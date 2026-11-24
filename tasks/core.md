# Task brief: core (Jira NC-3)

**Worker:** core · **Branch:** `feature/NC-1-core` · **Worktree:** `../NeonCoast-wt-core`
**Commit prefix:** `NC-3 <type>: <summary>` (for example `NC-3 feat: add event validation`)

Read first: `CLAUDE.md`, `AGENTS.md`, `spec.md` (§1–§4 and §7 are your contract). This brief adds detail but never overrides the spec.

## Goal
Build the backend: SQLite data model, validation, progression rules, the store, the Express app with the `/api` routes, and the
server entry point. Write unit tests for all of it.

## Files you own (create or edit ONLY these)
- `src/db.js`: `openDb(dbPath)` creates the parent dir if missing, opens a `DatabaseSync`, sets `PRAGMA journal_mode=WAL` and
  `PRAGMA foreign_keys=ON`, creates the schema from spec §3 if absent, and upserts the seed data from `src/catalog.js`
  (`INSERT … ON CONFLICT DO UPDATE`). Returns the db handle.
- `src/rules.js`: a pure function `computeAward({ result, cash_reward, reputation_reward })` → `{ cash, reputation }`.
  `completed` → the reported values; `failed` → `{ cash: 0, reputation: 0 }`. This is the **only** place the reward rule lives.
- `src/validation.js`: a pure function `validateEvent(body, { playersById, missionsById })` →
  `{ ok: true, event }` (normalised: canonical timestamp, only the 8 known fields) or `{ ok: false, errors: [{ field, code, message }] }`.
  It collects **all** errors (spec §4.2). Check `CREW_MISMATCH` only when the mission exists. A missing field gives `MISSING_FIELD`
  for that field and no further checks on it. Messages are human-readable and name the bad value, e.g. `Player 'P-99' does not exist.`
- `src/store.js`: `createStore(dbPath)` with `submitEvent`, `getDashboard`, `listPlayerSummaries`, `listMissions`, `close`
  exactly as in spec §4.5:
  - `submitEvent(rawBody)` → `{ httpStatus, body }` per spec §4.3. Validate, then within `BEGIN IMMEDIATE … COMMIT`: look up an
    existing row by `event_id`. If one exists, return a duplicate (200 if `payload_hash` matches, 409 otherwise). If not,
    insert with `cash_awarded` and `reputation_awarded` from `computeAward`. Also catch a UNIQUE violation on insert
    (`err.errcode === 2067`) and treat it as a duplicate, which is the DB-level safety net. Roll back on any error.
  - `payload_hash` and canonical timestamps exactly as spec §3.
  - Totals are **derived by SQL aggregates** over `events`. Do not add counter tables.
  - `getDashboard(playerId)` → the §4.4 object or `null`. `reputation_by_crew` includes every crew in `CREWS` (0 if none).
    `recent_history` holds 10 entries ordered by `timestamp DESC, seq DESC` and includes `mission_title`.
- `src/app.js`: `createApp({ store, dashboardRouter } = {})` → an Express 5 app:
  - `express.json()`. A malformed JSON body → 400 `{"status":"rejected","errors":[{"field":"body","code":"INVALID_JSON","message":…}]}`.
    A non-object body (array, string, null) → 400 with code `INVALID_BODY`.
  - Routes `GET /api/health`, `GET /api/missions`, `GET /api/players`, `POST /api/events`, and
    `GET /api/players/:player_id/dashboard` (404 shape per §4.4).
  - `app.use('/static', express.static(<repo>/public))`, so the dashboard CSS is served at `/static/styles.css`.
  - If `dashboardRouter` is given, `app.use('/', dashboardRouter)`. Otherwise `GET /` returns a plain JSON pointer to `/api/players`.
  - Unknown `/api/*` routes → 404 JSON. Unhandled errors → 500 JSON without stack traces.
- `src/server.js`: reads `PORT` (default 3000) and `DB_PATH` (default `./data/neon-coast.db`), creates the store and app, and
  listens. It logs `Neon Coast tracker listening on http://localhost:<port> (db: <path>)`. On SIGINT/SIGTERM it closes the server
  and the store, then exits 0. For now it does NOT import the dashboard; the orchestrator wires that up after merge.
- `test/unit/core-*.test.js`: your tests (see below).

## Files you must NOT touch
Everything else, including `src/catalog.js`, `package.json`, `package-lock.json`, `spec.md`, `src/dashboard/**`, `src/sim/**`,
`scripts/**` and `public/**`. If you need a change there, write it under "Requests to orchestrator" below and carry on.
**Do not add dependencies.** Express 5 and supertest are already installed.

## Tests you must write (node:test + supertest, temp DB files in `os.tmpdir()`)
- rules: completed vs failed, including a failed event with non-zero reported rewards → 0.
- validation: one test per error code in spec §4.2; several errors collected at once; a valid event normalises its timestamp;
  extra fields are ignored; boundaries (0 is ok, 1,000,000 is ok, 1,000,001 is rejected, 1.5 is rejected, "500" as a string is rejected).
- store: accept completed (totals rise); accept failed (counts rise, totals unchanged); an identical duplicate → 200 and totals
  unchanged; same id with different data → 409 and totals unchanged; rejected → not stored; dashboard for an unknown
  player → null; reputation is split per crew; history order and limit of 10; **reopen the same DB file with a new store →
  identical dashboard** (persistence).
- app: each route's status and shape, INVALID_JSON, INVALID_BODY, unknown player dashboard 404.

## Definition of done
- `npm test` passes in this worktree. Paste the real final summary lines into your report.
- `git diff --stat feature/NC-1-mission-tracker...HEAD` shows only files you own.
- Small commits with the `NC-3` prefix. Do not push, merge or touch Jira or GitHub.
- When completely done: append a `## Worker report` section to the end of THIS file (what you built, test output, gaps,
  doubts), commit it, then run `touch .worker-done` in the worktree root (it is gitignored). That file is your "finished" signal.

## Requests to orchestrator
_(none yet)_
