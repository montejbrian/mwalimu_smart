/**
 * MwalimuSmart Web
 * backend/api/routes/progress.js — Student progress routes (/api/progress/*)
 *
 * Endpoints:
 *   GET  /api/progress/mastery                ?student_id=me&grade_id=&subject=&lang=
 *   GET  /api/progress/recent                 ?student_id=me&limit=10&lang=
 *   POST /api/progress/:lesson_id/viewed      { position_s }
 *   POST /api/progress/:lesson_id/assessment  { answers: [{question_id, chosen_index}], lang }
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  submitAssessment,
  markViewed,
  getMasteryMap,
  getRecentActivity,
} from "../services/progress_service.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/mastery",
  asyncHandler(async (req, res) => {
    const studentId =
      req.query?.student_id && req.query.student_id !== "me"
        ? req.query.student_id
        : req.auth?.student_id;
    const lang = req.query?.lang === "sw" || req.query?.lang === "en" ? req.query.lang : req.lang;
    const result = await getMasteryMap({
      studentId,
      gradeId: req.query?.grade_id,
      subject: req.query?.subject,
      lang,
    });
    res.setHeader("Content-Language", lang === "sw" ? "sw" : "en");
    res.json(result);
  })
);

router.get(
  "/recent",
  asyncHandler(async (req, res) => {
    const studentId =
      req.query?.student_id && req.query.student_id !== "me"
        ? req.query.student_id
        : req.auth?.student_id;
    const limit = req.query?.limit;
    const lang = req.query?.lang === "sw" || req.query?.lang === "en" ? req.query.lang : req.lang;
    const result = await getRecentActivity({ studentId, limit, lang });
    res.setHeader("Content-Language", lang === "sw" ? "sw" : "en");
    res.json(result);
  })
);

router.post(
  "/:lesson_id/viewed",
  asyncHandler(async (req, res) => {
    const result = await markViewed(req.params.lesson_id, {
      studentId: req.auth?.student_id || null,
      positionS: req.body?.position_s,
    });
    res.json(result);
  })
);

router.post(
  "/:lesson_id/assessment",
  asyncHandler(async (req, res) => {
    // Only `answers` and `lang` are read from the body; any client-supplied
    // score / mastery fields are deliberately ignored.
    const lang = req.body?.lang === "sw" || req.body?.lang === "en" ? req.body.lang : req.lang;
    const result = await submitAssessment(req.params.lesson_id, {
      studentId: req.auth?.student_id || null,
      answers: req.body?.answers,
      lang,
    });
    res.setHeader("Content-Language", lang === "sw" ? "sw" : "en");
    res.json(result);
  })
);

export default router;
