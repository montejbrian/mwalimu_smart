-- 0002_lessons.sql
-- Lessons, bilingual variants, media assets, and formative assessment questions

DO $$ BEGIN
  CREATE TYPE lesson_status AS ENUM ('draft','in_review','published','archived','needs_regeneration');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  substrand_id  UUID NOT NULL REFERENCES substrands(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  status        lesson_status NOT NULL DEFAULT 'draft',
  version       INT NOT NULL DEFAULT 1,
  supersedes    UUID REFERENCES lessons(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,
  UNIQUE (substrand_id, sort_order, version)
);

DO $$ BEGIN
  CREATE TYPE lang_code AS ENUM ('en','sw');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lesson_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language       lang_code NOT NULL,
  script         JSONB NOT NULL,
  transcript     TEXT NOT NULL,
  objectives     JSONB NOT NULL,
  key_concepts   JSONB NOT NULL,
  rag_sources    JSONB NOT NULL DEFAULT '[]',
  UNIQUE (lesson_id, language)
);

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('video_mp4','audio_mp3','captions_vtt','thumbnail');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS lesson_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_variant_id  UUID NOT NULL REFERENCES lesson_variants(id) ON DELETE CASCADE,
  type               asset_type NOT NULL,
  storage_url        TEXT,
  duration_s         INT,
  status             TEXT NOT NULL DEFAULT 'pending',
  job_id             TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_variant_id, type)
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sort_order      SMALLINT NOT NULL,
  question_en     TEXT NOT NULL,
  question_sw     TEXT NOT NULL,
  options         JSONB NOT NULL,
  correct_index   SMALLINT NOT NULL,
  explanation_en  TEXT NOT NULL,
  explanation_sw  TEXT NOT NULL,
  competency_tag  TEXT NOT NULL,
  UNIQUE (lesson_id, sort_order)
);

CREATE INDEX IF NOT EXISTS lessons_published_substrand_idx
  ON lessons (substrand_id) WHERE status = 'published';

-- DOWN
DROP INDEX IF EXISTS lessons_published_substrand_idx;
DROP TABLE IF EXISTS assessment_questions CASCADE;
DROP TABLE IF EXISTS lesson_assets CASCADE;
DROP TABLE IF EXISTS lesson_variants CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TYPE IF EXISTS asset_type;
DROP TYPE IF EXISTS lang_code;
DROP TYPE IF EXISTS lesson_status;
