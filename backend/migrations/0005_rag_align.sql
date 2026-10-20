-- 0005_rag_align.sql
-- Align kicd_chunks with curriculum graph (substrand_id + subject_code)

ALTER TABLE kicd_chunks
  ADD COLUMN IF NOT EXISTS substrand_id UUID REFERENCES substrands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_code TEXT;

CREATE INDEX IF NOT EXISTS kicd_chunks_substrand_idx ON kicd_chunks (substrand_id);
CREATE INDEX IF NOT EXISTS kicd_chunks_subject_code_idx ON kicd_chunks (subject_code);

-- DOWN
DROP INDEX IF EXISTS kicd_chunks_subject_code_idx;
DROP INDEX IF EXISTS kicd_chunks_substrand_idx;
ALTER TABLE kicd_chunks
  DROP COLUMN IF EXISTS subject_code,
  DROP COLUMN IF EXISTS substrand_id;
