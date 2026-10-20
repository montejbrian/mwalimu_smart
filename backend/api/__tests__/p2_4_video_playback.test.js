/**
 * MwalimuSmart Web
 * backend/api/__tests__/p2_4_video_playback.test.js
 *
 * Tests for P2.4:
 *   - Video resume at progress.last_position_s
 *   - Captions track from captions_url
 *   - 15s throttle on viewed posts
 *   - POST /api/progress/:id/viewed endpoint
 *   - Unplayed video shows ReadTab default
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
import {
  formatDuration,
  shouldPostViewed,
  VIEWED_THROTTLE_MS,
  resolveDefaultLessonTab,
} from "../../../frontend/src/lib/video.js";
import { enqueueAuthoringJobs, publishLessonById } from "../services/authoring_service.js";
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

describe("P2.4 — Video + captions playback with resume", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let teacherToken;
  let lessonId;
  let substrandId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P2.4 Test School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P2.4 Student', 'p2-4.student@test.sc.ke')
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

    teacherToken = jwt.sign(
      { teacher_id: "00000000-0000-0000-0000-000000000024", school_id: schoolId, role: "teacher" },
      config.authSecret,
      { expiresIn: "1h" }
    );

    // Pick mathematics substrand at offset 6
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 6 LIMIT 1`
    );
    substrandId = ssRes.rows[0].id;
    await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);

    const pub = await enqueueAuthoringJobs({ scope: { substrand_id: substrandId }, tier: "standard" });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  describe("Pure helper: formatDuration", () => {
    it("formats seconds into M:SS correctly", () => {
      expect(formatDuration(0)).toBe(null);
      expect(formatDuration(-10)).toBe(null);
      expect(formatDuration(null)).toBe(null);
      expect(formatDuration(45)).toBe("0:45");
      expect(formatDuration(60)).toBe("1:00");
      expect(formatDuration(125)).toBe("2:05");
      expect(formatDuration(3600)).toBe("60:00");
    });
  });

  describe("Pure helper: shouldPostViewed (15s throttle logic)", () => {
    it("enforces the 15-second throttle interval", () => {
      expect(VIEWED_THROTTLE_MS).toBe(15000);

      const now = 1000000;
      // 10 seconds since last post -> false
      expect(shouldPostViewed(now - 10000, 30, 20, 15000, now)).toBe(false);

      // 15 seconds since last post and position changed -> true
      expect(shouldPostViewed(now - 15000, 35, 20, 15000, now)).toBe(true);

      // 20 seconds since last post and position changed -> true
      expect(shouldPostViewed(now - 20000, 40, 20, 15000, now)).toBe(true);

      // 20 seconds since last post but position did not change (paused) -> false
      expect(shouldPostViewed(now - 20000, 20, 20, 15000, now)).toBe(false);

      // Initial post (lastPostedAt = 0) with non-zero position -> true
      expect(shouldPostViewed(0, 15, -1, 15000, now)).toBe(true);

      // Negative or invalid position -> false
      expect(shouldPostViewed(now - 20000, -5, 0, 15000, now)).toBe(false);
      expect(shouldPostViewed(now - 20000, NaN, 0, 15000, now)).toBe(false);
    });
  });

  describe("Default Tab: resolveDefaultLessonTab", () => {
    it("defaults to ReadTab when video_url is absent", () => {
      expect(resolveDefaultLessonTab(null)).toBe("read");
      expect(resolveDefaultLessonTab({})).toBe("read");
      expect(resolveDefaultLessonTab({ video_url: null })).toBe("read");
      expect(resolveDefaultLessonTab({ video_url: "https://cdn.example.com/video.mp4" })).toBe("watch");
    });
  });

  describe("POST /api/progress/:lesson_id/viewed", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await client.post(`/api/progress/${lessonId}/viewed`, {
        body: { position_s: 15 },
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("auth.missing");
    });

    it("rejects teachers with 403", async () => {
      const res = await client.post(`/api/progress/${lessonId}/viewed`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
        body: { position_s: 15 },
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("auth.forbidden");
    });

    it("rejects negative position_s with 400 validation", async () => {
      const res = await client.post(`/api/progress/${lessonId}/viewed`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { position_s: -10 },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("validation");
    });

    it("accepts valid position_s and updates student_progress", async () => {
      const res = await client.post(`/api/progress/${lessonId}/viewed`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { position_s: 42.8 },
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("viewed");
      expect(res.body.last_position_s).toBe(42);

      // Verify directly in database
      const dbRow = (
        await pool.query(
          `SELECT status, last_position_s FROM student_progress WHERE student_id = $1 AND lesson_id = $2`,
          [studentId, lessonId]
        )
      ).rows[0];
      expect(dbRow.status).toBe("viewed");
      expect(dbRow.last_position_s).toBe(42);
    });

    it("updates position to a later timestamp on subsequent view posts", async () => {
      const res = await client.post(`/api/progress/${lessonId}/viewed`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { position_s: 90 },
      });
      expect(res.status).toBe(200);
      expect(res.body.last_position_s).toBe(90);
    });
  });

  describe("WatchTab component source contracts", () => {
    it("contains resume logic, captions track, and 15s throttle integration", () => {
      const watchSrc = fs.readFileSync(
        path.join(FRONTEND_SRC, "components/lesson/WatchTab.jsx"),
        "utf8"
      );
      // Resume check
      expect(watchSrc).toContain("initialPositionS");
      expect(watchSrc).toContain("currentTime");
      expect(watchSrc).toContain("data-testid=\"video-resume-banner\"");
      expect(watchSrc).toContain("data-testid=\"restart-video-btn\"");

      // Captions track
      expect(watchSrc).toContain("captionsUrl");
      expect(watchSrc).toContain("data-testid=\"video-captions-track\"");
      expect(watchSrc).toContain("kind=\"captions\"");

      // 15s throttle
      expect(watchSrc).toContain("VIEWED_THROTTLE_MS");
      expect(watchSrc).toContain("progressApi.viewed");
      expect(watchSrc).toContain("onTimeUpdate");
      expect(watchSrc).toContain("onPause");
    });

    it("LessonPlayerPage wires lessonId and initialPositionS to WatchTab", () => {
      const playerSrc = fs.readFileSync(
        path.join(FRONTEND_SRC, "pages/LessonPlayerPage.jsx"),
        "utf8"
      );
      expect(playerSrc).toContain("lessonId={lessonId}");
      expect(playerSrc).toContain("initialPositionS={lesson.progress?.last_position_s || 0}");
    });
  });
});
