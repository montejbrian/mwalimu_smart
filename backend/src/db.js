import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'mwalimu_smart',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// Create pgvector extension if it doesn't exist
export const initializeDatabase = async () => {
    try {
        const client = await pool.connect();
        
        // Enable pgvector extension
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        
        // Create schools table
        await client.query(`
            CREATE TABLE IF NOT EXISTS schools (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                subdomain VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(20),
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create students table with RLS
        await client.query(`
            CREATE TABLE IF NOT EXISTS students (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                admission_number VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255),
                education_level VARCHAR(50), -- 'primary', 'junior_secondary', 'senior_secondary'
                grade_class VARCHAR(50), -- 'grade_1' to 'grade_12'
                is_activated BOOLEAN DEFAULT FALSE,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, admission_number)
            );
        `);

        // Enable RLS on students
        await client.query('ALTER TABLE students ENABLE ROW LEVEL SECURITY;');

        // Create curriculum_metadata table
        await client.query(`
            CREATE TABLE IF NOT EXISTS curriculum_metadata (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                chunk_id VARCHAR(255) UNIQUE NOT NULL,
                education_level VARCHAR(50),
                grade_class VARCHAR(50),
                subject_domain VARCHAR(100),
                topic_node VARCHAR(255),
                content_text TEXT,
                embedding_vector vector(1536),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create vector index for faster search
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_curriculum_embedding 
            ON curriculum_metadata USING ivfflat (embedding_vector vector_cosine_ops)
            WITH (lists = 100);
        `);

        // Create lessons_cache table
        await client.query(`
            CREATE TABLE IF NOT EXISTS lessons_cache (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                topic_hash VARCHAR(255) NOT NULL,
                grade_level VARCHAR(50) NOT NULL,
                lesson_content TEXT,
                audio_url TEXT,
                video_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                UNIQUE(school_id, topic_hash, grade_level)
            );
        `);

        // Create student_progress table
        await client.query(`
            CREATE TABLE IF NOT EXISTS student_progress (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                topic VARCHAR(255),
                completion_status VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create lesson_videos table for synchronized Manim sequence tracking
        await client.query(`
            CREATE TABLE IF NOT EXISTS lesson_videos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cache_id UUID NOT NULL REFERENCES lessons_cache(id) ON DELETE CASCADE,
                video_url TEXT NOT NULL,
                trigger_timestamp INTEGER NOT NULL, -- exact second during playback when this video plays
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        client.release();
        console.log('✓ Database initialized successfully');
    } catch (error) {
        console.error('✗ Database initialization error:', error.message);
        throw error;
    }
};

export default pool;
