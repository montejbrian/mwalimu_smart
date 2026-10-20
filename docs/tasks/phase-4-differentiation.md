# Phase 4 — Differentiation

**Exit criterion:** Voice-in-lesson works; the "progressive whiteboard" streams
structured visual specs as tokens arrive; adaptive next-lesson recommendation
uses the mastery map; Kiswahili toggle persists across the session.

Estimated calendar: ongoing.

---

## P4.1 — Voice assistant embedded in lesson

**Context:** Reuse `backend/voice/*` and the existing WS.

**Files:**
- `LessonPlayerPage` embeds a mic button.
- Server scopes NLU to current lesson.

**Acceptance criteria:**
- [ ] Push-to-talk in the lesson page.
- [ ] Voice question answered with the same lesson-scoped prompt as text
      follow-ups.
- [ ] STT/TTS in `en-KE` and `sw-KE`.
- [ ] Transcript of the voice turn appears in the follow-up thread.

---

## P4.2 — Progressive whiteboard (novel)

**Context:** Instead of Manim for follow-ups, Gemini streams a sequence of
draw ops that the frontend animates progressively.

**Files:**
- `backend/followups/whiteboard.py` (new prompt returns op stream)
- `frontend/src/components/visuals/Whiteboard.jsx`

Op spec:

```json
{ "op": "write",     "text": "2x + 3 = 7" }
{ "op": "highlight", "target": "2x" }
{ "op": "arrow",     "from": "both sides", "to": "2x + 3 = 7" }
{ "op": "equation",  "latex": "x = 2" }
```

---

## P4.3 — SMS / USSD Follow-Up Stub (Africa's Talking)

*(Skipped per user request)*

---

## P4.4 — Adaptive Recommendations & Ask Tutor Page (/ask)

**Context:** Complete the Phase 4 exit criterion by providing adaptive mastery-map-driven
recommendations and a standalone Free-Form Ask Tutor page (`AskPage.jsx`) as specified
in `docs/08-FRONTEND.md` and `docs/01-ARCHITECTURE.md`.

**Files:**
- `backend/api/services/progress_service.js` (adaptive recommendation using mastery map weak-spots)
- `frontend/src/pages/AskPage.jsx` (free-form CBC AI Tutor with subject selector, voice push-to-talk, streaming whiteboard & visuals)
- `frontend/src/App.jsx` (mount `/ask` route)
- `frontend/src/components/layout/Layout.jsx` (add "Ask Tutor" / "Uliza Mwalimu" nav item)
- `backend/api/__tests__/p4_4_adaptive_and_ask.test.js`

**Acceptance criteria:**
- [ ] Adaptive next-lesson recommendation prioritizes sub-strands flagged `review_recommended` (< 60% mastery) in the student's mastery map before advancing to unstarted topics.
- [ ] Kiswahili toggle persists across browser sessions in `localStorage` and drives UI translations + API requests.
- [ ] `/ask` route mounts `AskPage.jsx`, allowing students to query any CBC subject/topic directly with streaming text, whiteboard op rendering, and push-to-talk voice input.
- [ ] All tests passing cleanly without blocking the student experience.

