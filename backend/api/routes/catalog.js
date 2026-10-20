/**
 * MwalimuSmart Web
 * backend/api/routes/catalog.js — Curriculum catalog routes (/api/catalog/*)
 *
 * Endpoints:
 *   GET /api/catalog/levels
 *   GET /api/catalog/grades?level_id=:id
 *   GET /api/catalog/subjects?grade_id=:id
 *   GET /api/catalog/strands?grade_id=:id&subject=:code
 *   GET /api/catalog/substrands?strand_id=:uuid
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  getLevels,
  getGrades,
  getSubjects,
  getStrands,
  getSubstrands,
} from "../services/catalog_service.js";

const router = Router();

// 120 requests / minute per student (docs/07-API.md)
const catalogLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.student_id || req.auth?.teacher_id || req.ip,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Too many catalog requests — please wait a moment.",
        retry_after_s: 60,
      },
    });
  },
});

router.use(authMiddleware);
router.use(catalogLimiter);

router.get(
  "/levels",
  asyncHandler(async (_req, res) => {
    const levels = await getLevels();
    res.json(levels);
  })
);

router.get(
  "/grades",
  asyncHandler(async (req, res) => {
    const grades = await getGrades(req.query.level_id);
    res.json(grades);
  })
);

router.get(
  "/subjects",
  asyncHandler(async (req, res) => {
    const subjects = await getSubjects(req.query.grade_id, req.lang);
    res.json(subjects);
  })
);

router.get(
  "/strands",
  asyncHandler(async (req, res) => {
    const strands = await getStrands(
      req.query.grade_id,
      req.query.subject,
      req.auth?.student_id || null
    );
    res.json(strands);
  })
);

router.get(
  "/substrands",
  asyncHandler(async (req, res) => {
    const substrands = await getSubstrands(
      req.query.strand_id,
      req.auth?.student_id || null
    );
    res.json(substrands);
  })
);

export default router;
