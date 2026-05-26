import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from the backend directory and override any existing environment variables
dotenv.config({ 
    path: path.join(__dirname, '..', '.env'),
    override: true 
});
import express from 'express';
import cors from 'cors';
import pool, { initializeDatabase } from './db.js';
import { tenantMiddleware } from './middleware/tenant.js';
import lessonRoutes from './routes/lesson.routes.js';
import qaRoutes from './routes/qa.routes.js';
import exportRoutes from './routes/export.routes.js';
import activationRoutes from './routes/activation.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Allow multiple frontend origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL
].filter(Boolean);

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('mwalimusmart.com')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply tenant middleware to all API routes
app.use('/api', tenantMiddleware);

// Routes
app.use('/api/auth', activationRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/qa', qaRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Initialize database and start server
const startServer = async () => {
    try {
        // Initialize database
        await initializeDatabase();
        
        // Start listening
        app.listen(PORT, () => {
            console.log(`\n✓ MwalimuSmart Backend running on http://localhost:${PORT}`);
            console.log(`✓ Multi-tenant architecture enabled`);
            console.log(`✓ RAG system with pgvector ready`);
            console.log(`✓ Accepting requests from: ${allowedOrigins.join(', ')}`);

            if (!process.env.GEMINI_API_KEY) {
                console.warn('⚠ WARNING: GEMINI_API_KEY not set');
            } else {
                console.log('✓ GEMINI_API_KEY configured');
            }
            console.log(`✓ GEMINI_MODEL: ${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}\n`);
        });
    } catch (error) {
        console.error('✗ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();

// Capture unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

export default app;
