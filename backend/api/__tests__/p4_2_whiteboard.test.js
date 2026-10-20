/**
 * MwalimuSmart Web
 * backend/api/__tests__/p4_2_whiteboard.test.js
 *
 * Tests for P4.2:
 *   - Progressive Whiteboard draw op stream
 *   - SSE streaming of whiteboard_op events
 *   - Persistence of whiteboard visual_spec in PostgreSQL
 *   - Frontend Whiteboard component and VisualRenderer contract
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
import followupRoutes from "../routes/followups.js";
import {
  enqueueAuthoringJobs,
  publishLessonById,
} from "../services/authoring_service.js";
import { createSSEParser } from "../../../frontend/src/lib/sse.js";
import { createTestClient } from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_SRC = path.resolve(__dirname, "../../../frontend/src");

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use("/api/followups", followupRoutes);
  app.use(errorHandler);
  return app;
}

describe("P4.2 — Progressive Whiteboard Op Stream (/api/followups/*)", () => {
  let client;
  let schoolId;
  let studentId;
  let studentToken;
  let lessonId;
  let threadId;

  beforeAll(async () => {
    client = await createTestClient(createTestApp());

    const schoolRes = await pool.query(
      `INSERT INTO schools (name, county, school_type)
       VALUES ('P4.2 Whiteboard School', 'Nairobi', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P4.2 Student', 'p4-2.whiteboard@test.sc.ke')
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

    // Create an isolated substrand for this test to avoid parallel runner collision
    const ssRes = await pool.query(
      `SELECT st.id
       FROM strands st
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       LIMIT 1`
    );
    const strandId = ssRes.rows[0].id;
    await pool.query(`DELETE FROM substrands WHERE strand_id = $1 AND sort_order = 992`, [strandId]);
    const subRes = await pool.query(
      `INSERT INTO substrands (strand_id, name, sort_order)
       VALUES ($1, 'P4.2 Whiteboard Isolated Substrand', 992)
       RETURNING id`,
      [strandId]
    );
    const substrandId = subRes.rows[0].id;

    const pub = await enqueueAuthoringJobs({
      scope: { substrand_id: substrandId },
      tier: "standard",
    });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);

    // Create a thread for the student
    const tRes = await pool.query(
      `INSERT INTO followup_threads (student_id, lesson_id)
       VALUES ($1, $2)
       RETURNING id`,
      [studentId, lessonId]
    );
    threadId = tRes.rows[0].id;
  });

  afterAll(async () => {
    if (client) await client.close();
  });

  it("streams progressive whiteboard ops via SSE and stores visual_spec in Postgres", async () => {
    const res = await client.post(`/api/followups/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      body: {
        content: "Can you show step by step on the whiteboard how to solve 2x + 3 = 7?",
        lang: "en",
        with_visuals: true,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = [];
    const whiteboardOps = [];
    let finalVisualReady = null;

    const parser = createSSEParser(({ event, data }) => {
      events.push({ event, data });
      if (event === "whiteboard_op") {
        whiteboardOps.push(data);
      }
      if (event === "visual_ready") {
        finalVisualReady = data;
      }
    });

    parser.feed(res.body);

    expect(whiteboardOps.length).toBeGreaterThanOrEqual(4);
    expect(finalVisualReady).toBeTruthy();
    expect(finalVisualReady.tier).toBe("whiteboard");

    // Verify messages saved in Postgres
    const msgRes = await pool.query(
      `SELECT role, content, has_visual, visual_spec
       FROM followup_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [threadId]
    );

    expect(msgRes.rows.length).toBeGreaterThanOrEqual(2);
    const asstMsg = msgRes.rows.find((r) => r.role === "assistant");
    expect(asstMsg).toBeTruthy();
    expect(asstMsg.has_visual).toBe(true);
    expect(asstMsg.visual_spec).toBeTruthy();
    expect(asstMsg.visual_spec.tier).toBe("whiteboard");
    expect(asstMsg.visual_spec.template_id).toBe("whiteboard");
    expect(Array.isArray(asstMsg.visual_spec.ops)).toBe(true);
    expect(asstMsg.visual_spec.ops.length).toBeGreaterThanOrEqual(4);

    // Verify presence of all required op types
    const opTypes = asstMsg.visual_spec.ops.map((o) => o.op);
    expect(opTypes).toContain("write");
    expect(opTypes).toContain("equation");
    expect(opTypes).toContain("highlight");
    expect(opTypes).toContain("arrow");
  });

  it("reopening the thread reloads progressive whiteboard ops intact", async () => {
    const res = await client.get(`/api/followups/threads/${threadId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    expect(res.status).toBe(200);
    const asstMsg = res.body.messages.find(
      (m) => m.role === "assistant" && m.visual_spec?.tier === "whiteboard"
    );
    expect(asstMsg).toBeTruthy();
    expect(asstMsg.visual_spec.ops.length).toBeGreaterThanOrEqual(4);
  });

  describe("Frontend Source Contracts for Progressive Whiteboard", () => {
    it("Whiteboard.jsx implements progressive canvas, step controls, and all op types", () => {
      const wbPath = path.join(FRONTEND_SRC, "components/visuals/Whiteboard.jsx");
      const content = fs.readFileSync(wbPath, "utf-8");

      expect(content).toContain('data-testid="whiteboard-canvas"');
      expect(content).toContain('data-testid="whiteboard-step-indicator"');
      expect(content).toContain('data-testid="whiteboard-play-btn"');
      expect(content).toContain('data-testid="whiteboard-next-btn"');
      expect(content).toContain('data-testid="whiteboard-prev-btn"');
      expect(content).toContain('data-testid="whiteboard-reset-btn"');
      expect(content).toContain('data-testid="whiteboard-write"');
      expect(content).toContain('data-testid="whiteboard-highlight"');
      expect(content).toContain('data-testid="whiteboard-arrow"');
      expect(content).toContain('data-testid="whiteboard-equation"');
      expect(content).toContain('data-testid="whiteboard-diagram"');
    });

    it("VisualRenderer maps 'whiteboard' template_id to Whiteboard component", () => {
      const vrPath = path.join(FRONTEND_SRC, "components/visuals/VisualRenderer.jsx");
      const content = fs.readFileSync(vrPath, "utf-8");

      expect(content).toContain("Whiteboard");
      expect(content).toContain("whiteboard: Whiteboard");
      expect(content).toContain('activeTemplateId === "whiteboard"');
    });

    it("FollowUpPanel mounts Whiteboard and handles onWhiteboardOp SSE streaming", () => {
      const fpPath = path.join(FRONTEND_SRC, "components/lesson/FollowUpPanel.jsx");
      const content = fs.readFileSync(fpPath, "utf-8");

      expect(content).toContain("Whiteboard");
      expect(content).toContain('m.visual_spec?.tier === "whiteboard"');
      expect(content).toContain("onWhiteboardOp");
    });
  });
});
