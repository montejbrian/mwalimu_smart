import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Initialize the Text-to-Speech client lazily to avoid potential startup hangs
let client = null;

function getTTSClient() {
    if (!client) {
        console.log("Initializing Google Text-to-Speech client...");
        client = new TextToSpeechClient();
    }
    return client;
}

const CACHE_DIR = path.join(process.cwd(), 'cache', 'audio');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate audio from text using Google Cloud Text-to-Speech
 * Implements file-based caching to reduce API costs and latency.
 * @param text The text to convert to speech
 * @returns Base64-encoded audio data (MP3 format)
 */
export async function generateAudio(text) {
    try {
        // 1. Check Cache
        const hash = crypto.createHash('md5').update(text).digest('hex');
        const cacheFilePath = path.join(CACHE_DIR, `${hash}.mp3`);

        if (fs.existsSync(cacheFilePath)) {
            console.log(`Audio cache hit for: "${text.substring(0, 20)}..."`);
            const audioBuffer = fs.readFileSync(cacheFilePath);
            return audioBuffer.toString('base64');
        }

        console.log(`Audio cache miss. Generating for: "${text.substring(0, 20)}..."`);

        // 2. Call Google API
        const request = {
            input: { text },
            voice: {
                languageCode: 'en-US',
                name: 'en-US-Neural2-F', // Female voice
                ssmlGender: 'FEMALE'
            },
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: 0.9, // Slightly slower for clarity
                pitch: 0.0,
                volumeGainDb: 0.0
            }
        };

        const [response] = await getTTSClient().synthesizeSpeech(request);

        if (!response.audioContent) {
            throw new Error('No audio content received from TTS service');
        }

        // 3. Save to Cache
        const audioBuffer = Buffer.from(response.audioContent);
        try {
            fs.writeFileSync(cacheFilePath, audioBuffer);
        } catch (writeError) {
            console.error('Failed to write to audio cache:', writeError);
            // Continue even if caching fails
        }

        // 4. Return Base64
        return audioBuffer.toString('base64');
    } catch (error) {
        console.error('Error in generateAudio:', error);
        throw error;
    }
}
