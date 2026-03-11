import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateAudio } from './tts.service.js';

const getGenAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const getModelName = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';


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

            // For rate limit errors, use much longer delays
            const isRateLimit = error.status === 429;
            const effectiveDelay = isRateLimit
                ? 15000 * Math.pow(2, i) // 15s, 30s, 60s for rate limits
                : baseDelay * Math.pow(2, i);
            const effectiveMaxRetries = isRateLimit ? Math.max(maxRetries, 4) : maxRetries;

            console.warn(`Attempt ${i + 1}/${effectiveMaxRetries} failed${isRateLimit ? ' (RATE LIMITED)' : ''}. Retrying in ${effectiveDelay}ms...`);

            if (i < effectiveMaxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, effectiveDelay));
            } else {
                break;
            }
        }
    }

    // Provide a clearer error message for rate limits
    if (lastError?.status === 429) {
        const err = new Error('Gemini API rate limit exceeded. Please wait a minute and try again.');
        err.status = 429;
        throw err;
    }

    throw lastError;
}

/*Helper to clean JSON string from markdown code blocks and comments*/
export function cleanJsonString(text) {
    let extracted = text;
    // Try to extract content between ```json and ```
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
        extracted = jsonBlockMatch[1];
    } else {
        // Fallback: try to find the first { and last }
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            extracted = text.substring(firstBrace, lastBrace + 1);
        }
    }

    let cleaned = extracted.replace(/```(?:json)?\n?|\n?```/g, ''); // Just in case
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    cleaned = cleaned.replace(/(^|[^:])\/\/.*$/gm, '$1');

    return cleaned.trim();
}

/*Generate a structured lesson from a question, optional image, and optional weaknesses for reteaching*/
export async function generateLesson(
    question,
    imageBase64,
    level = "senior-school",
    weaknesses = null
) {
    const model = getGenAI().getGenerativeModel({
        model: getModelName()
    });

    const levelGuidelines = {
        "lower-primary": "Lower Primary (Grade 1-3): Use very simple language, short sentences, many analogies, and a very encouraging tone. Avoid any technical jargon. Focus on basic observable facts.",
        "upper-primary": "Upper Primary (Grade 4-6): Use clear, straightforward language. Introduce basic terms but explain them simply. Focus on 'how' things work at a superficial level.",
        "junior-school": "Junior School (Grade 7-9): Use moderate complexity. Introduce more formal terminology and conceptual depth. Align with the intermediate transition in the KICD curriculum.",
        "senior-school": "Senior School (Grade 10-12): Use academic and technical language. Focus on deep conceptual understanding, equations where applicable, and preparing for national exams (KCSE level).",
        "university": "University / Tertiary (CUE): Use high-level academic rigor, complex theories, professional terminology, and critical analysis. Assume a strong foundational background."
    };

    let contextPrompt = "";
    if (weaknesses && weaknesses.length > 0) {
        contextPrompt = `\n\n**RETEACHING MODE**: The student recently took a quiz on this topic and struggled with the following concepts or questions:
${weaknesses.map(w => `- Question: ${w.questionText}\n  Correct Answer: ${w.correctAnswer}\n  Explanation: ${w.explanation}`).join('\n')}

Your goal is to RETEACH these specific areas. Do not just repeat the previous explanation. Use different analogies, break it down further, and address the specific confusion points identified above.`;
    }

    const systemPrompt = `You are the Educator Agent for MwalimuSmart. Your task is to take a student's topic and break it down into a comprehensive, highly educational lesson consisting of 4 to 7 clear and logical steps. Adjust the number of steps based on the complexity of the topic.

Target Education Level: ${levelGuidelines[level] || levelGuidelines["senior-school"]}${contextPrompt}

For each step, you must provide:
1. A descriptive title.
2. The core educational text (1-3 sentences).
3. A detailed 'script' which is the exact spoken narration for this step. This script will be used to generate synchronized animations and voiceover.

Return your response as a JSON object with this structure:
{
  "title": "A clear, descriptive title for the overall lesson",
  "steps": [
    {
      "id": "1",
      "text": "Core educational explanation",
      "script": "The exact spoken narration for the Manim Programmer Agent to use.",
      "duration": 5
    },
    { "id": "2", ... }
    // Add up to 7 steps as needed to fully cover the topic
  ],
  "summary": "Brief summary of the key takeaways"
}

Guidelines:
- Generate between 4 and 7 steps depending on what's necessary to fully explain the topic. Do not just stop at 3 if the topic is complex.
- The 'script' should be engaging and explanatory, as if a human teacher is speaking. Break down complex ideas slowly.
- Use simple language appropriate for school students.
- Align with the Kenya Institute of Curriculum Development (KICD) curriculum.
- Duration should be 5-10 seconds per step to allow for meaningful animation.
- Focus on deep conceptual understanding.
- IMPORTANT: Return strictly valid JSON. Do not include comments or markdown formatting in the JSON block itself.`;


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
        if (error.status === 429) throw error;
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
    stepNumber,
    topic,
    script,
    level = "senior-school"
) {

    const model = getGenAI().getGenerativeModel({
        model: getModelName()
    });

    const levelVisualGuideline = {
        "lower-primary": "Keep diagrams extremely simple. Use bright colors and basic shapes. Focus on one main idea per step.",
        "upper-primary": "Use clear diagrams with labels. Focus on show-and-tell style visuals.",
        "junior-school": "Introduce more detailed diagrams, parts of a system, and basic process flows.",
        "senior-school": "Use technical diagrams, chemical structures, physics forces, and detailed mathematical representations.",
        "university": "Professional-grade academic illustrations, complex molecular structures, intricate flowcharts, and rigorous data visualizations."
    };

    const prompt = `You are a visual instruction generator for an educational whiteboard. Given a lesson step, generate simple drawing instructions that can be rendered on an HTML canvas.

Target Simplicity Level: ${levelVisualGuideline[level] || levelVisualGuideline["senior-school"]}

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
        if (error.status === 429) throw error;
        console.error('Failed to parse Gemini response for Visuals:', error);
        throw new Error('Failed to parse visual instructions from AI response');
    }
}
