# 10 — Migration Plan (from pre-pivot repo)

## Delete

| Path | Reason |
|------|--------|
| `frontend/src/pages/LessonGeneratePage.jsx` | Move to `pages/authoring/` and gate to teacher |
| `frontend/src/pages/DiagnosticPage.jsx` | Replaced by `AssessmentPage.jsx` (formative) |
| Any `University` / `Tertiary` UI string | Out of scope |
| Pipeline progress bar component | Student should not see generation |

Do not delete these aggressively — move, don't nuke. Git history is the safety
net; the working tree should stay green.

## Rename / repurpose

| Old | New | Notes |
|-----|-----|-------|
| `frontend/src/pages/DashboardPage.jsx` | `HomePage.jsx` | Rewrite contents |
| `frontend/src/pages/HistoryPage.jsx` | `MyLearningPage.jsx` | Mastery + completed |
| `frontend/src/pages/LessonViewPage.jsx` | `LessonPlayerPage.jsx` | New tabs |
| `backend/api/routes/` (only auth existed) | add `catalog.js`, `lessons.js`, `progress.js`, `followups.js`, `authoring.js` | — |
| `backend/utils/lesson_store.py` | `backend/authoring/lesson_store.py` | Mongo helpers for authoring |
| Mongo `lesson_jobs` | `authoring_jobs` | Migration script copies data |
| `backend/agents/diagnostic.py` | `backend/authoring/assessment_gen.py` | Remove gate loop |

## Keep untouched

- `backend/api/server.js`, `db.js`, `python_bridge.js`
- `backend/api/middleware/auth.js`, `routes/auth.js`
- `backend/rag/*` (except add fields — see `docs/03`)
- `backend/agents/researcher.py`, `scriptwriter.py`, `animator.py`
- `backend/graph/state.py` (extend), `graph.py` (split into authoring/render)
- `backend/voice/*`
- `backend/workers/manim_worker.py` (extend to handle `followup_visual_jobs`)
- `frontend/src/lib/api.js`, `store.js` (extend)
- `frontend/src/components/layout/*`
- `frontend/src/index.css` (extend tokens)

## Database migration order

1. `0001_education_graph.sql` — levels, grades, subjects, grade_subjects,
   strands, substrands.
2. `0002_lessons.sql` — lessons, lesson_variants, lesson_assets,
   assessment_questions.
3. `0003_progress.sql` — student_progress, student_mastery.
4. `0004_followups.sql` — threads, messages.
5. `0005_rag_align.sql` — add substrand_id/subject_code to `kicd_chunks`.
6. `0006_mongo_rename.js` — `lesson_jobs` → `authoring_jobs`.

## Config / env changes

Add to `.env.example`:
