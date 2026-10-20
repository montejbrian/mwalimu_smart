/**
 * MwalimuSmart Web
 * backend/api/middleware/requestContext.js — Request ID & Accept-Language middleware
 *
 * - Echoes X-Request-Id header if provided, or generates a UUID v4.
 * - Parses Accept-Language (or ?lang= query param) into req.lang ('en' | 'sw').
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Resolve requested language ('en' or 'sw') from query parameter or Accept-Language header.
 */
export function resolveLanguage(req) {
  const queryLang = typeof req.query?.lang === "string" ? req.query.lang.trim().toLowerCase() : "";
  if (queryLang === "sw" || queryLang.startsWith("sw-")) return "sw";
  if (queryLang === "en" || queryLang.startsWith("en-")) return "en";

  const header = typeof req.headers?.["accept-language"] === "string"
    ? req.headers["accept-language"].toLowerCase()
    : "";
  if (header.startsWith("sw") || header.includes(",sw") || header.includes(" sw")) {
    return "sw";
  }
  return "en";
}

export function requestContextMiddleware(req, res, next) {
  const incomingId = req.headers["x-request-id"];
  const requestId =
    typeof incomingId === "string" && incomingId.trim().length > 0
      ? incomingId.trim()
      : uuidv4();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  req.lang = resolveLanguage(req);
  next();
}
