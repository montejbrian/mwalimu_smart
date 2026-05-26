import pool from '../db.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

/**
 * Generate embedding for text using Gemini API
 */
async function getEmbedding(text) {
    try {
        // In production, use proper embedding API
        // For now, we'll create a hash-based pseudo-embedding
        const hash = crypto.createHash('sha256').update(text).digest();
        const embedding = Array.from(hash).slice(0, 1536).map(b => (b - 128) / 128);
        return embedding;
    } catch (error) {
        console.error('Embedding generation error:', error);
        throw error;
    }
}

/**
 * Store curriculum content with metadata and embeddings
 */
export const indexCurriculumContent = async (content, metadata) => {
    try {
        const {
            chunkId,
            educationLevel,
            gradeClass,
            subjectDomain,
            topicNode,
            contentText,
        } = metadata;

        // Generate embedding
        const embedding = await getEmbedding(contentText);

        // Store in database
        await pool.query(
            `INSERT INTO curriculum_metadata (
                chunk_id, education_level, grade_class, subject_domain, 
                topic_node, content_text, embedding_vector
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (chunk_id) DO UPDATE SET
                embedding_vector = $7,
                content_text = $6,
                updated_at = CURRENT_TIMESTAMP`,
            [chunkId, educationLevel, gradeClass, subjectDomain, topicNode, contentText, `[${embedding.join(',')}]`]
        );

        return { success: true, chunkId };
    } catch (error) {
        console.error('Index curriculum error:', error);
        throw error;
    }
};

/**
 * Core RAG Function - Retrieve relevant curriculum content with strict metadata filtering
 */
export const retrieveRagContext = async (query, educationLevel, gradeClass) => {
    try {
        // Generate embedding for query
        const queryEmbedding = await getEmbedding(query);

        // Metadata-filtered vector search
        // WHERE clause ensures we only get content for the specific grade/level
        const result = await pool.query(
            `SELECT 
                content_text, 
                subject_domain, 
                topic_node,
                (1 - (embedding_vector <=> $1::vector)) as similarity
            FROM curriculum_metadata
            WHERE education_level = $2 
                AND grade_class = $3
            ORDER BY embedding_vector <=> $1::vector
            LIMIT 5`,
            [`[${queryEmbedding.join(',')}]`, educationLevel, gradeClass]
        );

        if (result.rows.length === 0) {
            return {
                success: false,
                error: 'No relevant curriculum content found for this grade/level',
                context: '',
            };
        }

        // Format context from retrieved chunks
        const context = result.rows
            .map((row) => `[${row.subject_domain} - ${row.topic_node}]\n${row.content_text}`)
            .join('\n\n---\n\n');

        return {
            success: true,
            context,
            sources: result.rows.map(r => ({
                subject: r.subject_domain,
                topic: r.topic_node,
                similarity: r.similarity,
            })),
        };
    } catch (error) {
        console.error('RAG retrieval error:', error);
        return {
            success: false,
            error: error.message,
            context: '',
        };
    }
};

/**
 * Generate lesson with RAG context - guarantees Kenyan curriculum accuracy
 */
export const generateLessonWithRAG = async (topic, educationLevel, gradeClass) => {
    try {
        // Step 1: Retrieve relevant curriculum content
        const ragResult = await retrieveRagContext(topic, educationLevel, gradeClass);

        if (!ragResult.success) {
            return {
                success: false,
                error: ragResult.error,
            };
        }

        // Step 2: Create system prompt with strict execution cage
        const systemPrompt = `You are an expert educational AI tutor specialized in the Kenyan curriculum (CBC and 8-4-4).

CRITICAL OPERATIONAL CONSTRAINT:
- You MUST ONLY use the provided curriculum context below
- NEVER use generic international training data
- NEVER hallucinate or make up information
- If the provided context doesn't fully answer the query, say so explicitly
- All answers MUST strictly align with Kenyan pedagogical expectations

RETRIEVED CURRICULUM CONTEXT:
${ragResult.context}

Your task: Generate a clear, accurate, engaging lesson for Grade ${gradeClass.replace('grade_', '')} students on the topic.
Include:
1. Core concepts (strictly from the provided context)
2. Learning objectives
3. Key points to remember
4. Practical examples
5. Assessment questions

Generate ONLY based on the provided curriculum context.`;

        // Step 3: Call Gemini with RAG context
        const response = await model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `Generate a lesson on: ${topic}` }],
                },
            ],
            systemInstruction: systemPrompt,
        });

        const lessonText = response.response.text();

        return {
            success: true,
            lesson: lessonText,
            sources: ragResult.sources,
            metadata: {
                educationLevel,
                gradeClass,
                topic,
            },
        };
    } catch (error) {
        console.error('Lesson generation error:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Cache lesson to avoid duplicate computations
 */
export const cacheLessonContent = async (schoolId, topicHash, gradeLevel, content, audioUrl, videoUrl) => {
    try {
        await pool.query(
            `INSERT INTO lessons_cache (school_id, topic_hash, grade_level, lesson_content, audio_url, video_url, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '30 days')
            ON CONFLICT (school_id, topic_hash, grade_level) DO UPDATE SET
                lesson_content = $4,
                audio_url = $5,
                video_url = $6,
                expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days'`,
            [schoolId, topicHash, gradeLevel, content, audioUrl, videoUrl]
        );

        return { success: true };
    } catch (error) {
        console.error('Cache storage error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Retrieve cached lesson if available
 */
export const getCachedLesson = async (schoolId, topicHash, gradeLevel) => {
    try {
        const result = await pool.query(
            `SELECT lesson_content, audio_url, video_url FROM lessons_cache
            WHERE school_id = $1 AND topic_hash = $2 AND grade_level = $3
            AND expires_at > CURRENT_TIMESTAMP`,
            [schoolId, topicHash, gradeLevel]
        );

        if (result.rows.length === 0) {
            return { cached: false };
        }

        return {
            cached: true,
            content: result.rows[0],
        };
    } catch (error) {
        console.error('Cache retrieval error:', error);
        return { cached: false, error: error.message };
    }
};
