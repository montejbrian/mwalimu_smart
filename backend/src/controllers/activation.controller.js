import pool from '../db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

/**
 * Step 1: Identity Discovery - verify admission number
 */
export const verifyAdmissionNumber = async (req, res) => {
    try {
        const { admissionNumber } = req.body;
        const schoolId = req.tenant.id;

        if (!schoolId) {
            return res.status(400).json({ error: 'Invalid school' });
        }

        if (!admissionNumber) {
            return res.status(400).json({ error: 'Admission number required' });
        }

        // Check if student exists and is not activated
        const result = await pool.query(
            'SELECT id, full_name, is_activated FROM students WHERE school_id = $1 AND admission_number = $2',
            [schoolId, admissionNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Admission number not found' });
        }

        const student = result.rows[0];

        if (student.is_activated) {
            return res.status(400).json({ error: 'Student already activated' });
        }

        // Return student info for next step
        res.json({
            studentId: student.id,
            fullName: student.full_name,
            admissionNumber,
        });
    } catch (error) {
        console.error('Admission verification error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

/**
 * Step 2: Curricular Profile Setup - configure grade and education level
 */
export const setupCurricularProfile = async (req, res) => {
    try {
        const { studentId, educationLevel, gradeClass, password } = req.body;

        if (!studentId || !educationLevel || !gradeClass || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate education level
        const validLevels = ['primary', 'junior_secondary', 'senior_secondary'];
        if (!validLevels.includes(educationLevel)) {
            return res.status(400).json({ error: 'Invalid education level' });
        }

        // Validate grade
        const validGrades = ['grade_1', 'grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6', 'grade_7', 'grade_8', 'grade_9', 'grade_10', 'grade_11', 'grade_12'];
        if (!validGrades.includes(gradeClass)) {
            return res.status(400).json({ error: 'Invalid grade' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Update student profile
        const result = await pool.query(
            `UPDATE students 
             SET education_level = $1, grade_class = $2, password_hash = $3, is_activated = true, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING id, admission_number, full_name, education_level, grade_class`,
            [educationLevel, gradeClass, passwordHash, studentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = result.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            {
                studentId: student.id,
                admissionNumber: student.admission_number,
                educationLevel: student.education_level,
                gradeClass: student.grade_class,
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Profile setup complete',
            token,
            student: {
                id: student.id,
                fullName: student.full_name,
                educationLevel: student.education_level,
                gradeClass: student.grade_class,
            },
        });
    } catch (error) {
        console.error('Profile setup error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

/**
 * Login - authenticate existing student
 */
export const loginStudent = async (req, res) => {
    try {
        const { admissionNumber, password } = req.body;
        const schoolId = req.tenant.id;

        if (!admissionNumber || !password) {
            return res.status(400).json({ error: 'Admission number and password required' });
        }

        const result = await pool.query(
            'SELECT id, full_name, education_level, grade_class, password_hash FROM students WHERE school_id = $1 AND admission_number = $2 AND is_activated = true',
            [schoolId, admissionNumber]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const student = result.rows[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, student.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        await pool.query(
            'UPDATE students SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [student.id]
        );

        // Generate JWT token
        const token = jwt.sign(
            {
                studentId: student.id,
                admissionNumber,
                educationLevel: student.education_level,
                gradeClass: student.grade_class,
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            student: {
                id: student.id,
                fullName: student.full_name,
                educationLevel: student.education_level,
                gradeClass: student.grade_class,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

/**
 * Check activation status
 */
export const checkActivationStatus = async (req, res) => {
    try {
        const { admissionNumber } = req.query;
        const schoolId = req.tenant.id;

        if (!schoolId || !admissionNumber) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const result = await pool.query(
            'SELECT id, is_activated FROM students WHERE school_id = $1 AND admission_number = $2',
            [schoolId, admissionNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }

        res.json({
            isActivated: result.rows[0].is_activated,
        });
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};
