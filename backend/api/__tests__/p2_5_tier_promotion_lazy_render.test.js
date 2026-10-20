/**
 * MwalimuSmart Web
 * backend/api/__tests__/p2_5_tier_promotion_lazy_render.test.js
 *
 * Tests for P2.5:
 *   - Standard-tier lesson without video enqueues exactly one render job on first open
 *   - Idempotency check via UNIQUE(lesson_variant_id, type)
 *   - Concurrency: no duplicate renders even if 10 students open simultaneously
 *   - Poll surfaces video within the session when render completes
 *   - WatchTab displays "video is being prepared — start reading" and polls every 15s
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
import lessonRoutes from "../routes/lessons.js";
import {
  enqueueAuthoringJobs,
  publishLessonById,
} from "../services/authoring_service.js";
import {
  getLessonById,
  getLessonAssets,
  enqueueRenderJobIfMissing,
  completeRenderJob,
} from "../services/lesson_service.js";
import { createTestClient } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/lessons", lessonRoutes);
  app.use(errorHandler);
  return app;
}

describe("P2.5 — Tier promotion + lazy render", () => {
  let client;
  let schoolId;
  let studentTokens = [];
  let lessonId;
  let variantId;
  let substrandId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P2.5 Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    // Create 10 distinct student tokens for concurrency testing
    for (let i = 1; i <= 10; i++) {
      const stuRes = await pool.query(
        `INSERT INTO students (school_id, full_name, email)
         VALUES ($1, 'P2.5 Student ${i}', 'p2-5.student.${i}@test.sc.ke')
         ON CONFLICT (email) DO UPDATE SET school_id = EXCLUDED.school_id
         RETURNING student_id`,
        [schoolId]
      );
      const sid = stuRes.rows[0].student_id;
      studentTokens.push(
        jwt.sign(
          { student_id: sid, school_id: schoolId, role: "student" },
          config.authSecret,
          { expiresIn: "1h" }
        )
      );
    }

    // Pick a standard tier substrand (mathematics offset 7)
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 7 LIMIT 1`
    );
    substrandId = ssRes.rows[0].id;

    // Ensure tier is set to standard
    await pool.query(`UPDATE substrands SET tier = 'standard' WHERE id = $1`, [substrandId]);
    await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);

    // Create standard-tier lesson package
    const pub = await enqueueAuthoringJobs({
      scope: { substrand_id: substrandId },
      tier: "standard",
    });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);

    // Get English variant ID
    const varRes = await pool.query(
      `SELECT id FROM lesson_variants WHERE lesson_id = $1 AND language = 'en'`,
      [lessonId]
    );
    variantId = varRes.rows[0].id;

    // Ensure no video asset exists initially (clear any default placeholder)
    await pool.query(
      `DELETE FROM lesson_assets WHERE lesson_variant_id = $1 AND type = 'video_mp4'`,
      [variantId]
    );
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  describe("Simultaneous Open & Concurrency (10 students)", () => {
    it("enqueues exactly one render job even when 10 students open simultaneously", async () => {
      // 10 students open the lesson at the exact same moment
      const responses = await Promise.all(
        studentTokens.map((token) =>
          client.get(`/api/lessons/${lessonId}?lang=en`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );

      // All 10 requests must succeed with HTTP 200
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.lesson_id).toBe(lessonId);
        // Video is not ready yet, but render has been enqueued
        expect(res.body.assets.video_url).toBe(null);
        expect(["rendering", "pending"]).toContain(res.body.assets.status);
      }

      // Verify Postgres: exactly 1 row exists for (lesson_variant_id, 'video_mp4')
      const assetsRows = (
        await pool.query(
          `SELECT id, type, status, job_id FROM lesson_assets WHERE lesson_variant_id = $1 AND type = 'video_mp4'`,
          [variantId]
        )
      ).rows;

      expect(assetsRows.length).toBe(1);
      expect(assetsRows[0].status).toBe("rendering");
      expect(assetsRows[0].job_id).toMatch(/^render-/);
    });

    it("repeated calls do not enqueue duplicate render jobs (idempotency)", async () => {
      const res1 = await enqueueRenderJobIfMissing(variantId);
      expect(res1.enqueued).toBe(false);

      const countRes = await pool.query(
        `SELECT COUNT(*) FROM lesson_assets WHERE lesson_variant_id = $1 AND type = 'video_mp4'`,
        [variantId]
      );
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    });
  });

  describe("Poll & Render Completion hook", () => {
    it("poll initially returns video_url null with status rendering", async () => {
      const res = await client.get(`/api/lessons/${lessonId}/assets?lang=en`, {
        headers: { Authorization: `Bearer ${studentTokens[0]}` },
      });
      expect(res.status).toBe(200);
      expect(res.body.video_url).toBe(null);
      expect(res.body.status).toBe("rendering");
    });

    it("surfaces the video within the session when render completes", async () => {
      const renderedUrl = "https://storage.googleapis.com/mwalimusmart-renders/lesson_math_v1.mp4";
      const captionsUrl = "https://storage.googleapis.com/mwalimusmart-renders/lesson_math_v1.vtt";

      // Worker completion hook
      await completeRenderJob(variantId, {
        videoUrl: renderedUrl,
        durationS: 215,
        captionsUrl,
      });

      // Poll again: surfaces the video immediately
      const pollRes = await client.get(`/api/lessons/${lessonId}/assets?lang=en`, {
        headers: { Authorization: `Bearer ${studentTokens[0]}` },
      });
      expect(pollRes.status).toBe(200);
      expect(pollRes.body.video_url).toBe(renderedUrl);
      expect(pollRes.body.captions_url).toBe(captionsUrl);
      expect(pollRes.body.duration_s).toBe(215);
      expect(pollRes.body.status).toBe("ready");

      // Full lesson read also reflects the completed asset
      const fullRes = await client.get(`/api/lessons/${lessonId}?lang=en`, {
        headers: { Authorization: `Bearer ${studentTokens[0]}` },
      });
      expect(fullRes.status).toBe(200);
      expect(fullRes.body.assets.video_url).toBe(renderedUrl);
    });
  });

  describe("WatchTab Frontend source contracts", () => {
    it("WatchTab shows 'video is being prepared — start reading' and polls /api/lessons/:id/assets every 15s", () => {
      const watchSrc = fs.readFileSync(
        path.join(FRONTEND_SRC, "components/lesson/WatchTab.jsx"),
        "utf8"
      );
      // Banner text
      expect(watchSrc).toContain("Video is being prepared — start reading");
      expect(watchSrc).toContain("Video inaandaliwa — anza kusoma");
      expect(watchSrc).toContain('data-testid="watch-tab-preparing"');
      expect(watchSrc).toContain('data-testid="switch-to-read-btn"');

      // 15s polling hook
      expect(watchSrc).toContain("lessonsApi.assets");
      expect(watchSrc).toContain("15000");
    });
  });
});
