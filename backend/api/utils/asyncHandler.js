/**
 * MwalimuSmart Web
 * backend/api/utils/asyncHandler.js — Route wrapper & canonical error handler
 */

import { logger } from "./logger.js";
import { AppError, ERROR_STATUS_MAP } from "./errors.js";

/**
 * Wrap an async Express route handler so rejected promises are passed to next(err).
 */
export function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error-handling middleware that formats errors per docs/07-API.md
 * and logs 500s at error level with Pino.
 */
export function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || req.headers?.["x-request-id"];

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err: err.message, code: err.code, requestId }, "API error");
    }
    return res.status(err.status).json(err.toJSON());
  }

  const code = err?.code && ERROR_STATUS_MAP[err.code] ? err.code : "internal";
  const status = err?.status || ERROR_STATUS_MAP[code] || 500;
  const message = status >= 500 ? "Internal server error" : err?.message || "Request failed";

  if (status >= 500) {
    logger.error({ err: err?.message || String(err), stack: err?.stack, requestId }, "Unhandled route error");
  }

  return res.status(status).json({
    error: {
      code,
      message,
    },
  });
}
