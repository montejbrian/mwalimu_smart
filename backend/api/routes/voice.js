/**
 * MwalimuSmart Web
 * backend/api/routes/voice.js — Voice Assistant Endpoints (Phase 4.1)
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { validateVoice } from "../middleware/validators.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { processVoiceTurn } from "../services/voice_service.js";
import { PythonBridge } from "../python_bridge.js";

const router = Router();
const defaultBridge = new PythonBridge();

export function createVoiceRouter(bridge = defaultBridge) {
  const r = Router();

  r.use(authMiddleware);

  r.post(
    "/message",
    validateVoice,
    asyncHandler(async (req, res) => {
      const { school_id, teacher_id, student_id } = req.auth;
      const creator_id = student_id || req.body?.student_id || teacher_id;
      const { lesson_id, text, language = req.lang || "en" } = req.body;

      const result = await processVoiceTurn({
        schoolId: school_id || req.body?.school_id,
        studentId: req.body?.student_id || creator_id,
        lessonId: lesson_id,
        text,
        language,
        bridge,
      });

      res.json(result);
    })
  );

  r.post(
    "/stt",
    asyncHandler(async (req, res) => {
      const {
        audio_b64,
        language = "en-KE",
        encoding = "WEBM_OPUS",
        sample_rate = 48000,
      } = req.body || {};

      if (!audio_b64) {
        return res.status(400).json({ error: "audio_b64 is required" });
      }

      const result = await bridge.transcribeAudio({
        audio_b64,
        language,
        encoding,
        sample_rate,
      });

      res.json(result);
    })
  );

  r.delete(
    "/session/:id",
    asyncHandler(async (req, res) => {
      const result = await bridge.endVoiceSession({
        school_id: req.auth.school_id,
        student_id: req.auth.student_id || req.auth.teacher_id,
      });
      res.json(result || { status: "ended" });
    })
  );

  return r;
}

export default createVoiceRouter(defaultBridge);
