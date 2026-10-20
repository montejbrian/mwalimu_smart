/**
 * MwalimuSmart Web
 * backend/api/config.js — Centralized frozen configuration
 *
 * Reads environment variables once (from .env or backend/.env) and exports
 * a frozen configuration object per docs/09-CONVENTIONS.md.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BACKEND_DIR, "..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(BACKEND_DIR, ".env") });

const isTest = process.env.NODE_ENV === "test";
const postgresDsn =
  (isTest && process.env.TEST_DATABASE_URL) ||
  process.env.POSTGRES_DSN ||
  "postgresql://mwalimu:password@localhost:5432/mwalimusmart";

const authSecret = process.env.AUTH_SECRET || "dev-secret-change-in-production";

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "4000", 10),
  logLevel: process.env.LOG_LEVEL || "info",
  postgresDsn,
  testDatabaseUrl: process.env.TEST_DATABASE_URL || null,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/mwalimusmart",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  authSecret,
  authRefreshSecret: process.env.AUTH_REFRESH_SECRET || `${authSecret}_refresh`,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  rendersDir: process.env.RENDERS_DIR || path.join(REPO_ROOT, "renders"),
  cdnUrl: process.env.CDN_URL || null,
  featureFlags: Object.freeze({
    tier1Visuals: process.env.FF_TIER1_VISUALS !== "false",
  }),
});

export default config;
