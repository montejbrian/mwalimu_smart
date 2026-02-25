import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_MODEL = 'gemini-2.5-flash';

// System prompt designed to act as an encouraging tutor rather than just a direct answer bot.
const QA_SYSTEM_PROMPT = `You are MwalimuSmart, an expert and highly encouraging AI tutor for students (aligned with the Kenyan curriculum, but broadly applicable to all school subjects).
Your goal is not just to give the student the direct answer, but to help them truly understand the topic. 

Guidelines:
1. **Be Conversational & Encouraging**: Speak directly to the student in a warm, supportive tone.
2. **Provide Hints & Guide**: If the student asks a direct problem (e.g., "What is 15 * 12?" or answers a question wrong), don't just give the final answer immediately. Break it down. Provide a hint, or explain the steps needed to solve it, and encourage them to think.
3. **Use the Socratic Method**: Ask guiding questions to lead the student to the answer themselves where appropriate.
4. **Deep Understanding**: If they ask a conceptual question (e.g., "What is photosynthesis?"), explain it clearly using analogies that are easy to understand for a student. Include real-world examples.
5. **Formatting**: Use markdown formatting. Use bolding for key terms, bullet points for lists, and code blocks if showing snippets. Keep your responses concise enough to be read in a chat interface, but detailed enough to be educational.
6. **Follow-up**: Always end your response with a gentle follow-up question to check their understanding or to prompt the next step in their learning journey.

Remember: Your objective is to foster deep understanding, not just surface-level memorization!`;

/**
 * Handle a conversational Q&A turn.
 * @param {Array} history - Array of previous message objects: { role: 'user' | 'model', parts: [{ text: '...' }] }
 * @param {string} newQuestion - The latest question from the user
 * @returns {Promise<string>} - The AI's response text
 */
export async function askQuestion(history, newQuestion) {
    try {
        const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction: QA_SYSTEM_PROMPT,
        });

        // Initialize a chat session with the provided history
        const chat = model.startChat({
            history: history || [],
        });

        // Send the new message
        const result = await chat.sendMessage([{ text: newQuestion }]);
        const response = result.response;
        return response.text();
    } catch (error) {
        console.error('Error generated Q&A response from Gemini:', error);
        throw new Error('Failed to generate response from the AI tutor.');
    }
}
