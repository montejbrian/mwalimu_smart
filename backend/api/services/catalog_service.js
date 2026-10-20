/**
 * MwalimuSmart Web
 * backend/api/services/catalog_service.js — Curriculum catalog read service
 *
 * Reads curriculum hierarchy from PostgreSQL with an in-process 5-minute TTL cache
 * (invalidated on authoring publish) and overlays student mastery badges.
 */

import { pool } from "../db.js";
import { AppError } from "../utils/errors.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _cache = new Map(); // key -> { value, expiresAt }

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateCatalogCache() {
  _cache.clear();
}

export function getCatalogCacheSize() {
  return _cache.size;
}

/**
 * Compute formative mastery badge per docs/00-PRINCIPLES.md:
 *   null/undefined     -> "new"
 *   >= 0.80            -> "mastered"
 *   >= 0.50 && < 0.80  -> "in_progress"
 *   < 0.50             -> "review_recommended"
 */
export function computeMasteryBadge(score) {
  if (score === null || score === undefined) return "new";
  const num = Number(score);
  if (Number.isNaN(num)) return "new";
  if (num >= 0.8) return "mastered";
  if (num >= 0.5) return "in_progress";
  return "review_recommended";
}

export async function getLevels() {
  const cacheKey = "levels";
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await pool.query(
    `SELECT id, name, sort_order
     FROM education_levels
     ORDER BY sort_order ASC;`
  );
  return setCached(cacheKey, res.rows);
}

export async function getGrades(levelIdRaw) {
  const levelId = Number.parseInt(String(levelIdRaw ?? ""), 10);
  if (!Number.isInteger(levelId) || levelId <= 0) {
    throw new AppError("validation", "Query parameter 'level_id' must be a positive integer");
  }

  const cacheKey = `grades:${levelId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await pool.query(
    `SELECT id, level_id, name, sort_order
     FROM grades
     WHERE level_id = $1
     ORDER BY sort_order ASC;`,
    [levelId]
  );
  return setCached(cacheKey, res.rows);
}

export async function getSubjects(gradeIdRaw, lang = "en") {
  const gradeId = Number.parseInt(String(gradeIdRaw ?? ""), 10);
  if (!Number.isInteger(gradeId) || gradeId <= 0) {
    throw new AppError("validation", "Query parameter 'grade_id' must be a positive integer");
  }

  const cacheKey = `subjects:${gradeId}`;
  let rows = getCached(cacheKey);
  if (!rows) {
    const res = await pool.query(
      `SELECT s.id, s.code, s.name_en, s.name_sw, gs.curriculum_ref
       FROM grade_subjects gs
       JOIN subjects s ON s.id = gs.subject_id
       WHERE gs.grade_id = $1
       ORDER BY s.name_en ASC;`,
      [gradeId]
    );
    rows = setCached(cacheKey, res.rows);
  }

  const useSw = lang === "sw";
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: useSw ? r.name_sw : r.name_en,
    name_en: r.name_en,
    name_sw: r.name_sw,
    curriculum_ref: r.curriculum_ref,
  }));
}

export async function getStrands(gradeIdRaw, subjectCodeRaw, studentId = null) {
  const gradeId = Number.parseInt(String(gradeIdRaw ?? ""), 10);
  const subjectCode = typeof subjectCodeRaw === "string" ? subjectCodeRaw.trim() : "";

  if (!Number.isInteger(gradeId) || gradeId <= 0 || !subjectCode) {
    throw new AppError(
      "validation",
      "Query parameters 'grade_id' (integer) and 'subject' (subject code) are required"
    );
  }

  const cacheKey = `strands:${gradeId}:${subjectCode}`;
  let baseStrands = getCached(cacheKey);
  if (!baseStrands) {
    const res = await pool.query(
      `SELECT st.id,
              st.name,
              st.description,
              st.sort_order,
              COALESCE(
                json_agg(ss.id ORDER BY ss.sort_order) FILTER (WHERE ss.id IS NOT NULL),
                '[]'::json
              ) AS substrand_ids
       FROM strands st
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       LEFT JOIN substrands ss ON ss.strand_id = st.id
       WHERE gs.grade_id = $1 AND s.code = $2
       GROUP BY st.id, st.name, st.description, st.sort_order
       ORDER BY st.sort_order ASC;`,
      [gradeId, subjectCode]
    );
    baseStrands = setCached(cacheKey, res.rows);
  }

  // Overlay per-student mastery summary
  let masteryBySubstrand = new Map();
  if (studentId && baseStrands.length > 0) {
    const allSubstrandIds = baseStrands.flatMap((st) => st.substrand_ids || []);
    if (allSubstrandIds.length > 0) {
      const mRes = await pool.query(
        `SELECT substrand_id, mastery_score
         FROM student_mastery
         WHERE student_id = $1 AND substrand_id = ANY($2::uuid[]);`,
        [studentId, allSubstrandIds]
      );
      masteryBySubstrand = new Map(
        mRes.rows.map((r) => [r.substrand_id, Number(r.mastery_score)])
      );
    }
  }

  return baseStrands.map((st) => {
    const ssIds = st.substrand_ids || [];
    const totalCount = ssIds.length;
    let masteredCount = 0;
    let inProgressCount = 0;
    let reviewCount = 0;

    for (const ssId of ssIds) {
      const badge = computeMasteryBadge(masteryBySubstrand.get(ssId));
      if (badge === "mastered") masteredCount += 1;
      else if (badge === "in_progress") inProgressCount += 1;
      else if (badge === "review_recommended") reviewCount += 1;
    }

    let strandBadge = "new";
    if (totalCount > 0 && masteredCount === totalCount) {
      strandBadge = "mastered";
    } else if (reviewCount > 0) {
      strandBadge = "review_recommended";
    } else if (masteredCount > 0 || inProgressCount > 0) {
      strandBadge = "in_progress";
    }

    return {
      id: st.id,
      name: st.name,
      description: st.description,
      sort_order: st.sort_order,
      substrand_count: totalCount,
      mastery_summary: {
        mastered_count: masteredCount,
        in_progress_count: inProgressCount,
        review_recommended_count: reviewCount,
        total_count: totalCount,
        badge: strandBadge,
      },
    };
  });
}

export async function getSubstrands(strandIdRaw, studentId = null) {
  const strandId = typeof strandIdRaw === "string" ? strandIdRaw.trim() : "";
  if (!UUID_REGEX.test(strandId)) {
    throw new AppError("validation", "Query parameter 'strand_id' must be a valid UUID");
  }

  const cacheKey = `substrands:${strandId}`;
  let baseSubstrands = getCached(cacheKey);
  if (!baseSubstrands) {
    const res = await pool.query(
      `SELECT ss.id,
              ss.strand_id,
              ss.name,
              ss.sort_order,
              ss.tier,
              ss.learning_outcomes,
              ss.competencies,
              COUNT(l.id) FILTER (WHERE l.status = 'published')::int AS lesson_count,
              (
                SELECT l2.id
                FROM lessons l2
                WHERE l2.substrand_id = ss.id AND l2.status = 'published'
                ORDER BY l2.sort_order ASC, l2.version DESC
                LIMIT 1
              ) AS first_lesson_id
       FROM substrands ss
       LEFT JOIN lessons l ON l.substrand_id = ss.id AND l.status = 'published'
       WHERE ss.strand_id = $1
       GROUP BY ss.id, ss.strand_id, ss.name, ss.sort_order, ss.tier, ss.learning_outcomes, ss.competencies
       ORDER BY ss.sort_order ASC;`,
      [strandId]
    );
    baseSubstrands = setCached(cacheKey, res.rows);
  }

  let masteryBySubstrand = new Map();
  if (studentId && baseSubstrands.length > 0) {
    const ssIds = baseSubstrands.map((ss) => ss.id);
    const mRes = await pool.query(
      `SELECT substrand_id, mastery_score
       FROM student_mastery
       WHERE student_id = $1 AND substrand_id = ANY($2::uuid[]);`,
      [studentId, ssIds]
    );
    masteryBySubstrand = new Map(
      mRes.rows.map((r) => [r.substrand_id, Number(r.mastery_score)])
    );
  }

  return baseSubstrands.map((ss) => {
    const score = masteryBySubstrand.has(ss.id) ? masteryBySubstrand.get(ss.id) : null;
    return {
      id: ss.id,
      strand_id: ss.strand_id,
      name: ss.name,
      sort_order: ss.sort_order,
      tier: ss.tier,
      learning_outcomes: ss.learning_outcomes,
      competencies: ss.competencies,
      lesson_count: ss.lesson_count,
      first_lesson_id: ss.first_lesson_id || null,
      mastery_score: score,
      mastery_badge: computeMasteryBadge(score),
    };
  });
}
