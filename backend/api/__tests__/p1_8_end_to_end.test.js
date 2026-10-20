import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { config } from "../config.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import authRoutes from "../routes/auth.js";
import catalogRoutes from "../routes/catalog.js";
import lessonRoutes from "../routes/lessons.js";
import authoringRoutes from "../routes/authoring.js";
import { clearAuthoringJobsMemory } from "../services/authoring_service.js";
import { createTestClient } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

function createPhase1App() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/auth", authRoutes);
  app.use("/api/catalog", catalogRoutes);
  app.use("/api/lessons", lessonRoutes);
  app.use("/api/authoring", authoringRoutes);
  app.use(errorHandler);
  return app;
}

describe("P1.8 — Teacher Authoring & Review UI + Phase 1 Exit Criterion", () => {
  let client;
  let teacherToken;
  let mathSubstrandId;
  let sciSubstrandId;

  beforeAll(async () => {
    clearAuthoringJobsMemory();
    client = await createTestClient(createPhase1App());

    teacherToken = jwt.sign(
      {
        teacher_id: "00000000-0000-0000-0000-000000000088",
        role: "teacher",
        email: "teacher.p1.8@school.sc.ke",
        name: "Mwalimu Amina",
      },
      config.authSecret,
      { expiresIn: "1h" }
    );

    const mathRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE gs.grade_id = 71 AND s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 2
       LIMIT 1`
    );
    mathSubstrandId = mathRes.rows[0].id;

    const sciRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE gs.grade_id = 71 AND s.code = 'integrated_science'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 2
       LIMIT 1`
    );
    sciSubstrandId = sciRes.rows[0].id;

    await pool.query(
      `DELETE FROM lessons WHERE substrand_id = ANY($1::uuid[])`,
      [[mathSubstrandId, sciSubstrandId]]
    );
  });

  afterAll(async () => {
    if (mathSubstrandId && sciSubstrandId) {
      await pool.query(
        `DELETE FROM lessons WHERE substrand_id = ANY($1::uuid[])`,
        [[mathSubstrandId, sciSubstrandId]]
      );
    }
    if (client) await client.close();
  });

  it("defines AuthoringDashboard.jsx and ReviewQueue.jsx and gates /authoring routes to teachers in App.jsx", () => {
    expect(
      fs.existsSync(
        path.join(FRONTEND_SRC, "pages/authoring/AuthoringDashboard.jsx")
      )
    ).toBe(true);
    expect(
      fs.existsSync(path.join(FRONTEND_SRC, "pages/authoring/ReviewQueue.jsx"))
    ).toBe(true);

    const appSrc = fs.readFileSync(path.join(FRONTEND_SRC, "App.jsx"), "utf8");
    expect(appSrc).toContain("TeacherOnly");
    expect(appSrc).toContain("AuthoringDashboard");
    expect(appSrc).toContain("ReviewQueue");
    expect(appSrc).toContain('path="authoring/review/:lesson_id"');
  });

  it("Phase 1 Exit Criterion: teacher enqueues, reviews, and publishes; student logs in, browses Grade 7 Math & Integrated Science, opens lesson, reads script, downloads transcript, and sees assessment questions", async () => {
    // 1. Teacher enqueues authoring for Grade 7 Mathematics & Integrated Science sub-strands
    for (const ssId of [mathSubstrandId, sciSubstrandId]) {
      const enq = await client.post("/api/authoring/jobs", {
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: { scope: { substrand_id: ssId }, tier: "featured" },
      });
      expect(enq.status).toBe(201);
      const lessonId = enq.body.jobs[0].lesson_id;

      // Teacher reviews draft (GET /api/lessons/:id)
      const draftReview = await client.get(`/api/lessons/${lessonId}?lang=en`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(draftReview.status).toBe(200);

      // Teacher approves & publishes
      const appRes = await client.post(
        `/api/authoring/lessons/${lessonId}/approve`,
        {
          headers: { Authorization: `Bearer ${teacherToken}` },
        }
      );
      expect(appRes.status).toBe(200);

      const pubRes = await client.post(
        `/api/authoring/lessons/${lessonId}/publish`,
        {
          headers: { Authorization: `Bearer ${teacherToken}` },
        }
      );
      expect(pubRes.status).toBe(200);
    }

    // 2. Student logs in via POST /api/auth/student/login
    const loginRes = await client.post("/api/auth/student/login", {
      body: {
        email: "kamau.phase1@school.sc.ke",
        name: "Kamau Learner",
      },
    });
    expect(loginRes.status).toBe(200);
    const studentToken = loginRes.body.access_token;
    expect(studentToken).toBeTruthy();

    // 3. Student browses Grade 7 subjects (Mathematics & Integrated Science)
    const subjRes = await client.get("/api/catalog/subjects?grade_id=71", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(subjRes.status).toBe(200);
    const codes = subjRes.body.map((s) => s.code);
    expect(codes).toContain("mathematics");
    expect(codes).toContain("integrated_science");

    // 4. Student browses Grade 7 Mathematics strands & substrands
    const mathStrands = await client.get(
      "/api/catalog/strands?grade_id=71&subject=mathematics",
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    expect(mathStrands.status).toBe(200);
    expect(mathStrands.body.length).toBeGreaterThanOrEqual(5);

    const firstStrandId = mathStrands.body[0].id;
    const mathSubstrands = await client.get(
      `/api/catalog/substrands?strand_id=${firstStrandId}`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    expect(mathSubstrands.status).toBe(200);
    const publishedSub = mathSubstrands.body.find((ss) => ss.id === mathSubstrandId);
    expect(publishedSub).toBeTruthy();
    expect(publishedSub.lesson_count).toBeGreaterThanOrEqual(1);

    const publishedLessonId = publishedSub.first_lesson_id;
    expect(publishedLessonId).toBeTruthy();

    // 5. Student opens the pre-published lesson, reads script, sees assessment questions (without answers)
    const lessonRes = await client.get(
      `/api/lessons/${publishedLessonId}?lang=en`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    expect(lessonRes.status).toBe(200);
    expect(lessonRes.body.variant.script.sections.length).toBeGreaterThan(0);
    expect(lessonRes.body.assessment.questions.length).toBeGreaterThanOrEqual(3);
    expect(lessonRes.body.assessment.questions[0].correct_index).toBeUndefined();

    // 6. Student downloads the plain-text transcript
    const transcriptRes = await client.get(
      `/api/lessons/${publishedLessonId}/transcript?lang=en`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    expect(transcriptRes.status).toBe(200);
    expect(
      transcriptRes.headers.get("content-disposition")
    ).toContain("attachment");
    expect(transcriptRes.body.length).toBeGreaterThan(20);
  });
});
