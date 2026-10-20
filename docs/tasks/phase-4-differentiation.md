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