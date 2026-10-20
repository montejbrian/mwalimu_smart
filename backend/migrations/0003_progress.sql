-- 0003_progress.sql
-- Student progress and mastery tracking
-- TODO(docs): docs/02-DATA-MODEL.md references students(id), while pre-pivot schema and
-- backend/api/routes/auth.js define students(student_id) as primary key.

CREATE TABLE IF NOT EXISTS student_progress (
  student_id      UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'not_started',  -- not_started|viewed|assessed|completed
  last_position_s INT NOT NULL DEFAULT 0,
  attempts        SMALLINT NOT NULL DEFAULT 0,
  last_score      NUMERIC(4,2),        -- 0.00-1.00
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS student_mastery (
  student_id     UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  substrand_id   UUID NOT NULL REFERENCES substrands(id) ON DELETE CASCADE,
  mastery_score  NUMERIC(4,2) NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, substrand_id)
);

CREATE INDEX IF NOT EXISTS student_progress_student_id_idx ON student_progress (student_id);
CREATE INDEX IF NOT EXISTS student_mastery_student_id_idx ON student_mastery (student_id);

-- DOWN
DROP INDEX IF EXISTS student_mastery_student_id_idx;
DROP INDEX IF EXISTS student_progress_student_id_idx;
DROP TABLE IF EXISTS student_mastery CASCADE;
DROP TABLE IF EXISTS student_progress CASCADE;
