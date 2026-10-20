---

### `docs/04-AUTHORING.md`

```markdown
# 04 — Authoring Pipeline

## Job queue: BullMQ + Redis

Add to `package.json`:
bullmq ^5
ioredis ^5


Add env var: `REDIS_URL=redis://localhost:6379`. Add a Redis service to
`deploy/docker-compose.yml`.

**Do not** create a second queue system. The BullMQ queue is the source of
truth for authoring job state. Mongo `authoring_jobs` is a denormalized mirror
for the admin UI (so the review page doesn't need to query Redis directly).

## Job types
authoring:strand — one job per strand (fan-out to substrand jobs internally)
authoring:substrand — one job per sub-strand, does the real work
authoring:assess — assessment generation only (used for regeneration)
authoring:render — Manim render only (used for re-render)


## State machine (per sub-strand job)
queued
│
▼
researching → researcher.py returns chunks + citations
│
▼
scripting → scriptwriter.py returns script (EN + SW)
│
▼
assessing → assessment_gen.py returns 3–5 MCQs with explanations
│
▼
assembling → lesson + variants + questions inserted (status=draft)
│
▼
awaiting_review → appears in teacher review queue
│
├──▶ publishing → status=published, assets rendered lazily
└──▶ regenerating → back to researching with feedback


Render is **not** part of the state machine — it runs as a separate
`authoring:render` job that fires after `publishing` for "Featured" tier
sub-strands (see below).

## Cost / speed tiers

Every sub-strand is tagged with a tier in `substrands` (add column):

```sql
ALTER TABLE substrands ADD COLUMN tier TEXT NOT NULL DEFAULT 'standard';
-- 'featured' | 'standard' | 'on_demand'