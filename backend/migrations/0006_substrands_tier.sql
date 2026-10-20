-- UP
ALTER TABLE substrands
    ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('featured', 'standard', 'on_demand'));

-- DOWN
ALTER TABLE substrands
    DROP COLUMN IF EXISTS tier;
