
---

### `docs/tasks/phase-1-foundation.md`

```markdown
# Phase 1 — Foundation

**Exit criterion:** A student can log in, browse Grade 7 Mathematics and
Integrated Science, open a pre-published lesson, read the script, download the
transcript, and see the assessment questions. A teacher can enqueue authoring
for a sub-strand, review the draft, and publish it.

Estimated calendar: 4 weeks at solo-founder pace.

---

## P1.1 — Postgres migrations + seed

**Context:** Implement `docs/02` and `docs/03`. Foundation for everything.

**Files to create/modify:**
- `backend/migrations/0001_education_graph.sql` … `0005_rag_align.sql`
- `backend/scripts/seed_curriculum.py`
- `backend/data/curriculum/seed_v1.json` (start with Grade 7 Mathematics)
- `package.json`: `"db:migrate": "node backend/scripts/migrate.js"` (write a
  tiny runner that applies pending `.sql` files)

**Acceptance criteria:**
- [ ] `npm run db:migrate` applies all migrations from an empty DB.
- [ ] `python3 -m scripts.seed_curriculum --file data/curriculum/seed_v1.json`
      populates Grade 7 Mathematics with ≥ 5 strands and ≥ 3 sub-strands each.
- [ ] Re-running seed is idempotent (0 new rows).
- [ ] `psql` shows `kicd_chunks.substrand_id` column exists.

**Verify:**
```bash
npm run db:migrate && python3 -m scripts.seed_curriculum --file data/curriculum/seed_v1.json
psql $POSTGRES_DSN -c "select count(*) from substrands;"