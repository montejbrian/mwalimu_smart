import crypto from 'crypto';
import pool from '../db.js';
import { generateLesson, generateAudioNarration, generateVisualInstructions } from '../services/gemini.service.js';
import { generateEducationalImage, shouldUseAIImage } from '../services/stable-diffusion.service.js';
import { retrieveRagContext, getCachedLesson } from '../services/rag.service.js';

/*Generate a lesson from a question and optional image using curriculum-aligned RAG*/
export async function generateLessonController(req, res) {
    try {
        const { question, image } = req.body;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({ error: 'Question is required and must be a string' });
        }

        // 1. Check secure student context (tenant isolated)
        if (!req.student) {
            return res.status(401).json({ error: 'Unauthorized student session. Access denied.' });
        }

        const { id: studentId, educationLevel, gradeClass } = req.student;
        const schoolId = req.school.id;

        console.log(`[RAG AI] Starting lesson generation for student ${studentId} (${gradeClass} ${educationLevel})`);
        const startTime = Date.now();

        // 2. Compute deterministic topic hash for caching
        const topic = question.trim().toLowerCase();
        const topicHash = crypto.createHash('sha256').update(topic).digest('hex');

        // 3. Cache Check (tenant + topic + grade isolation)
        const cached = await getCachedLesson(schoolId, topicHash, gradeClass);
        if (cached.cached) {
            console.log(`[CACHE HIT] Instantly returning lesson cache for topic: "${question}"`);
            const lessonData = JSON.parse(cached.content.lesson_content);
            
            // Fetch associated timeline-synchronized Manim sequence videos
            const videosResult = await pool.query(
                'SELECT video_url, trigger_timestamp FROM lesson_videos WHERE cache_id = $1 ORDER BY trigger_timestamp ASC',
                [cached.content.id]
            );

            return res.json({
                ...lessonData,
                audioUrl: cached.content.audio_url,
                videoUrl: cached.content.video_url,
                videos: videosResult.rows
            });
        }

        console.log(`[CACHE MISS] Fetching curriculum content matching KICD standards...`);

        // 4. Retrieve metadata-filtered KICD RAG context
        const ragResult = await retrieveRagContext(topic, educationLevel, gradeClass);
        
        let ragContext = "";
        if (ragResult.success) {
            console.log(`[RAG SUCCESS] Found ${ragResult.sources.length} matching curriculum chunks for ${gradeClass}.`);
            ragContext = ragResult.context;
        } else {
            console.warn(`[RAG WARNING] No curriculum chunks found for Grade level ${gradeClass}. Proceeding with standard guidelines.`);
        }

        // 5. Generate lesson via RAG-aligned Gemini
        const lessonData = await generateLesson(question, image, educationLevel, null, ragContext);

        // 6. Generate synchronized timeline videos sequence if topic is science/math-heavy
        let mockVideos = [];
        if (topic.includes('equation') || topic.includes('quadratic') || topic.includes('algebra')) {
            mockVideos = [
                {
                    video_url: 'https://storage.googleapis.com/mwalimusmart-public/manim_quadratic_definition.mp4',
                    trigger_timestamp: 0
                },
                {
                    video_url: 'https://storage.googleapis.com/mwalimusmart-public/manim_quadratic_formula.mp4',
                    trigger_timestamp: 12
                }
            ];
        } else if (topic.includes('cell') || topic.includes('plant') || topic.includes('biology')) {
            mockVideos = [
                {
                    video_url: 'https://storage.googleapis.com/mwalimusmart-public/manim_plantcell_structure.mp4',
                    trigger_timestamp: 0
                },
                {
                    video_url: 'https://storage.googleapis.com/mwalimusmart-public/manim_photosynthesis_cycle.mp4',
                    trigger_timestamp: 18
                }
            ];
        }

        // 7. Store lesson metadata in cache database
        const cacheResult = await pool.query(
            `INSERT INTO lessons_cache (school_id, topic_hash, grade_level, lesson_content, audio_url, video_url, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '30 days')
             ON CONFLICT (school_id, topic_hash, grade_level) DO UPDATE SET
                 lesson_content = $4,
                 audio_url = $5,
                 video_url = $6,
                 expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days'
             RETURNING id`,
            [schoolId, topicHash, gradeClass, JSON.stringify(lessonData), null, mockVideos[0]?.video_url || null]
        );
        const cacheId = cacheResult.rows[0].id;

        // 8. Insert synchronized timeline video sequence records
        for (const v of mockVideos) {
            await pool.query(
                'INSERT INTO lesson_videos (cache_id, video_url, trigger_timestamp) VALUES ($1, $2, $3)',
                [cacheId, v.video_url, v.trigger_timestamp]
            );
        }

        const duration = Date.now() - startTime;
        console.log(`[SUCCESS] Generated lesson in ${duration}ms with ${lessonData.steps.length} steps.`);
        
        return res.json({
            ...lessonData,
            videos: mockVideos
        });
    } catch (error) {
        console.error('Error generating lesson:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate lesson'
        });
    }
}

/* Generate audio narration for a step*/
export async function generateAudioController(req, res) {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required and must be a string' });
        }

        const audioData = await generateAudioNarration(text);
        return res.json(audioData);
    } catch (error) {
        console.error('Error generating audio:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate audio'
        });
    }
}

/*Generate visual instructions for a step*/
export async function generateVisualController(req, res) {
    try {
        const { stepText, stepNumber, topic, script, level } = req.body;

        if (!stepText || typeof stepText !== 'string') {
            return res.status(400).json({ error: 'stepText is required and must be a string' });
        }

        if (stepNumber === undefined || typeof stepNumber !== 'number') {
            return res.status(400).json({ error: 'stepNumber is required and must be a number' });
        }

        // Determine if we should use Manim or Canvas
        const manimTopics = ['math', 'physics', 'geometry', 'theorem', 'equation', 'pythagorean'];
        const isManim = manimTopics.some(t => topic.toLowerCase().includes(t));

        if (isManim) {
            try {
                const { generateManimAnimation, checkManimCache } = await import('../services/manim.service.js');
                
                // 1. Check if Manim is already cached
                const isCached = await checkManimCache(stepText, topic, script);
                
                if (isCached) {
                    // Video is ready, return it immediately
                    const manimResult = await generateManimAnimation(stepText, stepNumber, topic, script);
                    return res.json({
                        isVideo: true,
                        videoBase64: manimResult.videoBase64
                    });
                } else {
                    // Video not ready, trigger background generation and return canvas fallback immediately
                    console.log(`Manim cache miss for step ${stepNumber}. Triggering background render and returning canvas fallback.`);
                    
                    generateManimAnimation(stepText, stepNumber, topic, script).catch(e => console.error(`Bg Manim Error: ${e.message}`));
                    
                    const instructions = await generateVisualInstructions(stepText, stepNumber, topic, script, level);
                    return res.json({ 
                        instructions,
                        videoStatus: 'rendering'
                    });
                }
            } catch (manimError) {
                console.warn('Manim logic failed, falling back to canvas instructions:', manimError.message);
                const instructions = await generateVisualInstructions(stepText, stepNumber, topic, script, level);
                return res.json({ instructions });
            }
        } else {
            const instructions = await generateVisualInstructions(stepText, stepNumber, topic, script, level);
            return res.json({ instructions });
        }


    } catch (error) {
        console.error('Error generating visual instructions:', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate visual instructions'
        });
    }
}

/*Generate an AI image for a step*/
export async function generateImageController(req, res) {
    try {
        const { topic, stepText } = req.body;

        if (!topic || typeof topic !== 'string') {
            return res.status(400).json({ error: 'Topic is required and must be a string' });
        }

        if (!stepText || typeof stepText !== 'string') {
            return res.status(400).json({ error: 'stepText is required and must be a string' });
        }

        // Check if we should use AI image or canvas
        const useAI = shouldUseAIImage(topic, stepText);

        if (!useAI) {
            return res.json({ useAI: false });
        }

        const result = await generateEducationalImage(topic, stepText);
        return res.json({
            useAI: true,
            imageBase64: result.imageBase64,
            cached: result.cached
        });
    } catch (error) {
        console.log(`AI Image Fallback triggered: ${error.message}`);
        // Fallback to canvas on error
        return res.json({ useAI: false, error: 'Failed to generate image' });
    }
}
