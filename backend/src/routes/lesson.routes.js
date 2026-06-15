import { Router } from 'express';
import {
    generateLessonController,
    generateAudioController,
    generateVisualController,
    generateImageController
} from '../controllers/lesson.controller.js';
import { verifyStudentToken } from '../middleware/tenant.js';

const router = Router();

// Secure all lesson endpoints with student JWT verification
router.use(verifyStudentToken);

// POST /api/lessons/generate - Generate a lesson using RAG
router.post('/generate', generateLessonController);

// POST /api/lessons/audio - Generate audio narration
router.post('/audio', generateAudioController);

// POST /api/lessons/visual - Generate visual content
router.post('/visual', generateVisualController);

// POST /api/lessons/image - Generate image (placeholder)
router.post('/image', generateImageController);

export default router;
