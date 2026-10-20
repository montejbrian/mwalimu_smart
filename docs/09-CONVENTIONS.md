
---

### `docs/09-CONVENTIONS.md`

```markdown
# 09 — Conventions

## File and symbol naming

- Node: `camelCase.js` for files, `camelCase` for variables/functions,
  `PascalCase` for classes/react components.
- Python: `snake_case.py`, `snake_case` variables, `PascalCase` classes.
- Postgres: `snake_case` tables and columns. Plural table names.
- Mongo: `snake_case` collections, `camelCase` fields (existing style).
- React components: one component per file; file name matches component name.
- API routes: plural nouns, kebab only if needed (`/api/followups` not
  `/api/followUps`).

## Error handling

- **Never** let an uncaught promise reach the client as a 500. Wrap route
  handlers with `asyncHandler` (add to `utils/`).
- Log with Pino at `error` level before responding 500.
- Return canonical error codes from `docs/07`.
- In Python, use `structlog`-style key-value logging via the existing `logger`.
  Do not `print()` in production code.

## Async patterns

- All DB calls awaited. No fire-and-forget writes to Postgres.
- Fire-and-forget allowed only for: WS broadcasts, Mongo audit writes, cache
  invalidation — and only with a `.catch(log)`.
- BullMQ jobs must be idempotent. Key on `(scope, tier, input_hash)`.

## Testing protocol

- Node: `vitest` (add if not present). Tests in `backend/api/**/__tests__/`.
- Python: `pytest` (already). Tests in `backend/tests/`.
- Each new endpoint requires:
  - a happy-path test
  - a validation-error test
  - an auth test (missing/invalid token)
- Each service function with branching requires unit tests for each branch.
- Do **not** mock Postgres in integration tests — use a real test database
  (`TEST_DATABASE_URL`). Mock only external APIs (Gemini, ElevenLabs, S3).

## Migration files

- Postgres migrations live in `backend/migrations/NNNN_description.sql`.
- Number sequentially. Never edit a shipped migration.
- Each migration must include a `-- DOWN` section that reverses it.
- Add a tiny runner if one doesn't exist: `npm run db:migrate`.

## Env vars

- New vars go in `.env.example` with a comment and a sample value.
- In Python: `config/settings.py` (Pydantic).
- In Node: read once in `config.js`, export a frozen object. Do not read
  `process.env` throughout the codebase.

## Commit and PR protocol

- Commit messages: `<task-id>: <summary>` (e.g. `P1.3: add catalog endpoints`).
- PR description must include:
  - Task id and link to `docs/tasks/...`
  - "What changed" in 3 bullets
  - "How verified" with command output
  - "Blocked on" if any product decision needed
- Keep PRs under ~400 lines of diff. If a task exceeds this, split it and add
  a note in `PROGRESS.md`.

## Comment discipline

- `TODO(owner)`: something left undone. Must include the owner's role (e.g.
  `TODO(product)`).
- `DECISION(agent): <choice> — <rationale>`: an ambiguity call the agent made.
- `FIXME`: a known bug. Must link to a GitHub issue number once created.

## Anti-patterns (do not do these)

- Do not add a "just in case" abstraction layer.
- Do not refactor unrelated code in the same PR.
- Do not introduce a new state management lib, HTTP client, or styling system.
- Do not rewrite `auth.js`, `db.js`, or `server.js` wholesale. Extend them.
- Do not hardcode secrets, URLs, or model names. Always env vars.