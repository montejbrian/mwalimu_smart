import { GoogleGenerativeAI } from '@google/generative-ai';
import { cleanJsonString } from './gemini.service.js';
import axios from 'axios';

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

        const prompt = `You are an expert examiner for MwalimuSmart. Based on the following lesson content, generate a clear and effective multiple-choice quiz to test the student's understanding.

Lesson Title: ${lessonContent.title}
Lesson Content:
${lessonContent.steps.map(s => `Step ${s.id}: ${s.text}`).join('\n')}

Guidelines:
1. Generate exactly 3-5 high-quality multiple-choice questions.
2. Each question must target a specific concept from the lesson steps.
3. For each question, provide 4 options (A, B, C, D).
4. Clearly state the 'correctAnswer' (A, B, C, or D) and the 'relatedStepId' (the id of the lesson step this question tests).
5. Ensure the tone is academic but encouraging.

Return your response as a strictly valid JSON object:
\`\`\`json
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
      "explanation": "Brief explanation of why B is correct."
    }
  ]
}
\`\`\``;

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
