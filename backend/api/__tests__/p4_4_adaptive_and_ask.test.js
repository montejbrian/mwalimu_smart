/**
 * MwalimuSmart Web
 * backend/api/__tests__/p4_4_adaptive_and_ask.test.js
 *
 * Tests for P4.4:
 *   - Adaptive next-lesson recommendation using the student's mastery map
 *   - Formative remediation prioritizing weak earlier topics (mastery < 0.8)
 *   - Clean progression to next sequential lesson when previous topics are mastered
 *   - Bilingual session persistence (en/sw)
 *   - Frontend source contracts for AskPage (/ask), Whiteboard & Visuals stage, and mic push-to-talk
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
import progressRoutes from "../routes/progress.js";
import { createTestClient } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/progress", progressRoutes);
  app.use(errorHandler);
  return app;
}

describe("P4.4 — Adaptive Recommendations & Ask Tutor Page (/ask)", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let gradeSubjectId;
  let substrand1Id;
  let substrand2Id;
  let lesson1Id;
  let lesson2Id;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P4.4 Adaptive School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P4.4 Student', 'p4-4.adaptive@test.sc.ke')
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

    // Pick two substrands in Mathematics Grade 7
    const ssRes = await pool.query(
      `SELECT ss.id, ss.strand_id, st.grade_subject_id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       LIMIT 2`
    );
    expect(ssRes.rows.length).toBeGreaterThanOrEqual(2);
    substrand1Id = ssRes.rows[0].id;
    substrand2Id = ssRes.rows[1].id;
    gradeSubjectId = ssRes.rows[0].grade_subject_id;

    // Find or create published lesson for substrand 1
    const l1 = await pool.query(
      `SELECT id FROM lessons WHERE substrand_id = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`,
      [substrand1Id]
    );
    if (l1.rows.length > 0) {
      lesson1Id = l1.rows[0].id;
    } else {
      const ins = await pool.query(
        `INSERT INTO lessons (substrand_id, title, status, version) VALUES ($1, 'P4.4 Lesson 1', 'published', 1) RETURNING id`,
        [substrand1Id]
      );
      lesson1Id = ins.rows[0].id;
    }

    // Find or create published lesson for substrand 2
    const l2 = await pool.query(
      `SELECT id FROM lessons WHERE substrand_id = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`,
      [substrand2Id]
    );
    if (l2.rows.length > 0) {
      lesson2Id = l2.rows[0].id;
    } else {
      const ins = await pool.query(
        `INSERT INTO lessons (substrand_id, title, status, version) VALUES ($1, 'P4.4 Lesson 2', 'published', 1) RETURNING id`,
        [substrand2Id]
      );
      lesson2Id = ins.rows[0].id;
    }
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  describe("Adaptive Recommendation Engine (GET /api/progress/recent)", () => {
    it("detects an earlier learning gap in mastery map and recommends reviewing weak topic", async () => {
      // Set student_mastery for substrand 1 to low score (0.40 - review_recommended)
      await pool.query(
        `INSERT INTO student_mastery (student_id, substrand_id, mastery_score, updated_at)
         VALUES ($1, $2, 0.40, now() - interval '1 hour')
         ON CONFLICT (student_id, substrand_id)
         DO UPDATE SET mastery_score = 0.40, updated_at = now() - interval '1 hour'`,
        [studentId, substrand1Id]
      );

      // Set student_progress for lesson 2 as recently completed with high score (1.0)
      await pool.query(
        `INSERT INTO student_progress (student_id, lesson_id, status, last_score, updated_at)
         VALUES ($1, $2, 'completed', 1.0, now())
         ON CONFLICT (student_id, lesson_id)
         DO UPDATE SET status = 'completed', last_score = 1.0, updated_at = now()`,
        [studentId, lesson2Id]
      );

      // Query recent activity recommendation
      const res = await client.get("/api/progress/recent", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.body.recommendation).toBeDefined();

      // Adaptive check: Instead of advancing blindly, recommends reviewing the weak substrand 1
      expect(res.body.recommendation.type).toBe("review");
      expect(res.body.recommendation.reason).toBe("gap");
      expect(res.body.recommendation.substrand_id).toBe(substrand1Id);
      expect(res.body.recommendation.lesson_id).toBe(lesson1Id);
      expect(res.body.recommendation.message).toContain("Teacher's Tip");
    });

    it("serves adaptive recommendation in Swahili when requested", async () => {
      const res = await client.get("/api/progress/recent?lang=sw", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.body.recommendation).toBeDefined();
      expect(res.body.recommendation.type).toBe("review");
      expect(res.body.recommendation.message).toContain("Ushauri wa Mwalimu");
    });

    it("advances to next sequential topic once weak topics are remediated (>= 0.80)", async () => {
      // Remediate substrand 1 to mastered (0.85)
      await pool.query(
        `UPDATE student_mastery
         SET mastery_score = 0.85
         WHERE student_id = $1 AND substrand_id = $2`,
        [studentId, substrand1Id]
      );

      const res = await client.get("/api/progress/recent", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.body.recommendation).toBeDefined();
      // Since substrand 1 is now remediated and lesson 2 was completed with 1.0, it should recommend next or done
      expect(["next", "done"]).toContain(res.body.recommendation.type);
    });
  });

  describe("Frontend Source Contracts for Ask Tutor Page (/ask)", () => {
    it("AskPage.jsx implements free-form dialogue, subject selector, whiteboard stage, and push-to-talk mic", () => {
      const askPath = path.join(FRONTEND_SRC, "pages/AskPage.jsx");
      const content = fs.readFileSync(askPath, "utf-8");

      expect(content).toContain('data-testid="ask-page"');
      expect(content).toContain('data-testid="ask-input"');
      expect(content).toContain('data-testid="ask-mic-button"');
      expect(content).toContain('data-testid="ask-send-button"');
      expect(content).toContain("<Whiteboard");
      expect(content).toContain("<VisualRenderer");
      expect(content).toContain("QUICK_PROMPTS");
      expect(content).toContain("sw-KE");
      expect(content).toContain("en-KE");
    });

    it("App.jsx mounts the /ask route with Protected layout", () => {
      const appPath = path.join(FRONTEND_SRC, "App.jsx");
      const content = fs.readFileSync(appPath, "utf-8");

      expect(content).toContain('import AskPage from "./pages/AskPage.jsx"');
      expect(content).toContain('<Route path="ask" element={<AskPage />} />');
    });

    it("Layout.jsx navigation includes 'Ask Tutor' / 'Uliza Mwalimu'", () => {
      const layoutPath = path.join(FRONTEND_SRC, "components/layout/Layout.jsx");
      const content = fs.readFileSync(layoutPath, "utf-8");

      expect(content).toContain('to: "/ask"');
      expect(content).toContain('label: { en: "Ask Tutor", sw: "Uliza Mwalimu" }');
    });

    it("store.js persists language to localStorage for continuous sessions", () => {
      const storePath = path.join(FRONTEND_SRC, "lib/store.js");
      const content = fs.readFileSync(storePath, "utf-8");

      expect(content).toContain('storage.getItem("mwalimu_lang")');
      expect(content).toContain('storage.setItem("mwalimu_lang", normalized)');
    });
  });
});
