import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Listing available models...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    try {
        // Unfortunately, the current SDK doesn't have a simple listModels on genAI.
        // It requires the 'GenerativeAI' package from @google-cloud/generative-ai sometimes? 
        // No, the @google/generative-ai SDK is different.

        // Let's try 1.5-flash as a control.
        console.log("Testing gemini-1.5-flash...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hi");
        console.log("Response 1.5-flash:", result.response.text());

        console.log("Testing gemini-2.0-flash...");
        const model2 = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result2 = await model2.generateContent("Hi");
        console.log("Response 2.0-flash:", result2.response.text());

        process.exit(0);
    } catch (e) {
        console.error("API Error:", e.message);
        process.exit(1);
    }
}

test();
