---

### `docs/06-FOLLOWUPS.md`

```markdown
# 06 — Follow-ups (the moat)

## Purpose

A student just watched "Separating Mixtures" and got 3/5. They ask: *"Why do we
use a filter and not a sieve?"* YouTube can't answer. ChatGPT doesn't know what
they just watched. We do. This is the differentiator.

## Endpoint

with_visuals = true
        │
        ▼
   visual_router.py decides:
        │
        ├─ TIER 1: template match (target < 500ms)
        │    - Gemini called with a *classifier* prompt:
        │      "Given this question and template registry, return
        │       {template_id, params} or {no_match:true}."
        │    - If match: emit `visual_queued` with tier=1 and template_id,
        │      then `visual_ready` with params. Frontend renders client-side.
        │    - Templates live in backend/followups/templates.py and
        │      frontend/src/components/visuals/templates/.
        │
        ├─ TIER 2: Manim follow-up (target < 2 min)
        │    - Text streams immediately.
        │    - Insert `followup_visual_jobs` in Mongo, state=queued.
        │    - Manim worker picks it up, renders, uploads to storage,
        │      updates state=ready, then server pushes via WS to the student
        │      (reuse existing WS connection from server.js).
        │    - Frontend shows a "preparing visual" card; on WS push, replaces
        │      with the MP4 player.
        │
        └─ TIER 3: not implemented in Phase 3. Reserve. Full codegen only
             when the student explicitly requests it and Tier 1/2 can't serve.