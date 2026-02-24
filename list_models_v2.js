import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
        const response = await axios.get(url);
        console.log('--- AVAILABLE MODELS ---');
        response.data.models.forEach(m => {
            console.log(`- ${m.name} (Supports: ${m.supportedGenerationMethods.join(', ')})`);
        });
        console.log('-------------------------');
    } catch (error) {
        console.error('Error listing models:', error.response ? error.response.data : error.message);
    }
}

listModels();
