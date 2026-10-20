/**
 * MwalimuSmart Web
 * backend/api/__tests__/p3_2_visual_templates.test.js
 *
 * Tests for P3.2:
 *   - Tier 1 visual templates (EquationBalance, NumberLine, FractionBar, Flowchart, GraphPlot)
 *   - Fast visual router (< 500ms latency)
 *   - SSE emission of visual_queued + visual_ready
 *   - Postgres persistence of has_visual and visual_spec
 *   - Feature flag FF_TIER1_VISUALS gating
 *   - Non-matching fallback to text-only without blocking stream
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
import { runVisualRouter } from "../services/followup_service.js";
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

describe("P3.2 — Tier 1 visual templates & fast router (/api/followups/*)", () => {
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
       VALUES ('P3.2 Visual School', 'Kiambu', 'junior_secondary')
       RETURNING school_id`
    );
    schoolId = schoolRes.rows[0].school_id;

    const stuRes = await pool.query(
      `INSERT INTO students (school_id, full_name, email)
       VALUES ($1, 'P3.2 Visual Student', 'p3-2.visual@test.sc.ke')
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

    // Grab mathematics substrand at offset 9
    const ssRes = await pool.query(
      `SELECT ss.id
       FROM substrands ss
       JOIN strands st ON st.id = ss.strand_id
       JOIN grade_subjects gs ON gs.id = st.grade_subject_id
       JOIN subjects s ON s.id = gs.subject_id
       WHERE s.code = 'mathematics'
       ORDER BY st.sort_order ASC, ss.sort_order ASC
       OFFSET 9 LIMIT 1`
    );
    const substrandId = ssRes.rows[0].id;
    await pool.query(`DELETE FROM lessons WHERE substrand_id = $1`, [substrandId]);

    const pub = await enqueueAuthoringJobs({
      scope: { substrand_id: substrandId },
      tier: "standard",
    });
    lessonId = pub.jobs[0].lesson_id;
    await publishLessonById(lessonId);

    // Create follow-up thread
    const threadRes = await client.post(
      `/api/followups/lessons/${lessonId}/threads`,
      {
        headers: {
          authorization: `Bearer ${studentToken}`,
        },
      }
    );
    expect(threadRes.status).toBe(200);
    threadId = threadRes.body.thread_id;
  });

  afterAll(async () => {
    if (client) await client.close();
    delete process.env.FF_TIER1_VISUALS;
  });

  it("runVisualRouter matches all 5 templates with sub-500ms latency in dev", async () => {
    const t0 = Date.now();
    const eqMatch = await runVisualRouter(
      "how to solve 2x + 3 = 11 balance",
      "Linear Equations"
    );
    const latency = Date.now() - t0;

    expect(latency).toBeLessThan(500);
    expect(eqMatch.match).toBe(true);
    expect(eqMatch.tier).toBe(1);
    expect(eqMatch.template_id).toBe("equation_balance");
    expect(eqMatch.params).toHaveProperty("left");
    expect(eqMatch.params).toHaveProperty("right");
    expect(eqMatch.params).toHaveProperty("balanced", true);

    // Number Line
    const nlMatch = await runVisualRouter(
      "show numbers on number line from -5 to 5",
      "Integers"
    );
    expect(nlMatch.match).toBe(true);
    expect(nlMatch.template_id).toBe("number_line");
    expect(nlMatch.params).toHaveProperty("min");
    expect(nlMatch.params).toHaveProperty("max");

    // Fraction Bar
    const fracMatch = await runVisualRouter(
      "compare fractions 3/4 and 6/8",
      "Fractions"
    );
    expect(fracMatch.match).toBe(true);
    expect(fracMatch.template_id).toBe("fraction_bar");
    expect(fracMatch.params.bars.length).toBeGreaterThanOrEqual(2);

    // Flowchart
    const flowMatch = await runVisualRouter(
      "steps in the process of filtration flowchart",
      "Separation"
    );
    expect(flowMatch.match).toBe(true);
    expect(flowMatch.template_id).toBe("flowchart");
    expect(flowMatch.params.nodes.length).toBeGreaterThan(0);

    // Graph Plot
    const graphMatch = await runVisualRouter(
      "plot coordinates on a graph y = 2x + 1",
      "Linear Relations"
    );
    expect(graphMatch.match).toBe(true);
    expect(graphMatch.template_id).toBe("graph_plot");
    expect(graphMatch.params.points.length).toBeGreaterThan(0);

    // No match
    const noMatch = await runVisualRouter(
      "what is the capital city of Kenya?",
      "Geography"
    );
    expect(noMatch.match).toBe(false);
    expect(noMatch.no_match).toBe(true);
  });

  it("emits visual_queued and visual_ready over SSE and stores visual_spec in Postgres", async () => {
    delete process.env.FF_TIER1_VISUALS; // Enabled by default

    const res = await client.post(`/api/followups/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        Accept: "text/event-stream",
      },
      body: {
        content: "Can you balance the equation 2x + 3 = 11 with a visual?",
        with_visuals: true,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const events = [];
    const parser = createSSEParser(({ event, data }) => {
      events.push({ event, data });
    });
    parser.feed(res.body);

    const queuedEvent = events.find((e) => e.event === "visual_queued");
    const readyEvent = events.find((e) => e.event === "visual_ready");
    const doneEvent = events.find((e) => e.event === "done");

    expect(queuedEvent).toBeDefined();
    expect(queuedEvent.data.tier).toBe(1);
    expect(queuedEvent.data.template_id).toBe("equation_balance");

    expect(readyEvent).toBeDefined();
    expect(readyEvent.data.tier).toBe(1);
    expect(readyEvent.data.template_id).toBe("equation_balance");
    expect(readyEvent.data.params).toBeDefined();

    expect(doneEvent).toBeDefined();
    expect(doneEvent.data.has_visual).toBe(true);
    expect(doneEvent.data.visual_spec).toBeDefined();
    expect(doneEvent.data.visual_spec.template_id).toBe("equation_balance");

    // Verify stored in PostgreSQL
    const msgRes = await pool.query(
      `SELECT has_visual, visual_spec
       FROM followup_messages
       WHERE id = $1`,
      [doneEvent.data.message_id]
    );
    expect(msgRes.rows.length).toBe(1);
    expect(msgRes.rows[0].has_visual).toBe(true);
    expect(msgRes.rows[0].visual_spec.template_id).toBe("equation_balance");

    // Verify GET /api/followups/threads/:thread_id includes visual_spec
    const histRes = await client.get(`/api/followups/threads/${threadId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(histRes.status).toBe(200);
    const lastMsg = histRes.body.messages[histRes.body.messages.length - 1];
    expect(lastMsg.has_visual).toBe(true);
    expect(lastMsg.visual_spec.template_id).toBe("equation_balance");
  });

  it("FF_TIER1_VISUALS='false' disables visual routing, yielding identical text-only behavior to P3.1", async () => {
    process.env.FF_TIER1_VISUALS = "false";

    const res = await client.post(`/api/followups/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        Accept: "text/event-stream",
      },
      body: {
        content: "how to solve 2x + 3 = 11 balance",
        with_visuals: true,
      },
    });

    expect(res.status).toBe(200);

    const events = [];
    const parser = createSSEParser(({ event, data }) => {
      events.push({ event, data });
    });
    parser.feed(res.body);

    const queuedEvent = events.find((e) => e.event === "visual_queued");
    const readyEvent = events.find((e) => e.event === "visual_ready");
    const doneEvent = events.find((e) => e.event === "done");

    expect(queuedEvent).toBeUndefined();
    expect(readyEvent).toBeUndefined();
    expect(doneEvent).toBeDefined();
    expect(doneEvent.data.has_visual).toBe(false);
    expect(doneEvent.data.visual_spec).toBeNull();
  });

  it("non-matching question falls through without visual events and completes stream unblocked", async () => {
    delete process.env.FF_TIER1_VISUALS;

    const res = await client.post(`/api/followups/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${studentToken}`,
        Accept: "text/event-stream",
      },
      body: {
        content: "Why do we study algebra in Grade 7?",
        with_visuals: true,
      },
    });

    expect(res.status).toBe(200);

    const events = [];
    const parser = createSSEParser(({ event, data }) => {
      events.push({ event, data });
    });
    parser.feed(res.body);

    const queuedEvent = events.find((e) => e.event === "visual_queued");
    const readyEvent = events.find((e) => e.event === "visual_ready");
    const doneEvent = events.find((e) => e.event === "done");

    expect(queuedEvent).toBeUndefined();
    expect(readyEvent).toBeUndefined();
    expect(doneEvent).toBeDefined();
    expect(doneEvent.data.has_visual).toBe(false);
  });
});
