# 02 — Data Model

## Postgres — curriculum and lessons

Extensions: `pgvector`, `pg_trgm` (for search), `uuid-ossp`.

```sql
-- 1. Education levels and grades ---------------------------------------------

CREATE TABLE education_levels (
  id          SMALLINT PRIMARY KEY,
  name        TEXT NOT NULL,          -- 'Pre-Primary','Primary','Junior Secondary','Senior Secondary'
  sort_order  SMALLINT NOT NULL
);

CREATE TABLE grades (
  id          SMALLINT PRIMARY KEY,
  level_id    SMALLINT NOT NULL REFERENCES education_levels(id),
  name        TEXT NOT NULL,          -- 'PP1','Grade 7'
  sort_order  SMALLINT NOT NULL
);

-- 2. Subjects and the grade↔subject join -------------------------------------

CREATE TABLE subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,   -- 'mathematics','integrated_science'
  name_en     TEXT NOT NULL,
  name_sw     TEXT NOT NULL
);

CREATE TABLE grade_subjects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id        SMALLINT NOT NULL REFERENCES grades(id),
  subject_id      UUID NOT NULL REFERENCES subjects(id),
  curriculum_ref  TEXT,               -- e.g. KICD doc code
  UNIQUE (grade_id, subject_id)
);

-- 3. Strands and sub-strands -------------------------------------------------

CREATE TABLE strands (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_subject_id  UUID NOT NULL REFERENCES grade_subjects(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  sort_order        SMALLINT NOT NULL,
  description       TEXT,
  UNIQUE (grade_subject_id, sort_order)
);

CREATE TABLE substrands (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strand_id          UUID NOT NULL REFERENCES strands(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  sort_order         SMALLINT NOT NULL,
  learning_outcomes  JSONB NOT NULL DEFAULT '[]',   -- string[]
  competencies       JSONB NOT NULL DEFAULT '[]',   -- string[]
  UNIQUE (strand_id, sort_order)
);

-- 4. Lessons and variants ----------------------------------------------------

CREATE TYPE lesson_status AS ENUM
  ('draft','in_review','published','archived','needs_regeneration');

CREATE TABLE lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  substrand_id  UUID NOT NULL REFERENCES substrands(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  status        lesson_status NOT NULL DEFAULT 'draft',
  version       INT NOT NULL DEFAULT 1,
  supersedes    UUID REFERENCES lessons(id),         -- prior version if any
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,
  UNIQUE (substrand_id, sort_order, version)
);

CREATE TYPE lang_code AS ENUM ('en','sw');

CREATE TABLE lesson_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id      UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language       lang_code NOT NULL,
  script         JSONB NOT NULL,      -- structured sections
  transcript     TEXT NOT NULL,       -- plain .txt for download
  objectives     JSONB NOT NULL,      -- string[]
  key_concepts   JSONB NOT NULL,      -- [{ term, definition }]
  rag_sources    JSONB NOT NULL DEFAULT '[]',  -- [{ chunk_id, page, doc }]
  UNIQUE (lesson_id, language)
);

CREATE TYPE asset_type AS ENUM ('video_mp4','audio_mp3','captions_vtt','thumbnail');

CREATE TABLE lesson_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_variant_id  UUID NOT NULL REFERENCES lesson_variants(id) ON DELETE CASCADE,
  type               asset_type NOT NULL,
  storage_url        TEXT,            -- S3/R2 signed or public URL
  duration_s         INT,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending|rendering|ready|failed
  job_id             TEXT,            -- BullMQ job id
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_variant_id, type)
);

-- 5. Assessment ---------------------------------------------------------------

CREATE TABLE assessment_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  sort_order      SMALLINT NOT NULL,
  question_en     TEXT NOT NULL,
  question_sw     TEXT NOT NULL,
  options         JSONB NOT NULL,     -- { en: string[], sw: string[] }
  correct_index   SMALLINT NOT NULL,
  explanation_en  TEXT NOT NULL,
  explanation_sw  TEXT NOT NULL,
  competency_tag  TEXT NOT NULL,      -- reused from diagnostic.py tags
  UNIQUE (lesson_id, sort_order)
);

-- 6. Student progress and mastery --------------------------------------------

CREATE TABLE student_progress (
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id      UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'not_started',  -- not_started|viewed|assessed|completed
  last_position_s INT NOT NULL DEFAULT 0,
  attempts       SMALLINT NOT NULL DEFAULT 0,
  last_score     NUMERIC(4,2),        -- 0.00–1.00
  completed_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, lesson_id)
);

CREATE TABLE student_mastery (
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  substrand_id   UUID NOT NULL REFERENCES substrands(id) ON DELETE CASCADE,
  mastery_score  NUMERIC(4,2) NOT NULL DEFAULT 0,  -- rolling avg of last N scores
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, substrand_id)
);

-- 7. Follow-up threads --------------------------------------------------------

CREATE TABLE followup_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE followup_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES followup_threads(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,          -- 'student'|'assistant'
  content      TEXT NOT NULL,
  has_visual   BOOLEAN NOT NULL DEFAULT false,
  visual_spec  JSONB,                  -- { tier, template_id, params, asset_url? }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Indices ------------------------------------------------------------------

CREATE INDEX ON student_progress (student_id);
CREATE INDEX ON student_mastery (student_id);
CREATE INDEX ON lessons (substrand_id) WHERE status = 'published';
CREATE INDEX ON followup_threads (student_id, lesson_id);