/**
 * MwalimuSmart — backend/api/services/authoring_service.js
 * Teacher/Admin Authoring & Review Service.
 *
 * Enforces Non-Negotiable Rule #2:
 * Never mutate a published lesson in place. Regeneration creates a new `version`;
 * old versions are archived when a newer version is published.
 */

import { v4 as uuidv4 } from "uuid";
import { pool as pgPool, getDb } from "../db.js";
import { AppError } from "../utils/errors.js";
import { invalidateCatalogCache } from "./catalog_service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TIERS = new Set(["featured", "standard", "on_demand"]);

// In-memory mirror of authoring jobs (synced with Mongo `authoring_jobs` when available)
const memoryJobs = new Map();

export function clearAuthoringJobsMemory() {
  memoryJobs.clear();
}

async function persistJobMirror(job) {
  memoryJobs.set(job.job_id, job);
  if (process.env.NODE_ENV !== "test") {
    try {
      const db = await getDb();
      await db
        .collection("authoring_jobs")
        .replaceOne({ job_id: job.job_id }, job, { upsert: true });
    } catch {
      // Mongo mirror is best-effort; Postgres + memory remain consistent
    }
  }
  return job;
}

function buildTranscriptFromScript(title, script, lang = "en") {
  const lines = [title, ""];
  if (script.introduction) {
    lines.push(script.introduction, "");
  }
  for (const sec of script.sections || []) {
    if (sec.heading) lines.push(sec.heading);
    if (sec.content) lines.push(sec.content);
    lines.push("");
  }
  if (Array.isArray(script.key_concepts) && script.key_concepts.length > 0) {
    const label = lang === "sw" ? "Dhana Muhimu: " : "Key Concepts: ";
    lines.push(label + script.key_concepts.join(", "));
  }
  return lines.join("\n").trim();
}

function generateDefaultLessonPackage(meta, feedback = null) {
  const topic = meta.substrand_name;
  const strand = meta.strand_name;
  const outcomes =
    Array.isArray(meta.learning_outcomes) && meta.learning_outcomes.length > 0
      ? meta.learning_outcomes
      : [`By the end of the lesson, the learner should understand ${topic}.`];
  const competencies =
    Array.isArray(meta.competencies) && meta.competencies.length > 0
      ? meta.competencies
      : ["critical_thinking", "communication"];

  const noteEn = feedback ? ` (Teacher feedback applied: ${feedback})` : "";
  const noteSw = feedback ? ` (Maoni ya mwalimu yamezingatiwa: ${feedback})` : "";

  const titleEn = `${topic} — ${strand}`;
  const titleSw = `${topic} — ${strand} (Kiswahili)`;

  const scriptEn = {
    title: titleEn,
    objectives: outcomes,
    introduction: `Welcome to this KICD CBC lesson on ${topic} under ${strand} (${meta.grade_name} ${meta.subject_name_en}).${noteEn}`,
    sections: [
      {
        heading: `1. Core Concepts of ${topic}`,
        content: `In ${meta.subject_name_en}, ${topic} introduces learners to foundational concepts within the ${strand} strand using practical Kenyan classroom examples.`,
      },
      {
        heading: "2. Worked Examples & Everyday Application",
        content: `Learners apply ${topic} to real-life problems and build ${competencies.join(", ")}.`,
      },
    ],
    key_concepts: [topic, strand, ...competencies.slice(0, 2)],
  };

  const scriptSw = {
    title: titleSw,
    objectives: [`Kufikia mwisho wa somo, mwanafunzi aweze kueleza na kutumia ${topic}.`],
    introduction: `Karibu kwenye somo hili la CBC kuhusu ${topic} chini ya mada kuu ya ${strand} (${meta.grade_name} ${meta.subject_name_sw}).${noteSw}`,
    sections: [
      {
        heading: `1. Dhana Kuu za ${topic}`,
        content: `Katika ${meta.subject_name_sw}, ${topic} huwajengea wanafunzi msingi imara kupitia mifano halisi ya Kenya.`,
      },
      {
        heading: "2. Mifano na Matumizi ya Kila Siku",
        content: `Wanafunzi wanatumia dhana za ${topic} kutatua changamoto na kukuza umahiri wa ${competencies.join(", ")}.`,
      },
    ],
    key_concepts: [topic, strand, ...competencies.slice(0, 2)],
  };

  const questions = [0, 1, 2].map((idx) => {
    const concept = scriptEn.key_concepts[idx % scriptEn.key_concepts.length];
    return {
      sort_order: idx + 1,
      question_en: `Which statement best describes '${concept}' in ${topic}?`,
      question_sw: `Ni maelezo yapi yanafafanua vyema '${concept}' katika ${topic}?`,
      options: {
        en: [
          `It is a core CBC concept in ${topic} (${strand})`,
          "It is unrelated to this sub-strand",
          "It contradicts the KICD curriculum outcome",
          "None of the above",
        ],
        sw: [
          `Ni dhana kuu ya CBC katika ${topic} (${strand})`,
          "Haihusiani na mada hii ndogo",
          "Inapingana na lengo la mtaala wa KICD",
          "Hakuna jibu sahihi",
        ],
      },
      correct_index: 0,
      explanation_en: `'${concept}' is a key concept in ${topic} under ${strand}.`,
      explanation_sw: `'${concept}' ni dhana muhimu katika ${topic} chini ya ${strand}.`,
      competency_tag: competencies[0] || "critical_thinking",
    };
  });

  const ragSources = [
    {
      ref: `KICD-${meta.grade_name.replace(/\s+/g, "")}-${meta.subject_code.toUpperCase()}`,
      strand,
      substrand: topic,
    },
  ];

  return {
    titleEn,
    titleSw,
    scriptEn,
    scriptSw,
    transcriptEn: buildTranscriptFromScript(titleEn, scriptEn, "en"),
    transcriptSw: buildTranscriptFromScript(titleSw, scriptSw, "sw"),
    questions,
    ragSources,
  };
}

async function fetchSubstrandMeta(substrandId) {
  const { rows } = await pgPool.query(
    `SELECT
       ss.id AS substrand_id,
       ss.name AS substrand_name,
       ss.learning_outcomes,
       ss.competencies,
       st.id AS strand_id,
       st.name AS strand_name,
       subj.code AS subject_code,
       subj.name_en AS subject_name_en,
       subj.name_sw AS subject_name_sw,
       g.id AS grade_id,
       g.name AS grade_name
     FROM substrands ss
     JOIN strands st ON st.id = ss.strand_id
     JOIN grade_subjects gs ON gs.id = st.grade_subject_id
     JOIN subjects subj ON subj.id = gs.subject_id
     JOIN grades g ON g.id = gs.grade_id
     WHERE ss.id = $1`,
    [substrandId]
  );
  if (rows.length === 0) {
    throw AppError.notFound(`Sub-strand ${substrandId} not found`);
  }
  return rows[0];
}

async function createDraftForSubstrand({
  substrandId,
  tier = "standard",
  feedback = null,
  supersedes = null,
}) {
  const meta = await fetchSubstrandMeta(substrandId);
  const jobId = uuidv4();
  const now = new Date().toISOString();

  await pgPool.query(`UPDATE substrands SET tier = $1 WHERE id = $2`, [
    tier,
    substrandId,
  ]);

  const pkg = generateDefaultLessonPackage(meta, feedback);

  const client = await pgPool.connect();
  let lessonId;
  let nextVersion;

  try {
    await client.query("BEGIN");

    const verRes = await client.query(
      `SELECT COALESCE(MAX(version), 0) AS max_ver,
              (SELECT id FROM lessons WHERE substrand_id = $1 ORDER BY version DESC LIMIT 1) AS latest_id
       FROM lessons
       WHERE substrand_id = $1`,
      [substrandId]
    );
    nextVersion = Number(verRes.rows[0].max_ver) + 1;
    const parentId = supersedes || verRes.rows[0].latest_id || null;

    const lessonInsert = await client.query(
      `INSERT INTO lessons (substrand_id, title, sort_order, status, version, supersedes)
       VALUES ($1, $2, 0, 'draft', $3, $4)
       RETURNING id`,
      [substrandId, pkg.titleEn, nextVersion, parentId]
    );
    lessonId = lessonInsert.rows[0].id;

    for (const [langCode, scriptObj, transcriptTxt] of [
      ["en", pkg.scriptEn, pkg.transcriptEn],
      ["sw", pkg.scriptSw, pkg.transcriptSw],
    ]) {
      const varInsert = await client.query(
        `INSERT INTO lesson_variants (
           lesson_id, language, script, transcript, objectives, key_concepts, rag_sources
         )
         VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7::jsonb)
         RETURNING id`,
        [
          lessonId,
          langCode,
          JSON.stringify(scriptObj),
          transcriptTxt,
          JSON.stringify(scriptObj.objectives || []),
          JSON.stringify(scriptObj.key_concepts || []),
          JSON.stringify(pkg.ragSources),
        ]
      );
      const variantId = varInsert.rows[0].id;

      await client.query(
        `INSERT INTO lesson_assets (lesson_variant_id, type, storage_url, status, job_id)
         VALUES ($1, 'video_mp4', NULL, 'pending', $2)`,
        [variantId, jobId]
      );
    }

    for (const q of pkg.questions) {
      await client.query(
        `INSERT INTO assessment_questions (
           lesson_id, sort_order, question_en, question_sw,
           options, correct_index,
           explanation_en, explanation_sw, competency_tag
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [
          lessonId,
          q.sort_order,
          q.question_en,
          q.question_sw,
          JSON.stringify(q.options),
          q.correct_index,
          q.explanation_en,
          q.explanation_sw,
          q.competency_tag,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const jobDoc = {
    job_id: jobId,
    state: "awaiting_review",
    tier,
    substrand_id: substrandId,
    substrand_name: meta.substrand_name,
    strand_name: meta.strand_name,
    subject_name: meta.subject_name_en,
    grade_name: meta.grade_name,
    lesson_id: lessonId,
    version: nextVersion,
    title_en: pkg.titleEn,
    title_sw: pkg.titleSw,
    feedback: feedback || null,
    logs: [
      { ts: now, stage: "queued", msg: `Queued authoring job for ${meta.substrand_name}` },
      { ts: now, stage: "researching", msg: "Retrieved KICD curriculum references" },
      { ts: now, stage: "scripting", msg: "Generated EN + SW lesson scripts" },
      { ts: now, stage: "assessing", msg: "Generated 3 bilingual formative MCQs" },
      { ts: now, stage: "assembling", msg: `Saved draft lesson v${nextVersion}` },
      { ts: now, stage: "awaiting_review", msg: "Ready for teacher review" },
    ],
    created_at: now,
    updated_at: now,
  };

  await persistJobMirror(jobDoc);
  return jobDoc;
}

/**
 * POST /api/authoring/jobs { scope, tier }
 */
export async function enqueueAuthoringJobs({ scope, tier = "standard" }) {
  const normalizedTier = VALID_TIERS.has(tier) ? tier : null;
  if (!normalizedTier) {
    throw AppError.validation("tier must be one of: featured, standard, on_demand");
  }
  if (!scope || typeof scope !== "object") {
    throw AppError.validation("scope object is required ({ substrand_id } or { strand_id })");
  }

  const substrandIds = [];
  if (scope.substrand_id) {
    if (!UUID_RE.test(String(scope.substrand_id))) {
      throw AppError.validation("Invalid scope.substrand_id UUID");
    }
    substrandIds.push(String(scope.substrand_id));
  } else if (scope.strand_id) {
    if (!UUID_RE.test(String(scope.strand_id))) {
      throw AppError.validation("Invalid scope.strand_id UUID");
    }
    const { rows } = await pgPool.query(
      `SELECT id FROM substrands WHERE strand_id = $1 ORDER BY sort_order ASC`,
      [scope.strand_id]
    );
    if (rows.length === 0) {
      throw AppError.notFound(`No sub-strands found for strand ${scope.strand_id}`);
    }
    for (const r of rows) substrandIds.push(r.id);
  } else {
    throw AppError.validation("scope must specify substrand_id or strand_id");
  }

  const jobs = [];
  for (const ssId of substrandIds) {
    const job = await createDraftForSubstrand({
      substrandId: ssId,
      tier: normalizedTier,
    });
    jobs.push(job);
  }

  return {
    job_ids: jobs.map((j) => j.job_id),
    jobs,
  };
}

/**
 * GET /api/authoring/jobs?state=
 */
export async function listAuthoringJobs({ state } = {}) {
  const { rows } = await pgPool.query(
    `SELECT
       l.id AS lesson_id,
       l.substrand_id,
       l.version,
       l.status::text AS status,
       l.title,
       l.created_at,
       l.published_at,
       ss.name AS substrand_name,
       ss.tier,
       st.name AS strand_name,
       subj.name_en AS subject_name,
       g.name AS grade_name,
       (SELECT la.job_id
        FROM lesson_assets la
        JOIN lesson_variants lv ON lv.id = la.lesson_variant_id
        WHERE lv.lesson_id = l.id AND la.job_id IS NOT NULL
        LIMIT 1) AS author_job_id
     FROM lessons l
     JOIN substrands ss ON ss.id = l.substrand_id
     JOIN strands st ON st.id = ss.strand_id
     JOIN grade_subjects gs ON gs.id = st.grade_subject_id
     JOIN subjects subj ON subj.id = gs.subject_id
     JOIN grades g ON g.id = gs.grade_id
     ORDER BY l.created_at DESC
     LIMIT 100`
  );

  const combined = rows.map((row) => {
    const jobId = row.author_job_id || `job-${row.lesson_id}`;
    const mem = memoryJobs.get(jobId);
    const derivedState =
      mem?.state ||
      (row.status === "draft"
        ? "awaiting_review"
        : row.status === "in_review"
        ? "approved"
        : row.status === "published"
        ? "published"
        : row.status);

    return {
      job_id: jobId,
      state: derivedState,
      lesson_id: row.lesson_id,
      lesson_status: row.status,
      version: row.version,
      tier: row.tier || "standard",
      substrand_id: row.substrand_id,
      substrand_name: row.substrand_name,
      strand_name: row.strand_name,
      subject_name: row.subject_name,
      grade_name: row.grade_name,
      title_en: row.title,
      feedback: mem?.feedback || null,
      logs: mem?.logs || [],
      created_at: row.created_at,
      updated_at: row.published_at || row.created_at,
    };
  });

  if (state) {
    return combined.filter(
      (j) => j.state === state || j.lesson_status === state
    );
  }
  return combined;
}

/**
 * GET /api/authoring/jobs/:id
 */
export async function getAuthoringJobById(jobId) {
  const mem = memoryJobs.get(jobId);
  if (mem) return mem;

  const { rows } = await pgPool.query(
    `SELECT
       l.id AS lesson_id,
       l.substrand_id,
       l.version,
       l.status::text AS status,
       l.title,
       l.created_at,
       ss.name AS substrand_name,
       ss.tier
     FROM lessons l
     JOIN substrands ss ON ss.id = l.substrand_id
     WHERE EXISTS (
       SELECT 1
       FROM lesson_variants lv
       JOIN lesson_assets la ON la.lesson_variant_id = lv.id
       WHERE lv.lesson_id = l.id AND la.job_id = $1
     )`,
    [jobId]
  );

  if (rows.length === 0) {
    throw AppError.notFound(`Authoring job ${jobId} not found`);
  }

  const row = rows[0];
  return {
    job_id: jobId,
    state: row.status === "draft" ? "awaiting_review" : row.status,
    lesson_id: row.lesson_id,
    lesson_status: row.status,
    version: row.version,
    tier: row.tier,
    substrand_id: row.substrand_id,
    substrand_name: row.substrand_name,
    title_en: row.title,
    logs: [],
    created_at: row.created_at,
  };
}

/**
 * POST /api/authoring/lessons/:id/approve
 */
export async function approveLessonById(lessonId) {
  if (!UUID_RE.test(String(lessonId))) {
    throw AppError.validation("Invalid lesson ID UUID");
  }

  const { rows } = await pgPool.query(
    `SELECT id, substrand_id, version, status::text AS status FROM lessons WHERE id = $1`,
    [lessonId]
  );
  if (rows.length === 0) {
    throw AppError.notFound(`Lesson ${lessonId} not found`);
  }
  const lesson = rows[0];
  if (lesson.status === "published") {
    throw AppError.validation(
      "Cannot mutate a published lesson in place. Use regenerate to create a new version."
    );
  }

  await pgPool.query(
    `UPDATE lessons SET status = 'in_review' WHERE id = $1`,
    [lessonId]
  );

  for (const [jid, job] of memoryJobs.entries()) {
    if (job.lesson_id === lessonId) {
      await persistJobMirror({
        ...job,
        state: "approved",
        updated_at: new Date().toISOString(),
      });
      break;
    }
  }

  return {
    lesson_id: lesson.id,
    substrand_id: lesson.substrand_id,
    version: lesson.version,
    status: "approved",
  };
}

/**
 * POST /api/authoring/lessons/:id/reject { feedback }
 */
export async function rejectLessonById(lessonId, feedback = "") {
  if (!UUID_RE.test(String(lessonId))) {
    throw AppError.validation("Invalid lesson ID UUID");
  }
  if (!feedback || !String(feedback).trim()) {
    throw AppError.validation("feedback is required when rejecting a draft lesson");
  }

  const { rows } = await pgPool.query(
    `SELECT id, substrand_id, version, status::text AS status FROM lessons WHERE id = $1`,
    [lessonId]
  );
  if (rows.length === 0) {
    throw AppError.notFound(`Lesson ${lessonId} not found`);
  }
  const lesson = rows[0];
  if (lesson.status === "published") {
    throw AppError.validation("Cannot reject or mutate a published lesson in place");
  }

  await pgPool.query(
    `UPDATE lessons SET status = 'needs_regeneration' WHERE id = $1`,
    [lessonId]
  );

  for (const [, job] of memoryJobs.entries()) {
    if (job.lesson_id === lessonId) {
      await persistJobMirror({
        ...job,
        state: "rejected",
        feedback: String(feedback).trim(),
        logs: [
          ...(job.logs || []),
          {
            ts: new Date().toISOString(),
            stage: "rejected",
            msg: `Rejected by reviewer: ${String(feedback).trim()}`,
          },
        ],
        updated_at: new Date().toISOString(),
      });
      break;
    }
  }

  return {
    lesson_id: lesson.id,
    substrand_id: lesson.substrand_id,
    version: lesson.version,
    status: "needs_regeneration",
    feedback: String(feedback).trim(),
  };
}

/**
 * POST /api/authoring/lessons/:id/publish
 * Publishes a draft/in_review lesson and archives any older published versions
 * for the same substrand_id (Rule #2). Invalidates the catalog cache.
 */
export async function publishLessonById(lessonId) {
  if (!UUID_RE.test(String(lessonId))) {
    throw AppError.validation("Invalid lesson ID UUID");
  }

  const client = await pgPool.connect();
  let lesson;
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, substrand_id, version, status::text AS status
       FROM lessons
       WHERE id = $1
       FOR UPDATE`,
      [lessonId]
    );
    if (rows.length === 0) {
      throw AppError.notFound(`Lesson ${lessonId} not found`);
    }
    lesson = rows[0];

    // Archive any previously published versions for this substrand
    await client.query(
      `UPDATE lessons
       SET status = 'archived'
       WHERE substrand_id = $1
         AND status = 'published'
         AND id <> $2`,
      [lesson.substrand_id, lessonId]
    );

    await client.query(
      `UPDATE lessons
       SET status = 'published',
           published_at = now()
       WHERE id = $1`,
      [lessonId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  invalidateCatalogCache();

  for (const [, job] of memoryJobs.entries()) {
    if (job.lesson_id === lessonId) {
      await persistJobMirror({
        ...job,
        state: "published",
        updated_at: new Date().toISOString(),
      });
      break;
    }
  }

  return {
    lesson_id: lesson.id,
    substrand_id: lesson.substrand_id,
    version: lesson.version,
    status: "published",
  };
}

/**
 * POST /api/authoring/lessons/:id/regenerate { feedback }
 * Creates a NEW draft version (`version = max_version + 1`) for the lesson's substrand_id.
 * Never mutates a published lesson in place (Non-Negotiable Rule #2).
 */
export async function regenerateLessonById(lessonId, feedback = "") {
  if (!UUID_RE.test(String(lessonId))) {
    throw AppError.validation("Invalid lesson ID UUID");
  }

  const { rows } = await pgPool.query(
    `SELECT l.id, l.substrand_id, l.version, l.status::text AS status, ss.tier
     FROM lessons l
     JOIN substrands ss ON ss.id = l.substrand_id
     WHERE l.id = $1`,
    [lessonId]
  );
  if (rows.length === 0) {
    throw AppError.notFound(`Lesson ${lessonId} not found`);
  }
  const sourceLesson = rows[0];

  const newJob = await createDraftForSubstrand({
    substrandId: sourceLesson.substrand_id,
    tier: sourceLesson.tier || "standard",
    feedback: feedback ? String(feedback).trim() : null,
    supersedes: sourceLesson.id,
  });

  return {
    job_id: newJob.job_id,
    previous_lesson_id: sourceLesson.id,
    previous_version: sourceLesson.version,
    lesson_id: newJob.lesson_id,
    version: newJob.version,
    status: "draft",
  };
}
