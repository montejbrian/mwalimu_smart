
---

### `docs/tasks/PROGRESS.md` (starter file)

```markdown
# Task Progress

| Task | Status | Date | Notes |
|------|--------|------|-------|
| P1.1 | done | 2026-10-20 | Added migrations 0001–0005, migrate.js runner, idempotent seed_curriculum.py + seed_v1.json, and integration tests |
| P1.2 | done | 2026-10-20 | Added frozen config.js, canonical AppError/asyncHandler/errorHandler, X-Request-Id + Accept-Language middleware, role checks, and Vitest test suite |
| P1.3 | done | 2026-10-20 | Added catalog_service.js (5m TTL cache + mastery overlay), routes/catalog.js (/api/catalog/*), and integration tests |
| P1.4 | done | 2026-10-20 | Added lesson_service.js and routes/lessons.js (GET /api/lessons/:id, /transcript, /assets with EN/SW support and answer-hiding) + integration tests |
| P1.5 | done | 2026-10-20 | Added HomePage.jsx, BrowsePage.jsx, LevelCard.jsx, StrandList.jsx, MasteryBadge.jsx, store slices, and one-tap EN/SW toggle |
| P1.6 | done | 2026-10-20 | Added LessonPlayerPage.jsx, AssessmentPage.jsx, WatchTab.jsx, ReadTab.jsx, NotesTab.jsx, AssessmentBlock.jsx, FollowUpPanel.jsx + tests |
| P1.7 | done | 2026-10-20 | Added backend/authoring/{assessment_gen,publish,authoring_worker,lesson_store}.py, authoring_service.js, routes/authoring.js + tests |
| P1.8 | done | 2026-10-20 | Added AuthoringDashboard.jsx, ReviewQueue.jsx, teacher-gated routes in App.jsx, and Phase 1 end-to-end exit criterion tests |
| P2.1 | done | 2026-10-20 | Added migration 0007_assessment_attempts, progress_service.js (server-side grading, rolling-5 mastery, recommendation), routes/progress.js (/assessment, /viewed) + progress.test.js |
| P2.2 | done | 2026-10-20 | Implemented formative 1-at-a-time AssessmentBlock with step dots, batch submission, results screen (score, explanations, mastery delta, recommendation card, practice again) + assessment.js helpers + p2_2_assessment_ui.test.js |
| P2.3 | done | 2026-10-20 | Added GET /api/progress/mastery (strands x mastery heatmap + summary stats), GET /api/progress/recent ("What's next" recommendation + recent activity list), MyLearningPage.jsx, progressApi in api.js, App.jsx /me route, and p2_3_my_learning.test.js |
| P2.4 | done | 2026-10-20 | Added video playback resume at last_position_s, bilingual captions track, 15s throttled viewed updates, pure video.js helpers, and p2_4_video_playback.test.js |
| P2.5 | done | 2026-10-20 | Added standard-tier lazy render on first open with UNIQUE constraint idempotency, concurrent 10-student deduplication, completion poll hook, and p2_5_tier_promotion_lazy_render.test.js |
| P3.1 | done | 2026-10-20 | Added followups/{prompt.py,stream.py}, followup_service.js, routes/followups.js (/threads, /messages SSE), sse.js parser + client, FollowUpPanel.jsx, and p3_1_followups.test.js |
| P3.2 | done | 2026-10-20 | Added 5 CBC SVG templates, VisualRenderer.jsx, fast visual router (<500ms) with keyword heuristics + LLM fallback, SSE visual_queued/ready events, FF_TIER1_VISUALS gating, and p3_2_visual_templates.test.js |
| P3.3 | done | 2026-10-20 | Extended manim_worker to poll followup_visual_jobs, added Tier 2 router path, WebSocket broadcast in server.js (/ws/followups), Tier2PlaceholderCard with 3-min timeout + retry, and p3_3_tier2_followups.test.js |
| P3.4 | pending | — | — |