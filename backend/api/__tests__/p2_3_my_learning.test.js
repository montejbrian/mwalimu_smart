/**
 * MwalimuSmart Web
 * backend/api/__tests__/p2_3_my_learning.test.js
 *
 * Tests for P2.3:
 *   - GET /api/progress/mastery (heatmap: strands x mastery color, summary stats)
 *   - GET /api/progress/recent (recent activity list + "What's next" recommendation)
 *   - Non-blocking formative behaviour
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import progressRoutes from "../routes/progress.js";
import { badgeColor } from "../services/progress_service.js";
import { enqueueAuthoringJobs, publishLessonById } from "../services/authoring_service.js";
import { createTestClient } from "./helpers.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/progress", progressRoutes);
  app.use(errorHandler);
  return app;
}

describe("P2.3 — My Learning Endpoints (/api/progress/mastery, /api/progress/recent)", () => {
  let client;
  let schoolId;
  let studentId;
  let emptyStudentId;
  let studentToken;
  let emptyStudentToken;
  let teacherToken;
  let lessonId;
  let substrandId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P2.3 Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    // Active student with attempts/progress
    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P2.3 Active Student', 'p2-3.active@test.sc.ke')
       ON CONFLICT (email) DO UPDATE SET school_id = EXCLUDED.school_id
       RETURNING student_id`,
      [schoolId]
    );
    studentId = stuRes.rows[0].student_id;

    // Clean up any previous test state for this student
    await pool.query(`DELETE FROM assessment_attempts WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM student_mastery WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM student_progress WHERE student_id = $1`, [studentId]);

    // Student without any activity
    const emptyStuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P2.3 Empty Student', 'p2-3.empty@test.sc.ke')
       ON CONFLICT (email) DO UPDATE SET school_id = EXCLUDED.school_id
       RETURNING student_id`,
      [schoolId]
    );
    emptyStudentId = emptyStuRes.rows[0].student_id;
    await pool.query(`DELETE FROM assessment_attempts WHERE student_id = $1`, [emptyStudentId]);
    await pool.query(`DELETE FROM student_mastery WHERE student_id = $1`, [emptyStudentId]);
    await pool.query(`DELETE FROM student_progress WHERE student_id = $1`, [emptyStudentId]);

    studentToken = jwt.sign(
      { student_id: studentId, school_id: schoolId, role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    emptyStudentToken = jwt.sign(
      { student_id: emptyStudentId, school_id: schoolId, role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    teacherToken = jwt.sign(
      { teacher_id: "00000000-0000-0000-0000-000000000023", school_id: schoolId, role: "teacher" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    // Pick mathematics substrand at offset 5
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 5 LIMIT 1`
    );
    substrandId = ssRes.rows[0].id;
    await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);

    const pub = await enqueueAuthoringJobs({ scope: { substrand_id: substrandId }, tier: "standard" });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);

    // Seed student_mastery with a mastered score (0.90)
    await pool.query(
      `INSERT INTO student_mastery (student_id, substrand_id, mastery_score, updated_at)
       VALUES ($1, $2, 0.90, now())
       ON CONFLICT (student_id, substrand_id)
       DO UPDATE SET mastery_score = EXCLUDED.mastery_score`,
      [studentId, substrandId]
    );

    // Seed student_progress
    await pool.query(
      `INSERT INTO student_progress (student_id, lesson_id, status, last_position_s, attempts, last_score, completed_at, updated_at)
       VALUES ($1, $2, 'assessed', 60, 2, 0.90, now(), now())
       ON CONFLICT (student_id, lesson_id)
       DO UPDATE SET status = 'assessed', last_score = 0.90`,
      [studentId, lessonId]
    );
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  describe("Pure badgeColor helper", () => {
    it("maps badges to formative hex colors", () => {
      expect(badgeColor("mastered")).toBe("#10b981");
      expect(badgeColor("in_progress")).toBe("#f59e0b");
      expect(badgeColor("review_recommended")).toBe("#6366f1");
      expect(badgeColor("new")).toBe("#64748b");
      expect(badgeColor("unknown")).toBe("#64748b");
    });
  });

  describe("GET /api/progress/mastery", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await client.get("/api/progress/mastery");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("auth.missing");
    });

    it("rejects teacher without student_id with 403", async () => {
      const res = await client.get("/api/progress/mastery", {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("auth.forbidden");
    });

    it("returns empty student mastery map with clean zero/new stats", async () => {
      const res = await client.get("/api/progress/mastery", {
        headers: { Authorization: `Bearer ${emptyStudentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.total_substrands).toBeGreaterThan(0);
      expect(res.body.summary.assessed_substrands).toBe(0);
      expect(res.body.summary.mastered).toBe(0);
      expect(res.body.summary.average_mastery).toBe(0);
      expect(res.body.subjects.length).toBeGreaterThan(0);

      // Verify that every strand and substrand has 'new' badge and #64748b color
      const firstSubj = res.body.subjects[0];
      expect(firstSubj.strands.length).toBeGreaterThan(0);
      const firstStrand = firstSubj.strands[0];
      expect(firstStrand.badge).toBe("new");
      expect(firstStrand.color).toBe("#64748b");
      expect(firstStrand.substrands.length).toBeGreaterThan(0);
      expect(firstStrand.substrands[0].badge).toBe("new");
      expect(firstStrand.substrands[0].color).toBe("#64748b");
    });

    it("returns active student mastery map with correct rolling score and badge", async () => {
      const res = await client.get("/api/progress/mastery", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.summary.assessed_substrands).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.mastered).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.average_mastery).toBeGreaterThan(0);

      // Locate the seeded substrand
      let found = false;
      for (const s of res.body.subjects) {
        for (const st of s.strands) {
          for (const ss of st.substrands) {
            if (ss.id === substrandId) {
              found = true;
              expect(ss.mastery_score).toBe(0.9);
              expect(ss.badge).toBe("mastered");
              expect(ss.color).toBe("#10b981");
              expect(st.color).toBe("#10b981");
            }
          }
        }
      }
      expect(found).toBe(true);
    });

    it("respects Accept-Language: sw", async () => {
      const res = await client.get("/api/progress/mastery?lang=sw", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-language")).toBe("sw");
      const math = res.body.subjects.find((s) => s.code === "mathematics");
      if (math) {
        expect(math.name).toBe(math.name_sw);
      }
    });

    it("allows teacher to query on behalf of student via ?student_id=", async () => {
      const res = await client.get(`/api/progress/mastery?student_id=${studentId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.summary.mastered).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /api/progress/recent", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await client.get("/api/progress/recent");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("auth.missing");
    });

    it("returns empty recent list with 'start' recommendation for new student", async () => {
      const res = await client.get("/api/progress/recent", {
        headers: { Authorization: `Bearer ${emptyStudentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.recent).toEqual([]);
      expect(res.body.recommendation).toBeDefined();
      expect(["start", "none"]).toContain(res.body.recommendation.type);
    });

    it("returns recent activity items ordered by updated_at with formative scores", async () => {
      const res = await client.get("/api/progress/recent", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.recent.length).toBeGreaterThanOrEqual(1);

      const top = res.body.recent[0];
      expect(top.lesson_id).toBe(lessonId);
      expect(top.status).toBe("assessed");
      expect(top.last_score).toBe(0.9);
      expect(top.badge).toBe("mastered");
      expect(top.color).toBe("#10b981");
      expect(top.subject_name).toBeDefined();
      expect(top.strand_name).toBeDefined();

      // What's next recommendation
      expect(res.body.recommendation).toBeDefined();
      expect(["next", "review", "done"]).toContain(res.body.recommendation.type);
      expect(res.body.recommendation.message).toBeDefined();
    });

    it("respects limit parameter", async () => {
      const res = await client.get("/api/progress/recent?limit=1", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.recent.length).toBeLessThanOrEqual(1);
    });
  });
});
