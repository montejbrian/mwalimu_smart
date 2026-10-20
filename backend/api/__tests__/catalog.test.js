import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";
import { requestContextMiddleware } from "../middleware/requestContext.js";
import { errorHandler } from "../utils/asyncHandler.js";
import catalogRoutes from "../routes/catalog.js";
import {
  invalidateCatalogCache,
  computeMasteryBadge,
  getCatalogCacheSize,
} from "../services/catalog_service.js";
import { createTestClient } from "./helpers.js";

describe("P1.3 — Catalog / Curriculum Browse API", () => {
  let client;
  let studentToken;
  let testStudentId;
  let testSchoolId;
  let mathFirstStrandId;
  let mathFirstSubstrandId;

  beforeAll(async () => {
    // Ensure a school and student exist for mastery tests
    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('Catalog Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id;`
    );
    testSchoolId = schoolRes.rows[0].school_id;

    const studentRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'Catalog Student', 'catalog.student@test.sc.ke')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING student_id;`,
      [testSchoolId]
    );
    testStudentId = studentRes.rows[0].student_id;

    studentToken = jwt.sign(
      { student_id: testStudentId, school_id: testSchoolId, role: "student" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use("/api/catalog", catalogRoutes);
    app.use(errorHandler);

    client = await createTestClient(app);
  });

  afterAll(async () => {
    await client.close();
    if (testSchoolId) {
      await pool.query("DELETE FROM schools WHERE school_id = $1;", [testSchoolId]);
    }
  });

  it("rejects unauthenticated requests with 401 auth.missing", async () => {
    const res = await client.get("/api/catalog/levels");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("auth.missing");
  });

  it("returns education levels (Pre-Primary to Senior Secondary, no University)", async () => {
    invalidateCatalogCache();
    expect(getCatalogCacheSize()).toBe(0);

    const res = await client.get("/api/catalog/levels", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(4);
    const names = res.body.map((l) => l.name);
    expect(names).toEqual([
      "Pre-Primary",
      "Primary",
      "Junior Secondary",
      "Senior Secondary",
    ]);
    expect(getCatalogCacheSize()).toBeGreaterThan(0);
  });

  it("returns grades for a level_id and 400 validation when level_id is missing", async () => {
    const missing = await client.get("/api/catalog/grades", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("validation");

    const res = await client.get("/api/catalog/grades?level_id=3", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    const grade7 = res.body.find((g) => g.id === 71);
    expect(grade7).toBeDefined();
    expect(grade7.name).toBe("Grade 7");
  });

  it("returns localized subjects for a grade_id based on Accept-Language (en vs sw)", async () => {
    const missing = await client.get("/api/catalog/subjects", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("validation");

    const enRes = await client.get("/api/catalog/subjects?grade_id=71", {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        "Accept-Language": "en",
      },
    });
    expect(enRes.status).toBe(200);
    const mathEn = enRes.body.find((s) => s.code === "mathematics");
    expect(mathEn).toBeDefined();
    expect(mathEn.name).toBe("Mathematics");
    expect(mathEn.name_en).toBe("Mathematics");
    expect(mathEn.name_sw).toBe("Hisabati");

    const swRes = await client.get("/api/catalog/subjects?grade_id=71", {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        "Accept-Language": "sw",
      },
    });
    expect(swRes.status).toBe(200);
    const mathSw = swRes.body.find((s) => s.code === "mathematics");
    expect(mathSw.name).toBe("Hisabati");
  });

  it("returns strands with substrand_count and mastery_summary for Grade 7 Mathematics", async () => {
    const missing = await client.get("/api/catalog/strands?grade_id=71", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("validation");

    const res = await client.get("/api/catalog/strands?grade_id=71&subject=mathematics", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(5);

    const first = res.body[0];
    mathFirstStrandId = first.id;
    expect(first.name).toBe("Numbers");
    expect(first.substrand_count).toBeGreaterThanOrEqual(3);
    expect(first.mastery_summary).toHaveProperty("mastered_count");
    expect(first.mastery_summary).toHaveProperty("total_count");
    expect(first.mastery_summary).toHaveProperty("badge");
  });

  it("returns substrands with lesson_count and mastery_badge, reflecting student_mastery updates", async () => {
    const invalid = await client.get("/api/catalog/substrands?strand_id=not-a-uuid", {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("validation");

    const res1 = await client.get(`/api/catalog/substrands?strand_id=${mathFirstStrandId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res1.status).toBe(200);
    expect(res1.body.length).toBeGreaterThanOrEqual(3);

    mathFirstSubstrandId = res1.body[0].id;
    expect(res1.body[0].mastery_badge).toBe("new");
    expect(typeof res1.body[0].lesson_count).toBe("number");

    // Insert a mastered score (0.85) for the student on the first substrand
    await pool.query(
      `INSERT INTO student_mastery (student_id, substrand_id, mastery_score)
       VALUES ($1, $2, 0.85)
       ON CONFLICT (student_id, substrand_id) DO UPDATE SET mastery_score = 0.85;`,
      [testStudentId, mathFirstSubstrandId]
    );

    const res2 = await client.get(`/api/catalog/substrands?strand_id=${mathFirstStrandId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res2.status).toBe(200);
    expect(res2.body[0].mastery_badge).toBe("mastered");
    expect(res2.body[0].mastery_score).toBe(0.85);
  });

  it("computes mastery badges for all score branches", () => {
    expect(computeMasteryBadge(null)).toBe("new");
    expect(computeMasteryBadge(undefined)).toBe("new");
    expect(computeMasteryBadge(0.9)).toBe("mastered");
    expect(computeMasteryBadge(0.8)).toBe("mastered");
    expect(computeMasteryBadge(0.65)).toBe("in_progress");
    expect(computeMasteryBadge(0.35)).toBe("review_recommended");
  });
});
