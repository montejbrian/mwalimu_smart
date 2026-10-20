/**
 * MwalimuSmart Web
 * backend/api/services/followup_service.js — Lesson-scoped AI follow-up service (Phase 3)
 *
 * Responsibilities:
 *   - Thread persistence & history retrieval
 *   - Context assembly (lesson objectives, script excerpt, key concepts)
 *   - Real-time token-by-token SSE streaming via followups.stream
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { pool, getDb } from "../db.js";
import { AppError } from "../utils/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.resolve(__dirname, "../..");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(raw, label) {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!UUID_RE.test(id)) {
    throw new AppError("validation", `Invalid ${label}: must be a valid UUID`);
  }
  return id;
}

function requireStudent(studentId) {
  if (!studentId) {
    throw new AppError("auth.forbidden", "Student ID is required");
  }
  return studentId;
}

/**
 * POST /api/followups/lessons/:lesson_id/threads
 * Returns an existing thread if one exists for (student_id, lesson_id), or creates a new one.
 */
export async function getOrCreateThread({ studentId, lessonIdRaw }) {
  const lessonId = assertUuid(lessonIdRaw, "lesson_id");
  const sid = requireStudent(studentId);

  // Check existing thread
  const existing = await pool.query(
    `SELECT id, student_id, lesson_id, created_at
     FROM followup_threads
     WHERE student_id = $1 AND lesson_id = $2
     LIMIT 1`,
    [sid, lessonId]
  );
  if (existing.rows.length > 0) {
    return {
      thread_id: existing.rows[0].id,
      lesson_id: existing.rows[0].lesson_id,
      created_at: existing.rows[0].created_at,
      is_new: false,
    };
  }

  // Create new thread
  const inserted = await pool.query(
    `INSERT INTO followup_threads (student_id, lesson_id)
     VALUES ($1, $2)
     RETURNING id, student_id, lesson_id, created_at`,
    [sid, lessonId]
  );
  return {
    thread_id: inserted.rows[0].id,
    lesson_id: inserted.rows[0].lesson_id,
    created_at: inserted.rows[0].created_at,
    is_new: true,
  };
}

/**
 * GET /api/followups/threads/:thread_id
 * Returns full message history for a thread.
 */
export async function getThreadHistory(threadIdRaw, studentId = null) {
  const threadId = assertUuid(threadIdRaw, "thread_id");

  const threadRes = await pool.query(
    `SELECT ft.id, ft.student_id, ft.lesson_id, ft.created_at, l.title AS lesson_title
     FROM followup_threads ft
     JOIN lessons l ON l.id = ft.lesson_id
     WHERE ft.id = $1`,
    [threadId]
  );
  if (threadRes.rows.length === 0) {
    throw new AppError("not_found", "Follow-up thread not found");
  }

  const thread = threadRes.rows[0];
  if (studentId && thread.student_id !== studentId) {
    throw new AppError("auth.forbidden", "You cannot access this thread");
  }

  const msgsRes = await pool.query(
    `SELECT id, role, content, has_visual, visual_spec, created_at
     FROM followup_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [threadId]
  );

  return {
    thread_id: thread.id,
    lesson_id: thread.lesson_id,
    lesson_title: thread.lesson_title,
    created_at: thread.created_at,
    messages: msgsRes.rows,
  };
}

/**
 * GET /api/followups/threads
 * Returns all saved follow-up Q&A threads for the student across all lessons (P3.4).
 */
export async function getStudentSavedThreads({ studentId, lang = "en" }) {
  const sid = requireStudent(studentId);

  const res = await pool.query(
    `SELECT
       ft.id AS thread_id,
       ft.student_id,
       ft.lesson_id,
       ft.created_at,
       l.title AS lesson_title,
       ss.name AS substrand_name,
       st.name AS strand_name,
       CASE WHEN $2 = 'sw' THEN s.name_sw ELSE s.name_en END AS subject_name,
       g.name AS grade_name,
       COUNT(fm.id)::int AS message_count,
       COUNT(CASE WHEN fm.has_visual = true THEN 1 END)::int AS visual_count,
       MAX(fm.created_at) AS last_active_at,
       (
         SELECT content FROM followup_messages
         WHERE thread_id = ft.id AND role = 'student'
         ORDER BY created_at DESC LIMIT 1
       ) AS last_question,
       (
         SELECT content FROM followup_messages
         WHERE thread_id = ft.id AND role = 'assistant'
         ORDER BY created_at DESC LIMIT 1
       ) AS last_answer,
       (
         SELECT json_agg(visual_spec) FROM followup_messages
         WHERE thread_id = ft.id AND has_visual = true AND visual_spec IS NOT NULL
       ) AS saved_visuals
     FROM followup_threads ft
     JOIN lessons l ON l.id = ft.lesson_id
     JOIN substrands ss ON ss.id = l.substrand_id
     JOIN strands st ON st.id = ss.strand_id
     JOIN grade_subjects gs ON gs.id = st.grade_subject_id
     JOIN subjects s ON s.id = gs.subject_id
     JOIN grades g ON g.id = gs.grade_id
     LEFT JOIN followup_messages fm ON fm.thread_id = ft.id
     WHERE ft.student_id = $1
     GROUP BY ft.id, ft.student_id, ft.lesson_id, ft.created_at, l.title, ss.name, st.name, s.name_sw, s.name_en, g.name
     HAVING COUNT(fm.id) > 0
     ORDER BY MAX(fm.created_at) DESC NULLS LAST, ft.created_at DESC`,
    [sid, lang === "sw" ? "sw" : "en"]
  );

  return {
    threads: res.rows.map((row) => ({
      thread_id: row.thread_id,
      lesson_id: row.lesson_id,
      lesson_title: row.lesson_title,
      substrand_name: row.substrand_name,
      strand_name: row.strand_name,
      subject_name: row.subject_name,
      grade_name: row.grade_name,
      message_count: row.message_count,
      visual_count: row.visual_count,
      last_active_at: row.last_active_at || row.created_at,
      last_question: row.last_question || "",
      last_answer: row.last_answer || "",
      saved_visuals: Array.isArray(row.saved_visuals) ? row.saved_visuals : [],
    })),
  };
}

/**
 * Helper to build script excerpt from variant script object
 */
function extractScriptExcerpt(scriptObj) {
  if (!scriptObj || typeof scriptObj !== "object") return "";
  const parts = [];
  if (scriptObj.introduction) parts.push(scriptObj.introduction);
  const sections = scriptObj.sections || scriptObj.body_sections || [];
  for (const s of sections.slice(0, 3)) {
    if (s.heading) parts.push(`### ${s.heading}`);
    if (s.content) parts.push(s.content);
  }
  return parts.join("\n\n").slice(0, 2000);
}

/**
 * Runs Python visual router to classify question for Tier 1 SVG templates.
 */
export function runVisualRouter(question, lessonTitle) {
  return new Promise((resolve) => {
    try {
      const venvPython = path.join(BACKEND_DIR, "venv/bin/python3");
      const pythonBin = process.env.PYTHON_BIN || venvPython;

      const child = spawn(pythonBin, ["-m", "followups.visual_router"], {
        cwd: BACKEND_DIR,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk.toString();
      });

      child.on("close", () => {
        try {
          const parsed = JSON.parse(out.trim());
          resolve(parsed);
        } catch {
          resolve({ match: false, no_match: true });
        }
      });

      child.on("error", () => {
        resolve({ match: false, no_match: true });
      });

      child.stdin.write(JSON.stringify({ question, lesson_title: lessonTitle }));
      child.stdin.end();
    } catch {
      resolve({ match: false, no_match: true });
    }
  });
}

/**
 * POST /api/followups/threads/:thread_id/messages
 * Streams follow-up text tokens over SSE and routes Tier 1 visual templates.
 */
export async function streamFollowUpResponse({
  threadIdRaw,
  studentId,
  content,
  lang = "en",
  with_visuals = true,
  res,
}) {
  const threadId = assertUuid(threadIdRaw, "thread_id");
  const sid = requireStudent(studentId);

  const cleanContent = typeof content === "string" ? content.trim() : "";
  if (!cleanContent) {
    throw new AppError("validation", "Message content cannot be empty");
  }

  // 1. Fetch thread and lesson context
  const ctxRes = await pool.query(
    `SELECT ft.id AS thread_id, ft.student_id, ft.lesson_id, l.title, ss.name AS substrand_name,
            st.name AS strand_name, s.name_en AS subject_name_en, s.name_sw AS subject_name_sw,
            g.name AS grade_name, lv.script, lv.objectives, lv.key_concepts, lv.language
     FROM followup_threads ft
     JOIN lessons l ON l.id = ft.lesson_id
     JOIN substrands ss ON ss.id = l.substrand_id
     JOIN strands st ON st.id = ss.strand_id
     JOIN grade_subjects gs ON gs.id = st.grade_subject_id
     JOIN subjects s ON s.id = gs.subject_id
     JOIN grades g ON g.id = gs.grade_id
     JOIN lesson_variants lv ON lv.lesson_id = l.id
     WHERE ft.id = $1
     ORDER BY CASE WHEN lv.language::text = $2 THEN 0 ELSE 1 END ASC
     LIMIT 1`,
    [threadId, lang === "sw" ? "sw" : "en"]
  );

  if (ctxRes.rows.length === 0) {
    throw new AppError("not_found", "Thread not found");
  }

  const ctx = ctxRes.rows[0];
  if (ctx.student_id !== sid) {
    throw new AppError("auth.forbidden", "You cannot post to this thread");
  }

  // 2. Fetch recent conversation history
  const historyRes = await pool.query(
    `SELECT role, content
     FROM followup_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC
     LIMIT 10`,
    [threadId]
  );

  // 3. Insert student message
  await pool.query(
    `INSERT INTO followup_messages (thread_id, role, content)
     VALUES ($1, 'student', $2)`,
    [threadId, cleanContent]
  );

  // 4. Set up SSE stream
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  // SSE Heartbeat every 15s
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  const cleanUp = () => {
    clearInterval(heartbeat);
  };

  // Visual router (Feature Flag gated via FF_TIER1_VISUALS)
  const enableVisuals = process.env.FF_TIER1_VISUALS !== "false";
  const shouldRouteVisuals = with_visuals !== false && enableVisuals;

  let matchedVisualSpec = null;
  let visualPromise = null;

  if (shouldRouteVisuals) {
    visualPromise = runVisualRouter(cleanContent, ctx.title)
      .then(async (visualResult) => {
        if (!visualResult || !visualResult.match) {
          return null;
        }

        if (visualResult.tier === 1) {
          matchedVisualSpec = {
            tier: 1,
            template_id: visualResult.template_id,
            params: visualResult.params,
          };
          res.write(
            `event: visual_queued\ndata: ${JSON.stringify({
              tier: 1,
              template_id: visualResult.template_id,
            })}\n\n`
          );
          res.write(
            `event: visual_ready\ndata: ${JSON.stringify({
              tier: 1,
              template_id: visualResult.template_id,
              params: visualResult.params,
            })}\n\n`
          );
        } else if (visualResult.tier === 2) {
          // Tier 2: Enqueue Manim follow-up job and notify client immediately (<200ms)
          const jobId = uuidv4();
          matchedVisualSpec = {
            tier: 2,
            job_id: jobId,
            status: "queued",
            prompt: cleanContent,
            concept: visualResult.concept || cleanContent,
            created_at: new Date().toISOString(),
          };

          res.write(
            `event: visual_queued\ndata: ${JSON.stringify({
              tier: 2,
              job_id: jobId,
              status: "queued",
              placeholder: "Preparing custom animation...",
            })}\n\n`
          );

          try {
            const db = await getDb();
            await db.collection("followup_visual_jobs").insertOne({
              job_id: jobId,
              student_id: sid,
              lesson_id: ctx.lesson_id,
              thread_id: threadId,
              question: cleanContent,
              concept: visualResult.concept || cleanContent,
              scene_prompt: visualResult.scene_prompt || `Visualizing ${cleanContent}`,
              status: "queued",
              created_at: new Date(),
              updated_at: new Date(),
            });
          } catch {
            // Mongo queue insertion is non-blocking to stream
          }
        } else if (visualResult.tier === "whiteboard") {
          // Progressive Whiteboard: stream draw ops directly to client
          matchedVisualSpec = {
            tier: "whiteboard",
            template_id: "whiteboard",
            title: visualResult.title || `Whiteboard: ${ctx.title}`,
            ops: visualResult.ops || [],
          };

          res.write(
            `event: visual_queued\ndata: ${JSON.stringify({
              tier: "whiteboard",
              template_id: "whiteboard",
              status: "streaming",
              placeholder: "Streaming progressive whiteboard...",
            })}\n\n`
          );

          if (Array.isArray(visualResult.ops)) {
            for (const op of visualResult.ops) {
              res.write(
                `event: whiteboard_op\ndata: ${JSON.stringify(op)}\n\n`
              );
            }
          }

          res.write(
            `event: visual_ready\ndata: ${JSON.stringify(matchedVisualSpec)}\n\n`
          );
        }
        return matchedVisualSpec;
      })
      .catch(() => null);
  }

  const payload = {
    lesson_title: ctx.title,
    objectives: Array.isArray(ctx.objectives) ? ctx.objectives : [],
    script_excerpt: extractScriptExcerpt(ctx.script),
    key_concepts: Array.isArray(ctx.key_concepts) ? ctx.key_concepts : [],
    conversation_history: historyRes.rows.map((r) => ({ role: r.role, content: r.content })),
    question: cleanContent,
    grade_name: ctx.grade_name,
    subject_name: lang === "sw" ? ctx.subject_name_sw : ctx.subject_name_en,
    strand_name: ctx.strand_name,
    lang: lang === "sw" ? "sw" : "en",
  };

  const venvPython = path.join(BACKEND_DIR, "venv/bin/python3");
  const pythonBin = process.env.PYTHON_BIN || venvPython;

  const child = spawn(pythonBin, ["-m", "followups.stream"], {
    cwd: BACKEND_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();

  let fullResponseText = "";
  let buffer = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop(); // Keep partial line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.token) {
          fullResponseText += parsed.token;
          res.write(`event: token\ndata: ${JSON.stringify({ token: parsed.token })}\n\n`);
        } else if (parsed.done) {
          const finalContent = parsed.full_text || fullResponseText;
          // Ensure visual router has finished if active
          Promise.resolve(visualPromise)
            .then(async () => {
              const saveRes = await pool.query(
                `INSERT INTO followup_messages (thread_id, role, content, has_visual, visual_spec)
                 VALUES ($1, 'assistant', $2, $3, $4)
                 RETURNING id`,
                [
                  threadId,
                  finalContent,
                  Boolean(matchedVisualSpec),
                  matchedVisualSpec ? JSON.stringify(matchedVisualSpec) : null,
                ]
              );
              const msgId = saveRes.rows[0]?.id;
              res.write(
                `event: done\ndata: ${JSON.stringify({
                  message_id: msgId,
                  full_content: finalContent,
                  has_visual: Boolean(matchedVisualSpec),
                  visual_spec: matchedVisualSpec || null,
                })}\n\n`
              );
              cleanUp();
              res.end();
            })
            .catch(() => {
              cleanUp();
              res.end();
            });
        } else if (parsed.error) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: parsed.error })}\n\n`);
          cleanUp();
          res.end();
        }
      } catch {
        // Skip malformed lines
      }
    }
  });

  child.stderr.on("data", () => {
    // Non-fatal logging from python
  });

  child.on("error", (err) => {
    res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    cleanUp();
    res.end();
  });

  res.on("close", () => {
    cleanUp();
    child.kill();
  });
}

/**
 * Retrieves the status and result of a Tier 2 visual job.
 */
export async function getFollowUpVisualJob(jobId) {
  // 1. Check MongoDB
  try {
    const db = await getDb();
    const job = await db.collection("followup_visual_jobs").findOne({ job_id: jobId });
    if (job) {
      return {
        job_id: job.job_id,
        status: job.status,
        asset_url: job.asset_url || null,
        error: job.error || null,
        created_at: job.created_at,
      };
    }
  } catch {
    // Fall back to Postgres if MongoDB is unreachable
  }

  // 2. Check PostgreSQL followup_messages
  const msgRes = await pool.query(
    `SELECT visual_spec FROM followup_messages WHERE visual_spec->>'job_id' = $1 LIMIT 1`,
    [jobId]
  );
  if (msgRes.rows.length > 0 && msgRes.rows[0].visual_spec) {
    const spec = msgRes.rows[0].visual_spec;
    return {
      job_id: spec.job_id,
      status: spec.status || "queued",
      asset_url: spec.asset_url || null,
      error: spec.error || null,
    };
  }

  throw new AppError("not_found", "Visual job not found");
}

/**
 * Updates a Tier 2 visual job in MongoDB and PostgreSQL.
 */
export async function updateFollowUpVisualJob({ jobId, status, asset_url = null, error = null }) {
  // 1. Update MongoDB
  try {
    const db = await getDb();
    await db.collection("followup_visual_jobs").updateOne(
      { job_id: jobId },
      {
        $set: {
          status,
          asset_url: asset_url || null,
          error: error || null,
          updated_at: new Date(),
        },
      }
    );
  } catch {
    // Ignore
  }

  // 2. Update PostgreSQL followup_messages
  const updateRes = await pool.query(
    `UPDATE followup_messages
     SET visual_spec = jsonb_set(
       jsonb_set(
         jsonb_set(coalesce(visual_spec, '{}'::jsonb), '{status}', to_jsonb($2::text)),
         '{asset_url}', to_jsonb($3::text)
       ),
       '{error}', to_jsonb($4::text)
     )
     WHERE visual_spec->>'job_id' = $1
     RETURNING id, thread_id`,
    [jobId, status, asset_url || "", error || ""]
  );

  return {
    job_id: jobId,
    status,
    asset_url,
    error,
    thread_id: updateRes.rows[0]?.thread_id,
  };
}
