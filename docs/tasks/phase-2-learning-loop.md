
---

### `docs/tasks/phase-2-learning-loop.md`

```markdown
# Phase 2 — Learning Loop

**Exit criterion:** A student can complete a lesson end-to-end: watch or read,
answer the assessment, get a score with explanations, see their mastery update,
and land on My Learning where they can see progress and pick the next lesson.

Estimated calendar: 3 weeks.

---

## P2.1 — Assessment submission + mastery

**Context:** `docs/05`. Server-side grading, rolling mastery, recommendation.

**Files:**
- `backend/api/services/progress_service.js`
- `backend/api/routes/progress.js`
- `backend/api/__tests__/progress.test.js`

**Acceptance criteria:**
- [ ] `POST /api/progress/:id/assessment` grades correctly against
      `assessment_questions.correct_index`.
- [ ] Returns per-question explanations in requested language.
- [ ] `student_mastery.mastery_score` updates as rolling avg of last 5.
- [ ] Client-submitted mastery values ignored.
- [ ] Empty answers array → `400 validation`.

---

## P2.2 — Assessment UI

**Context:** `docs/08` `AssessmentBlock` + `AssessmentPage`. Formative UX.

**Files:**
- `frontend/src/components/lesson/AssessmentBlock.jsx`
- `frontend/src/pages/AssessmentPage.jsx`

**Acceptance criteria:**
- [ ] One question at a time with progress indicator ("2 of 5").
- [ ] Immediate feedback per answer? **NO** — batch feedback after submit (so
      we measure true understanding). Show explanations on results screen.
- [ ] Results screen: score, per-question explanation, mastery delta,
      recommendation card.
- [ ] No "failed" / "pass mark" language. Use "mastered" / "review recommended".
- [ ] Retake allowed; counted in `attempts`, updates rolling mastery.

---

## P2.3 — My Learning page

**Files:**
- `frontend/src/pages/MyLearningPage.jsx`
- `GET /api/progress/mastery`, `GET /api/progress/recent` endpoints

**Acceptance criteria:**
- [ ] Heatmap: strands × mastery color.
- [ ] Recent activity list.
- [ ] Recommendation card ("What's next").
- [ ] Nothing on this page blocks progression.

---

## P2.4 — Video + captions playback with resume

**Files:**
- `frontend/src/components/lesson/WatchTab.jsx`
- `POST /api/progress/:id/viewed` accepts `position_s`

**Acceptance criteria:**
- [ ] Video resumes at `progress.last_position_s` on reopen.
- [ ] Captions track loads from `captions_url` when present.
- [ ] Throttle `viewed` posts to 1 every 15s.
- [ ] Unplayed video shows ReadTab default (already P1.6).

---

## P2.5 — Tier promotion + lazy render

**Context:** `docs/04`. Standard-tier lessons render on first open.

**Files:**
- Modify `lesson_service.js`: on first `GET /api/lessons/:id` if
  `tier=standard` and no video asset, enqueue a render job.
- Frontend: `WatchTab` shows "video is being prepared — start reading" and
  polls `/api/lessons/:id/assets` every 15s.

**Acceptance criteria:**
- [ ] Opening a standard-tier lesson without video enqueues exactly one
      render job (idempotency check via `(lesson_variant_id, type)` unique
      constraint).
- [ ] Poll surfaces the video within the same session when render completes.
- [ ] No duplicate renders even if 10 students open simultaneously.