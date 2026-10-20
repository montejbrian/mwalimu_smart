# AGENTS.md — Coding Assistant Operating Manual

You are working on **MwalimuSmart**, a CBC-aligned AI lesson platform for Kenyan
primary and secondary schools. Read this file completely before doing anything.

## Mission (one paragraph)

We are pivoting from an **on-demand AI generation tool** to a **curriculum-scoped
lesson library with AI follow-ups**. The student must never wait for content.
Pre-built lessons (script + transcript + video + assessment) are authored by a
batch pipeline and reviewed by teachers. The student browses, watches, is
assessed, and can then ask follow-up questions that either stream text instantly
or produce lightweight visuals. The follow-up system is our moat against YouTube
and raw ChatGPT.

## Non-negotiable rules

1. **The student path must never block on generation.** If a UI action would
   make the student wait more than 500ms for content, redesign it. Follow-up
   text streams; follow-up visuals arrive asynchronously; lessons are
   pre-published.
2. **Never mutate a published lesson in place.** Regeneration creates a new
   `version`; old versions are archived but retained.
3. **No hard diagnostic gates.** Assessment is formative. It records mastery;
   it does not block progression. The 80% pass threshold from the old P4 agent
   is retired for the student path. It may be reused for teacher-facing
   "quality check" of an authoring job.
4. **Postgres is the source of truth for curriculum and lessons.** MongoDB is
   for job queues, scene source, and follow-up threads. Never store a lesson
   body only in Mongo.
5. **All AI provider calls go through `backend/agents/` or `backend/voice/`.**
   Do not call Gemini directly from `routes/` or from frontend.
6. **Every endpoint that returns a lesson must accept `Accept-Language` and
   return `en` or `sw`.** Bilingual is a launch requirement, not a follow-up.
7. **Do not add a "University" or "Tertiary" option anywhere.** Scope is Pre-
   Primary, Primary, Junior Secondary, Senior Secondary only.
8. **Do not regenerate the docs.** If you find an inconsistency, open a
   `TODO(docs)` comment and continue.

## Reading order (do this before starting a task)

1. `docs/00-PRINCIPLES.md`      — why we exist
2. `docs/01-ARCHITECTURE.md`    — two-pipeline model
3. `docs/02-DATA-MODEL.md`      — schemas you will implement
4. `docs/09-CONVENTIONS.md`     — code style, patterns, test protocol
5. The specific task file you are assigned (e.g. `docs/tasks/phase-1-foundation.md`)

Consult the rest (`03`–`08`, `10`) on demand.

## Workflow per task

1. **Read the task's "Context", "Files to touch", and "Acceptance criteria"
   fully before touching code.**
2. **Write or update tests first** where the task involves logic. Existing
   tests must keep passing.
3. **Implement in small commits.** Commit message format:
   `<task-id>: <imperative summary>`
   e.g. `P1.3: add curriculum browse API`.
4. **Run the verification block** at the bottom of the task. Paste the output
   in your response. If any check fails, do not declare the task done.
5. **Update `docs/tasks/PROGRESS.md`** (create it if missing) with the task id,
   date, and a one-line status. This is how the next agent picks up.
6. **Stop.** Do not start the next task unless the user asks you to.

## What to do when the docs are ambiguous

- Prefer the option that respects the Non-negotiable rules above.
- Prefer the option that reduces student-visible latency.
- Prefer the option that is reversible (feature flag, new endpoint, not rewrite).
- Leave a `DECISION(agent): <choice> — <rationale>` comment in the PR body.
- Do **not** invent new product features. If a task needs a product decision,
  stop and ask.

## Reference: current repo state (pre-pivot)

The pre-pivot codebase already has, and you MUST reuse:

- `backend/api/server.js` — Express + WebSocket entry point
- `backend/api/routes/auth.js` — teacher/student JWT auth (KEEP)
- `backend/api/middleware/auth.js` — JWT verification (KEEP)
- `backend/api/db.js` — Postgres + Mongo clients (EXTEND, don't replace)
- `backend/agents/researcher.py` — RAG over pgvector (KEEP, becomes authoring)
- `backend/agents/scriptwriter.py` — CBC script generator (KEEP, authoring)
- `backend/agents/diagnostic.py` — MCQ generator (KEEP, become assessment gen)
- `backend/agents/animator.py` — Manim + ElevenLabs (KEEP, authoring)
- `backend/graph/graph.py` — LangGraph orchestration (KEEP, becomes authoring runner)
- `backend/rag/*` — ingest, retriever, pdf_converter (KEEP)
- `backend/voice/*` — voice assistant (KEEP, later embed in lesson)
- `backend/workers/manim_worker.py` — Mongo-polled render worker (KEEP, extend)
- `backend/utils/lesson_store.py` — Mongo helpers (REFACTOR)
- `frontend/src/lib/api.js`, `store.js` — HTTP + Zustand (KEEP)
- `frontend/src/components/layout/*` — shell (KEEP)

The pre-pivot codebase also has the following which you MUST remove or repurpose:

- `frontend/src/pages/LessonGeneratePage.jsx` — becomes authoring-only (teacher role)
- `frontend/src/pages/DiagnosticPage.jsx` — becomes `AssessmentPage` with formative UX
- The "pipeline progress bar" on the student lesson page — remove
- The `University` option in any education-level selector — remove
- The hard 80% gate + auto-rewrite in `diagnostic.py` — remove from student path

See `docs/10-MIGRATION.md` for the full move/rename/delete list.

## Verification protocol (run before declaring a task done)

```bash
npm test                                  # node + python test suite
cd backend && source venv/bin/activate && pytest -q
npm run lint 2>/dev/null || true          # eslint + ruff if configured