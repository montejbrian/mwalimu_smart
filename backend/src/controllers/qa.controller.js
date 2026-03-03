import { askQuestion } from '../services/qa.service.js';

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
