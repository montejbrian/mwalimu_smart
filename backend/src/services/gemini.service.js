import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { generateAudio } from './tts.service.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_MODEL = 'gemini-2.5-flash';


/*Helper to retry an operation with exponential backoff*/
async function retryOperation(
    operation,
    maxRetries = 3,
    baseDelay = 1000
) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const delay = baseDelay * Math.pow(2, i);
            console.warn(`Attempt ${i + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

/*Helper to clean JSON string from markdown code blocks and comments*/
function cleanJsonString(text) {

    let cleaned = text.replace(/```json\n?|\n?```/g, '');

    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

    cleaned = cleaned.replace(/(^|[^:])\/\/.*$/gm, '$1');

    return cleaned.trim();
}

/*Generate a structured lesson from a question and optional image*/
export async function generateLesson(
    question,
    imageBase64
) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL
    });

    const systemPrompt = `You are an expert tutor for MwalimuSmart. When given a student question, break it down into clear, educational steps that help them understand the concept deeply.

Return your response as a JSON object with this structure:
{
  "title": "A clear, descriptive title for the lesson",
  "steps": [
    {
      "id": "1",
      "text": "Clear explanation of this step (1-3 sentences)",
      "duration": 3
    }
  ],
  "summary": "Brief summary of the key takeaways"
}

Guidelines:
- Create 4-6 steps for most concepts
- Each step should be clear and build on the previous one
- Use simple language appropriate for students school students
- The explanation should align with the Kenya Institute of Curriculum Development (KICD) curriculum
- Duration should be 2-5 seconds per step based on complexity
- Focus on understanding, not just memorization
- IMPORTANT: Return strictly valid JSON. Do not include comments (// or /* */) in the response.`;

    const parts = [
        { text: systemPrompt },
        { text: `\n\nStudent Question: ${question}` }
    ];

    if (imageBase64) {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
            }
        });
    }

    try {
        const result = await retryOperation(() => model.generateContent(parts));
        const response = result.response;
        const text = response.text();

        const cleanedText = cleanJsonString(text);
        const lessonData = JSON.parse(cleanedText);
        return lessonData;
    } catch (error) {
        console.error('Failed to parse Gemini response for Lesson:', error);
        throw new Error('Failed to parse lesson data from AI response');
    }
}

/*Generate audio narration for a given text using Google Cloud Text-to-Speech*/
export async function generateAudioNarration(text) {
    try {
        const audioBase64 = await retryOperation(() => generateAudio(text));
        return {
            text,
            audioBase64,
            audioUrl: undefined
        };
    } catch (error) {
        console.error('Failed to generate audio with Google Cloud TTS:', error);
        return {
            text,
            audioUrl: undefined,
            audioBase64: undefined
        };
    }
}

/*Generate visual drawing instructions for a step*/
export async function generateVisualInstructions(
    stepText,
    stepNumber
) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL
    });

    const prompt = `You are a visual instruction generator for an educational whiteboard. Given a lesson step, generate simple drawing instructions that can be rendered on an HTML canvas.

Lesson Step ${stepNumber}: "${stepText}"

Generate drawing instructions as a JSON array of objects. Each object should have:
- type: "circle" | "rectangle" | "line" | "arrow" | "text" | "curve"
- Coordinates and dimensions appropriate for a 800x600 canvas
- color: hex color code
- For text: 
  - text: content
  - fontSize: number
  - isFormula: boolean (true if text contains chemical formulas or math equations like H2O, x^2)
  - highlight: boolean (true if this text is a key concept that should glow)

Guidelines:
- For formulas, use standard text (e.g., "H2O", "x^2 + y^2"). The frontend will handle subscript/superscript rendering.
- For state symbols in chemistry, include them (e.g., "HCl(aq)").
- Use "highlight": true for important terms, formulas, or keywords.
- Keep it simple and educational. Focus on diagrams, labels, and key visual elements.
- IMPORTANT: Return strictly valid JSON. Do not include comments (// or /* */) in the response.

Example output:
[
  {"type": "circle", "x": 400, "y": 300, "radius": 50, "color": "#3b82f6"},
  {"type": "text", "x": 400, "y": 400, "text": "H2O(l)", "fontSize": 24, "color": "#333333", "isFormula": true, "highlight": true}
]`;

    try {
        const result = await retryOperation(() => model.generateContent(prompt));
        const response = result.response;
        const text = response.text();

        const cleanedText = cleanJsonString(text);
        const instructions = JSON.parse(cleanedText);
        return instructions;
    } catch (error) {
        console.error('Failed to parse Gemini response for Visuals:', error);
        throw new Error('Failed to parse visual instructions from AI response');
    }
}
