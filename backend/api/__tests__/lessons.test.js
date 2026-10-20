import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import lessonRoutes from "../routes/lessons.js";
import { createTestClient } from "./helpers.js";

describe("P1.4 — Lesson Read API (/api/lessons/*)", () => {
  let client;
  let studentToken;
  let teacherToken;
  let testSchoolId;
  let testStudentId;
  let testTeacherId;
  let substrandId;
  let publishedLessonId;
  let draftLessonId;

  beforeAll(async () => {
    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('Lesson API Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id;`
    );
    testSchoolId = schoolRes.rows[0].school_id;

    const studentRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'Lesson Student', 'lesson.student@test.sc.ke')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING student_id;`,
      [testSchoolId]
    );
    testStudentId = studentRes.rows[0].student_id;

    const teacherRes = await pool.query(
      `INSERT INTO teachers (school_id, full_name, email, password_hash)
       VALUES ($1, 'Lesson Teacher', 'lesson.teacher@test.sc.ke', 'hash')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING teacher_id;`,
      [testSchoolId]
    );
    testTeacherId = teacherRes.rows[0].teacher_id;

    studentToken = jwt.sign(
      { student_id: testStudentId, school_id: testSchoolId, role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );
    teacherToken = jwt.sign(
      { teacher_id: testTeacherId, school_id: testSchoolId, role: "teacher" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    // Pick a seeded substrand (Grade 7 Mathematics -> Numbers -> Whole Numbers)
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE gs.grade_id = 71 AND s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       LIMIT 1;`
    );
    substrandId = ssRes.rows[0].id;

    // Insert a published lesson + EN/SW variants + assets + assessment questions
    const pubRes = await pool.query(
      `INSERT INTO lessons (substrand_id, title, sort_order, status, version, published_at)
       VALUES ($1, 'Place Value up to Hundreds of Millions', 90, 'published', 1, now())
       RETURNING id;`,
      [substrandId]
    );
    publishedLessonId = pubRes.rows[0].id;

    const enVarRes = await pool.query(
      `INSERT INTO lesson_variants (lesson_id, language, script, transcript, objectives, key_concepts, rag_sources)
       VALUES (
         $1,
         'en',
         $2::jsonb,
         'Place Value in English full transcript text.',
         $3::jsonb,
         $4::jsonb,
         $5::jsonb
       ) RETURNING id;`,
      [
        publishedLessonId,
        JSON.stringify({
          introduction: "Welcome to place value.",
          sections: [{ heading: "Hundreds of Millions", content: "Each digit has a place value." }],
        }),
        JSON.stringify(["Identify place value up to hundreds of millions"]),
        JSON.stringify([{ term: "Place Value", definition: "The value represented by a digit in a number" }]),
        JSON.stringify([{ chunk_id: "c1", page: 12, doc: "KICD Grade 7 Math" }]),
      ]
    );
    const enVariantId = enVarRes.rows[0].id;

    await pool.query(
      `INSERT INTO lesson_variants (lesson_id, language, script, transcript, objectives, key_concepts, rag_sources)
       VALUES (
         $1,
         'sw',
         $2::jsonb,
         'Thamani ya nafasi kwa Kiswahili nakala kamili.',
         $3::jsonb,
         $4::jsonb,
         $5::jsonb
       );`,
      [
        publishedLessonId,
        JSON.stringify({
          introduction: "Karibu kwenye thamani ya nafasi.",
          sections: [{ heading: "Mamia ya Mamilioni", content: "Kila tarakimu ina thamani ya nafasi." }],
        }),
        JSON.stringify(["Kutambua thamani ya nafasi hadi mamia ya mamilioni"]),
        JSON.stringify([{ term: "Thamani ya Nafasi", definition: "Thamani inayowakilishwa na tarakimu" }]),
        JSON.stringify([{ chunk_id: "c1", page: 12, doc: "KICD Grade 7 Math" }]),
      ]
    );

    await pool.query(
      `INSERT INTO lesson_assets (lesson_variant_id, type, storage_url, duration_s, status)
       VALUES ($1, 'video_mp4', '/renders/place_value.mp4', 180, 'ready');`,
      [enVariantId]
    );

    await pool.query(
      `INSERT INTO assessment_questions (
         lesson_id, sort_order, question_en, question_sw, options,
         correct_index, explanation_en, explanation_sw, competency_tag
       ) VALUES (
         $1, 1,
         'What is the place value of 7 in 745,000,000?',
         'Thamani ya nafasi ya 7 katika 745,000,000 ni ipi?',
         $2::jsonb,
         2,
         '7 is in the hundreds of millions position.',
         '7 iko katika nafasi ya mamia ya mamilioni.',
         'place_value_hundreds_millions'
       );`,
      [
        publishedLessonId,
        JSON.stringify({
          en: ["Ten millions", "Millions", "Hundreds of millions", "Thousands"],
          sw: ["Makumi ya mamilioni", "Mamilioni", "Mamia ya mamilioni", "Maelfu"],
        }),
      ]
    );

    // Insert a draft lesson to verify students cannot access drafts
    const draftRes = await pool.query(
      `INSERT INTO lessons (substrand_id, title, sort_order, status, version)
       VALUES ($1, 'Draft Lesson', 91, 'draft', 1)
       RETURNING id;`,
      [substrandId]
    );
    draftLessonId = draftRes.rows[0].id;
    await pool.query(
      `INSERT INTO lesson_variants (lesson_id, language, script, transcript, objectives, key_concepts)
       VALUES ($1, 'en', '{}'::jsonb, 'Draft transcript', '[]'::jsonb, '[]'::jsonb);`,
      [draftLessonId]
    );

    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use("/api/lessons", lessonRoutes);
    app.use(errorHandler);

    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
    if (publishedLessonId) {
      await pool.query("DELETE FROM lessons WHERE id = ANY($1::uuid[]);", [
        [publishedLessonId, draftLessonId],
      ]);
    }
    if (testSchoolId) {
      await pool.query("DELETE FROM schools WHERE school_id = $1;", [testSchoolId]);
    }
  });

  it("rejects unauthenticated requests with 401 auth.missing", async () => {
    const res = await client.get(`/api/lessons/${publishedLessonId}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("auth.missing");
  });

  it("returns 400 validation for invalid lesson UUID and 404 not_found for missing lesson", async () => {
    const badId = await client.get("/api/lessons/not-a-uuid", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe("validation");

    const missing = await client.get("/api/lessons/00000000-0000-0000-0000-000000000099", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("not_found");
  });

  it("returns lesson in EN and SW via Accept-Language or ?lang=, excluding correct_index & explanations", async () => {
    const enRes = await client.get(`/api/lessons/${publishedLessonId}`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        "Accept-Language": "en",
      },
    });
    expect(enRes.status).toBe(200);
    expect(enRes.body.lesson_id).toBe(publishedLessonId);
    expect(enRes.body.breadcrumb).toHaveLength(4);
    expect(enRes.body.breadcrumb[0]).toMatchObject({
      level: "Junior Secondary",
      grade: "Grade 7",
    });
    expect(enRes.body.breadcrumb[1]).toMatchObject({
      subject: "Mathematics",
    });
    expect(enRes.body.variant.language).toBe("en");
    expect(enRes.body.variant.transcript_url).toBe(
      `/api/lessons/${publishedLessonId}/transcript?lang=en`
    );
    expect(enRes.body.assets.video_url).toBe("/renders/place_value.mp4");
    expect(enRes.body.assessment.questions).toHaveLength(1);

    const qEn = enRes.body.assessment.questions[0];
    expect(qEn.question).toBe("What is the place value of 7 in 745,000,000?");
    expect(qEn.options).toEqual([
      "Ten millions",
      "Millions",
      "Hundreds of millions",
      "Thousands",
    ]);
    // Security/pedagogical check: never leak answers or explanations on GET
    expect(qEn.correct_index).toBeUndefined();
    expect(qEn.explanation).toBeUndefined();
    expect(qEn.explanation_en).toBeUndefined();
    expect(qEn.explanation_sw).toBeUndefined();

    // Kiswahili via Accept-Language header
    const swRes = await client.get(`/api/lessons/${publishedLessonId}`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        "Accept-Language": "sw",
      },
    });
    expect(swRes.status).toBe(200);
    expect(swRes.body.variant.language).toBe("sw");
    expect(swRes.body.breadcrumb[1].subject).toBe("Hisabati");
    expect(swRes.body.assessment.questions[0].question).toBe(
      "Thamani ya nafasi ya 7 katika 745,000,000 ni ipi?"
    );
  });

  it("hides draft lessons from students (404) but allows teachers to view them", async () => {
    const studentDraft = await client.get(`/api/lessons/${draftLessonId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentDraft.status).toBe(404);
    expect(studentDraft.body.error.code).toBe("not_found");

    const teacherDraft = await client.get(`/api/lessons/${draftLessonId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(teacherDraft.status).toBe(200);
    expect(teacherDraft.body.status).toBe("draft");
  });

  it("serves plain-text transcript download on GET /api/lessons/:id/transcript", async () => {
    const res = await client.get(`/api/lessons/${publishedLessonId}/transcript?lang=sw`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(res.body).toBe("Thamani ya nafasi kwa Kiswahili nakala kamili.");
  });

  it("returns render status and asset URLs on GET /api/lessons/:id/assets", async () => {
    const res = await client.get(`/api/lessons/${publishedLessonId}/assets?lang=en`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.video_url).toBe("/renders/place_value.mp4");
    expect(res.body.duration_s).toBe(180);
    expect(res.body.status).toBe("ready");
  });
});
