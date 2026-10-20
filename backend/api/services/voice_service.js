/**
 * MwalimuSmart Web
 * backend/api/services/voice_service.js — Embedded Voice Assistant Service (Phase 4.1)
 *
 * Responsibilities:
 *   - Fetch lesson context (objectives, script excerpt, key concepts, CBC metadata)
 *   - Route voice question through lesson-scoped NLU / Q&A prompt
 *   - Persist student voice transcript and assistant voice reply into the lesson's follow-up thread
 *   - Return audio bytes (TTS in en-KE / sw-KE) + full transcript for UI playback
 */

import { pool } from "../db.js";
import { AppError } from "../utils/errors.js";
import { getOrCreateThread } from "./followup_service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(raw, label) {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!UUID_RE.test(id)) {
    throw new AppError("validation", `Invalid ${label}: must be a valid UUID`);
  }
  return id;
}

/**
 * Fetch pedagogical lesson context from Postgres to ground voice NLU and Q&A.
 */
export async function getLessonVoiceContext(lessonIdRaw, lang = "en") {
  const lessonId = assertUuid(lessonIdRaw, "lesson_id");
  const normalizedLang = lang === "sw" ? "sw" : "en";

  const res = await pool.query(
    `SELECT
       l.id,
       l.title,
       l.substrand_id,
       lv.objectives,
       lv.key_concepts,
       lv.script,
       ss.name AS substrand_name,
       st.name AS strand_name,
       s.name_en AS subject_name_en,
       s.name_sw AS subject_name_sw,
       g.name AS grade_name
     FROM lessons l
     JOIN lesson_variants lv ON lv.lesson_id = l.id
     JOIN substrands ss ON ss.id = l.substrand_id
     JOIN strands st ON st.id = ss.strand_id
     JOIN grade_subjects gs ON gs.id = st.grade_subject_id
     JOIN subjects s ON s.id = gs.subject_id
     JOIN grades g ON g.id = gs.grade_id
     WHERE l.id = $1
     ORDER BY CASE WHEN lv.language::text = $2 THEN 0 ELSE 1 END ASC
     LIMIT 1`,
    [lessonId, normalizedLang]
  );

  if (res.rows.length === 0) {
    throw new AppError("not_found", `Published lesson ${lessonId} not found`);
  }

  const row = res.rows[0];
  const variant = row.script || {};

  let scriptExcerpt = "";
  if (Array.isArray(variant?.scenes)) {
    scriptExcerpt = variant.scenes
      .slice(0, 3)
      .map((s) => s.narration || s.text || "")
      .filter(Boolean)
      .join("\n\n");
  } else if (typeof variant === "string") {
    scriptExcerpt = variant.slice(0, 800);
  }

  return {
    lesson_id: row.id,
    lesson_title: row.title,
    objectives: Array.isArray(row.objectives) ? row.objectives : [],
    key_concepts: Array.isArray(row.key_concepts) ? row.key_concepts : [],
    script_excerpt: scriptExcerpt,
    grade_name: row.grade_name,
    subject_name: normalizedLang === "sw" ? row.subject_name_sw : row.subject_name_en,
    strand_name: row.strand_name,
    substrand_name: row.substrand_name,
    language: normalizedLang,
  };
}

/**
 * Process a complete voice question turn:
 *   1. Resolve lesson context
 *   2. Run through VoiceAssistant via PythonBridge
 *   3. Persist transcript & response in followup_threads
 *   4. Return audio + transcript
 */
export async function processVoiceTurn({
  schoolId,
  studentId,
  lessonId,
  text,
  language = "en",
  bridge,
}) {
  if (!text || !text.trim()) {
    throw new AppError("validation", "Voice message text is required");
  }
  if (!studentId) {
    throw new AppError("auth.forbidden", "Student ID is required for voice turns");
  }

  const normalizedLang = language === "sw" || language === "sw-KE" ? "sw" : "en";
  const lessonContext = await getLessonVoiceContext(lessonId, normalizedLang);

  // Invoke VoiceAssistant through Python bridge
  const voiceResult = await bridge.invokeVoice({
    school_id: schoolId || "default_school",
    student_id: studentId,
    lesson_id: lessonId,
    text: text.trim(),
    language: normalizedLang,
    lesson_context: lessonContext,
  });

  const responseText = voiceResult.response_text || "";

  // Persist conversation turn into follow-up thread for this student and lesson
  const thread = await getOrCreateThread({
    studentId,
    lessonIdRaw: lessonId,
  });

  // 1. Insert student's voice question
  const stuRes = await pool.query(
    `INSERT INTO followup_messages (thread_id, role, content, has_visual, visual_spec)
     VALUES ($1, 'student', $2, false, $3)
     RETURNING id, created_at`,
    [
      thread.thread_id,
      text.trim(),
      JSON.stringify({ source: "voice", language: normalizedLang }),
    ]
  );
  const stuMsg = stuRes.rows[0];

  // 2. Insert assistant's voice answer
  const asstRes = await pool.query(
    `INSERT INTO followup_messages (thread_id, role, content, has_visual, visual_spec)
     VALUES ($1, 'assistant', $2, false, $3)
     RETURNING id, created_at`,
    [
      thread.thread_id,
      responseText,
      JSON.stringify({ source: "voice", language: normalizedLang, has_audio: Boolean(voiceResult.audio_b64) }),
    ]
  );
  const asstMsg = asstRes.rows[0];

  return {
    thread_id: thread.thread_id,
    lesson_id: lessonId,
    student_message: {
      id: stuMsg.id,
      role: "student",
      content: text.trim(),
      source: "voice",
      created_at: stuMsg.created_at,
    },
    assistant_message: {
      id: asstMsg.id,
      role: "assistant",
      content: responseText,
      source: "voice",
      created_at: asstMsg.created_at,
    },
    transcript: text.trim(),
    response_text: responseText,
    audio_b64: voiceResult.audio_b64 || "",
    action: voiceResult.action || {},
    language: normalizedLang,
  };
}
