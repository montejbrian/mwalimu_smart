# Phase 3 — Follow-ups (the moat)

**Exit criterion:** A student who just completed a lesson can ask a question,
see a streaming text answer in under 2s, and — when relevant — see a client-side
visual (Tier 1) inline within 500ms, or a Manim video (Tier 2) within 2 minutes.
Threads are saved and reloadable.

Estimated calendar: 4 weeks.

---

## P3.1 — SSE infra + text-only follow-ups

**Files:**
- `backend/followups/{prompt.py, stream.py}`
- `backend/api/services/followup_service.js`
- `backend/api/routes/followups.js`
- `frontend/src/lib/sse.js`
- `frontend/src/components/lesson/FollowUpPanel.jsx` (v1 text-only)
- `frontend/src/lib/sse.test.js`

**Acceptance criteria:**
- [ ] SSE streams tokens with first token < 1.5s warm.
- [ ] Prompt includes lesson objectives + script excerpt.
- [ ] Thread persisted on first message; `POST /api/followups/lessons/:id/threads`
      returns existing thread if one exists.
- [ ] `GET /api/followups/threads/:id` returns full history.
- [ ] `sse.js` unit tests cover chunk boundary splits and `event:`/`data:`
      parsing.
- [ ] Follow-up panel visible on lesson page below assessment.

---

## P3.2 — Tier 1 visual templates

**Context:** `docs/06`. Five templates + router.

**Files:**
- `backend/followups/templates.py`
- `backend/followups/visual_router.py`
- `backend/followups/prompt.py` (classifier prompt)
- `frontend/src/components/visuals/VisualRenderer.jsx`
- `frontend/src/components/visuals/templates/{EquationBalance,NumberLine,FractionBar,Flowchart,GraphPlot}.jsx`
- `frontend/src/components/visuals/templates/*.test.jsx`

**Acceptance criteria:**
- [ ] Each template renders correctly from a valid params object (unit test per
      template).
- [ ] Router emits `visual_queued` + `visual_ready` for a matching question in
      < 500ms in dev.
- [ ] `no_match` falls through to text-only (or Tier 2 if enabled) without
      blocking the stream.
- [ ] Frontend inline-renders the visual inside the assistant bubble.
- [ ] Feature flag `FF_TIER1_VISUALS` gates this — when off, behaviour identical
      to P3.1.

---

## P3.3 — Tier 2 Manim follow-up queue

**Files:**
- `backend/workers/manim_worker.py` (extend to poll `followup_visual_jobs`)
- `backend/followups/visual_router.py` (Tier 2 path)
- WS broadcast in `server.js` (`followup_visual_ready` event)
- `FollowUpPanel` placeholder + WS listener

**Acceptance criteria:**
- [ ] A Tier 2 request inserts a job, streams text immediately.
- [ ] Placeholder card shows within 200ms of stream start.
- [ ] Manim worker picks up, renders, uploads, updates job state, WS-broadcasts.
- [ ] Frontend replaces placeholder with video on WS event.
- [ ] Timeout after 3 minutes → "visual not available" + retry button.
- [ ] Failed renders log the error and surface a clean message.

---

## P3.4 — Thread history + visual gallery

**Files:**
- `MyLearningPage` shows "Saved Q&A" per lesson.
- Lesson page shows previous threads when reopened.

**Acceptance criteria:**
- [ ] Reopening a lesson loads prior thread messages.
- [ ] Prior Tier 1 visuals re-render from stored `visual_spec`.
- [ ] Prior Tier 2 videos play from stored `asset_url`.
- [ ] My Learning lists lessons with saved threads.