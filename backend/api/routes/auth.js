/**
 * MwalimuSmart Institutional OS
 * api/routes/auth.js — Authentication Routes
 *
 * POST /api/auth/login    → email + password → JWT
 * POST /api/auth/refresh  → refreshToken → new accessToken
 * POST /api/auth/logout   → invalidate refresh token
 * GET  /api/auth/me       → return current user profile
 */

import { Router }  from "express";
import bcrypt       from "bcryptjs";
import jwt          from "jsonwebtoken";
import { config }   from "../config.js";
import { pool }     from "../db.js";
import { logger }   from "../utils/logger.js";

const router = Router();

const ACCESS_TTL  = "8h";
const REFRESH_TTL = "30d";
const SECRET      = config.authSecret;
const REFRESH_SECRET = config.authRefreshSecret;

function signAccess(payload)  { return jwt.sign(payload, SECRET,         { expiresIn: ACCESS_TTL  }); }
function signRefresh(payload) { return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL }); }

async function handleLogin(req, res, forcedRole = null) {
  const { email, password, role } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const userRole = (forcedRole || role) === "student" ? "student" : "teacher";
  const normalizedEmail = email.toLowerCase().trim();

  try {
    if (userRole === "student") {
      // Student Flow: Auto-registration / Login without password
      let studentResult = await pool.query(
        `SELECT st.student_id, st.full_name, st.email, st.school_id, s.name AS school_name, s.county
         FROM students st
         JOIN schools s ON s.school_id = st.school_id
         WHERE st.email = $1 AND st.is_active = true`,
        [normalizedEmail]
      );

      let student;
      if (studentResult.rows.length === 0) {
        // Auto-register student. Assign to the default demo school if no explicit school exists.
        const schoolResult = await pool.query(`SELECT school_id, name, county FROM schools LIMIT 1`);
        if (schoolResult.rows.length === 0) {
          return res.status(500).json({ error: "No schools available for registration" });
        }
        const defaultSchool = schoolResult.rows[0];

        const insertResult = await pool.query(
          `INSERT INTO students (school_id, full_name, email)
           VALUES ($1, $2, $3) RETURNING student_id, full_name, email, school_id`,
          [defaultSchool.school_id, `Student (${email.split("@")[0]})`, normalizedEmail]
        );

        student = {
          ...insertResult.rows[0],
          school_name: defaultSchool.name,
          county: defaultSchool.county,
        };
      } else {
        student = studentResult.rows[0];
      }

      const payload = {
        student_id: student.student_id,
        school_id:  student.school_id,
        role:       "student",
      };

      const accessToken  = signAccess(payload);
      const refreshToken = signRefresh({ student_id: student.student_id, role: "student" });
      const rtHash = await bcrypt.hash(refreshToken, 8);

      await pool.query(
        "UPDATE students SET refresh_token_hash = $1, last_login = now() WHERE student_id = $2",
        [rtHash, student.student_id]
      );

      logger.info({ student_id: student.student_id }, "Student logged in");

      return res.json({
        access_token:  accessToken,
        refresh_token: refreshToken,
        expires_in:    8 * 3600,
        user: {
          student_id: student.student_id,
          name:       student.full_name,
          email:      student.email,
          school_id:  student.school_id,
          school:     student.school_name,
          county:     student.county,
          role:       "student",
        },
      });
    } else {
      // Teacher Flow: Requires password
      if (!password) return res.status(400).json({ error: "Password is required for teachers" });

      const result = await pool.query(
        `SELECT t.teacher_id, t.full_name, t.email, t.password_hash,
                t.school_id, t.tsc_number, t.strand,
                s.name AS school_name, s.county
         FROM teachers t
         JOIN schools s ON s.school_id = t.school_id
         WHERE t.email = $1 AND t.is_active = true`,
        [normalizedEmail]
      );

      if (result.rows.length === 0)
        return res.status(401).json({ error: "Invalid email or password" });

      const teacher = result.rows[0];
      const valid   = await bcrypt.compare(password, teacher.password_hash);
      if (!valid)
        return res.status(401).json({ error: "Invalid email or password" });

      const payload = {
        teacher_id: teacher.teacher_id,
        school_id:  teacher.school_id,
        role:       "teacher",
      };

      const accessToken  = signAccess(payload);
      const refreshToken = signRefresh({ teacher_id: teacher.teacher_id, role: "teacher" });

      const rtHash = await bcrypt.hash(refreshToken, 8);
      await pool.query(
        "UPDATE teachers SET refresh_token_hash = $1, last_login = now() WHERE teacher_id = $2",
        [rtHash, teacher.teacher_id]
      );

      logger.info({ teacher_id: teacher.teacher_id }, "Teacher logged in");

      return res.json({
        access_token:  accessToken,
        refresh_token: refreshToken,
        expires_in:    8 * 3600,
        user: {
          teacher_id: teacher.teacher_id,
          name:       teacher.full_name,
          email:      teacher.email,
          school_id:  teacher.school_id,
          school:     teacher.school_name,
          county:     teacher.county,
          tsc_number: teacher.tsc_number,
          strand:     teacher.strand,
          role:       "teacher",
        },
      });
    }
  } catch (err) {
    logger.error({ err: err.message }, "Login error");
    res.status(500).json({ error: "Login failed" });
  }
}

// ── POST /api/auth/login (and role-explicit aliases per docs/07-API.md) ──────
router.post("/login", (req, res) => handleLogin(req, res, null));
router.post("/teacher/login", (req, res) => handleLogin(req, res, "teacher"));
router.post("/student/login", (req, res) => handleLogin(req, res, "student"));

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: "refresh_token required" });

  try {
    const decoded = jwt.verify(refresh_token, REFRESH_SECRET);

    if (decoded.student_id) {
      const result = await pool.query(
        "SELECT student_id, school_id, refresh_token_hash FROM students WHERE student_id = $1",
        [decoded.student_id]
      );
      if (!result.rows.length) return res.status(401).json({ error: "Invalid token" });

      const { refresh_token_hash, student_id, school_id } = result.rows[0];
      const valid = await bcrypt.compare(refresh_token, refresh_token_hash || "");
      if (!valid) return res.status(401).json({ error: "Token revoked" });

      const accessToken = signAccess({ student_id, school_id, role: "student" });
      return res.json({ access_token: accessToken, expires_in: 8 * 3600 });
    }

    const result = await pool.query(
      "SELECT teacher_id, school_id, refresh_token_hash FROM teachers WHERE teacher_id = $1",
      [decoded.teacher_id]
    );
    if (!result.rows.length) return res.status(401).json({ error: "Invalid token" });

    const { refresh_token_hash, teacher_id, school_id } = result.rows[0];
    const valid = await bcrypt.compare(refresh_token, refresh_token_hash || "");
    if (!valid) return res.status(401).json({ error: "Token revoked" });

    const accessToken = signAccess({ teacher_id, school_id, role: "teacher" });
    res.json({ access_token: accessToken, expires_in: 8 * 3600 });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    try {
      const decoded = jwt.verify(refresh_token, REFRESH_SECRET);
      if (decoded.student_id) {
        await pool.query(
          "UPDATE students SET refresh_token_hash = NULL WHERE student_id = $1",
          [decoded.student_id]
        );
      } else if (decoded.teacher_id) {
        await pool.query(
          "UPDATE teachers SET refresh_token_hash = NULL WHERE teacher_id = $1",
          [decoded.teacher_id]
        );
      }
    } catch {}
  }
  res.json({ status: "logged_out" });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", async (req, res) => {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.student_id) {
      const stRes = await pool.query(
        `SELECT st.student_id, st.full_name, st.email, st.school_id, s.name AS school_name, s.county
         FROM students st JOIN schools s ON s.school_id = st.school_id
         WHERE st.student_id = $1`,
        [decoded.student_id]
      );
      if (!stRes.rows.length) return res.status(404).json({ error: "User not found" });
      const st = stRes.rows[0];
      return res.json({
        student_id: st.student_id,
        name:       st.full_name,
        email:      st.email,
        school_id:  st.school_id,
        school:     st.school_name,
        county:     st.county,
        role:       "student",
      });
    }

    const result  = await pool.query(
      `SELECT t.teacher_id, t.full_name, t.email, t.strand,
              t.school_id, s.name AS school_name, s.county
       FROM teachers t JOIN schools s ON s.school_id = t.school_id
       WHERE t.teacher_id = $1`,
      [decoded.teacher_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "User not found" });

    const t = result.rows[0];
    res.json({
      teacher_id: t.teacher_id,
      name:       t.full_name,
      email:      t.email,
      school_id:  t.school_id,
      school:     t.school_name,
      county:     t.county,
      strand:     t.strand,
      role:       "teacher",
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
