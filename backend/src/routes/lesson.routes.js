import { Router } from 'express';
import {
    generateLessonController,
    generateAudioController,
    generateVisualController,
    generateImageController
} from '../controllers/lesson.controller.js';

const router = Router();

// POST /api/lessons/generate - Generate a lesson using RAG
router.post('/generate', generateLessonController);

// POST /api/lessons/audio - Generate audio narration
router.post('/audio', generateAudioController);

// POST /api/lessons/visual - Generate visual content
router.post('/visual', generateVisualController);

// POST /api/lessons/image - Generate image (placeholder)
router.post('/image', generateImageController);

export default router;
