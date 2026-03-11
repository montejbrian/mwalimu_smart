import { Router } from 'express';
import { 
    askQuestionController, 
    generateQuizController, 
    analyzeAssessmentController 
} from '../controllers/qa.controller.js';

const router = Router();

// POST /api/qa/ask - Ask a question to the AI tutor
router.post('/ask', askQuestionController);

// POST /api/qa/quiz/generate - Generate a quiz from lesson content
router.post('/quiz/generate', generateQuizController);

// POST /api/qa/quiz/analyze - Analyze quiz results
router.post('/quiz/analyze', analyzeAssessmentController);

export default router;
