/**
 * MwalimuSmart — backend/api/routes/authoring.js
 * Teacher/Admin Authoring & Review Routes:
 *   POST /api/authoring/jobs { scope, tier } -> { job_ids: [...] }
 *   GET  /api/authoring/jobs?state=          -> { jobs: [...] }
 *   GET  /api/authoring/jobs/:id             -> status + log
 *   POST /api/authoring/lessons/:id/approve
 *   POST /api/authoring/lessons/:id/reject { feedback }
 *   POST /api/authoring/lessons/:id/publish
 *   POST /api/authoring/lessons/:id/regenerate { feedback }
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  enqueueAuthoringJobs,
  listAuthoringJobs,
  getAuthoringJobById,
  approveLessonById,
  rejectLessonById,
  publishLessonById,
  regenerateLessonById,
} from "../services/authoring_service.js";

const router = Router();

// 50/hour per teacher rate limit on authoring enqueue (docs/07-API.md)
const authoringEnqueueLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || req.ip),
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Too many authoring jobs enqueued, please try again later",
        retry_after_s: 3600,
      },
    });
  },
});

router.use(authMiddleware);
router.use(requireRole("teacher", "admin"));

function resolveNumericReviewerId(user) {
  const n = Number(user?.id);
  return Number.isInteger(n) ? n : null;
}

// POST /api/authoring/jobs
router.post(
  "/jobs",
  authoringEnqueueLimiter,
  asyncHandler(async (req, res) => {
    const scope =
      req.body?.scope ||
      (req.body?.substrand_id
        ? { substrand_id: req.body.substrand_id }
        : req.body?.strand_id
        ? { strand_id: req.body.strand_id }
        : null);
    const tier = req.body?.tier || "standard";
    const result = await enqueueAuthoringJobs({
      scope,
      tier,
      teacherId: resolveNumericReviewerId(req.user),
    });
    res.status(201).json(result);
  })
);

// GET /api/authoring/jobs?state=
router.get(
  "/jobs",
  asyncHandler(async (req, res) => {
    const state = req.query.state ? String(req.query.state) : undefined;
    const jobs = await listAuthoringJobs({ state });
    res.json({ jobs });
  })
);

// GET /api/authoring/jobs/:id
router.get(
  "/jobs/:id",
  asyncHandler(async (req, res) => {
    const job = await getAuthoringJobById(req.params.id);
    res.json(job);
  })
);

// POST /api/authoring/lessons/:id/approve
router.post(
  "/lessons/:id/approve",
  asyncHandler(async (req, res) => {
    const result = await approveLessonById(
      req.params.id,
      resolveNumericReviewerId(req.user)
    );
    res.json(result);
  })
);

// POST /api/authoring/lessons/:id/reject
router.post(
  "/lessons/:id/reject",
  asyncHandler(async (req, res) => {
    const result = await rejectLessonById(
      req.params.id,
      req.body?.feedback,
      resolveNumericReviewerId(req.user)
    );
    res.json(result);
  })
);

// POST /api/authoring/lessons/:id/publish
router.post(
  "/lessons/:id/publish",
  asyncHandler(async (req, res) => {
    const result = await publishLessonById(
      req.params.id,
      resolveNumericReviewerId(req.user)
    );
    res.json(result);
  })
);

// POST /api/authoring/lessons/:id/regenerate
router.post(
  "/lessons/:id/regenerate",
  asyncHandler(async (req, res) => {
    const result = await regenerateLessonById(
      req.params.id,
      req.body?.feedback,
      resolveNumericReviewerId(req.user)
    );
    res.status(201).json(result);
  })
);

export default router;
