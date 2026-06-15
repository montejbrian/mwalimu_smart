import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateAudio } from './tts.service.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'visuals');

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

const getGenAI = () => new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const getModelName = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Simple Semaphore to limit concurrent AI requests
 */
class Semaphore {
    constructor(max) {
        this.max = max;
        this.count = 0;
        this.queue = [];
    }
    async acquire() {
        if (this.count < this.max) {
            this.count++;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }
    release() {
        this.count--;
        if (this.queue.length > 0) {
            this.count++;
            const next = this.queue.shift();
            next();
        }
    }
    async run(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

// Ensure gemini-2.5-flash doesn't get slammed. Serialize requests (limit: 1)
const geminiSemaphore = new Semaphore(1);


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

            // For rate limit (429) or high demand (503), use much longer delays
            const isRateLimited = error.status === 429 || error.status === 503;
            if (isRateLimited) {
                const retryDelay = 20000 * Math.pow(2, i); // 20s, 40s, 80s, 160s
                const maxRetriesTotal = Math.max(maxRetries, 5);
                console.warn(`Attempt ${i + 1}/${maxRetriesTotal} failed with ${error.status} (Busy). Retrying in ${retryDelay}ms...`);
                
                if (i < maxRetriesTotal - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
            }

            const effectiveDelay = baseDelay * Math.pow(2, i);
            console.warn(`Attempt ${i + 1}/${maxRetries} failed: ${error.message}. Retrying in ${effectiveDelay}ms...`);

            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, effectiveDelay));
            } else {
                break;
            }
        }
    }

    // Provide a clearer error message for rate limits or high demand
    if (lastError?.status === 429 || lastError?.status === 503) {
        const errorType = lastError.status === 429 ? 'Rate limit exceeded' : 'AI service high demand (503)';
        const err = new Error(`Gemini ${errorType}. Please try again in a minute.`);
        err.status = lastError.status;
        throw err;
    }

    throw lastError;
}

/**
 * Validates the model name and provides feedback if it's likely incorrect.
 */
async function validateModel(modelName) {
    if (modelName.includes('2.5')) {
        // Reduced noise as user specifically requested this model
        console.log(`[AI] Active model: ${modelName} (Experimental Mode)`);
    } else {
        console.log(`[AI] Using model: ${modelName}`);
    }
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
    weaknesses = null,
    ragContext = ""
) {
    const modelName = getModelName();
    await validateModel(modelName);

    const model = getGenAI().getGenerativeModel({
        model: modelName
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

    let ragPrompt = "";
    if (ragContext) {
        ragPrompt = `
# CRITICAL CURRICULUM CONTEXT (KICD Textbook Excerpts)
You MUST ONLY teach and explain using the concepts, terms, and facts provided in this context. DO NOT hallucinate, do not use generic external training knowledge, and do not make up equations or structures that aren't grounded in this textbook source:

---
${ragContext}
---
`;
    }

    const systemPrompt = `
# CONTEXT
You are the Educator Agent for MwalimuSmart, an AI-powered educational platform aligned with the Kenya Institute of Curriculum Development (KICD) curriculum. Your role is to transform a student's topic into a high-quality lesson.

${ragPrompt}

# OBJECTIVE
Break down the student's topic into a comprehensive, highly educational lesson consisting of 4 to 7 clear and logical steps. Adjust the number of steps based on the complexity of the topic.

# TARGET AUDIENCE
Target Education Level: ${levelGuidelines[level] || levelGuidelines["senior-school"]}${contextPrompt}

# STYLE (CLEAR Framework)
1. **CONCISE**: Deliver direct, focused information without fluff.
2. **LOGICAL FLOW**: Use a "Define → Explain → Contrast" or "Concept → Example → Conclusion" structure for each step.
3. **EXPLICIT**: Use specific examples and relevant formulas (e.g., chemical equations, math formulas) to clarify concepts.
4. **ADAPTIVE**: Tailor the depth and narration complexity strictly to the target education level.
5. **REFLECTIVE**: Ensure each step builds on the previous one to reinforce learning.

# RESPONSE FORMAT
Return your response as a strictly valid JSON object:
{
  "title": "A clear, descriptive title for the overall lesson",
  "steps": [
    {
      "id": "1",
      "text": "Core educational explanation (1-3 sentences). Use formulas and specific examples where possible.",
      "script": "The exact spoken narration for this step. Engaging, teacher-like, and explanatory.",
      "duration": 5
    }
  ],
  "summary": "Short conclusion summarizing the key takeaways."
}

# GUIDELINES
- Generate 4 to 7 steps as needed to fully cover the topic.
- The 'script' should be engaging and explanatory.
- Align with KICD standards.
- Duration: 5-10 seconds per step.
- IMPORTANT: No markdown formatting or comments inside the JSON.
`;


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
        const result = await geminiSemaphore.run(() => 
            retryOperation(() => model.generateContent(parts))
        );
        if (!result || !result.response) throw new Error('Empty response from AI');
        const text = result.response.text();

        const cleanedText = cleanJsonString(text);
        const lessonData = JSON.parse(cleanedText);
        return lessonData;
    } catch (error) {
        if (error.status === 429 || error.status === 503) throw error;
        console.error('Lesson Generation Error:', error);
        throw new Error('Lesson generation failed. Please try again.');
    }
}

/*Generate audio narration for a given text using Google Cloud Text-to-Speech*/
export async function generateAudioNarration(text) {
    try {
        const audioBase64 = await geminiSemaphore.run(() => 
            retryOperation(() => generateAudio(text))
        );
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

    const modelName = getModelName();
    await validateModel(modelName);

    const model = getGenAI().getGenerativeModel({
        model: modelName
    });

    const levelVisualGuideline = {
        "lower-primary": "Keep diagrams extremely simple. Use bright colors and basic shapes. Focus on one main idea per step.",
        "upper-primary": "Use clear diagrams with labels. Focus on show-and-tell style visuals.",
        "junior-school": "Introduce more detailed diagrams, parts of a system, and basic process flows.",
        "senior-school": "Use technical diagrams, chemical structures, physics forces, and detailed mathematical representations.",
            "university": "Professional-grade academic illustrations, complex molecular structures, intricate flowcharts, and rigorous data visualizations."
    };

    const prompt = `
# CONTEXT
You are a visual instruction generator for MwalimuSmart's educational whiteboard. You translate lesson steps into clear, non-overlapping drawing instructions for an 800x600 HTML canvas.

# OBJECTIVE
Generate a logical set of drawing instructions for Lesson Step ${stepNumber}: "${stepText}". Ensure the visual FULLY covers the explanation without clutter.

# SPATIAL LAYOUT (800x600 Grid)
1. **GRID**: Center is (400, 300). Use the full width but keep a 50px margin.
2. **ARRANGEMENT**: 
   - Primary Object: Typically at (300, 300) or centered.
   - Labels/secondary text: Place relative to objects (e.g., if object is at 300, label it at 300, 200).
3. **OVERLAP PREVENTION**: 
   - Maintain at least **60px** distance between different text blocks.
   - Ensure labels do not sit directly on top of geometric shapes unless they are inside them (like a centered label in a circle).
   - If multiple objects exist, arrange them side-by-side (Horizontal) or top-to-bottom (Vertical).

# STYLE (CLEAR Framework)
1. **CONCISE**: Every shape must have a purpose, but do NOT be sparse. Use "rich" and "detailed" illustrations.
2. **LOGICAL**: Group related items visually. Create structured diagrams rather than isolated shapes.
3. **EXPLICIT**: Use specific colors. Highlight formulas and key terms using "highlight": true.

# RESPONSE FORMAT (Strict JSON Array)
Generate a JSON array of objects:
- type: "circle" | "rectangle" | "line" | "arrow" | "text" | "curve"
- Coordinates (x, y) and dimensions for an 800x600 canvas.
- color: hex color code (e.g., #4CAF50). Use diverse colors.
- lineWidth: number (1-8, default 3). Use thicker lines for outlines.
- shadowBlur: number (0-15). Use for depth.
- filled: boolean.
- For text: 
  - text: content
  - fontSize: number (e.g., 20 or 25 for titles)
  - isFormula: boolean
  - highlight: boolean

# MASTER ILLUSTRATOR REQUIREMENTS
1. **COMPREHENSIVE**: Aim for **10-15+ objects**. Draw a full scene, not just a standalone shape.
2. **LABELED**: Every important part of the drawing MUST have a 'text' label pointing to it.
3. **COLORFUL**: Use a professional palette (e.g., #4CAF50, #3b82f6, #ef4444, #8b5cf6).
4. **SPATIAL**: Spread out the drawing across the 800x600 space. Do not cluster everything in the center.
5. **ORGANIC**: Use 'curve' for anatomy, nature, or flow.
6. **ILLUSTRATIVE**: If the topic is 'Heart', draw the chambers, valves, and blood flow paths with arrows.
7. Return ONLY the JSON array.
`;

    try {
        // 1. Check Cache
        const cacheRaw = `${topic}:${stepText}:${script}:${level}`;
        const hash = crypto.createHash('md5').update(cacheRaw).digest('hex');
        const cacheFilePath = path.join(CACHE_DIR, `${hash}.json`);

        if (fs.existsSync(cacheFilePath)) {
            console.log(`Visual cache hit for step ${stepNumber}: ${topic}`);
            const cachedData = fs.readFileSync(cacheFilePath, 'utf8');
            return JSON.parse(cachedData);
        }

        console.log(`Visual cache miss for step ${stepNumber}. Generating...`);
        ensureCacheDir();
        const result = await geminiSemaphore.run(() => 
            retryOperation(() => model.generateContent(prompt))
        );
        const response = result.response;
        const text = response.text();

        const cleanedText = cleanJsonString(text);
        const instructions = JSON.parse(cleanedText);

        // 2. Save to Cache
        try {
            fs.writeFileSync(cacheFilePath, JSON.stringify(instructions));
        } catch (e) { console.error("Visual cache write error:", e); }

        return instructions;
    } catch (error) {
        if (error.status === 429) throw error;
        console.error('Failed to parse Gemini response for Visuals:', error);
        throw new Error('Failed to parse visual instructions from AI response');
    }
}
