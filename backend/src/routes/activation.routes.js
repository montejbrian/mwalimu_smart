import { Router } from 'express';
import {
    verifyAdmissionNumber,
    setupCurricularProfile,
    loginStudent,
    checkActivationStatus,
} from '../controllers/activation.controller.js';
import { tenantMiddleware } from '../middleware/tenant.js';

const router = Router();

// All activation routes are tenant-aware
router.use(tenantMiddleware);

// Step 1: Verify admission number
router.post('/verify-admission', verifyAdmissionNumber);

// Step 2: Complete profile setup
router.post('/setup-profile', setupCurricularProfile);

// Login
router.post('/login', loginStudent);

// Check activation status
router.get('/status', checkActivationStatus);

export default router;
