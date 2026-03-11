import axios from 'axios';

const MANIM_SERVICE_URL = process.env.MANIM_SERVICE_URL || 'http://localhost:5000';

/**
 * Communicates with the Python Manim service to generate synchronised animations.
 * @param {string} stepText The exact text for the voiceover.
 * @param {number} stepNumber The chronological step number.
 * @param {string} topic The overarching topic (e.g., 'Pythagorean Theorem').
 * @param {string} script The expanded educator script for the step.
 * @returns {Promise<string>} Base64 encoded video data.
 */
export async function generateManimAnimation(stepText, stepNumber, topic, script) {
    try {
        console.log(`Requesting Manim animation for topic: "${topic}", step: ${stepNumber}`);
        const response = await axios.post(`${MANIM_SERVICE_URL}/generate-animation`, {
            stepText,
            stepNumber,
            topic,
            script
        }, {
            timeout: 120000 // Manim rendering can take up to 2 minutes
        });

        if (response.data && response.data.videoBase64) {
            console.log(`Successfully generated Manim animation for step ${stepNumber}`);
            return response.data;
        } else {
            throw new Error('No video data returned from Manim service.');
        }

    } catch (error) {
        console.error(`Error communicating with Manim service for step ${stepNumber}:`, error.message);
        throw error;
    }
}

/**
 * Checks if an animation is already cached in the Manim service.
 */
export async function checkManimCache(stepText, topic, script) {
    try {
        const response = await axios.post(`${MANIM_SERVICE_URL}/check-cache`, {
            stepText,
            topic,
            script
        }, {
            timeout: 5000
        });
        return !!response.data?.exists;
    } catch (error) {
        console.warn('Failed to check Manim cache:', error.message);
        return false;
    }
}
