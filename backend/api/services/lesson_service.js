/**
 * MwalimuSmart Web
 * backend/api/services/lesson_service.js — Lesson read service
 *
 * Reads published lessons (or any status for teacher/admin review) from PostgreSQL,
 * returning localized variants (EN/SW), assets, student progress, and assessment
 * questions (strictly excluding correct_index and explanations per docs/05-LEARNING.md).
 */

import { pool } from "../db.js";
import { AppError } from "../utils/errors.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(idRaw, label = "lesson_id") {
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!UUID_REGEX.test(id)) {
    throw new AppError("validation", `Invalid ${label}: must be a valid UUID`);
  }
  return id;
}

function normalizeLang(lang) {
  return lang === "sw" ? "sw" : "en";
}

async function fetchLessonHeader(lessonId, role = "student") {
  const res = await pool.query(
    `SELECT l.id AS lesson_id,
            l.title,
            l.sort_order,
            l.status,
            l.version,
            l.supersedes,
            l.created_at,
            l.published_at,
            ss.id AS substrand_id,
            ss.name AS substrand_name,
            ss.tier AS substrand_tier,
            st.id AS strand_id,
            st.name AS strand_name,
            s.code AS subject_code,
            s.name_en AS subject_name_en,
            s.name_sw AS subject_name_sw,
            g.id AS grade_id,
            g.name AS grade_name,
            el.id AS level_id,
            el.name AS level_name
     FROM lessons l
     JOIN substrands ss ON ss.id = l.substrand_id
     JOIN strands st ON st.id = ss.strand_id
     JOIN grade_subjects gs ON gs.id = st.grade_subject_id
     JOIN subjects s ON s.id = gs.subject_id
     JOIN grades g ON g.id = gs.grade_id
     JOIN education_levels el ON el.id = g.level_id
     WHERE l.id = $1;`,
    [lessonId]
  );

  if (res.rows.length === 0) {
    throw new AppError("not_found", "Lesson not found");
  }

  const row = res.rows[0];
  const isStaff = role === "teacher" || role === "admin";
  if (!isStaff && row.status !== "published") {
    throw new AppError("not_found", "Lesson not found");
  }

  return row;
}

async function selectVariant(lessonId, requestedLang) {
  const varRes = await pool.query(
    `SELECT id, lesson_id, language, script, transcript, objectives, key_concepts, rag_sources
     FROM lesson_variants
     WHERE lesson_id = $1
     ORDER BY CASE WHEN language::text = $2 THEN 0 ELSE 1 END ASC;`,
    [lessonId, requestedLang]
  );

  if (varRes.rows.length === 0) {
    throw new AppError("not_found", "Lesson variant not found");
  }

  return varRes.rows[0];
}

async function fetchAssetsForLesson(lessonId, preferredVariantId) {
  const assetRes = await pool.query(
    `SELECT la.id,
            la.lesson_variant_id,
            la.type,
            la.storage_url,
            la.duration_s,
            la.status,
            la.job_id,
            la.updated_at
     FROM lesson_assets la
     JOIN lesson_variants lv ON lv.id = la.lesson_variant_id
     WHERE lv.lesson_id = $1
     ORDER BY CASE WHEN la.lesson_variant_id = $2 THEN 0 ELSE 1 END ASC;`,
    [lessonId, preferredVariantId]
  );

  const byType = new Map();
  for (const row of assetRes.rows) {
    if (!byType.has(row.type)) {
      byType.set(row.type, row);
    }
  }

  const video = byType.get("video_mp4");
  const captions = byType.get("captions_vtt");
  const audio = byType.get("audio_mp3");
  const thumbnail = byType.get("thumbnail");

  return {
    video_url: video?.status === "ready" ? video.storage_url : video?.storage_url || null,
    captions_url: captions?.storage_url || null,
    audio_url: audio?.storage_url || null,
    thumbnail_url: thumbnail?.storage_url || null,
    duration_s: video?.duration_s ?? audio?.duration_s ?? null,
    status: video?.status || "pending",
  };
}

/**
 * Enqueue a render job for a standard-tier lesson variant if not already rendering or ready.
 * Idempotency is strictly guaranteed by the UNIQUE(lesson_variant_id, type) constraint.
 * If 10 students request concurrently, exactly one transaction updates/inserts and returns
 * enqueued: true; the rest see the constraint / status condition and return enqueued: false.
 */
export async function enqueueRenderJobIfMissing(variantId) {
  const jobId = `render-${variantId}-${Date.now()}`;
  const res = await pool.query(
    `INSERT INTO lesson_assets (lesson_variant_id, type, storage_url, status, job_id, updated_at)
     VALUES ($1, 'video_mp4', NULL, 'rendering', $2, now())
     ON CONFLICT (lesson_variant_id, type)
     DO UPDATE SET
       status = 'rendering',
       job_id = EXCLUDED.job_id,
       updated_at = now()
     WHERE lesson_assets.status NOT IN ('ready', 'rendering')
       AND lesson_assets.storage_url IS NULL
     RETURNING id, status, job_id`,
    [variantId, jobId]
  );

  if (res.rows.length > 0) {
    return { enqueued: true, job_id: res.rows[0].job_id, status: "rendering" };
  }
  return { enqueued: false, job_id: null };
}

/**
 * Worker completion hook: marks a video render as ready and attaches storage_url + duration.
 */
export async function completeRenderJob(
  variantId,
  { videoUrl, durationS = 180, captionsUrl = null } = {}
) {
  const res = await pool.query(
    `UPDATE lesson_assets
     SET status = 'ready',
         storage_url = $2,
         duration_s = $3,
         updated_at = now()
     WHERE lesson_variant_id = $1 AND type = 'video_mp4'
     RETURNING id, status, storage_url`,
    [variantId, videoUrl, durationS]
  );

  if (captionsUrl) {
    await pool.query(
      `INSERT INTO lesson_assets (lesson_variant_id, type, storage_url, status, updated_at)
       VALUES ($1, 'captions_vtt', $2, 'ready', now())
       ON CONFLICT (lesson_variant_id, type)
       DO UPDATE SET storage_url = EXCLUDED.storage_url, status = 'ready', updated_at = now()`,
      [variantId, captionsUrl]
    );
  }

  return res.rows[0] || null;
}

export async function getLessonById(
  lessonIdRaw,
  { lang = "en", studentId = null, role = "student" } = {}
) {
  const lessonId = assertValidUuid(lessonIdRaw, "lesson_id");
  const requestedLang = normalizeLang(lang);

  const header = await fetchLessonHeader(lessonId, role);
  const variant = await selectVariant(lessonId, requestedLang);
  const effectiveLang = variant.language;
  const useSw = effectiveLang === "sw";

  let [assets, qRes, progRes] = await Promise.all([
    fetchAssetsForLesson(lessonId, variant.id),
    pool.query(
      `SELECT id, sort_order, question_en, question_sw, options, competency_tag
       FROM assessment_questions
       WHERE lesson_id = $1
       ORDER BY sort_order ASC;`,
      [lessonId]
    ),
    studentId
      ? pool.query(
          `SELECT status, last_position_s, attempts, last_score, completed_at
           FROM student_progress
           WHERE student_id = $1 AND lesson_id = $2;`,
          [studentId, lessonId]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  // P2.5: Lazy render on first open for standard-tier lessons without video
  if (
    header.substrand_tier === "standard" &&
    (!assets.video_url || assets.status === "pending")
  ) {
    const renderRes = await enqueueRenderJobIfMissing(variant.id);
    if (renderRes.enqueued) {
      assets = {
        ...assets,
        status: "rendering",
      };
    }
  }

  const scriptObj =
    variant.script && typeof variant.script === "object" ? variant.script : {};
  const sections =
    scriptObj.sections ||
    scriptObj.body_sections ||
    [];

  // Build assessment questions strictly WITHOUT correct_index or explanations
  const questions = qRes.rows.map((q) => {
    const rawOpts = q.options;
    let localizedOptions = [];
    if (Array.isArray(rawOpts)) {
      localizedOptions = rawOpts;
    } else if (rawOpts && typeof rawOpts === "object") {
      localizedOptions =
        (useSw ? rawOpts.sw : rawOpts.en) ||
        rawOpts.en ||
        rawOpts.sw ||
        [];
    }

    return {
      id: q.id,
      sort_order: q.sort_order,
      question: useSw ? q.question_sw || q.question_en : q.question_en || q.question_sw,
      options: localizedOptions,
      competency_tag: q.competency_tag,
    };
  });

  const progRow = progRes.rows[0];
  const progress = progRow
    ? {
        status: progRow.status,
        last_position_s: progRow.last_position_s,
        attempts: progRow.attempts,
        last_score: progRow.last_score !== null ? Number(progRow.last_score) : null,
        completed_at: progRow.completed_at,
      }
    : {
        status: "not_started",
        last_position_s: 0,
        attempts: 0,
        last_score: null,
        completed_at: null,
      };

  return {
    lesson_id: header.lesson_id,
    title: scriptObj.title || header.title,
    status: header.status,
    version: header.version,
    substrand_id: header.substrand_id,
    tier: header.substrand_tier,
    breadcrumb: [
      {
        level: header.level_name,
        grade: header.grade_name,
        level_id: header.level_id,
        grade_id: header.grade_id,
      },
      {
        subject: useSw ? header.subject_name_sw : header.subject_name_en,
        subject_code: header.subject_code,
      },
      {
        strand: header.strand_name,
        strand_id: header.strand_id,
      },
      {
        substrand: header.substrand_name,
        substrand_id: header.substrand_id,
      },
    ],
    variant: {
      id: variant.id,
      language: effectiveLang,
      script: {
        ...scriptObj,
        objectives: variant.objectives || scriptObj.objectives || [],
        sections,
        key_concepts: variant.key_concepts || scriptObj.key_concepts || [],
      },
      transcript_url: `/api/lessons/${header.lesson_id}/transcript?lang=${effectiveLang}`,
      rag_sources: variant.rag_sources || [],
    },
    assets,
    assessment: {
      questions,
    },
    progress,
  };
}

export async function getLessonTranscript(
  lessonIdRaw,
  { lang = "en", role = "student" } = {}
) {
  const lessonId = assertValidUuid(lessonIdRaw, "lesson_id");
  const requestedLang = normalizeLang(lang);

  const header = await fetchLessonHeader(lessonId, role);
  const variant = await selectVariant(lessonId, requestedLang);

  const safeSlug = String(header.title || "lesson")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return {
    filename: `${safeSlug || "lesson"}_${variant.language}_transcript.txt`,
    language: variant.language,
    transcript: variant.transcript || "",
  };
}

export async function getLessonAssets(
  lessonIdRaw,
  { lang = "en", role = "student" } = {}
) {
  const lessonId = assertValidUuid(lessonIdRaw, "lesson_id");
  const requestedLang = normalizeLang(lang);

  await fetchLessonHeader(lessonId, role);
  const variant = await selectVariant(lessonId, requestedLang);
  return fetchAssetsForLesson(lessonId, variant.id);
}
