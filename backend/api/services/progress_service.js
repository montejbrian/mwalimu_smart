/**
 * MwalimuSmart Web
 * backend/api/services/progress_service.js — Student progress, grading & mastery
 *
 * Formative only (AGENTS.md rule #3): grading records mastery and recommends,
 * it never blocks progression. Mastery is computed server-side as a rolling
 * average of the student's last 5 attempts for the sub-strand; any
 * client-submitted mastery/score values are ignored.
 */

import { pool } from "../db.js";
import { AppError } from "../utils/errors.js";
import { computeMasteryBadge } from "./catalog_service.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MASTERY_WINDOW = 5;
export const MASTERED_THRESHOLD = 0.8;

export function badgeColor(badge) {
  switch (badge) {
    case "mastered":
      return "#10b981"; // emerald-500
    case "in_progress":
      return "#f59e0b"; // amber-500
    case "review_recommended":
      return "#6366f1"; // indigo-500 (formative, supportive)
    case "new":
    default:
      return "#64748b"; // slate-500
  }
}

function assertUuid(raw, label) {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!UUID_REGEX.test(id)) {
    throw new AppError("validation", `Invalid ${label}: must be a valid UUID`);
  }
  return id;
}

function requireStudent(studentId) {
  if (!studentId) {
    throw new AppError("auth.forbidden", "Only students can record progress");
  }
  return studentId;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Pure: rolling mean of the most recent `window` scores (newest first). */
export function rollingMastery(scoresNewestFirst, window = MASTERY_WINDOW) {
  const recent = scoresNewestFirst.slice(0, window).map(Number);
  if (recent.length === 0) return 0;
  return round2(recent.reduce((a, b) => a + b, 0) / recent.length);
}

async function fetchPublishedLesson(client, lessonId) {
  const res = await client.query(
    `SELECT l.id, l.substrand_id, ss.strand_id, ss.sort_order AS substrand_sort,
            st.grade_subject_id, st.sort_order AS strand_sort
     FROM lessons l
     JOIN substrands ss ON ss.id = l.substrand_id
     JOIN strands st ON st.id = ss.strand_id
     WHERE l.id = $1 AND l.status = 'published'`,
    [lessonId]
  );
  if (res.rows.length === 0) {
    throw new AppError("not_found", "Lesson not found");
  }
  return res.rows[0];
}

/**
 * Recommendation (formative): below threshold → review the same sub-strand;
 * otherwise → next sub-strand in strand order (crossing into the next strand
 * of the same grade-subject); none left → done.
 * `lesson_id` is the first published lesson for the recommended sub-strand
 * (null if none is published yet) so the UI can deep-link without extra calls.
 */
async function firstPublishedLessonId(client, substrandId) {
  const res = await client.query(
    `SELECT id FROM lessons
     WHERE substrand_id = $1 AND status = 'published'
     ORDER BY sort_order ASC, version DESC
     LIMIT 1`,
    [substrandId]
  );
  return res.rows[0]?.id || null;
}

async function computeRecommendation(client, lesson, masteryScore) {
  if (masteryScore < MASTERED_THRESHOLD) {
    return { type: "review", substrand_id: lesson.substrand_id, lesson_id: lesson.id };
  }
  const next = await client.query(
    `SELECT ss.id
     FROM substrands ss
     JOIN strands st ON st.id = ss.strand_id
     WHERE st.grade_subject_id = $1
       AND (st.sort_order > $2 OR (st.sort_order = $2 AND ss.sort_order > $3))
     ORDER BY st.sort_order ASC, ss.sort_order ASC
     LIMIT 1`,
    [lesson.grade_subject_id, lesson.strand_sort, lesson.substrand_sort]
  );
  if (next.rows.length === 0) return { type: "done", substrand_id: null, lesson_id: null };
  const nextId = next.rows[0].id;
  return {
    type: "next",
    substrand_id: nextId,
    lesson_id: await firstPublishedLessonId(client, nextId),
  };
}

/**
 * POST /api/progress/:lesson_id/assessment
 * body: { answers: [{question_id, chosen_index}], lang }
 */
export async function submitAssessment(lessonIdRaw, { studentId, answers, lang = "en" }) {
  const lessonId = assertUuid(lessonIdRaw, "lesson_id");
  requireStudent(studentId);
  const useSw = lang === "sw";

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new AppError("validation", "answers must be a non-empty array");
  }
  for (const a of answers) {
    if (
      !a ||
      typeof a.question_id !== "string" ||
      !UUID_REGEX.test(a.question_id) ||
      !Number.isInteger(a.chosen_index) ||
      a.chosen_index < 0
    ) {
      throw new AppError(
        "validation",
        "Each answer requires a UUID question_id and a non-negative integer chosen_index"
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lesson = await fetchPublishedLesson(client, lessonId);

    const qRes = await client.query(
      `SELECT id, correct_index, explanation_en, explanation_sw
       FROM assessment_questions
       WHERE lesson_id = $1
       ORDER BY sort_order ASC`,
      [lessonId]
    );
    if (qRes.rows.length === 0) {
      throw new AppError("validation", "This lesson has no assessment questions");
    }

    const chosenById = new Map(answers.map((a) => [a.question_id, a.chosen_index]));
    for (const qid of chosenById.keys()) {
      if (!qRes.rows.some((q) => q.id === qid)) {
        throw new AppError("validation", `question_id ${qid} does not belong to this lesson`);
      }
    }

    // Unanswered questions count as incorrect; score is over all lesson questions.
    let correctCount = 0;
    const perQuestion = qRes.rows.map((q) => {
      const chosen = chosenById.has(q.id) ? chosenById.get(q.id) : null;
      const correct = chosen !== null && chosen === Number(q.correct_index);
      if (correct) correctCount += 1;
      return {
        id: q.id,
        correct,
        chosen,
        correct_index: Number(q.correct_index),
        explanation: useSw ? q.explanation_sw : q.explanation_en,
      };
    });
    const score = round2(correctCount / qRes.rows.length);

    await client.query(
      `INSERT INTO assessment_attempts (student_id, lesson_id, substrand_id, score, answers, language)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        studentId,
        lessonId,
        lesson.substrand_id,
        score,
        JSON.stringify(perQuestion.map(({ id, chosen, correct }) => ({ question_id: id, chosen_index: chosen, correct }))),
        useSw ? "sw" : "en",
      ]
    );

    const histRes = await client.query(
      `SELECT score FROM assessment_attempts
       WHERE student_id = $1 AND substrand_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [studentId, lesson.substrand_id, MASTERY_WINDOW]
    );
    const prevMasteryRes = await client.query(
      `SELECT mastery_score FROM student_mastery WHERE student_id = $1 AND substrand_id = $2`,
      [studentId, lesson.substrand_id]
    );
    const previousMastery =
      prevMasteryRes.rows.length > 0 ? Number(prevMasteryRes.rows[0].mastery_score) : null;
    const masteryScore = rollingMastery(histRes.rows.map((r) => r.score));

    await client.query(
      `INSERT INTO student_mastery (student_id, substrand_id, mastery_score, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (student_id, substrand_id)
       DO UPDATE SET mastery_score = EXCLUDED.mastery_score, updated_at = now()`,
      [studentId, lesson.substrand_id, masteryScore]
    );

    await client.query(
      `INSERT INTO student_progress (student_id, lesson_id, status, attempts, last_score, completed_at, updated_at)
       VALUES ($1, $2, 'assessed', 1, $3, now(), now())
       ON CONFLICT (student_id, lesson_id)
       DO UPDATE SET status = 'assessed',
                     attempts = student_progress.attempts + 1,
                     last_score = EXCLUDED.last_score,
                     completed_at = COALESCE(student_progress.completed_at, now()),
                     updated_at = now()`,
      [studentId, lessonId, score]
    );

    const recommendation = await computeRecommendation(client, lesson, masteryScore);
    await client.query("COMMIT");

    return {
      score,
      per_question: perQuestion,
      mastery: {
        substrand_id: lesson.substrand_id,
        mastery_score: masteryScore,
        previous_mastery_score: previousMastery,
        delta: previousMastery === null ? masteryScore : round2(masteryScore - previousMastery),
        badge: computeMasteryBadge(masteryScore),
        updated: true,
      },
      recommendation,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * POST /api/progress/:lesson_id/viewed  body: { position_s }
 */
export async function markViewed(lessonIdRaw, { studentId, positionS }) {
  const lessonId = assertUuid(lessonIdRaw, "lesson_id");
  requireStudent(studentId);
  const pos = positionS === undefined || positionS === null ? 0 : Number(positionS);
  if (!Number.isFinite(pos) || pos < 0) {
    throw new AppError("validation", "position_s must be a non-negative number");
  }

  await fetchPublishedLesson(pool, lessonId);
  const res = await pool.query(
    `INSERT INTO student_progress (student_id, lesson_id, status, last_position_s, updated_at)
     VALUES ($1, $2, 'viewed', $3, now())
     ON CONFLICT (student_id, lesson_id)
     DO UPDATE SET last_position_s = EXCLUDED.last_position_s,
                   status = CASE WHEN student_progress.status = 'not_started'
                                 THEN 'viewed' ELSE student_progress.status END,
                   updated_at = now()
     RETURNING status, last_position_s`,
    [studentId, lessonId, Math.floor(pos)]
  );
  return res.rows[0];
}

/**
 * GET /api/progress/mastery
 * Returns a curriculum mastery heatmap: strands x mastery color, plus summary stats.
 */
export async function getMasteryMap({ studentId, gradeId, subject, lang = "en" }) {
  const sid = requireStudent(studentId);
  const useSw = lang === "sw";

  const params = [sid];
  let whereClauses = "";

  if (gradeId !== undefined && gradeId !== null && gradeId !== "") {
    const gid = parseInt(gradeId, 10);
    if (!Number.isNaN(gid)) {
      params.push(gid);
      whereClauses += ` AND gs.grade_id = $${params.length}`;
    }
  }

  if (typeof subject === "string" && subject.trim()) {
    const sTerm = subject.trim();
    params.push(sTerm);
    whereClauses += ` AND (s.code = $${params.length} OR s.id::text = $${params.length})`;
  }

  const query = `
    SELECT
      s.id AS subject_id,
      s.code AS subject_code,
      s.name_en AS subject_name_en,
      s.name_sw AS subject_name_sw,
      g.id AS grade_id,
      g.name AS grade_name,
      st.id AS strand_id,
      st.name AS strand_name,
      st.sort_order AS strand_sort,
      ss.id AS substrand_id,
      ss.name AS substrand_name,
      ss.sort_order AS substrand_sort,
      ss.tier AS substrand_tier,
      sm.mastery_score,
      sm.updated_at AS mastery_updated_at,
      (
        SELECT l.id FROM lessons l
        WHERE l.substrand_id = ss.id AND l.status = 'published'
        ORDER BY l.sort_order ASC, l.version DESC
        LIMIT 1
      ) AS lesson_id
    FROM subjects s
    JOIN grade_subjects gs ON gs.subject_id = s.id
    JOIN grades g ON g.id = gs.grade_id
    JOIN strands st ON st.grade_subject_id = gs.id
    JOIN substrands ss ON ss.strand_id = st.id
    LEFT JOIN student_mastery sm ON sm.substrand_id = ss.id AND sm.student_id = $1
    WHERE 1=1 ${whereClauses}
    ORDER BY g.sort_order ASC, s.code ASC, st.sort_order ASC, ss.sort_order ASC;
  `;

  const rows = (await pool.query(query, params)).rows;

  let totalSubstrands = 0;
  let assessedSubstrands = 0;
  let masteredCount = 0;
  let inProgressCount = 0;
  let reviewCount = 0;
  let totalScoreSum = 0;

  const subjectsMap = new Map();

  for (const r of rows) {
    totalSubstrands += 1;
    const score = r.mastery_score !== null ? Number(r.mastery_score) : null;
    const badge = computeMasteryBadge(score);

    if (score !== null) {
      assessedSubstrands += 1;
      totalScoreSum += score;
    }
    if (badge === "mastered") masteredCount += 1;
    else if (badge === "in_progress") inProgressCount += 1;
    else if (badge === "review_recommended") reviewCount += 1;

    const sKey = `${r.grade_id}:${r.subject_id}`;
    if (!subjectsMap.has(sKey)) {
      subjectsMap.set(sKey, {
        id: r.subject_id,
        code: r.subject_code,
        name: useSw ? r.subject_name_sw : r.subject_name_en,
        name_en: r.subject_name_en,
        name_sw: r.subject_name_sw,
        grade_id: r.grade_id,
        grade_name: r.grade_name,
        strandsMap: new Map(),
      });
    }
    const subj = subjectsMap.get(sKey);

    if (!subj.strandsMap.has(r.strand_id)) {
      subj.strandsMap.set(r.strand_id, {
        id: r.strand_id,
        name: r.strand_name,
        sort_order: r.strand_sort,
        substrands: [],
      });
    }
    const strand = subj.strandsMap.get(r.strand_id);

    strand.substrands.push({
      id: r.substrand_id,
      name: r.substrand_name,
      sort_order: r.substrand_sort,
      tier: r.substrand_tier,
      mastery_score: score,
      badge,
      color: badgeColor(badge),
      lesson_id: r.lesson_id,
      updated_at: r.mastery_updated_at,
    });
  }

  const subjects = Array.from(subjectsMap.values()).map((s) => {
    const strands = Array.from(s.strandsMap.values()).map((st) => {
      const scores = st.substrands
        .filter((ss) => ss.mastery_score !== null)
        .map((ss) => ss.mastery_score);
      const avgScore =
        scores.length > 0 ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      const strandBadge = computeMasteryBadge(avgScore);
      const strandMasteredCount = st.substrands.filter((ss) => ss.badge === "mastered").length;

      return {
        id: st.id,
        name: st.name,
        sort_order: st.sort_order,
        mastery_score: avgScore,
        badge: strandBadge,
        color: badgeColor(strandBadge),
        substrand_count: st.substrands.length,
        mastered_count: strandMasteredCount,
        substrands: st.substrands,
      };
    });

    return {
      id: s.id,
      code: s.code,
      name: s.name,
      name_en: s.name_en,
      name_sw: s.name_sw,
      grade_id: s.grade_id,
      grade_name: s.grade_name,
      strands,
    };
  });

  return {
    summary: {
      total_substrands: totalSubstrands,
      assessed_substrands: assessedSubstrands,
      mastered: masteredCount,
      in_progress: inProgressCount,
      review_recommended: reviewCount,
      new: totalSubstrands - assessedSubstrands,
      average_mastery: assessedSubstrands > 0 ? round2(totalScoreSum / assessedSubstrands) : 0,
    },
    subjects,
  };
}

/**
 * GET /api/progress/recent
 * Returns recent student activity and a "What's next" recommendation card.
 */
export async function getRecentActivity({ studentId, limit = 10, lang = "en" }) {
  const sid = requireStudent(studentId);
  const useSw = lang === "sw";
  const lim = Math.max(1, Math.min(Number(limit) || 10, 50));

  const client = await pool.connect();
  try {
    const q = await client.query(
      `SELECT
         sp.lesson_id,
         sp.status,
         sp.last_position_s,
         sp.attempts,
         sp.last_score,
         sp.completed_at,
         sp.updated_at,
         l.title AS lesson_title,
         l.substrand_id,
         ss.name AS substrand_name,
         ss.sort_order AS substrand_sort,
         st.id AS strand_id,
         st.name AS strand_name,
         st.sort_order AS strand_sort,
         st.grade_subject_id,
         s.id AS subject_id,
         s.code AS subject_code,
         s.name_en AS subject_name_en,
         s.name_sw AS subject_name_sw,
         g.name AS grade_name,
         sm.mastery_score
       FROM student_progress sp
       JOIN lessons l ON l.id = sp.lesson_id
       JOIN substrands ss ON ss.id = l.substrand_id
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       JOIN grades g ON g.id = gs.grade_id
       LEFT JOIN student_mastery sm ON sm.student_id = sp.student_id AND sm.substrand_id = ss.id
       WHERE sp.student_id = $1
       ORDER BY sp.updated_at DESC
       LIMIT $2`,
      [sid, lim]
    );

    const recent = q.rows.map((r) => {
      const score = r.mastery_score !== null ? Number(r.mastery_score) : null;
      const badge = computeMasteryBadge(score);
      return {
        lesson_id: r.lesson_id,
        title: r.lesson_title,
        status: r.status,
        last_position_s: r.last_position_s,
        attempts: r.attempts,
        last_score: r.last_score !== null ? Number(r.last_score) : null,
        completed_at: r.completed_at,
        updated_at: r.updated_at,
        subject_id: r.subject_id,
        subject_code: r.subject_code,
        subject_name: useSw ? r.subject_name_sw : r.subject_name_en,
        grade_name: r.grade_name,
        strand_name: r.strand_name,
        substrand_id: r.substrand_id,
        substrand_name: r.substrand_name,
        mastery_score: score,
        badge,
        color: badgeColor(badge),
      };
    });

    let recommendation = null;
    if (q.rows.length > 0) {
      const top = q.rows[0];
      const topMastery =
        top.mastery_score !== null
          ? Number(top.mastery_score)
          : top.last_score !== null
          ? Number(top.last_score)
          : null;

      if (top.status === "viewed" && top.last_score === null) {
        recommendation = {
          type: "resume",
          lesson_id: top.lesson_id,
          substrand_id: top.substrand_id,
          title: top.lesson_title,
          strand_name: top.strand_name,
          subject_name: useSw ? top.subject_name_sw : top.subject_name_en,
          message: useSw
            ? "Endelea na somo hili na ujaribu tathmini ili kupima uelewa wako."
            : "Continue this lesson and try the assessment to test your understanding.",
        };
      } else if (topMastery !== null && topMastery < MASTERED_THRESHOLD) {
        recommendation = {
          type: "review",
          lesson_id: top.lesson_id,
          substrand_id: top.substrand_id,
          title: top.lesson_title,
          strand_name: top.strand_name,
          subject_name: useSw ? top.subject_name_sw : top.subject_name_en,
          message: useSw
            ? "Rudia somo hili na ujaribu maswali tena ili kuelewa vyema zaidi."
            : "Review this lesson and try the questions again whenever you're ready.",
        };
      } else {
        // Adaptive check: If student has earlier weak sub-strands in this subject (< MASTERED_THRESHOLD),
        // recommend reviewing the weakest sub-strand to close learning gaps.
        const weakSubstrand = (
          await client.query(
            `SELECT ss.id, ss.name AS substrand_name, st.name AS strand_name, s.name_en, s.name_sw,
                    sm.mastery_score,
                    (
                      SELECT l.id FROM lessons l
                      WHERE l.substrand_id = ss.id AND l.status = 'published'
                      ORDER BY l.sort_order ASC, l.version DESC
                      LIMIT 1
                    ) AS lesson_id
             FROM student_mastery sm
             JOIN substrands ss ON ss.id = sm.substrand_id
             JOIN strands st ON st.id = ss.strand_id
             JOIN grade_subjects gs ON gs.id = st.grade_subject_id
             JOIN subjects s ON s.id = gs.subject_id
             WHERE sm.student_id = $1
               AND sm.mastery_score < $2
               AND gs.id = $3
               AND ss.id != $4
             ORDER BY sm.mastery_score ASC, sm.updated_at ASC
             LIMIT 1`,
            [sid, MASTERED_THRESHOLD, top.grade_subject_id, top.substrand_id]
          )
        ).rows[0];

        if (weakSubstrand && weakSubstrand.lesson_id) {
          recommendation = {
            type: "review",
            reason: "gap",
            lesson_id: weakSubstrand.lesson_id,
            substrand_id: weakSubstrand.id,
            title: weakSubstrand.substrand_name,
            strand_name: weakSubstrand.strand_name,
            subject_name: useSw ? weakSubstrand.name_sw : weakSubstrand.name_en,
            message: useSw
              ? `Ushauri wa Mwalimu: Mada ya "${weakSubstrand.substrand_name}" inahitaji marudio kidogo ili kuimarisha msingi wako.`
              : `Teacher's Tip: "${weakSubstrand.substrand_name}" needs a quick review to strengthen your foundation.`,
          };
        } else {
          const fakeLesson = {
            id: top.lesson_id,
            substrand_id: top.substrand_id,
            grade_subject_id: top.grade_subject_id,
            strand_sort: top.strand_sort,
            substrand_sort: top.substrand_sort,
          };
          const rec = await computeRecommendation(client, fakeLesson, topMastery ?? 1.0);
          if (rec.type === "next" && rec.substrand_id) {
            const nextSubstrandInfo = (
              await client.query(
                `SELECT ss.name AS substrand_name, st.name AS strand_name, s.name_en, s.name_sw,
                        (SELECT l.title FROM lessons l WHERE l.id = $2) AS lesson_title
                 FROM substrands ss
                 JOIN strands st ON st.id = ss.strand_id
                 JOIN grade_subjects gs ON gs.id = st.grade_subject_id
                 JOIN subjects s ON s.id = gs.subject_id
                 WHERE ss.id = $1`,
                [rec.substrand_id, rec.lesson_id]
              )
            ).rows[0];

            recommendation = {
              type: "next",
              lesson_id: rec.lesson_id,
              substrand_id: rec.substrand_id,
              title:
                nextSubstrandInfo?.lesson_title || nextSubstrandInfo?.substrand_name || "Next Lesson",
              strand_name: nextSubstrandInfo?.strand_name || null,
              subject_name: useSw ? nextSubstrandInfo?.name_sw : nextSubstrandInfo?.name_en,
              message: useSw
                ? "Kazi nzuri! Endelea na mada inayofuata katika mtaala wako."
                : "Great progress! Continue to the next topic in your curriculum.",
            };
          } else {
            recommendation = {
              type: "done",
              lesson_id: null,
              substrand_id: null,
              title: null,
              strand_name: null,
              subject_name: useSw ? top.subject_name_sw : top.subject_name_en,
              message: useSw
                ? "Umefika mwisho wa mada za somo hili. Chunguza masomo mengine!"
                : "You have completed all available topics in this subject. Explore other subjects!",
            };
          }
        }
      }
    } else {
      // No recent activity: find first published lesson in catalog
      const first = (
        await client.query(
          `SELECT l.id, l.title, ss.name AS substrand_name, st.name AS strand_name,
                  s.name_en, s.name_sw
           FROM lessons l
           JOIN substrands ss ON ss.id = l.substrand_id
           JOIN strands st ON st.id = ss.strand_id
           JOIN grade_subjects gs ON gs.id = st.grade_subject_id
           JOIN subjects s ON s.id = gs.subject_id
           WHERE l.status = 'published'
           ORDER BY gs.grade_id ASC, s.code ASC, st.sort_order ASC, ss.sort_order ASC, l.sort_order ASC
           LIMIT 1`
        )
      ).rows[0];

      if (first) {
        recommendation = {
          type: "start",
          lesson_id: first.id,
          substrand_id: null,
          title: first.title,
          strand_name: first.strand_name,
          subject_name: useSw ? first.name_sw : first.name_en,
          message: useSw
            ? "Anza safari yako ya kujifunza na somo hili lililolinganishwa na CBC."
            : "Start your learning journey with this CBC-aligned lesson.",
        };
      } else {
        recommendation = {
          type: "none",
          lesson_id: null,
          substrand_id: null,
          title: null,
          strand_name: null,
          subject_name: null,
          message: useSw
            ? "Vinjari mtaala ili kuanza kujifunza."
            : "Browse the curriculum catalog to begin your learning journey.",
        };
      }
    }

    return { recent, recommendation };
  } finally {
    client.release();
  }
}
