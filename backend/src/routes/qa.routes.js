import { Router } from 'express';
import { askQuestionController } from '../controllers/qa.controller.js';

const router = Router();

// POST /api/qa/ask - Ask a question to the AI tutor
router.post('/ask', askQuestionController);

export default router;
