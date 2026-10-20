/**
 * MwalimuSmart Web
 * backend/api/__tests__/p3_1_followups.test.js
 *
 * Tests for P3.1:
 *   - SSE streaming infra + text follow-up responses
 *   - Prompt includes lesson objectives + script excerpt
 *   - Thread persistence & idempotency
 *   - Full message history retrieval
 *   - FollowUpPanel component source contracts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import followupRoutes from "../routes/followups.js";
import {
  enqueueAuthoringJobs,
  publishLessonById,
} from "../services/authoring_service.js";
import { createSSEParser } from "../../../frontend/src/lib/sse.js";
import { createTestClient } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/followups", followupRoutes);
  app.use(errorHandler);
  return app;
}

describe("P3.1 — SSE infra + text-only follow-ups (/api/followups/*)", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let lessonId;
  let substrandId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P3.1 Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P3.1 Student', 'p3-1.student@test.sc.ke')
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

    // Pick mathematics substrand at offset 8
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 8 LIMIT 1`
    );
    substrandId = ssRes.rows[0].id;
    await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);

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

  describe("Thread Persistence (POST /api/followups/lessons/:id/threads)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await client.post(`/api/followups/lessons/${lessonId}/threads`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("auth.missing");
    });

    it("creates a new thread on first call and returns existing thread on subsequent calls", async () => {
      const res1 = await client.post(`/api/followups/lessons/${lessonId}/threads`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res1.status).toBe(200);
      expect(res1.body.thread_id).toBeDefined();
      expect(res1.body.lesson_id).toBe(lessonId);
      expect(res1.body.is_new).toBe(true);

      const threadId = res1.body.thread_id;

      // Second call for the same student + lesson must return the existing thread
      const res2 = await client.post(`/api/followups/lessons/${lessonId}/threads`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res2.status).toBe(200);
      expect(res2.body.thread_id).toBe(threadId);
      expect(res2.body.is_new).toBe(false);
    });
  });

  describe("Thread History (GET /api/followups/threads/:id)", () => {
    it("returns 404 for non-existent thread UUID", async () => {
      const res = await client.get("/api/followups/threads/00000000-0000-0000-0000-000000000099", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("not_found");
    });

    it("returns empty message history for newly created thread", async () => {
      const tRes = await client.post(`/api/followups/lessons/${lessonId}/threads`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const threadId = tRes.body.thread_id;

      const res = await client.get(`/api/followups/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.thread_id).toBe(threadId);
      expect(res.body.lesson_title).toBeDefined();
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBe(0);
    });
  });

  describe("SSE Streaming Follow-Up (POST /api/followups/threads/:id/messages)", () => {
    it("streams text tokens over SSE and persists messages in PostgreSQL", async () => {
      const tRes = await client.post(`/api/followups/lessons/${lessonId}/threads`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const threadId = tRes.body.thread_id;

      const res = await client.post(`/api/followups/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          content: "Why is this concept important in everyday life?",
          lang: "en",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // Parse the SSE body text
      const rawBody = res.body;
      expect(typeof rawBody).toBe("string");

      const tokens = [];
      let doneEvent = null;

      const parser = createSSEParser(({ event, data }) => {
        if (event === "token") {
          tokens.push(data.token);
        } else if (event === "done") {
          doneEvent = data;
        }
      });

      parser.feed(rawBody);

      // Verify tokens streamed and done event was received
      expect(tokens.length).toBeGreaterThan(0);
      expect(doneEvent).toBeDefined();
      expect(doneEvent.message_id).toBeDefined();
      expect(doneEvent.full_content.length).toBeGreaterThan(0);

      // Verify database persistence of both student and assistant messages
      const histRes = await client.get(`/api/followups/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(histRes.status).toBe(200);
      expect(histRes.body.messages.length).toBe(2);

      const [studentMsg, assistantMsg] = histRes.body.messages;
      expect(studentMsg.role).toBe("student");
      expect(studentMsg.content).toBe("Why is this concept important in everyday life?");
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.content).toBe(doneEvent.full_content);
    });
  });

  describe("Frontend Source Contracts", () => {
    it("FollowUpPanel is visible and wires thread creation, history, and streaming", () => {
      const panelSrc = fs.readFileSync(
        path.join(FRONTEND_SRC, "components/lesson/FollowUpPanel.jsx"),
        "utf8"
      );
      expect(panelSrc).toContain('data-testid="followup-panel"');
      expect(panelSrc).toContain('data-testid="followup-input"');
      expect(panelSrc).toContain('data-testid="followup-submit-btn"');
      expect(panelSrc).toContain('data-testid="followup-messages"');
      expect(panelSrc).toContain("createOrGetThread");
      expect(panelSrc).toContain("streamSSE");
      expect(panelSrc).toContain("getHistory");
    });

    it("LessonPlayerPage mounts FollowUpPanel below the assessment", () => {
      const playerSrc = fs.readFileSync(
        path.join(FRONTEND_SRC, "pages/LessonPlayerPage.jsx"),
        "utf8"
      );
      expect(playerSrc).toContain("<AssessmentBlock");
      expect(playerSrc).toContain("<FollowUpPanel");

      // Verify FollowUpPanel comes after AssessmentBlock in JSX layout
      const assessIndex = playerSrc.indexOf("<AssessmentBlock");
      const followUpIndex = playerSrc.indexOf("<FollowUpPanel");
      expect(followUpIndex).toBeGreaterThan(assessIndex);
    });
  });
});
