
---

### `docs/00-PRINCIPLES.md`

```markdown
# 00 — Product Principles

## Why we exist

Students in Kenya have three options today:

1. **YouTube** — high-quality but unscoped. A student searching "linear equations"
   lands on a random US high-school video that assumes different prior knowledge,
   different notation, and different assessment style. No progression, no
   curriculum mapping, no bilingual support.
2. **Raw ChatGPT/Gemini** — a blank page. It will answer any question but has no
   memory of what the student just studied, no curriculum context, and cannot
   reliably draw a synced visual.
3. **Textbooks** — correct but static, no narration, no interactivity, no
   follow-up.

MwalimuSmart's wedge is **curriculum-scoped, teacher-reviewed, bilingual,
voice-synced lessons with a tutor that already knows what you just learned.**

## What "unique" concretely means

Every design decision must reinforce at least one of these five properties:

| # | Property | Test |
|---|----------|------|
| 1 | **Curriculum-scoped** | Can the student get lost? If yes, the UI is wrong. Every lesson lives under a specific grade → subject → strand → sub-strand. |
| 2 | **Teacher-reviewed** | Does this content exist because a human approved it? If not, it must be visibly marked as unverified. |
| 3 | **Bilingual** | Can the student switch EN ↔ SW on any lesson? If not, the feature is incomplete. |
| 4 | **Context-aware follow-ups** | Does the follow-up system know which lesson the student is in? It must. |
| 5 | **Formative, not punitive assessment** | Does assessment gate progress? It must not. It records mastery and recommends. |

## Non-goals

- **Not a general chatbot.** The free-form Ask page is a fallback, not the product.
- **Not a test-prep mill.** We do not optimize for exam scores; we optimize for
  understanding, which the mastery map reflects.
- **Not a video host.** Video is one artifact of a lesson; the script, transcript,
  assessment, and follow-up thread are co-equal.
- **Not a university platform.** We do not serve tertiary education. The CBC
  graph stops at Grade 12.
- **Not real-time generation for students.** Generation is an authoring concern.
  Student-facing generation is limited to follow-ups, and even then, text
  streams before visuals render.

## The hero of the lesson page

YouTube makes video the hero. We do not. **The hero is the follow-up panel.**
The video is a lecture; the follow-up is office hours. The layout, CTAs, and
copy should all point students toward asking questions after they've watched
and been assessed.

## Design principles (for UI tasks)

- **Zero-wait illusions.** Every screen that could be slow shows the fastest
  useful thing first: script before video, text before visual, summary before
  full assessment result.
- **Show the curriculum breadcrumb everywhere.** `Grade 7 · Integrated Science ·
  Mixtures · Separating Mixtures` must be visible on the lesson page.
- **Mastery is visible but not punitive.** Badges: `new`, `in progress`,
  `mastered`, `review recommended`. No red X, no "failed".
- **Kiswahili toggle is one tap away.** Not buried in settings.

## What we will never ship

- A "Generate a lesson" button for students.
- A progress bar showing AI pipeline stages to a student.
- A hard gate that prevents a student from moving to the next lesson.
- A lesson without a curriculum path.
- A follow-up that requires waiting for a video render before showing text.

# 01 — Architecture: Two Pipelines

The pivot's central idea: **separate authoring from learning.**
┌───────────────────────────────────────────────────────────────┐
│ AUTHORING PIPELINE (batch, minutes OK, teacher-triggered) │
│ │
│ Curriculum scope picker (admin UI) │
│ │ │
│ ▼ │
│ Authoring job queue (BullMQ / Mongo) │
│ │ │
│ ▼ │
│ authoring_worker.py ──▶ LangGraph graph.py │
│ │ │ │
│ │ ├─ researcher.py (RAG) │
│ │ ├─ scriptwriter.py (EN + SW) │
│ │ ├─ assessment_gen.py (MCQs) │
│ │ └─ animator.py (Manim) │
│ │ │
│ ▼ │
│ Draft lesson written to Postgres (status = draft) │
│ │ │
│ ▼ │
│ Teacher review UI → approve / edit / regenerate │
│ │ │
│ ▼ │
│ status = published → visible to students │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ LEARNING PIPELINE (real-time, must feel instant) │
│ │
│ Student login → Browse (level/subject/strand) │
│ │ │
│ ▼ │
│ GET /api/catalog/... (reads Postgres only, cached) │
│ │ │
│ ▼ │
│ GET /api/lessons/:id (returns script + transcript + │
│ video URL + assessment) │
│ │ │
│ ▼ │
│ Watch / Read / Notes tabs → End-of-lesson assessment │
│ │ │
│ ▼ │
│ POST /api/progress/... → mastery updated │
│ │ │
│ ▼ │
│ Follow-up panel │
│ ├─ Text-only: SSE stream from Gemini (~1s first token) │
│ └─ With visuals: three-tier strategy (see docs/06) │
└───────────────────────────────────────────────────────────────┘


## Component layout (backend)
backend/
├── api/
│ ├── server.js (unchanged entry point)
│ ├── routes/
│ │ ├── auth.js (unchanged)
│ │ ├── catalog.js NEW — levels, subjects, strands, substrands
│ │ ├── lessons.js NEW — get lesson, transcript, assessment
│ │ ├── progress.js NEW — mark viewed, submit assessment, mastery
│ │ ├── followups.js NEW — SSE stream, visual request, thread read
│ │ └── authoring.js NEW — admin: enqueue, review, publish
│ ├── services/
│ │ ├── catalog_service.js NEW — Postgres read helpers
│ │ ├── lesson_service.js NEW
│ │ ├── progress_service.js NEW
│ │ └── followup_service.js NEW — wraps Gemini streaming + visual tier
│ └── middleware/
│ └── auth.js (unchanged, add role check helper)
│
├── authoring/ NEW — batch pipeline
│ ├── authoring_worker.py NEW — job consumer, calls graph.py
│ ├── assessment_gen.py NEW — MCQ + explanation generation
│ └── publish.py NEW — draft → published transition
│
├── agents/ (existing, becomes authoring-only)
├── graph/ (existing, imported by authoring_worker)
├── rag/ (existing, unchanged)
├── voice/ (existing, embed in lesson later)
├── workers/
│ └── manim_worker.py (existing, extend for follow-up tier-2 jobs)
│
├── followups/ NEW
│ ├── prompt.py — lesson-scoped prompt builder
│ ├── stream.py — SSE writer
│ ├── visual_router.py — decides Tier 1 / 2 / 3
│ └── templates.py — Tier 1 template registry
│
└── config/settings.py (extend with new env vars)


## Component layout (frontend)
frontend/src/
├── pages/
│ ├── LoginPage.jsx (unchanged)
│ ├── HomePage.jsx NEW — replaces DashboardPage
│ ├── BrowsePage.jsx NEW — level → subject → strand
│ ├── LessonPlayerPage.jsx NEW — replaces LessonViewPage
│ ├── AssessmentPage.jsx NEW — replaces DiagnosticPage, formative
│ ├── MyLearningPage.jsx NEW — replaces HistoryPage
│ ├── AskPage.jsx NEW — free-form Q&A (optional, Phase 4)
│ └── authoring/
│ ├── AuthoringDashboard.jsx NEW — scope picker + job queue
│ └── ReviewQueue.jsx NEW — approve / edit / regenerate
│
├── components/
│ ├── lesson/
│ │ ├── WatchTab.jsx NEW
│ │ ├── ReadTab.jsx NEW
│ │ ├── NotesTab.jsx NEW
│ │ ├── FollowUpPanel.jsx NEW — THE HERO
│ │ └── AssessmentBlock.jsx NEW
│ ├── visuals/
│ │ ├── VisualRenderer.jsx NEW — dispatches by template_id
│ │ └── templates/ NEW — one file per template
│ │ ├── EquationBalance.jsx
│ │ ├── NumberLine.jsx
│ │ ├── FractionBar.jsx
│ │ ├── Flowchart.jsx
│ │ └── GraphPlot.jsx
│ └── catalog/
│ ├── LevelCard.jsx NEW
│ ├── StrandList.jsx NEW
│ └── MasteryBadge.jsx NEW
│
└── lib/
├── api.js (extend with new endpoints)
├── sse.js NEW — EventSource wrapper
└── store.js (extend slices)


## Data flow: student opens a lesson

1. `BrowsePage` → `GET /api/catalog/strands?grade=7&subject=integrated_science`
   → Postgres → JSON list with mastery badges from `student_mastery`.
2. Student taps a sub-strand → `GET /api/lessons/:lesson_id?lang=en`
   → returns script, transcript URL, video URL (may be `null` while rendering),
   assessment questions, current progress.
3. `LessonPlayerPage` mounts, defaults to `ReadTab` if `video_url` is null,
   else `WatchTab`.
4. `POST /api/progress/:lesson_id/viewed` on first play.
5. Student finishes assessment → `POST /api/progress/:lesson_id/assessment`
   with answers → server grades, updates `student_mastery`, returns result.
6. `FollowUpPanel` opens below. Student types a question, optionally toggles
   "Explain with visuals".

## Failure modes and fallbacks

| Failure | Fallback |
|---------|----------|
| Video not rendered yet | `ReadTab` default; banner "video is being prepared"; poll `GET /api/lessons/:id/assets` every 15s while tab is open |
| RAG has no chunks for sub-strand | Scriptwriter falls back to general CBC knowledge (existing behavior) |
| Gemini follow-up fails | SSE emits `event: error` with a canned apologetic text; UI shows retry |
| Tier 1 visual match fails | Text streams immediately, Tier 2 queued, UI shows "preparing visual" placeholder |
| Manim render fails | Job marked failed; UI hides placeholder after 3 min and shows "visual not available" |

## What the agent must NOT do during refactor

- Do not delete existing `agents/*.py` — they are reused by `authoring_worker.py`.
- Do not touch `rag/ingest.py` except to add sub-strand metadata columns.
- Do not rewrite the auth flow. It works.
- Do not introduce a second job queue. Pick BullMQ OR Mongo-polling and extend.
  Decision: **BullMQ + Redis** (see `docs/04`).