import { generateAudioNarration } from './src/services/gemini.service.js';
(async () => {
    try {
        console.log("Testing audio...");
        const result = await generateAudioNarration("Hello, testing the audio generation.");
        console.log("Audio generated successfully:", !!result.audioBase64);
        if (!result.audioBase64) {
             console.log(result);
        }
    } catch(e) {
        console.error("Test failed:", e);
    }
})();
