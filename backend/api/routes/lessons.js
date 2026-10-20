/**
 * MwalimuSmart Web
 * backend/api/routes/lessons.js — Lesson read routes (/api/lessons/*)
 *
 * Endpoints:
 *   GET /api/lessons/:id
 *   GET /api/lessons/:id/transcript
 *   GET /api/lessons/:id/assets
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getLessonById,
  getLessonTranscript,
  getLessonAssets,
} from "../services/lesson_service.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lesson = await getLessonById(req.params.id, {
      lang: req.lang,
      studentId: req.auth?.student_id || null,
      role: req.auth?.role || "student",
    });
    res.setHeader("Content-Language", lesson.variant.language);
    res.json(lesson);
  })
);

router.get(
  "/:id/transcript",
  asyncHandler(async (req, res) => {
    const { filename, language, transcript } = await getLessonTranscript(
      req.params.id,
      {
        lang: req.lang,
        role: req.auth?.role || "student",
      }
    );
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Language", language);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(transcript);
  })
);

router.get(
  "/:id/assets",
  asyncHandler(async (req, res) => {
    const assets = await getLessonAssets(req.params.id, {
      lang: req.lang,
      role: req.auth?.role || "student",
    });
    res.json(assets);
  })
);

export default router;
