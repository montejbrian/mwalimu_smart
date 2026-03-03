import { generateLesson, generateAudioNarration, generateVisualInstructions } from '../services/gemini.service.js';
import { generateEducationalImage, shouldUseAIImage } from '../services/stable-diffusion.service.js';

/*Generate a lesson from a question and optional image*/
export async function generateLessonController(req, res) {
    try {
        const { question, image, level } = req.body;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'Question is required and must be a string' });
        }

        console.log(`Generating lesson for question: "${question}" with image: ${image ? 'yes' : 'no'} and level: ${level}`);

        const lessonData = await generateLesson(question, image, level);

        console.log(`Generated lesson: "${lessonData.title}" with ${lessonData.steps.length} steps and scripts.`);

        return res.json(lessonData);
    } catch (error) {
        console.error('Error generating lesson:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate lesson'
        });
    }
}

/* Generate audio narration for a step*/
export async function generateAudioController(req, res) {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required and must be a string' });
        }

        const audioData = await generateAudioNarration(text);
        return res.json(audioData);
    } catch (error) {
        console.error('Error generating audio:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate audio'
        });
    }
}

/*Generate visual instructions for a step*/
export async function generateVisualController(req, res) {
    try {
        const { stepText, stepNumber, topic, script, level } = req.body;

        if (!stepText || typeof stepText !== 'string') {
            return res.status(400).json({ error: 'stepText is required and must be a string' });
        }

        if (stepNumber === undefined || typeof stepNumber !== 'number') {
            return res.status(400).json({ error: 'stepNumber is required and must be a number' });
        }

        // Determine if we should use Manim or Canvas
        const manimTopics = ['math', 'physics', 'geometry', 'theorem', 'equation', 'pythagorean'];
        const isManim = manimTopics.some(t => topic.toLowerCase().includes(t));

        if (isManim) {
            try {
                // Import the manim service dynamically to avoid issues if the python server is down
                const { generateManimAnimation } = await import('../services/manim.service.js');
                const manimResult = await generateManimAnimation(stepText, stepNumber, topic, script);
                return res.json({
                    isVideo: true,
                    videoBase64: manimResult.videoBase64
                });
            } catch (manimError) {
                console.warn('Manim generation failed, falling back to canvas instructions:', manimError.message);
                // Fallback to canvas
                const instructions = await generateVisualInstructions(stepText, stepNumber, topic, script, level);
                return res.json({ instructions });
            }
        } else {
            const instructions = await generateVisualInstructions(stepText, stepNumber, topic, script, level);
            return res.json({ instructions });
        }


    } catch (error) {
        console.error('Error generating visual instructions:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate visual instructions'
        });
    }
}

/*Generate an AI image for a step*/
export async function generateImageController(req, res) {
    try {
        const { topic, stepText } = req.body;

        if (!topic || typeof topic !== 'string') {
            return res.status(400).json({ error: 'Topic is required and must be a string' });
        }

        if (!stepText || typeof stepText !== 'string') {
            return res.status(400).json({ error: 'stepText is required and must be a string' });
        }

        // Check if we should use AI image or canvas
        const useAI = shouldUseAIImage(topic, stepText);

        if (!useAI) {
            return res.json({ useAI: false });
        }

        const result = await generateEducationalImage(topic, stepText);
        return res.json({
            useAI: true,
            imageBase64: result.imageBase64,
            cached: result.cached
        });
    } catch (error) {
        console.log(`AI Image Fallback triggered: ${error.message}`);
        // Fallback to canvas on error
        return res.json({ useAI: false, error: 'Failed to generate image' });
    }
}
