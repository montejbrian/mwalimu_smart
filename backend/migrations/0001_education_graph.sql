-- 0001_education_graph.sql
-- Extensions, base pre-pivot tables (if starting from an empty DB), and CBC education graph

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Base pre-pivot tables (idempotent for empty DB bootstrap)
CREATE TABLE IF NOT EXISTS schools (
  school_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  knec_code    TEXT        UNIQUE,
  county       TEXT        NOT NULL DEFAULT 'Nairobi',
  sub_county   TEXT,
  school_type  TEXT        NOT NULL DEFAULT 'primary',
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  teacher_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
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
  student_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX IF NOT EXISTS kicd_chunks_strand_grade_idx ON kicd_chunks (strand, grade_level);

-- 1. Education levels and grades ---------------------------------------------

CREATE TABLE IF NOT EXISTS education_levels (
  id          SMALLINT PRIMARY KEY,
  name        TEXT NOT NULL,          -- 'Pre-Primary','Primary','Junior Secondary','Senior Secondary'
  sort_order  SMALLINT NOT NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id          SMALLINT PRIMARY KEY,
  level_id    SMALLINT NOT NULL REFERENCES education_levels(id),
  name        TEXT NOT NULL,          -- 'PP1','Grade 7'
  sort_order  SMALLINT NOT NULL
);

-- 2. Subjects and the grade<->subject join -----------------------------------

CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,   -- 'mathematics','integrated_science'
  name_en     TEXT NOT NULL,
  name_sw     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grade_subjects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id        SMALLINT NOT NULL REFERENCES grades(id),
  subject_id      UUID NOT NULL REFERENCES subjects(id),
  curriculum_ref  TEXT,               -- e.g. KICD doc code
  UNIQUE (grade_id, subject_id)
);

-- 3. Strands and sub-strands -------------------------------------------------

CREATE TABLE IF NOT EXISTS strands (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_subject_id  UUID NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  sort_order        SMALLINT NOT NULL,
  description       TEXT,
  UNIQUE (grade_subject_id, sort_order)
);

CREATE TABLE IF NOT EXISTS substrands (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strand_id          UUID NOT NULL REFERENCES strands(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  sort_order         SMALLINT NOT NULL,
  learning_outcomes  JSONB NOT NULL DEFAULT '[]',   -- string[]
  competencies       JSONB NOT NULL DEFAULT '[]',   -- string[]
  tier               TEXT NOT NULL DEFAULT 'standard', -- 'featured' | 'standard' | 'on_demand'
  UNIQUE (strand_id, sort_order)
);

-- DOWN
DROP TABLE IF EXISTS substrands CASCADE;
DROP TABLE IF EXISTS strands CASCADE;
DROP TABLE IF EXISTS grade_subjects CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS education_levels CASCADE;
