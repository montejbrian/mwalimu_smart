/**
 * MwalimuSmart Web
 * backend/api/__tests__/p3_4_saved_threads.test.js
 *
 * Tests for P3.4:
 *   - Thread history persistence & reload
 *   - Prior Tier 1 visual re-rendering from stored visual_spec
 *   - Prior Tier 2 video playback from stored asset_url
 *   - GET /api/followups/threads aggregating saved Q&A per lesson
 *   - My Learning UI contracts (saved-qa-section, saved-qa-card, open-thread-btn)
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

describe("P3.4 — Thread history + saved visual gallery (/api/followups/threads)", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let lessonId1;
  let lessonId2;
  let threadId1;
  let threadId2;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P3.4 History School', 'Kisumu', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P3.4 Student History', 'p3-4.student@test.sc.ke')
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

    // Pick two substrands from mathematics
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       LIMIT 2`
    );
    const sub1 = ssRes.rows[0].id;
    const sub2 = ssRes.rows[1].id;

    await pool.query(`DELETE FROM lessons WHERE substrand_id IN ($1, $2)`, [sub1, sub2]);

    const pub1 = await enqueueAuthoringJobs({
      scope: { substrand_id: sub1 },
      tier: "standard",
    });
    lessonId1 = pub1.jobs[0].lesson_id;
    await publishLessonById(lessonId1);

    const pub2 = await enqueueAuthoringJobs({
      scope: { substrand_id: sub2 },
      tier: "standard",
    });
    lessonId2 = pub2.jobs[0].lesson_id;
    await publishLessonById(lessonId2);

    // Create thread 1 on lesson 1
    const t1 = await pool.query(
      `INSERT INTO followup_threads (student_id, lesson_id)
       VALUES ($1, $2)
       RETURNING id`,
      [studentId, lessonId1]
    );
    threadId1 = t1.rows[0].id;

    // Add messages to thread 1: student question, Tier 1 visual assistant message
    await pool.query(
      `INSERT INTO followup_messages (thread_id, role, content, has_visual, visual_spec)
       VALUES
         ($1, 'student', 'How do you multiply negative numbers on a number line?', false, NULL),
         ($1, 'assistant', 'Here is the step-by-step number line jump.', true, $2)`,
      [
        threadId1,
        JSON.stringify({
          tier: 1,
          template_id: "number_line",
          title: "Negative Multiplication",
          params: { min: -10, max: 10, jumps: [{ from: 0, to: -6, label: "2 * (-3)" }] },
        }),
      ]
    );

    // Create thread 2 on lesson 2
    const t2 = await pool.query(
      `INSERT INTO followup_threads (student_id, lesson_id)
       VALUES ($1, $2)
       RETURNING id`,
      [studentId, lessonId2]
    );
    threadId2 = t2.rows[0].id;

    // Add messages to thread 2: student question, Tier 2 video assistant message
    await pool.query(
      `INSERT INTO followup_messages (thread_id, role, content, has_visual, visual_spec)
       VALUES
         ($1, 'student', 'Can you animate 3D rotation of a cylinder?', false, NULL),
         ($1, 'assistant', 'Watch the 3D rotating cylinder below:', true, $2)`,
      [
        threadId2,
        JSON.stringify({
          tier: 2,
          job_id: "job_cyl_12345",
          asset_url: "https://cdn.mwalimusmart.co.ke/visuals/cylinder_3d.mp4",
          prompt: "3D cylinder rotation",
        }),
      ]
    );
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  it("GET /api/followups/threads rejects unauthenticated requests with 401", async () => {
    const res = await client.get("/api/followups/threads");
    expect(res.status).toBe(401);
  });

  it("GET /api/followups/threads returns aggregated saved threads with visual badges & snippets", async () => {
    const res = await client.get("/api/followups/threads", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("threads");
    expect(Array.isArray(res.body.threads)).toBe(true);

    const saved = res.body.threads;
    expect(saved.length).toBeGreaterThanOrEqual(2);

    const t1Data = saved.find((t) => t.thread_id === threadId1);
    expect(t1Data).toBeTruthy();
    expect(t1Data.lesson_id).toBe(lessonId1);
    expect(t1Data.message_count).toBe(2);
    expect(t1Data.visual_count).toBe(1);
    expect(t1Data.last_question).toContain("negative numbers");
    expect(t1Data.last_answer).toContain("number line jump");
    const t1HasVisual = t1Data.saved_visuals.some(
      (v) => v.tier === 1 && v.template_id === "number_line"
    );
    expect(t1HasVisual).toBe(true);

    const t2Data = saved.find((t) => t.thread_id === threadId2);
    expect(t2Data).toBeTruthy();
    expect(t2Data.lesson_id).toBe(lessonId2);
    expect(t2Data.message_count).toBe(2);
    expect(t2Data.visual_count).toBe(1);
    expect(t2Data.last_question).toContain("cylinder");
    const t2HasVisual = t2Data.saved_visuals.some(
      (v) => v.tier === 2 && v.asset_url === "https://cdn.mwalimusmart.co.ke/visuals/cylinder_3d.mp4"
    );
    expect(t2HasVisual).toBe(true);
  });

  it("GET /api/followups/threads supports ?lang=sw localization", async () => {
    const res = await client.get("/api/followups/threads?lang=sw", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    const t1Data = res.body.threads.find((t) => t.thread_id === threadId1);
    expect(t1Data).toBeTruthy();
    // In seed, mathematics subject_name in sw is Hisabati
    expect(t1Data.subject_name).toBe("Hisabati");
  });

  it("GET /api/followups/threads/:thread_id reloads full history with Tier 1 and Tier 2 specs", async () => {
    // Check Thread 1 (Tier 1 visual)
    const res1 = await client.get(`/api/followups/threads/${threadId1}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res1.status).toBe(200);
    expect(res1.body.messages.length).toBe(2);
    const t1Assistant = res1.body.messages.find((m) => m.role === "assistant");
    expect(t1Assistant.has_visual).toBe(true);
    expect(t1Assistant.visual_spec?.tier).toBe(1);
    expect(t1Assistant.visual_spec?.template_id).toBe("number_line");

    // Check Thread 2 (Tier 2 Manim visual)
    const res2 = await client.get(`/api/followups/threads/${threadId2}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res2.status).toBe(200);
    expect(res2.body.messages.length).toBe(2);
    const t2Assistant = res2.body.messages.find((m) => m.role === "assistant");
    expect(t2Assistant.has_visual).toBe(true);
    expect(t2Assistant.visual_spec?.tier).toBe(2);
    expect(t2Assistant.visual_spec?.asset_url).toBe("https://cdn.mwalimusmart.co.ke/visuals/cylinder_3d.mp4");
  });

  describe("Frontend Source Contracts for Saved Threads & Replay", () => {
    it("MyLearningPage includes saved Q&A section with count, cards, and direct open buttons", () => {
      const myLearningPath = path.join(FRONTEND_SRC, "pages/MyLearningPage.jsx");
      const content = fs.readFileSync(myLearningPath, "utf-8");

      expect(content).toContain('data-testid="saved-qa-section"');
      expect(content).toContain('data-testid="saved-qa-count"');
      expect(content).toContain('data-testid="saved-qa-card"');
      expect(content).toContain('data-testid="open-thread-btn"');
      expect(content).toContain("followupsApi.getSavedThreads");
    });

    it("FollowUpPanel re-renders prior Tier 1 specs and prior Tier 2 videos on reload", () => {
      const panelPath = path.join(FRONTEND_SRC, "components/lesson/FollowUpPanel.jsx");
      const content = fs.readFileSync(panelPath, "utf-8");

      // Verify history loading
      expect(content).toContain("followupsApi.getHistory");
      // Verify visual rendering for prior messages
      expect(content).toContain("VisualRenderer");
      expect(content).toContain("m.visual_spec?.tier === 1");
      expect(content).toContain("m.visual_spec?.tier === 2");
      expect(content).toContain("video");
      expect(content).toContain("m.visual_spec.asset_url");
    });
  });
});
