/**
 * MwalimuSmart Web
 * backend/api/__tests__/grade10_geography.test.js
 *
 * Verification test for KICD Grade 10 Geography Curriculum Designs:
 *   - Senior Secondary Grade 10 catalog discovery
 *   - Practical Geography & Natural Systems and Processes strands
 *   - Pre-generated canvas video playback & WebVTT captions
 *   - Bilingual transcripts & lesson script
 *   - Formative assessment submission with server grading & feedback
 *   - Follow-up Q&A thread creation & messaging
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import catalogRoutes from "../routes/catalog.js";
import lessonRoutes from "../routes/lessons.js";
import progressRoutes from "../routes/progress.js";
import followupRoutes from "../routes/followups.js";
import { createTestClient } from "./helpers.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/catalog", catalogRoutes);
  app.use("/api/lessons", lessonRoutes);
  app.use("/api/progress", progressRoutes);
  app.use("/api/followups", followupRoutes);
  app.use(errorHandler);
  return app;
}

describe("KICD Grade 10 Geography — Senior Secondary Integration", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let grade10Id;
  let geographyCode = "geography";
  let introLessonId;
  let rocksLessonId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('Senior Secondary Test Academy', 'Nakuru', 'senior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'Grade 10 Geographer', 'g10.geography@test.sc.ke')
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

    // Look up Grade 10 ID
    const gRes = await pool.query(`SELECT id FROM grades WHERE name = 'Grade 10'`);
    expect(gRes.rows.length).toBe(1);
    grade10Id = gRes.rows[0].id;

    // Look up seeded lessons
    const lIntro = await pool.query(
      `SELECT l.id FROM lessons l
       JOIN substrands ss ON ss.id = l.substrand_id
       WHERE ss.name = 'Introduction to Geography' AND l.status = 'published'
       LIMIT 1`
    );
    expect(lIntro.rows.length).toBe(1);
    introLessonId = lIntro.rows[0].id;

    const lRocks = await pool.query(
      `SELECT l.id FROM lessons l
       JOIN substrands ss ON ss.id = l.substrand_id
       WHERE ss.name = 'Rocks' AND l.status = 'published'
       LIMIT 1`
    );
    expect(lRocks.rows.length).toBe(1);
    rocksLessonId = lRocks.rows[0].id;
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  describe("1. Curriculum Catalog Discovery (/api/catalog/*)", () => {
    it("returns Senior Secondary with Grade 10", async () => {
      const levelsRes = await client.get("/api/catalog/levels", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(levelsRes.status).toBe(200);
      const seniorSec = levelsRes.body.find((l) => l.name === "Senior Secondary");
      expect(seniorSec).toBeDefined();

      const gradesRes = await client.get(`/api/catalog/grades?level_id=${seniorSec.id}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(gradesRes.status).toBe(200);
      const g10 = gradesRes.body.find((g) => g.name === "Grade 10");
      expect(g10).toBeDefined();
    });

    it("returns Geography subject for Grade 10 with bilingual names (EN/SW)", async () => {
      const resEn = await client.get(`/api/catalog/subjects?grade_id=${grade10Id}`, {
        headers: { Authorization: `Bearer ${studentToken}`, "Accept-Language": "en" },
      });
      expect(resEn.status).toBe(200);
      const geogEn = resEn.body.find((s) => s.code === "geography");
      expect(geogEn).toBeDefined();
      expect(geogEn.name).toBe("Geography");

      const resSw = await client.get(`/api/catalog/subjects?grade_id=${grade10Id}`, {
        headers: { Authorization: `Bearer ${studentToken}`, "Accept-Language": "sw" },
      });
      expect(resSw.status).toBe(200);
      const geogSw = resSw.body.find((s) => s.code === "geography");
      expect(geogSw).toBeDefined();
      expect(geogSw.name).toBe("Jiografia");
    });

    it("returns Practical Geography and Natural Systems and Processes strands with published lessons", async () => {
      const strandsRes = await client.get(
        `/api/catalog/strands?grade_id=${grade10Id}&subject=${geographyCode}`,
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      expect(strandsRes.status).toBe(200);
      expect(strandsRes.body.length).toBeGreaterThanOrEqual(2);

      const practicalStrand = strandsRes.body.find((s) => s.name === "Practical Geography");
      expect(practicalStrand).toBeDefined();

      const subRes = await client.get(`/api/catalog/substrands?strand_id=${practicalStrand.id}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(subRes.status).toBe(200);
      const introSub = subRes.body.find((ss) => ss.name === "Introduction to Geography");
      expect(introSub).toBeDefined();
      expect(introSub.lesson_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe("2. Pre-Generated Lesson Reading & Assets (/api/lessons/:id)", () => {
    it("returns published lesson with pre-generated canvas video and WebVTT captions", async () => {
      const res = await client.get(`/api/lessons/${introLessonId}?lang=en`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.lesson_id).toBe(introLessonId);
      expect(res.body.title).toContain("Introduction to Geography");

      // Verify breadcrumb
      expect(res.body.breadcrumb.length).toBe(4);
      expect(res.body.breadcrumb[0].level).toBe("Senior Secondary");
      expect(res.body.breadcrumb[0].grade).toBe("Grade 10");
      expect(res.body.breadcrumb[1].subject).toBe("Geography");
      expect(res.body.breadcrumb[3].substrand).toBe("Introduction to Geography");

      // Verify pre-generated video asset
      expect(res.body.assets).toBeDefined();
      expect(res.body.assets.video_url).toBe("/renders/canvas_geography_intro.mp4");
      expect(res.body.assets.captions_url).toBe("/renders/canvas_geography_intro.vtt");
      expect(res.body.assets.duration_s).toBe(10);

      // Verify assessment questions hide correct answers
      expect(res.body.assessment.questions.length).toBe(4);
      for (const q of res.body.assessment.questions) {
        expect(q.correct_index).toBeUndefined();
        expect(q.explanation).toBeUndefined();
        expect(q.options.length).toBe(4);
      }
    });

    it("serves localized transcript in Kiswahili", async () => {
      const res = await client.get(`/api/lessons/${introLessonId}/transcript?lang=sw`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(res.body).toContain("Karibu kwenye Jiografia ya Gredi ya 10");
      expect(res.body).toContain("Jiografia ya Kimaumbile");
    });
  });

  describe("3. Formative Assessment & Mastery Loop (/api/progress/*)", () => {
    it("submits assessment, calculates score, and returns formative explanations", async () => {
      // Get questions
      const lessonRes = await client.get(`/api/lessons/${introLessonId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const questions = lessonRes.body.assessment.questions;

      // Submit answers: Answer Q1, Q2, Q3 correctly, Q4 incorrectly (score = 0.75)
      // Based on our seeded answers:
      // Q1 -> 1 ("Physical Geography")
      // Q2 -> 1 ("environmental conservation...")
      // Q3 -> 0 ("Geographical Information Systems (GIS)")
      // Q4 -> 1 (wrong, correct is 0)
      const answers = [
        { question_id: questions[0].id, chosen_index: 1 },
        { question_id: questions[1].id, chosen_index: 1 },
        { question_id: questions[2].id, chosen_index: 0 },
        { question_id: questions[3].id, chosen_index: 1 },
      ];

      const assessRes = await client.post(`/api/progress/${introLessonId}/assessment`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { answers, lang: "en" },
      });

      expect(assessRes.status).toBe(200);
      expect(assessRes.body.score).toBe(0.75);
      expect(assessRes.body.per_question.length).toBe(4);
      expect(assessRes.body.per_question[0].correct).toBe(true);
      expect(assessRes.body.per_question[0].explanation).toBeDefined();

      // Verify mastery recorded
      expect(assessRes.body.mastery).toBeDefined();
      expect(assessRes.body.mastery.mastery_score).toBe(0.75);

      // Verify recommendation provides formative review since score < 0.80
      expect(assessRes.body.recommendation.type).toBe("review");
      expect(assessRes.body.recommendation.lesson_id).toBe(introLessonId);
    });
  });

  describe("4. Follow-Up Thread & Whiteboard Integration (/api/followups/*)", () => {
    it("creates follow-up thread for Grade 10 Geography lesson and saves turns", async () => {
      const threadRes = await client.post(`/api/followups/lessons/${introLessonId}/threads`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(threadRes.status).toBe(200);
      const threadId = threadRes.body.thread_id;
      expect(threadId).toBeDefined();

      // Post follow-up question
      const msgRes = await client.post(`/api/followups/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          content: "Can you explain the main difference between physical and human geography?",
          lang: "en",
          with_visuals: true,
        },
      });
      expect(msgRes.status).toBe(200);

      // Verify thread history
      const histRes = await client.get(`/api/followups/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(histRes.status).toBe(200);
      expect(histRes.body.messages.length).toBeGreaterThanOrEqual(2);
      expect(histRes.body.lesson_title).toContain("Introduction to Geography");
    });
  });
});
