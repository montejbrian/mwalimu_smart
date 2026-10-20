"""
MwalimuSmart Institutional OS
scripts/init_db.py — Full PostgreSQL Schema Bootstrap

Usage:
    python -m scripts.init_db          # schema only
    python -m scripts.init_db --seed   # schema + demo data
"""
from __future__ import annotations
import argparse, logging, sys
import psycopg2
from config.settings import settings

logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS schools (
    school_id    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT        NOT NULL,
    knec_code    TEXT        UNIQUE,
    county       TEXT        NOT NULL DEFAULT 'Nairobi',
    sub_county   TEXT,
    school_type  TEXT        NOT NULL DEFAULT 'primary',
    is_active    BOOLEAN     NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
    teacher_id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id          UUID        NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    full_name          TEXT        NOT NULL,
    email              TEXT        UNIQUE NOT NULL,
    password_hash      TEXT        NOT NULL,
    tsc_number         TEXT        UNIQUE,
    strand             TEXT,
    refresh_token_hash TEXT,
    last_login         TIMESTAMPTZ,
    is_active          BOOLEAN     NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teachers_school_idx ON teachers (school_id);
CREATE INDEX IF NOT EXISTS teachers_email_idx  ON teachers (email);

CREATE TABLE IF NOT EXISTS students (
    student_id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id          UUID        NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    full_name          TEXT        NOT NULL,
    email              TEXT        UNIQUE NOT NULL,
    refresh_token_hash TEXT,
    last_login         TIMESTAMPTZ,
    is_active          BOOLEAN     NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_school_idx ON students (school_id);
CREATE INDEX IF NOT EXISTS students_email_idx  ON students (email);

CREATE TABLE IF NOT EXISTS kicd_chunks (
    chunk_id     TEXT         PRIMARY KEY,
    content      TEXT         NOT NULL,
    source_title TEXT         NOT NULL,
    page_number  INTEGER,
    strand       TEXT         NOT NULL,
    grade_level  TEXT         NOT NULL,
    embedding    VECTOR(768)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kicd_chunks_embedding_idx
    ON kicd_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS kicd_chunks_strand_grade_idx ON kicd_chunks (strand, grade_level);

DROP TABLE IF EXISTS lesson_jobs CASCADE;
CREATE TABLE IF NOT EXISTS lesson_jobs (
    lesson_id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id          UUID        NOT NULL REFERENCES schools(school_id),
    creator_id         UUID        NOT NULL,
    topic              TEXT        NOT NULL,
    strand             TEXT        NOT NULL,
    grade_level        TEXT        NOT NULL,
    language           TEXT        NOT NULL DEFAULT 'en',
    workflow_status    TEXT        NOT NULL DEFAULT 'initialised',
    script_version     INTEGER     NOT NULL DEFAULT 0,
    retake_count       INTEGER     NOT NULL DEFAULT 0,
    diagnostic_score   NUMERIC(5,2),
    diagnostic_outcome TEXT,
    mp4_path           TEXT,
    mongodb_file_id    TEXT,
    error_log          JSONB       NOT NULL DEFAULT '[]',
    node_durations     JSONB       NOT NULL DEFAULT '[]',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_jobs_school_idx  ON lesson_jobs (school_id);
CREATE INDEX IF NOT EXISTS lesson_jobs_status_idx  ON lesson_jobs (workflow_status);
CREATE INDEX IF NOT EXISTS lesson_jobs_created_idx ON lesson_jobs (created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS lesson_jobs_updated_at ON lesson_jobs;
CREATE TRIGGER lesson_jobs_updated_at
    BEFORE UPDATE ON lesson_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
"""

# bcrypt hash of 'MwalimuDemo2025' (cost=10)
SEED = """
INSERT INTO schools (school_id,name,knec_code,county,school_type)
VALUES ('00000000-0000-0000-0000-000000000001','Westlands Primary School','NRB001','Nairobi','primary')
ON CONFLICT DO NOTHING;

INSERT INTO teachers (teacher_id,school_id,full_name,email,password_hash,tsc_number,strand)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Ms. Jane Wanjiku',
  'wanjiku@westlands.sc.ke',
  '$2a$10$CWA1D8ZD5MJ0JDJwZ0I9Aezd0ckKVChfxWzUJUfWEeHL13pVAkMNa',
  'TSC/0001234',
  'science_technology'
) ON CONFLICT DO NOTHING;
"""

def init_db(seed: bool = False) -> None:
    log.info("Connecting: %s", settings.POSTGRES_DSN)
    conn = psycopg2.connect(settings.POSTGRES_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA)
            if seed:
                cur.execute(SEED)
                log.info("Seed → email: wanjiku@westlands.sc.ke  password: MwalimuDemo2025")
        conn.commit()
        log.info("✓ DB initialised.")
    except Exception as exc:
        conn.rollback(); log.error("Failed: %s", exc); sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--seed", action="store_true")
    init_db(seed=p.parse_args().seed)
