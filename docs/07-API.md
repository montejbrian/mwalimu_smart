
---

### `docs/07-API.md`

```markdown
# 07 — API Contracts

## Conventions

- Base path `/api`. All responses JSON except SSE and static.
- Auth: `Authorization: Bearer <jwt>` unless marked *public*.
- Locale: `Accept-Language: en` (default) or `sw`.
- Errors: `{ "error": { "code": "STRING", "message": "human readable" } }`
  with proper HTTP status.
- Request IDs: echo `X-Request-Id` if provided, generate otherwise. Log in Pino.

## Error codes (canonical)
auth.missing 401
auth.invalid 401
auth.expired 401
auth.forbidden 403
not_found 404
validation 400
rate_limited 429
upstream.gemini 502
upstream.storage 502
internal 500


## Endpoint summary

### Auth (unchanged)
POST /api/auth/teacher/login
POST /api/auth/student/login (passwordless auto-register)
POST /api/auth/refresh
GET /api/auth/me


### Catalog (new)
GET /api/catalog/levels
GET /api/catalog/grades?level_id=:id
GET /api/catalog/subjects?grade_id=:id
GET /api/catalog/strands?grade_id=:id&subject=:code
GET /api/catalog/substrands?strand_id=:uuid


### Lessons (new)
GET /api/lessons/:id?lang=en
GET /api/lessons/:id/transcript?lang=en (text/plain; attachment)
GET /api/lessons/:id/assets (poll for render status)


### Progress (new)
POST /api/progress/:lesson_id/viewed
POST /api/progress/:lesson_id/assessment
GET /api/progress/mastery
GET /api/progress/recent


### Follow-ups (new)
POST /api/followups/lessons/:lesson_id/threads → { thread_id }
GET /api/followups/threads/:thread_id → message history
POST /api/followups/threads/:thread_id/messages → SSE stream


### Authoring (new; role=teacher|admin)
POST /api/authoring/jobs { scope, tier } → { job_ids: [...] }
GET /api/authoring/jobs?state= → list
GET /api/authoring/jobs/:id → status + log
POST /api/authoring/lessons/:id/approve
POST /api/authoring/lessons/:id/reject { feedback }
POST /api/authoring/lessons/:id/publish
POST /api/authoring/lessons/:id/regenerate { feedback }


### Curriculum admin (new; role=admin)
POST /api/admin/strands
PATCH /api/admin/strands/:id
POST /api/admin/substrands
PATCH /api/admin/substrands/:id


## SSE shape (follow-ups)

See `docs/06` for full event list. Key rules:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `X-Accel-Buffering: no` (for Nginx)
- Heartbeat `: ping\n\n` every 15s while open
- Server closes on `done` or `error`

## Rate limits (Phase 1 minimum)

- Follow-up messages: 20/min per student.
- Authoring enqueue: 50/hour per teacher.
- Catalog: 120/min per student.

Return `429` with `{error:{code:"rate_limited",retry_after_s:N}}`.

## Versioning

All new routes are under `/api`. If breaking change needed later, add `/api/v2`.
Do not rename existing `/api/auth/*` paths.