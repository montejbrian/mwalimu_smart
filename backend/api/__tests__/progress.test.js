import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import progressRoutes from "../routes/progress.js";
import {
  enqueueAuthoringJobs,
  publishLessonById,
} from "../services/authoring_service.js";
import { rollingMastery } from "../services/progress_service.js";
import { createTestClient } from "./helpers.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/progress", progressRoutes);
  app.use(errorHandler);
  return app;
}

describe("P2.1 — Assessment submission + mastery (/api/progress/*)", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let teacherToken;
  let substrandId;
  let nextSubstrandId;
  let lessonId;
  let draftLessonId;
  let questions; // [{id, correct_index}]

  async function submit(body, token = studentToken) {
    return client.post(`/api/progress/${lessonId}/assessment`, {
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  }

  // Build answers where the first `nCorrect` questions are answered correctly.
  function answersWithCorrect(nCorrect) {
    return questions.map((q, i) => ({
      question_id: q.id,
      chosen_index: i < nCorrect ? q.correct_index : (q.correct_index + 1) % 4,
    }));
  }

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P2.1 Progress Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;
    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'Progress Student', 'p2-1.progress.student@test.sc.ke')
       ON CONFLICT (email) DO UPDATE SET school_id = EXCLUDED.school_id
       RETURNING student_id`,
      [schoolId]
    );
    studentId = stuRes.rows[0].student_id;
    await pool.query(`DELETE FROM assessment_attempts WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM student_mastery WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM student_progress WHERE student_id = $1`, [studentId]);

    studentToken = jwt.sign(
      { student_id: studentId, school_id: schoolId, role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );
    teacherToken = jwt.sign(
      { teacher_id: "00000000-0000-0000-0000-000000000021", school_id: schoolId, role: "teacher" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    // Second-to-last + last Integrated Science sub-strands (unused by other suites)
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE gs.grade_id = 71 AND s.code = 'integrated_science'
       ORDER BY st.sort_order DESC, ss.sort_order DESC
       LIMIT 2`
    );
    nextSubstrandId = ssRes.rows[0].id;
    substrandId = ssRes.rows[1].id;
    await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);

    const pub = await enqueueAuthoringJobs({ scope: { substrand_id: substrandId }, tier: "standard" });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);

    const draft = await enqueueAuthoringJobs({ scope: { substrand_id: substrandId }, tier: "standard" });
    draftLessonId = draft.jobs[0].lesson_id;

    const qRes = await pool.query(
      `SELECT id, correct_index FROM assessment_questions WHERE lesson_id = $1 ORDER BY sort_order`,
      [lessonId]
    );
    questions = qRes.rows.map((r) => ({ id: r.id, correct_index: Number(r.correct_index) }));
    expect(questions.length).toBe(3);
  });

  afterAll(async () => {
    if (studentId) await pool.query(`DELETE FROM students WHERE student_id = $1`, [studentId]);
    if (substrandId) await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);
    if (schoolId) await pool.query(`DELETE FROM schools WHERE school_id = $1`, [schoolId]);
    if (client) await client.close();
  });

  it("computes rolling mastery over the last 5 scores only", () => {
    expect(rollingMastery([])).toBe(0);
    expect(rollingMastery([1, 1, 1, 1, 0.33, 0])).toBe(0.87);
    expect(rollingMastery([0.5])).toBe(0.5);
  });

  it("rejects unauthenticated (401), non-student (403), and empty answers (400 validation)", async () => {
    const unauth = await client.post(`/api/progress/${lessonId}/assessment`, {
      body: { answers: answersWithCorrect(3) },
    });
    expect(unauth.status).toBe(401);

    const teacher = await submit({ answers: answersWithCorrect(3) }, teacherToken);
    expect(teacher.status).toBe(403);
    expect(teacher.body.error.code).toBe("auth.forbidden");

    const empty = await submit({ answers: [] });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("validation");

    const missing = await submit({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("validation");

    const badShape = await submit({ answers: [{ question_id: "nope", chosen_index: 1 }] });
    expect(badShape.status).toBe(400);
  });

  it("returns 404 for draft lessons and 400 for questions from another lesson", async () => {
    const draft = await client.post(`/api/progress/${draftLessonId}/assessment`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { answers: answersWithCorrect(3) },
    });
    expect(draft.status).toBe(404);

    const foreign = await submit({
      answers: [{ question_id: "00000000-0000-0000-0000-0000000000ff", chosen_index: 0 }],
    });
    expect(foreign.status).toBe(400);
  });

  it("grades against correct_index, returns explanations in the requested language, and ignores client mastery values", async () => {
    const res = await submit({
      answers: answersWithCorrect(2),
      lang: "en",
      score: 1, // must be ignored
      mastery_score: 1, // must be ignored
      mastery: { mastery_score: 1 }, // must be ignored
    });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0.67);
    expect(res.body.per_question.length).toBe(3);
    expect(res.body.per_question.map((q) => q.correct)).toEqual([true, true, false]);
    expect(res.body.per_question[0].correct_index).toBe(questions[0].correct_index);
    expect(res.body.per_question[0].explanation).toMatch(/is a key concept/);
    expect(res.body.mastery.substrand_id).toBe(substrandId);
    expect(res.body.mastery.mastery_score).toBe(0.67);
    expect(res.body.mastery.updated).toBe(true);
    expect(res.body.recommendation).toEqual({
      type: "review",
      substrand_id: substrandId,
      lesson_id: lessonId,
    });

    const stored = await pool.query(
      `SELECT mastery_score FROM student_mastery WHERE student_id = $1 AND substrand_id = $2`,
      [studentId, substrandId]
    );
    expect(Number(stored.rows[0].mastery_score)).toBe(0.67);

    const sw = await submit({ answers: answersWithCorrect(3), lang: "sw" });
    expect(sw.status).toBe(200);
    expect(sw.headers.get("content-language")).toBe("sw");
    expect(sw.body.per_question[0].explanation).toMatch(/ni dhana muhimu/);
  });

  it("updates mastery as a rolling average of the last 5 attempts, counts attempts, and recommends next when mastered", async () => {
    // Reset history for a deterministic sequence
    await pool.query(`DELETE FROM assessment_attempts WHERE student_id = $1`, [studentId]);
    await pool.query(`DELETE FROM student_progress WHERE student_id = $1`, [studentId]);

    // Scores: 0, 0.33, 1, 1, 1, 1  → last 5 = 0.33,1,1,1,1 → 0.87 (all 6 would be 0.72)
    const sequence = [0, 1, 3, 3, 3, 3];
    let last;
    for (const nCorrect of sequence) {
      last = await submit({ answers: answersWithCorrect(nCorrect) });
      expect(last.status).toBe(200);
    }
    expect(last.body.score).toBe(1);
    expect(last.body.mastery.mastery_score).toBe(0.87);
    expect(last.body.mastery.badge).toBe("mastered");
    expect(last.body.recommendation.type).toBe("next");
    expect(last.body.recommendation.substrand_id).toBe(nextSubstrandId);
    expect("lesson_id" in last.body.recommendation).toBe(true);

    const prog = await pool.query(
      `SELECT status, attempts, last_score FROM student_progress WHERE student_id = $1 AND lesson_id = $2`,
      [studentId, lessonId]
    );
    expect(prog.rows[0].status).toBe("assessed");
    expect(Number(prog.rows[0].attempts)).toBe(6);
    expect(Number(prog.rows[0].last_score)).toBe(1);
  });

  it("records viewed position via POST /api/progress/:id/viewed", async () => {
    const res = await client.post(`/api/progress/${lessonId}/viewed`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { position_s: 42 },
    });
    expect(res.status).toBe(200);
    expect(res.body.last_position_s).toBe(42);

    const bad = await client.post(`/api/progress/${lessonId}/viewed`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: { position_s: -3 },
    });
    expect(bad.status).toBe(400);
  });
});
