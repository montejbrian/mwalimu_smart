import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLesson } from './gemini.service.js';
import { askQuestion } from './qa.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function verifyPrompts() {
    console.log("--- START PROMPT VERIFICATION ---");

    try {
        console.log("\nTesting Lesson Generation (Photosynthesis)...");
        const lesson = await generateLesson("Photosynthesis", null, "senior-school");
        console.log("Lesson Title:", lesson.title);
        console.log("Number of steps:", lesson.steps.length);
        console.log("Summary (Short Conclusion):", lesson.summary);
        
        const stepWithFormula = lesson.steps.find(s => s.text.includes('CO2') || s.text.includes('H2O') || s.text.includes('glucose'));
        console.log("Step with Formula/Example found:", !!stepWithFormula);
        if (stepWithFormula) console.log("Sample Step Content:", stepWithFormula.text);

        console.log("\nTesting Q&A (Socratic Method)...");
        const qaResponse = await askQuestion([], "Help me understand why plants are green.", "junior-school");
        console.log("QA Text snippet:", qaResponse.text.substring(0, 200) + "...");
        console.log("Ends with question:", qaResponse.text.trim().endsWith('?'));

        console.log("\n--- VERIFICATION SUCCESSFUL ---");
    } catch (error) {
        console.error("\n--- VERIFICATION FAILED ---");
        console.error(error);
    }
}

verifyPrompts();
