import { Router } from 'express';
import { exportLessonPDFController } from '../controllers/export.controller.js';

const router = Router();

// POST /api/export/pdf - Export lesson summary as PDF
router.post('/pdf', exportLessonPDFController);

export default router;
