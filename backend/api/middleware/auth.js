/**
 * MwalimuSmart Institutional OS
 * api/middleware/auth.js — JWT Auth Middleware
 *
 * Schools and teachers authenticate with a JWT issued at login.
 * The token carries: school_id, teacher_id, role ("teacher"|"admin"|"student")
 *
 * Tokens are signed with HS256 using AUTH_SECRET from .env.
 * Students use short-lived tokens (1h), teachers use 8h tokens.
 */

import jwt from "jsonwebtoken";
import { config } from "../config.js";

const AUTH_SECRET = config.authSecret;
if (!AUTH_SECRET) throw new Error("AUTH_SECRET must be set in .env");

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: {
        code: "auth.missing",
        message: "Missing Bearer token",
      },
    });
  }

  try {
    const payload = jwt.verify(token, AUTH_SECRET);
    req.auth = {
      school_id:  payload.school_id,
      teacher_id: payload.teacher_id || null,
      student_id: payload.student_id || null,
      role:       payload.role || "student",
    };
    next();
  } catch (err) {
    const isExpired = err.name === "TokenExpiredError";
    return res.status(401).json({
      error: {
        code: isExpired ? "auth.expired" : "auth.invalid",
        message: isExpired ? "Token expired" : "Invalid token",
      },
    });
  }
}

/**
 * Require a specific role.
 * Usage: router.delete("/school", requireRole("admin"), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth?.role)) {
      return res.status(403).json({
        error: {
          code: "auth.forbidden",
          message: `Access denied. Required role: ${roles.join(" or ")}`,
        },
      });
    }
    next();
  };
}
