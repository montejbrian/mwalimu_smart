-- 0007_assessment_attempts.sql
-- Per-attempt assessment history used to compute student_mastery.mastery_score
-- as a rolling average of the last 5 attempts (docs/tasks/phase-2-learning-loop.md P2.1).
-- DECISION(agent): docs/02 only defines student_progress.last_score, which cannot
-- support a rolling average. Added an append-only attempts table (reversible).

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  substrand_id  UUID NOT NULL REFERENCES substrands(id) ON DELETE CASCADE,
  score         NUMERIC(4,2) NOT NULL,          -- 0.00-1.00
  answers       JSONB NOT NULL DEFAULT '[]',    -- [{question_id, chosen_index, correct}]
  language      TEXT NOT NULL DEFAULT 'en',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_attempts_student_substrand_idx
  ON assessment_attempts (student_id, substrand_id, created_at DESC);

-- DOWN
DROP INDEX IF EXISTS assessment_attempts_student_substrand_idx;
DROP TABLE IF EXISTS assessment_attempts CASCADE;
