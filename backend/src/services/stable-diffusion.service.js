import axios from 'axios';

const HF_API_URL = 'https://router.huggingface.co/hf-inference/v1/models/stabilityai/stable-diffusion-xl-base-1.0';
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || '';

const imageCache = new Map();

/*Generate an educational image using Stable Diffusion*/
export async function generateEducationalImage(
    topic,
    description
) {
    const cacheKey = `${topic}:${description}`;

    if (imageCache.has(cacheKey)) {
        console.log('Using cached image for:', topic);
        return {
            imageBase64: imageCache.get(cacheKey),
            cached: true
        };
    }
    const prompt = `Photorealistic image of ${topic}, ${description}, 2k resolution, highly detailed, scientific photography, cinematic lighting, sharp focus, educational`;
    const negativePrompt = "cartoon, drawing, sketch, low quality, blurry, distorted, text, watermark";

    try {
        const response = await axios.post(
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
                timeout: 30000 // 30 second timeout
            }
        );

        // Convert to base64
        const imageBase64 = Buffer.from(response.data).toString('base64');

        // Cache the result
        imageCache.set(cacheKey, imageBase64);

        console.log('Generated new image for:', topic);
        return {
            imageBase64,
            cached: false
        };
    } catch (error) {
        console.error('Error generating image with Stable Diffusion:', error);
        throw new Error('Failed to generate image');
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
