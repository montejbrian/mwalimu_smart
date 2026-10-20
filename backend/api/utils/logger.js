/**
 * MwalimuSmart Institutional OS
 * api/utils/logger.js — Structured Logger (pino)
 */

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
    : undefined,
  base: { service: "mwalimusmart-api" },
});
