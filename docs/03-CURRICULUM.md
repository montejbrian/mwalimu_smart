---

### `docs/03-CURRICULUM.md`

```markdown
# 03 — Curriculum Seed

## CBC structure (the shape we model)
Level (Pre-Primary | Primary | Junior Secondary | Senior Secondary)
└─ Grade (PP1, PP2, Grade 1..12)
└─ Subject (Mathematics, English, Kiswahili, Integrated Science, ...)
└─ Strand (e.g. "Numbers")
└─ Sub-Strand (e.g. "Whole Numbers up to 100")
└─ Lesson (1–2 per sub-strand)
├─ Variant: en
├─ Variant: sw
└─ Assessment (3–5 MCQs)


## Seed scope for Phase 1 launch

Do not try to seed all of CBC. Seed this slice:

| Level | Grade | Subjects |
|-------|-------|----------|
| Junior Secondary | 7, 8, 9 | Mathematics, Integrated Science, English, Kiswahili |
| Primary (upper) | 4, 5, 6 | Mathematics, Science and Technology, English, Kiswahili |
| Primary (lower) | 1, 2, 3 | Mathematics, English, Kiswahili |
| Senior Secondary | 10–12 | deferred to Phase 4 |

The admin UI must allow teachers to add strands/sub-strands beyond the seed.

## Seed script

Create `backend/scripts/seed_curriculum.py`:

```python
# Spec
# Usage: python3 -m scripts.seed_curriculum --file data/curriculum/seed_v1.json
#
# - Idempotent: re-running on the same file must not duplicate rows.
# - Upserts by (grade_id, subject_code) → grade_subjects,
#   (grade_subject_id, sort_order) → strands,
#   (strand_id, sort_order) → substrands.
# - Fails loudly if a subject_code is not in `subjects`.
# - Emits a summary table at the end: rows created / updated / skipped.
Seed file format: backend/data/curriculum/seed_v1.json

{
  "levels": [
    { "id": 1, "name": "Pre-Primary", "sort_order": 1 },
    { "id": 2, "name": "Primary", "sort_order": 2 },
    { "id": 3, "name": "Junior Secondary", "sort_order": 3 },
    { "id": 4, "name": "Senior Secondary", "sort_order": 4 }
  ],
  "grades": [
    { "id": 71, "level_id": 3, "name": "Grade 7", "sort_order": 7 }
  ],
  "subjects": [
    { "code": "mathematics", "name_en": "Mathematics", "name_sw": "Hisabati" }
  ],
  "grade_subjects": [
    { "grade_id": 71, "subject_code": "mathematics", "curriculum_ref": "KICD-JSS-MATH" }
  ],
  "strands": [
    {
      "grade_id": 71,
      "subject_code": "mathematics",
      "name": "Numbers",
      "sort_order": 1,
      "substrands": [
        {
          "name": "Whole Numbers",
          "sort_order": 1,
          "learning_outcomes": [
            "By the end of the sub-strand, the learner should be able to read and write whole numbers up to 1,000,000"
          ],
          "competencies": ["critical thinking", "communication"]
        }
      ]
    }
  ]
}


The agent should not invent curriculum content from scratch. Copy from
KICD's published curriculum designs (available at kicd.ac.ke). For Phase 1,
populate the JSON with:

Grade 7 Mathematics: 5 strands, each 3–6 sub-strands

Grade 7 Integrated Science: 5 strands, each 3–5 sub-strands

Grade 7 English: 4 strands

Grade 7 Kiswahili: 4 strands

Repeat the same shape for Grade 8 and Grade 9, and Grades 4–6.

If the source content isn't available, the agent must leave a
// TODO(source): populate from KICD design <ref> placeholder and continue —
do not fabricate learning outcomes.