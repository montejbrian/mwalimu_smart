import { GoogleGenerativeAI } from '@google/generative-ai';
import { cleanJsonString } from './gemini.service.js';
import axios from 'axios';

const getGenAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const getModelName = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// System prompt designed to act as an encouraging tutor and optionally return drawing instructions.
const QA_SYSTEM_PROMPT = `
# CONTEXT
You are MwalimuSmart, an expert and highly encouraging AI tutor for students. You are aligned with the Kenyan curriculum but support all school subjects.

# OBJECTIVE
Guide the student to a deep understanding of their question. Do not just provide direct answers; act as a supportive mentor.

# STYLE (CLEAR Framework)
1. **CONCISE**: Keep explanations direct and avoid unnecessary jargon.
2. **LOGICAL**: Use the Socratic method. Break problems into smaller, manageable parts.
3. **EXPLICIT**: Use specific examples, analogies, and relevant formulas (e.g., mathematical or chemical) to clarify points.
4. **ADAPTIVE**: Adjust your tone and complexity based on the student's education level.
5. **REFLECTIVE**: End each response with a **short conclusion** and a gentle follow-up question to encourage further thinking.

# TONE
Warm, supportive, patient, and highly encouraging.

# RESPONSE FORMAT (Strict JSON)
You MUST always respond with strictly valid JSON:
{
  "text": "Your conversational text response in Markdown. Include formulas and examples.",
  "visuals": [
     // OPTIONAL: Drawing instructions for complex concepts.
     // {"type": "circle"|"rectangle"|"line"|"arrow"|"text", ...}
     // Canvas size: 800x600.
  ]
}

# GUIDELINES
- Use markdown for text formatting.
- Provide hints before answers.
- Use analogies to explain abstract concepts.
- End with a question.
- No comments inside the JSON.
`;

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
/**
 * Generates a quiz based on the lesson content.
 * @param {Object} lessonContent - The lesson data containing title and steps.
 * @param {string} level - Education level.
 * @returns {Promise<Object>} - Quiz data with questions and options.
 */
export async function generateQuiz(lessonContent, level = "senior-school") {
    // Attempt to use the advanced Python QuestionGenerator first
    try {
        const manimPort = process.env.MANIM_PORT || '5000';
        const manimUrl = `http://localhost:${manimPort}/generate-questions`;
        
        console.log(`Quiz: Attempting advanced generation via Manim Service at ${manimUrl}...`);
        
        const manimResponse = await axios.post(manimUrl, {
            lessonContent: JSON.stringify(lessonContent.steps.map(s => s.text).join('\n')),
            topic: lessonContent.title,
            numQuestions: 5
        }, { timeout: 45000 });

        if (manimResponse.data && manimResponse.data.success && manimResponse.data.questions.length > 0) {
            console.log("Quiz: Successfully generated advanced questions from Python service.");
            
            // Map the Python generator's format to our internal quiz format
            const formattedQuestions = manimResponse.data.questions.map((q, idx) => ({
                id: `q${idx + 1}`,
                question: q.question,
                options: q.options,
                correctAnswer: q.correct_answer,
                relatedStepId: q.relatedStepId || "1", // Fallback if not specified
                explanation: q.explanation,
                distractorExplanations: q.distractor_explanations,
                bloomLevel: q.bloom_level,
                concept: q.concept
            }));

            return {
                quizTitle: `Advanced Quiz: ${lessonContent.title}`,
                questions: formattedQuestions
            };
        }
    } catch (manimError) {
        console.warn('Quiz: Advanced Python generation failed or timed out. Falling back to Gemini.', manimError.message);
    }

    // Fallback to Gemini generation
    try {
        const model = getGenAI().getGenerativeModel({
            model: getModelName(),
        });

        const prompt = `
# CONTEXT
You are an expert academic examiner for MwalimuSmart.

# OBJECTIVE
Generate a clear and effective multiple-choice quiz based on the provided lesson content.

# STYLE (CLEAR Framework)
1. **CONCISE**: Questions and options should be clear and unambiguous.
2. **LOGICAL**: Each question must target a specific concept from the lesson steps.
3. **EXPLICIT**: Provide clear explanations for the correct answers.

# RESPONSE FORMAT (Strict JSON)
{
  "quizTitle": "Quiz: ${lessonContent.title}",
  "questions": [
    {
      "id": "q1",
      "question": "The question text?",
      "options": {
        "A": "Option text",
        "B": "Option text",
        "C": "Option text",
        "D": "Option text"
      },
      "correctAnswer": "B",
      "relatedStepId": "1",
      "explanation": "Brief explanation of why B is correct, citing lesson facts."
    }
  ]
}

# GUIDELINES
- Generate exactly 3-5 high-quality questions.
- Each question must have 4 distinct options.
- Tone: Academic but encouraging.
- Return ONLY the JSON object.
`;

        console.log("Quiz: Generating questions via Gemini (Fallback)...");
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleaned = cleanJsonString(text);
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Quiz: Failed to generate quiz (Gemini Fallback):', error);
        throw new Error('Failed to generate quiz: ' + error.message);
    }
}

/**
 * Analyzes the student's quiz results to identify weaknesses.
 * @param {Object} lessonContent - The original lesson data.
 * @param {Array} studentAnswers - Array of { questionId: string, answer: string }.
 * @param {Object} quizData - The generated quiz data.
 * @returns {Object} - Analysis of weaknesses and steps to reteach.
 */
export function analyzeAssessment(lessonContent, studentAnswers, quizData) {
    const weaknesses = [];
    const correctStepIds = new Set();
    const incorrectStepIds = new Set();

    studentAnswers.forEach(submission => {
        const question = quizData.questions.find(q => q.id === submission.questionId);
        if (question) {
            const isCorrect = question.correctAnswer === submission.answer;
            if (isCorrect) {
                correctStepIds.add(question.relatedStepId);
            } else {
                incorrectStepIds.add(question.relatedStepId);
                weaknesses.push({
                    questionId: question.id,
                    questionText: question.question,
                    submittedAnswer: submission.answer,
                    correctAnswer: question.correctAnswer,
                    explanation: question.explanation,
                    relatedStepId: question.relatedStepId
                });
            }
        }
    });

    // Identify steps where the student showed weakness (incorrect answers)
    // even if they got another question on the same step correct.
    const stepsToReteach = Array.from(incorrectStepIds).map(id => {
        return lessonContent.steps.find(s => s.id === id);
    }).filter(s => s !== undefined);

    return {
        score: studentAnswers.length > 0 ? (studentAnswers.length - weaknesses.length) / studentAnswers.length * 100 : 0,
        weaknesses,
        stepsToReteach,
        isPass: weaknesses.length === 0
    };
}
