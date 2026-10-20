-- 0004_followups.sql
-- Lesson-scoped AI follow-up threads and messages
-- TODO(docs): docs/02-DATA-MODEL.md references students(id); using students(student_id) to match existing PK.

CREATE TABLE IF NOT EXISTS followup_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followup_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES followup_threads(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,          -- 'student'|'assistant'
  content      TEXT NOT NULL,
  has_visual   BOOLEAN NOT NULL DEFAULT false,
  visual_spec  JSONB,                  -- { tier, template_id, params, asset_url? }
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS followup_threads_student_lesson_idx
  ON followup_threads (student_id, lesson_id);

-- DOWN
DROP INDEX IF EXISTS followup_threads_student_lesson_idx;
DROP TABLE IF EXISTS followup_messages CASCADE;
DROP TABLE IF EXISTS followup_threads CASCADE;
