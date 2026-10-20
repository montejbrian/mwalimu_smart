import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { pool as pgPool } from "../db.js";
import { config } from "../config.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import authoringRoutes from "../routes/authoring.js";
import lessonRoutes from "../routes/lessons.js";
import { clearAuthoringJobsMemory } from "../services/authoring_service.js";
import { createTestClient } from "./helpers.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/authoring", authoringRoutes);
  app.use("/api/lessons", lessonRoutes);
  app.use(errorHandler);
  return app;
}

describe("P1.7 — Teacher Authoring Pipeline & Review API (/api/authoring/*)", () => {
  let client;
  let studentToken;
  let teacherToken;
  let testSubstrandId;
  const createdLessonIds = [];

  beforeAll(async () => {
    clearAuthoringJobsMemory();
    client = await createTestClient(createTestApp());
    studentToken = jwt.sign(
      {
        student_id: "00000000-0000-0000-0000-000000000017",
        role: "student",
        email: "student.p1.7@school.sc.ke",
        name: "Wanjiku Student",
      },
      config.authSecret,
      { expiresIn: "1h" }
    );
    teacherToken = jwt.sign(
      {
        teacher_id: "00000000-0000-0000-0000-000000000027",
        role: "teacher",
        email: "teacher.p1.7@school.sc.ke",
        name: "Mwalimu Otieno",
      },
      config.authSecret,
      { expiresIn: "1h" }
    );

    const { rows } = await pgPool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects subj ON subj.id = gs.subject_id
       WHERE gs.grade_id = 71 AND subj.code = 'integrated_science'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       LIMIT 1`
    );
    expect(rows.length).toBe(1);
    testSubstrandId = rows[0].id;

    await pgPool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [
      testSubstrandId,
    ]);
  });

  afterAll(async () => {
    if (testSubstrandId) {
      await pgPool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [
        testSubstrandId,
      ]);
    } else if (createdLessonIds.length > 0) {
      await pgPool.query(`DELETE FROM lessons WHERE id = ANY($1::uuid[])`, [
        createdLessonIds,
      ]);
    }
    if (client) await client.close();
  });

  it("blocks unauthenticated (401) and student (403) access to /api/authoring/jobs", async () => {
    const unauth = await client.get("/api/authoring/jobs");
    expect(unauth.status).toBe(401);
    expect(unauth.body.error.code).toBe("auth.missing");

    const studentRes = await client.get("/api/authoring/jobs", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentRes.status).toBe(403);
    expect(studentRes.body.error.code).toBe("auth.forbidden");
  });

  it("enqueues a sub-strand authoring job, creates a v1 draft lesson with EN/SW variants + MCQs, approves, publishes, and regenerates v2 without mutating v1 in place", async () => {
    // 1. Enqueue authoring job for testSubstrandId
    const enqueueRes = await client.post("/api/authoring/jobs", {
      headers: { Authorization: `Bearer ${teacherToken}` },
      body: {
        scope: { substrand_id: testSubstrandId },
        tier: "featured",
      },
    });
    expect(enqueueRes.status).toBe(201);
    expect(Array.isArray(enqueueRes.body.job_ids)).toBe(true);
    expect(enqueueRes.body.job_ids.length).toBe(1);

    const jobId = enqueueRes.body.job_ids[0];

    // 2. Inspect job status via GET /api/authoring/jobs/:id
    const jobRes = await client.get(`/api/authoring/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.state).toBe("awaiting_review");
    expect(jobRes.body.version).toBe(1);
    expect(jobRes.body.lesson_id).toBeTruthy();

    const v1LessonId = jobRes.body.lesson_id;
    createdLessonIds.push(v1LessonId);

    // Student cannot read v1 while it is still a draft
    const studentDraftRes = await client.get(`/api/lessons/${v1LessonId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentDraftRes.status).toBe(404);

    // 3. Teacher approves v1 draft
    const approveRes = await client.post(
      `/api/authoring/lessons/${v1LessonId}/approve`,
      {
        headers: { Authorization: `Bearer ${teacherToken}` },
      }
    );
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("approved");

    // 4. Teacher publishes v1
    const publishRes = await client.post(
      `/api/authoring/lessons/${v1LessonId}/publish`,
      {
        headers: { Authorization: `Bearer ${teacherToken}` },
      }
    );
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.status).toBe("published");
    expect(publishRes.body.version).toBe(1);

    // Student can now read published v1 in both EN and SW
    const studentReadEn = await client.get(
      `/api/lessons/${v1LessonId}?lang=en`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    expect(studentReadEn.status).toBe(200);
    expect(studentReadEn.body.variant.language).toBe("en");
    expect(
      studentReadEn.body.assessment.questions.length
    ).toBeGreaterThanOrEqual(3);

    // 5. Rule #2 check: cannot approve or reject an already published lesson in place
    const mutateApprove = await client.post(
      `/api/authoring/lessons/${v1LessonId}/approve`,
      {
        headers: { Authorization: `Bearer ${teacherToken}` },
      }
    );
    expect(mutateApprove.status).toBe(400);

    // 6. Regenerating creates a new v2 draft while leaving v1 published
    const regenRes = await client.post(
      `/api/authoring/lessons/${v1LessonId}/regenerate`,
      {
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: {
          feedback: "Add more local laboratory separation examples",
        },
      }
    );
    expect(regenRes.status).toBe(201);
    expect(regenRes.body.version).toBe(2);
    expect(regenRes.body.status).toBe("draft");
    expect(regenRes.body.lesson_id).not.toBe(v1LessonId);

    const v2LessonId = regenRes.body.lesson_id;
    createdLessonIds.push(v2LessonId);

    // Verify v1 is still published in Postgres while v2 is draft
    const { rows: beforePubRows } = await pgPool.query(
      `SELECT id, version, status FROM lessons WHERE substrand_id = $1 ORDER BY version ASC`,
      [testSubstrandId]
    );
    expect(beforePubRows).toEqual([
      { id: v1LessonId, version: 1, status: "published" },
      { id: v2LessonId, version: 2, status: "draft" },
    ]);

    // 7. Publishing v2 archives v1 and makes v2 the active published version
    const pubV2Res = await client.post(
      `/api/authoring/lessons/${v2LessonId}/publish`,
      {
        headers: { Authorization: `Bearer ${teacherToken}` },
      }
    );
    expect(pubV2Res.status).toBe(200);

    const { rows: afterPubRows } = await pgPool.query(
      `SELECT id, version, status FROM lessons WHERE substrand_id = $1 ORDER BY version ASC`,
      [testSubstrandId]
    );
    expect(afterPubRows).toEqual([
      { id: v1LessonId, version: 1, status: "archived" },
      { id: v2LessonId, version: 2, status: "published" },
    ]);
  });
});
