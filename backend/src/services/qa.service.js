import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { cleanJsonString } from './gemini.service.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_MODEL = 'gemini-2.5-flash';

// System prompt designed to act as an encouraging tutor and optionally return drawing instructions.
const QA_SYSTEM_PROMPT = `You are MwalimuSmart, an expert and highly encouraging AI tutor for students (aligned with the Kenyan curriculum, but broadly applicable to all school subjects).
Your goal is not just to give the student the direct answer, but to help them truly understand the topic. 

Guidelines:
1. **Be Conversational & Encouraging**: Speak directly to the student in a warm, supportive tone.
2. **Provide Hints & Guide**: Break down problems and provide hints rather than immediate answers.
3. **Use the Socratic Method**: Ask guiding questions.
4. **Deep Understanding**: Use analogies and real-world examples.
5. **Formatting**: Use markdown formatting for the text response.
6. **Follow-up**: Always end your response with a gentle follow-up question.

**CRITICAL INSTRUCTION**: You MUST always respond with strictly valid JSON matching this schema:
\`\`\`json
{
  "text": "Your conversational text response formatted in Markdown.",
  "visuals": [
     // OPTIONAL: If the concept benefits from a drawing (like geometry, chemistry, physics), provide drawing instructions.
     // Leave this array empty if no drawing is needed.
     // Drawing objects format:
     // {"type": "circle", "x": 400, "y": 300, "radius": 50, "color": "#3b82f6"}
     // {"type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 100, "color": "#ef4444"}
     // {"type": "line", "x1": 100, "y1": 100, "x2": 200, "y2": 200, "color": "#10b981"}
     // {"type": "text", "x": 400, "y": 400, "text": "H2O(l)", "fontSize": 24, "color": "#333333", "isFormula": true, "highlight": true}
     // Arrow type needs x1, y1, x2, y2.
     // Assume an 800x600 canvas coordinate system.
  ]
}
\`\`\`
Do NOT include any comments inside the JSON array or object.`;

/**
 * Handle a conversational Q&A turn.
 * @param {Array} history - Array of previous message objects.
 * @param {string} newQuestion - The latest question from the user
 * @returns {Promise<Object>} - Object with { text: string, visuals?: Array }
 */
export async function askQuestion(history, newQuestion) {
    try {
        const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction: QA_SYSTEM_PROMPT,
        });

        const chat = model.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage([{ text: newQuestion }]);
        const responseText = result.response.text();

        try {
            const cleaned = cleanJsonString(responseText);
            return JSON.parse(cleaned);
        } catch (parseError) {
            console.warn("Failed to parse QA JSON response, falling back to raw text:", parseError);
            // Fallback if the model ignores the JSON instruction
            return {
                text: responseText,
                visuals: []
            };
        }
    } catch (error) {
        console.error('Error generated Q&A response from Gemini:', error);
        throw new Error('Failed to generate response from the AI tutor.');
    }
}
