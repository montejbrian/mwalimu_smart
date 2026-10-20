# 08 — Frontend Map

## Routes (`react-router-dom`)
/login LoginPage
/ HomePage
/browse BrowsePage
/browse/:grade/:subject BrowsePage (deep link)
/lesson/:lesson_id LessonPlayerPage
/lesson/:lesson_id/assess AssessmentPage
/me MyLearningPage
/ask AskPage (Phase 4)
/authoring AuthoringDashboard (teacher only)
/authoring/review ReviewQueue (teacher only)
/authoring/review/:lesson_id ReviewQueue detail

## Zustand store slices

Extend `frontend/src/lib/store.js`:

```js
useAuthStore        // existing — user, token, refresh
useCatalogStore     // NEW — cached levels/grades/subjects/strands/substrands
useLessonStore      // NEW — current lesson, progress
useFollowUpStore    // NEW — threads, messages, streaming state
useAuthoringStore   // NEW — jobs, review queue (teacher)