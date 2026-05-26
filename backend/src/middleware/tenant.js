import pool from '../db.js';

/**
 * Tenant middleware - extracts tenant context from subdomain or header
 */
export const tenantMiddleware = async (req, res, next) => {
    try {
        // Get hostname (subdomain)
        const hostname = req.hostname;
        const parts = hostname.split('.');
        
        let subdomain = 'root'; // Default for root domain
        if (parts.length > 2 || (parts.length === 2 && hostname !== 'localhost')) {
            subdomain = parts[0]; // Extract first part as subdomain
        }

        // Check if this is a demo route
        if (req.path.startsWith('/demo')) {
            req.tenant = {
                type: 'demo',
                subdomain: 'demo',
                id: null,
            };
            return next();
        }

        // For localhost or root domain, allow parent portal
        if (subdomain === 'localhost' || subdomain === 'root' || parts[0] === 'mwalimusmart') {
            req.tenant = {
                type: 'parent-portal',
                subdomain: 'root',
                id: null,
            };
            return next();
        }

        // Query for school by subdomain
        const result = await pool.query(
            'SELECT id, name, subdomain FROM schools WHERE subdomain = $1',
            [subdomain]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'School not found' });
        }

        req.tenant = {
            type: 'school',
            id: result.rows[0].id,
            name: result.rows[0].name,
            subdomain: result.rows[0].subdomain,
        };

        next();
    } catch (error) {
        console.error('Tenant middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

/**
 * Verify student authentication - check JWT token
 */
export const verifyStudentToken = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // TODO: Verify JWT token here
        // For now, just pass through
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * RLS policy enforcer - ensures student can only access their school's data
 */
export const enforceRowLevelSecurity = async (req, res, next) => {
    try {
        if (req.tenant.type === 'demo' || !req.student) {
            return next();
        }

        // Verify student belongs to the tenant
        const result = await pool.query(
            'SELECT school_id FROM students WHERE id = $1',
            [req.student.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Student not found' });
        }

        if (result.rows[0].school_id !== req.tenant.id) {
            return res.status(403).json({ error: 'Access denied - wrong school' });
        }

        next();
    } catch (error) {
        console.error('RLS enforcement error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};
