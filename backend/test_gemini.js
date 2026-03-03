import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Testing Gemini API...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.0-flash" });

    try {
        console.log("Using model:", process.env.GEMINI_MODEL || "gemini-2.0-flash");
        const result = await model.generateContent("Hi");
        console.log("Response:", result.response.text());
        process.exit(0);
    } catch (e) {
        console.error("API Error:", e.message);
        process.exit(1);
    }
}

test();
