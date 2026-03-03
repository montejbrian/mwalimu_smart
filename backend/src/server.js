import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import lessonRoutes from './routes/lesson.routes.js';
import qaRoutes from './routes/qa.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Allow multiple frontend origins
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:3000',
    process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined values

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Increased limit for base64 images

// Routes
app.use('/api', lessonRoutes);
app.use('/api/qa', qaRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'MwalimuSmart Backend is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`MwalimuSmart Backend running on http://localhost:${PORT}`);
    console.log(`API endpoints available at http://localhost:${PORT}/api`);
    console.log(`Accepting requests from: ${allowedOrigins.join(', ')}`);

    if (!process.env.GEMINI_API_KEY) {
        console.warn('WARNING: GEMINI_API_KEY not set in environment variables');
    }
});

// Capture unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown:', err);
});

export default app;
