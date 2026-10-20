/**
 * MwalimuSmart Web
 * backend/scripts/migrate.js — PostgreSQL migration runner
 *
 * Applies pending SQL migrations from backend/migrations/*.sql in sequential order.
 * Supports --down to roll back the most recently applied migration.
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { logger } from "../api/utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BACKEND_DIR, "..");
const MIGRATIONS_DIR = path.join(BACKEND_DIR, "migrations");

// Load .env from repo root or backend/.env without overriding existing env vars
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(BACKEND_DIR, ".env") });

const { Pool } = pg;

function splitMigrationSql(rawSql) {
  const parts = rawSql.split(/^--\s*DOWN\b/im);
  return {
    upSql: (parts[0] || "").trim(),
    downSql: (parts[1] || "").trim(),
  };
}

export async function runMigrations({ direction = "up", connectionString = process.env.POSTGRES_DSN } = {}) {
  if (!connectionString) {
    throw new Error("POSTGRES_DSN is not set in environment or .env");
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const appliedRes = await client.query(
      "SELECT filename FROM schema_migrations ORDER BY filename ASC;"
    );
    const appliedSet = new Set(appliedRes.rows.map((r) => r.filename));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (direction === "down") {
      const appliedList = files.filter((f) => appliedSet.has(f));
      if (appliedList.length === 0) {
        logger.info("No applied migrations to roll back.");
        return { rolledBack: [] };
      }
      const target = appliedList[appliedList.length - 1];
      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, target), "utf8");
      const { downSql } = splitMigrationSql(raw);
      if (!downSql) {
        throw new Error(`Migration ${target} does not contain a -- DOWN section.`);
      }

      await client.query("BEGIN");
      try {
        await client.query(downSql);
        await client.query("DELETE FROM schema_migrations WHERE filename = $1;", [target]);
        await client.query("COMMIT");
        logger.info({ migration: target }, "Rolled back migration");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return { rolledBack: [target] };
    }

    const appliedNow = [];
    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.info({ migration: file }, "Skipping already applied migration");
        continue;
      }

      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const { upSql } = splitMigrationSql(raw);

      await client.query("BEGIN");
      try {
        await client.query(upSql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1);", [file]);
        await client.query("COMMIT");
        appliedNow.push(file);
        logger.info({ migration: file }, "Applied migration");
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error({ migration: file, err: err.message }, "Migration failed");
        throw err;
      }
    }

    logger.info({ appliedCount: appliedNow.length }, "Migrations complete");
    return { applied: appliedNow };
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const direction = process.argv.includes("--down") ? "down" : "up";
  runMigrations({ direction }).catch((err) => {
    logger.error({ err: err.message }, "Migration runner exited with error");
    process.exit(1);
  });
}
