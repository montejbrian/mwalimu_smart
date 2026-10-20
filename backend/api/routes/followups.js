/**
 * MwalimuSmart Web
 * backend/api/routes/followups.js — Lesson-scoped AI follow-up routes (/api/followups/*)
 *
 * Endpoints:
 *   POST /api/followups/lessons/:lesson_id/threads → { thread_id, lesson_id, created_at }
 *   GET  /api/followups/threads/:thread_id        → full message history
 *   POST /api/followups/threads/:thread_id/messages → SSE token stream
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getOrCreateThread,
  getThreadHistory,
  getStudentSavedThreads,
  streamFollowUpResponse,
  getFollowUpVisualJob,
  updateFollowUpVisualJob,
} from "../services/followup_service.js";

const router = Router();

// Internal worker endpoint (no student auth required)
router.post(
  "/internal/visual-ready",
  asyncHandler(async (req, res) => {
    const { job_id, status, asset_url, error } = req.body || {};
    const updated = await updateFollowUpVisualJob({
      jobId: job_id,
      status: status || "ready",
      asset_url,
      error,
    });
    // Broadcast via WebSocket if registered
    if (typeof req.app?.get === "function" && req.app.get("broadcastFollowupVisual")) {
      req.app.get("broadcastFollowupVisual")({
        type: status === "failed" ? "followup_visual_failed" : "followup_visual_ready",
        job_id,
        thread_id: updated.thread_id,
        status: status || "ready",
        asset_url,
        error,
      });
    }
    res.json(updated);
  })
);

router.use(authMiddleware);

router.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const studentId = req.auth?.student_id;
    const lang = req.query?.lang === "sw" || req.query?.lang === "en" ? req.query.lang : req.lang;
    const result = await getStudentSavedThreads({ studentId, lang });
    res.json(result);
  })
);

router.get(
  "/jobs/:job_id",
  asyncHandler(async (req, res) => {
    const job = await getFollowUpVisualJob(req.params.job_id);
    res.json(job);
  })
);

router.post(
  "/lessons/:lesson_id/threads",
  asyncHandler(async (req, res) => {
    const studentId = req.auth?.student_id;
    const thread = await getOrCreateThread({
      studentId,
      lessonIdRaw: req.params.lesson_id,
    });
    res.json(thread);
  })
);

router.get(
  "/threads/:thread_id",
  asyncHandler(async (req, res) => {
    const studentId = req.auth?.student_id;
    const history = await getThreadHistory(req.params.thread_id, studentId);
    res.json(history);
  })
);

router.post(
  "/threads/:thread_id/messages",
  asyncHandler(async (req, res) => {
    const studentId = req.auth?.student_id;
    const lang = req.body?.lang === "sw" || req.body?.lang === "en" ? req.body.lang : req.lang;
    await streamFollowUpResponse({
      threadIdRaw: req.params.thread_id,
      studentId,
      content: req.body?.content,
      lang,
      with_visuals: req.body?.with_visuals,
      res,
    });
  })
);

export default router;
