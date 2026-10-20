/**
 * MwalimuSmart Institutional OS
 * api/db.js — Shared DB Clients
 *
 * Both pool (PostgreSQL) and mongoDb are exported here so every
 * route module imports from one place — no duplicate connections.
 */

import { Pool }     from "pg";
import { MongoClient } from "mongodb";
import { config }   from "./config.js";
import { logger }   from "./utils/logger.js";

// ── PostgreSQL ────────────────────────────────────────────────────────────────
export const pool = new Pool({
  connectionString: config.postgresDsn,
  max:              10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => logger.error({ err: err.message }, "PG pool error"));

// ── MongoDB ───────────────────────────────────────────────────────────────────
const mongoClient = new MongoClient(config.mongodbUri, {
  serverSelectionTimeoutMS: 5000,
});

let _db = null;

export async function getDb() {
  if (!_db) {
    await mongoClient.connect();
    _db = mongoClient.db();
    logger.info("MongoDB connected");
  }
  return _db;
}

// ── Health check helper ───────────────────────────────────────────────────────
export async function checkHealth() {
  const pg    = await pool.query("SELECT 1").then(() => "up").catch(() => "down");
  const mongo = await getDb().then((db) => db.command({ ping: 1 })).then(() => "up").catch(() => "down");
  return { postgres: pg, mongodb: mongo };
}
