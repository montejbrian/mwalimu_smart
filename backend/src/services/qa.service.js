import { GoogleGenerativeAI } from '@google/generative-ai';
import { cleanJsonString } from './gemini.service.js';

const getGenAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const getModelName = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
 * @param {string} level - The student's education level
 * @returns {Promise<Object>} - Object with { text: string, visuals?: Array }
 */
export async function askQuestion(history, newQuestion, level = "senior-school") {
    try {
        const levelGuidelines = {
            "lower-primary": "Target Level: Lower Primary (Grade 1-3). Use extremely simple words, short sentences, and many analogies. Be very encouraging and like a friendly big sibling.",
            "upper-primary": "Target Level: Upper Primary (Grade 4-6). Use clear language and basic terms. Explain things step-by-step with simple examples.",
            "junior-school": "Target Level: Junior School (Grade 7-9). Use moderate complexity and introduce more formal subject terminology.",
            "senior-school": "Target Level: Senior School (Grade 10-12). Use technical and academic language suitable for KCSE preparation. Focus on deep understanding.",
            "university": "Target Level: University / Tertiary (CUE). Use high-level academic rigor, complex theories, and professional terminology."
        };

        const model = getGenAI().getGenerativeModel({
            model: getModelName(),
            systemInstruction: `${QA_SYSTEM_PROMPT}\n\n${levelGuidelines[level] || levelGuidelines["senior-school"]}`,
        });

        // Sanitize history to ensure it matches Gemini's expected format:
        // { role: 'user'|'model', parts: [{ text: '...' }] }
        const sanitizedHistory = (history || []).map(msg => {
            // Map 'assistant' to 'model' if necessary
            const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';

            // Handle both '{ content: "..." }' and '{ parts: [{ text: "..." }] }'
            let parts = msg.parts;
            if (!parts && (msg.content || msg.text)) {
                parts = [{ text: msg.content || msg.text }];
            }

            return { role, parts: parts || [] };
        });

        // Ensure the conversation starts with a 'user' message as required by Gemini
        while (sanitizedHistory.length > 0 && sanitizedHistory[0].role !== 'user') {
            sanitizedHistory.shift();
        }

        const chat = model.startChat({
            history: sanitizedHistory,
        });

        console.log("Q&A: Sending message to Gemini...");
        const result = await chat.sendMessage([{ text: newQuestion }]);

        if (!result || !result.response) {
            console.error("Q&A: No response from Gemini");
            throw new Error('No response from Gemini');
        }

        const responseText = result.response.text();
        console.log("Q&A: Received response text:", responseText.substring(0, 50) + "...");

        try {
            const cleaned = cleanJsonString(responseText);
            const parsed = JSON.parse(cleaned);
            console.log("Q&A: Parsed response successfully");
            return parsed;
        } catch (parseError) {
            console.warn("Q&A: Failed to parse QA JSON response, falling back to raw text:", parseError.message);
            // Fallback if the model ignores the JSON instruction
            return {
                text: responseText,
                visuals: []
            };
        }
    } catch (error) {
        console.error('Q&A: Critical Error in askQuestion:', error);
        throw new Error('Failed to generate response from the AI tutor: ' + error.message);
    }
}
