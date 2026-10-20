/**
 * MwalimuSmart Web
 * backend/api/utils/errors.js — Canonical API errors per docs/07-API.md
 */

export const ERROR_STATUS_MAP = Object.freeze({
  "auth.missing": 401,
  "auth.invalid": 401,
  "auth.expired": 401,
  "auth.forbidden": 403,
  not_found: 404,
  validation: 400,
  rate_limited: 429,
  "upstream.gemini": 502,
  "upstream.storage": 502,
  internal: 500,
});

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_STATUS_MAP} code
   * @param {string} message
   * @param {Record<string, unknown>} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "AppError";
    this.code = ERROR_STATUS_MAP[code] ? code : "internal";
    this.status = ERROR_STATUS_MAP[this.code] || 500;
    this.extra = extra;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...this.extra,
      },
    };
  }

  static validation(message, extra) {
    return new AppError("validation", message, extra);
  }

  static notFound(message, extra) {
    return new AppError("not_found", message, extra);
  }

  static forbidden(message, extra) {
    return new AppError("auth.forbidden", message, extra);
  }
}
