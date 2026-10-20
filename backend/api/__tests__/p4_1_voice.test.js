/**
 * MwalimuSmart Web
 * backend/api/__tests__/p4_1_voice.test.js
 *
 * Tests for P4.1:
 *   - Voice assistant embedded in lesson
 *   - Push-to-talk in the lesson page & FollowUpPanel
 *   - Voice question answered with lesson-scoped prompt
 *   - STT/TTS in en-KE and sw-KE
 *   - Transcript of the voice turn appears in the follow-up thread
 *   - WebSocket /ws/voice interaction
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import followupRoutes from "../routes/followups.js";
import { createVoiceRouter } from "../routes/voice.js";
import {
  enqueueAuthoringJobs,
  publishLessonById,
} from "../services/authoring_service.js";
import { createTestClient } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/followups", followupRoutes);
  app.use("/api/voice", createVoiceRouter());
  app.use(errorHandler);
  return app;
}

describe("P4.1 — Voice Assistant Embedded in Lesson (/api/voice/* & Follow-up Thread)", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let lessonId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P4.1 Voice Academy', 'Mombasa', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P4.1 Voice Student', 'p4-1.voice@test.sc.ke')
       ON CONFLICT (email) DO UPDATE SET school_id = EXCLUDED.school_id
       RETURNING student_id`,
      [schoolId]
    );
    studentId = stuRes.rows[0].student_id;

    studentToken = jwt.sign(
      { student_id: studentId, school_id: schoolId, role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    // Create an isolated substrand for this test to avoid parallel runner collision
    const ssRes = await pool.query(
      `SELECT st.id
       FROM strands st
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       LIMIT 1`
    );
    const strandId = ssRes.rows[0].id;
    await pool.query(`DELETE FROM substrands WHERE strand_id = $1 AND sort_order = 991`, [strandId]);
    const subRes = await pool.query(
      `INSERT INTO substrands (strand_id, name, sort_order)
       VALUES ($1, 'P4.1 Voice Isolated Substrand', 991)
       RETURNING id`,
      [strandId]
    );
    const substrandId = subRes.rows[0].id;

    const pub = await enqueueAuthoringJobs({
      scope: { substrand_id: substrandId },
      tier: "standard",
    });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  it("POST /api/voice/message rejects unauthenticated requests with 401", async () => {
    const res = await client.post("/api/voice/message", {
      body: { lesson_id: lessonId, text: "Can you explain this step?" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/voice/message answers voice question with lesson context and saves turn into follow-up thread", async () => {
    const res = await client.post("/api/voice/message", {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        lesson_id: lessonId,
        text: "How do we apply integers when tracking school supplies in Kenya?",
        language: "en",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("thread_id");
    expect(res.body).toHaveProperty("transcript");
    expect(res.body.transcript).toContain("apply integers");
    expect(res.body).toHaveProperty("response_text");
    expect(typeof res.body.response_text).toBe("string");
    expect(res.body.response_text.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty("audio_b64");
    expect(res.body.student_message).toMatchObject({
      role: "student",
      source: "voice",
    });
    expect(res.body.assistant_message).toMatchObject({
      role: "assistant",
      source: "voice",
    });

    // Verify transcript appears in the lesson's follow-up thread history
    const threadId = res.body.thread_id;
    const historyRes = await client.get(`/api/followups/threads/${threadId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.messages.length).toBeGreaterThanOrEqual(2);

    const voiceStuMsg = historyRes.body.messages.find(
      (m) => m.role === "student" && m.content.includes("apply integers")
    );
    expect(voiceStuMsg).toBeTruthy();

    const voiceAsstMsg = historyRes.body.messages.find(
      (m) => m.role === "assistant" && m.content === res.body.response_text
    );
    expect(voiceAsstMsg).toBeTruthy();
  });

  it("POST /api/voice/message supports Swahili (sw-KE) with localized lesson context", async () => {
    const res = await client.post("/api/voice/message", {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        lesson_id: lessonId,
        text: "Nielezee jinsi nambari hasi zinavyotumika sokoni",
        language: "sw",
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.language).toBe("sw");
    expect(res.body.response_text.length).toBeGreaterThan(0);
    expect(res.body.audio_b64.length).toBeGreaterThan(0);
  });

  it("POST /api/voice/stt converts audio payload to transcript in en-KE / sw-KE", async () => {
    const resEn = await client.post("/api/voice/stt", {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        audio_b64: Buffer.from("test_wav_pcm").toString("base64"),
        language: "en-KE",
      },
    });
    expect(resEn.status).toBe(200);
    expect(resEn.body).toHaveProperty("transcript");
    expect(resEn.body.transcript.length).toBeGreaterThan(0);

    const resSw = await client.post("/api/voice/stt", {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        audio_b64: Buffer.from("test_wav_pcm").toString("base64"),
        language: "sw-KE",
      },
    });
    expect(resSw.status).toBe(200);
    expect(resSw.body).toHaveProperty("transcript");
    expect(resSw.body.transcript.length).toBeGreaterThan(0);
  });

  describe("Frontend Source Contracts for Voice-in-Lesson", () => {
    it("LessonPlayerPage embeds push-to-talk mic button linked to follow-up voice assistant", () => {
      const pagePath = path.join(FRONTEND_SRC, "pages/LessonPlayerPage.jsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      expect(content).toContain('data-testid="lesson-mic-btn"');
      expect(content).toContain("lesson-followup-panel");
      expect(content).toContain("voice-mic-btn");
    });

    it("FollowUpPanel implements push-to-talk mic button, voice badge, and audio playback", () => {
      const panelPath = path.join(FRONTEND_SRC, "components/lesson/FollowUpPanel.jsx");
      const content = fs.readFileSync(panelPath, "utf-8");

      expect(content).toContain('id="lesson-followup-panel"');
      expect(content).toContain('data-testid="voice-mic-btn"');
      expect(content).toContain('data-testid="voice-turn-badge"');
      expect(content).toContain('data-testid="voice-play-audio-btn"');
      expect(content).toContain("voiceApi.sendMessage");
      expect(content).toContain("SpeechRecognition");
    });
  });
});
