import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const HF_API_URL = 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1';
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || '';

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

const sdSemaphore = new Semaphore(1);

const CACHE_DIR = path.join(process.cwd(), 'cache', 'images');
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

export async function generateEducationalImage(
    topic,
    description,
    retries = 2
) {
    const cacheRaw = `${topic}:${description}`;
    const hash = crypto.createHash('md5').update(cacheRaw).digest('hex');
    const cacheFilePath = path.join(CACHE_DIR, `${hash}.png`);

    if (fs.existsSync(cacheFilePath)) {
        console.log('Using cached image (disk) for:', topic);
        const imageBuffer = fs.readFileSync(cacheFilePath);
        return {
            imageBase64: imageBuffer.toString('base64'),
            cached: true
        };
    }
    const prompt = `Photorealistic image of ${topic}, ${description}, 2k resolution, highly detailed, scientific photography, cinematic lighting, sharp focus, educational`;
    const negativePrompt = "cartoon, drawing, sketch, low quality, blurry, distorted, text, watermark";

    for (let i = 0; i <= retries; i++) {
        try {
            const response = await sdSemaphore.run(() => 
                axios.post(
                    HF_API_URL,
                    {
                        inputs: prompt,
                        parameters: {
                            negative_prompt: negativePrompt
                        }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${HF_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        responseType: 'arraybuffer',
                        timeout: 60000 // Increased timeout for v2-1
                    }
                )
            );

            ensureCacheDir();
            const imageBuffer = Buffer.from(response.data);
            const imageBase64 = imageBuffer.toString('base64');

            try {
                fs.writeFileSync(cacheFilePath, imageBuffer);
            } catch (e) {
                console.error('Failed to write to image cache:', e);
            }

            console.log('Generated new image for:', topic);
            return {
                imageBase64,
                cached: false
            };
        } catch (error) {
            const status = error.response ? error.response.status : null;
            if (i < retries && (status === 503 || status === 429 || status === 500)) {
                const delay = 5000 * (i + 1);
                console.warn(`Stable Diffusion API busy (${status}). Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (error.response) {
                console.warn(`Stable Diffusion API unavailable (${error.response.status}): ${error.response.statusText}. Falling back to canvas visuals.`);
            } else {
                console.error('Error generating image with Stable Diffusion:', error.message);
            }
            throw new Error('Failed to generate image');
        }
    }
}

/*Detect if a topic should use AI-generated images*/
export function shouldUseAIImage(topic, stepText) {
    const aiTopics = [
        'anatomy', 'biology', 'cell', 'organ', 'body', 'heart', 'brain',
        'chemistry', 'molecule', 'atom', 'compound', 'reaction',
        'physics', 'force', 'energy', 'wave', 'particle',
        'geography', 'map', 'continent', 'ocean',
        'history', 'ancient', 'civilization',
        'diagram', 'structure', 'system'
    ];

    const lowerTopic = topic.toLowerCase();
    const lowerText = stepText.toLowerCase();

    return aiTopics.some(keyword =>
        lowerTopic.includes(keyword) || lowerText.includes(keyword)
    );
}
