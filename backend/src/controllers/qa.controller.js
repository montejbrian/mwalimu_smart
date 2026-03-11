import { askQuestion, generateQuiz, analyzeAssessment } from '../services/qa.service.js';

export async function askQuestionController(req, res) {
    try {
        const { history, question, level } = req.body;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'Question is required and must be a string' });
        }

        console.log(`Processing Q&A question: "${question.substring(0, 50)}..." with level: ${level}`);

        const answer = await askQuestion(history, question, level);

        return res.json({ answer });
    } catch (error) {
        console.error('Error in askQuestionController:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate answer'
        });
    }
}

export async function generateQuizController(req, res) {
    try {
        const { lessonContent, level } = req.body;

        if (!lessonContent || !lessonContent.steps) {
            return res.status(400).json({ error: 'Lesson content is required' });
        }

        const quizData = await generateQuiz(lessonContent, level);
        return res.json(quizData);
    } catch (error) {
        console.error('Error in generateQuizController:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function analyzeAssessmentController(req, res) {
    try {
        const { lessonContent, studentAnswers, quizData } = req.body;

        if (!lessonContent || !studentAnswers || !quizData) {
            return res.status(400).json({ error: 'Missing assessment data' });
        }

        const analysis = analyzeAssessment(lessonContent, studentAnswers, quizData);
        return res.json(analysis);
    } catch (error) {
        console.error('Error in analyzeAssessmentController:', error);
        return res.status(500).json({ error: error.message });
    }
}
