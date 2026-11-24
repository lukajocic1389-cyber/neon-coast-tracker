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
1. **Record core decisions in `docs/ai-decisions.md`** (I don't own it). The decisions are listed under "Decisions I made" in the
   Worker report below.
2. **Check `/static/styles.css` after merge.** `public/` belongs to the dashboard worker and doesn't exist on this branch, so
   `core-app.test.js` can only check that a missing static file is a plain 404. An integration test should confirm that the
   real stylesheet is served with 200.

## Worker report

**Worker:** core (NC-3) · **Branch:** `feature/NC-1-core` · **Date:** 2026-11-24

### What I built
| File | Contents |
|---|---|
| `src/rules.js` | `computeAward()`: `completed` → reported values, anything else → `{cash:0, reputation:0}`. The only place the reward rule lives. |
| `src/validation.js` | `validateEvent(body, { playersById, missionsById })` collects every §4.2 error in field order. It also exports `canonicalTimestamp()`, `isPlainObject()`, `EVENT_FIELDS`, and the limits. Lookups accept a `Map` or a plain object and only match own string keys, so `'constructor'` or `'__proto__'` is `UNKNOWN_PLAYER`. A non-object body gives `INVALID_BODY`, so `store.submitEvent(garbage)` returns 400 instead of throwing. |
| `src/db.js` | `openDb(dbPath)` creates the parent dir, opens a `DatabaseSync`, sets WAL, `foreign_keys=ON` and `busy_timeout=5000`, creates the §3 schema (`IF NOT EXISTS`), and upserts the seed in one transaction. Exports `SCHEMA`. |
| `src/store.js` | `createStore(dbPath)` → `{ submitEvent, getDashboard, listPlayerSummaries, listMissions, close }` per §4.5. `submitEvent` validates, then within `BEGIN IMMEDIATE`: checks for an existing `event_id` (200/409 by `payload_hash`), otherwise inserts with `computeAward` values and COMMITs. On any error it rolls back. A UNIQUE violation (`errcode 2067`) is turned into the same 200/409 duplicate response. All totals are SQL aggregates over `events`. All returned objects are plain objects with exactly the spec keys (`node:sqlite` rows are null-prototype). `close()` is idempotent. Exports `payloadHash()` and `HISTORY_LIMIT`. |
| `src/app.js` | `createApp({ store, dashboardRouter })`: `/api` router with `express.json({ strict: false })`, the five routes, JSON 404 for any other `/api` path, `/static` → `<repo>/public` (resolved from `import.meta.url`), optional dashboard router at `/` (mounted after `/api`, so it can't shadow it), else `GET /` returns `{"name":…,"players":"/api/players"}`. The error handler returns `INVALID_JSON` 400 for parse errors, passes other body-parser 4xx through as `{status:"error",message}`, and returns 500 `{"status":"error","message":"Internal server error."}` otherwise (logged server-side; no stack in the response). |
| `src/server.js` | Reads `PORT` (default 3000, validated) and `DB_PATH` (default `./data/neon-coast.db`). Logs `Neon Coast tracker listening on http://localhost:<port> (db: <path>)`, using the real bound port, so `PORT=0` works. On SIGINT/SIGTERM it closes the server (idle keep-alive connections dropped at once, all connections after 3 s), closes the store, and exits 0. It does not import the dashboard. |

### Tests (73 in total, including the 3 existing catalog tests)
- `core-rules.test.js` (4): completed, completed with zero rewards, failed, and failed with non-zero reported rewards → 0.
- `core-validation.test.js` (27): one test per §4.2 code; prototype-key and non-string lookups; several errors at once in
  field order; an empty object → 8× `MISSING_FIELD`; a missing crew or mission → no `CREW_MISMATCH`; boundaries (0, 1,000,000
  ok; 1,000,001, 1.5, `"500"`, booleans, objects, arrays rejected; reputation 0/1,000 ok, 1,001/1.5/`"20"` rejected); impossible dates
  (Feb 30, Feb 29 2026, month 13, 24:00, :60 min/sec); `.5`/`.50`/`.007` normalisation; leap day; extra fields ignored.
- `core-store.test.js` (21): `openDb` (nested dir, WAL, FKs, idempotent re-open, DB-level UNIQUE gives 2067); completed/failed
  totals; failed stores the reported values but awards 0, and the stored `payload_hash` equals an independent SHA-256 of the
  literal §3 array; an identical duplicate → 200 with totals and row count unchanged; key order, an
  extra field or `…:00Z` vs `…:00.000Z` still → 200; different data → 409 with totals unchanged; global `event_id` (D8); a failed event
  resent as completed → 409 with no reward; a rejected event is not stored and its id can be reused; `INVALID_BODY` without throwing; unknown player →
  `null`; an all-zero dashboard for a player with no events; per-crew reputation; history: 12 events → 10, `timestamp DESC, seq DESC`
  with out-of-order arrival and tied timestamps, `mission_title`; summaries for all 5 players, including zeros; summaries match
  dashboards; `listMissions` equals the catalog; **persistence: close and reopen the same file → identical dashboard and summaries, and
  a duplicate is still a duplicate**.
- `core-app.test.js` (17): every route's status, content type and exact body; 201/200/409/400; `INVALID_JSON`; `INVALID_BODY` for
  `[]`, `[{…}]`, `"hello"`, `42`, `null`, an empty body and `text/plain`; dashboard 200 shape and 404; unknown `/api` routes (incl. a wrong method)
  → 404 JSON; `GET /` pointer; a dashboard router mounted at `/` without shadowing `/api`; 500 without a stack; a missing static file → 404.
- `core-server.test.js` (1): spawns `src/server.js` with `PORT=0` and a temp `DB_PATH`, checks the log line, `/api/health` and a POST,
  SIGTERM → exit 0, **restarts the process** on the same DB file and finds the event in the dashboard, then SIGINT → exit 0.

All test DBs live under `os.tmpdir()` (`mkdtempSync`) and are removed afterwards.

**Final `npm test` in this worktree (macOS, Node v26.10.0):**
```
ℹ tests 73
ℹ suites 10
ℹ pass 73
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 245.161167
```
**The same suite on the contracted runtime** (`docker run node:24-alpine`, Node **v24.22.3**, read-only copy of this worktree):
```
v24.22.3
ℹ tests 73
ℹ pass 73
ℹ fail 0
```

**Manual run** (`PORT=3917 DB_PATH=<scratchpad>/manual/neon.db node src/server.js`, curl): health `{"status":"ok"}`, POST → 201
accepted, the same POST → 200 duplicate, `{bad` → 400 `INVALID_JSON`, `/api/players/P-99/dashboard` → 404, SIGTERM → `exit=0`, log
`Neon Coast tracker listening on http://localhost:3917 (db: …/manual/neon.db)` then `SIGTERM received, shutting down.`

**Quick mutation check** (each mutation reverted with `git checkout`; the worktree was clean afterwards):
| Mutation | Result |
|---|---|
| `rules.js`: failed also pays (`if (true)`) | 8 tests fail |
| `store.js`: `payload_hash` leaves out `cash_reward` | 1 test fails ("the same id with different data returns 409…") |
| `store.js`: `payload_hash` swaps `crew`/`result` order | 1 test fails (the pinned-hash assertion in "accepts a failed event…") |
| `app.js`: plain `express.json()` (strict) | 1 test fails: `"hello"`/`42`/`null` give `INVALID_JSON` instead of `INVALID_BODY` (this confirms Decision 1) |
| `store.js`: pre-check for an existing `event_id` disabled | **0 fail**, as expected: every duplicate is then caught by `UNIQUE` + errcode 2067 and gets the same 200/409. This shows the DB-level safety net works on its own. |
| `store.js`: pre-check **and** the 2067 handler disabled | 7 tests fail |

### Decisions I made (please record in `docs/ai-decisions.md`)
1. `express.json({ strict: false })`. The default strict parser turns a top-level `"str"`/`null`/`42` into a parse error
   (`INVALID_JSON`), but the brief wants `INVALID_BODY` for those. Arrays and objects behave the same either way.
2. `PRAGMA busy_timeout = 5000` in `openDb`, in addition to the brief's two pragmas. This makes a second connection (e.g. a test or a tool opening the
   same file) wait for the write lock instead of failing at once with `SQLITE_BUSY`. No behaviour change otherwise.
3. Timestamp "real date" check: V8 rolls `2026-02-30` over to Mar 2 and `24:00` to the next day, so the parsed UTC components
   are compared back against the input. `setUTCFullYear` is used so that years 0000–0099 aren't mapped to 19xx.
4. Duplicate check inside the transaction ends with `ROLLBACK`, not `COMMIT`, because nothing was written. The response is the same.
5. Response shapes the spec doesn't define (my choice): 500 → `{"status":"error","message":"Internal server error."}`; other
   body-parser 4xx (413 too large, 415 charset) → `{"status":"error","message":…}`; unknown `/api` route → `{"status":"not_found",
   "message":"No API route for GET /api/x."}`; `GET /` without a dashboard → `{"name":"Neon Coast: Mission & Reputation Tracker","players":"/api/players"}`.
6. Messages for the spec codes other than `UNKNOWN_PLAYER` are my wording; each names the bad value (for example `Mission 'M-99' does not exist.`,
   `Cash reward '500' is invalid: it must be a whole number from 0 to 1,000,000 (it was sent as text).`). Bad values over 80
   characters are truncated in messages. The three §4.3 messages (duplicate, conflict, unknown player) are copied verbatim.

### Known gaps and doubts
- The 2067 catch path is not exercised by a real concurrent race (`DatabaseSync` is synchronous, so two requests in one process
  can't interleave). The mutation check above shows the path works when the pre-check is skipped, but no test
  forces it. Adding a test hook only for this seemed like scope creep.
- The rollback-on-unexpected-error path (e.g. an FK failure) has no direct test, for the same reason (no fault injection).
- `/static` serving of a real file is not tested here (see request 2).
- Non-`/api` unknown paths fall back to Express's default HTML 404 (the brief only asks for JSON on `/api/*`). Once the dashboard router
  is mounted, it owns those.
- `MISSING_FIELD` means `undefined` or `null` only. An empty string is "present", so `""` for `event_id` gives `INVALID_EVENT_ID` and
  for `player_id` gives `UNKNOWN_PLAYER`. This is my reading of "present and not null".
- The roster and catalog are read from the DB once when the store is created. They only change through `src/catalog.js` plus a restart,
  which matches "seeded on startup".
- `listPlayerSummaries` lists every row in `players`. If a player were ever removed from `catalog.js`, the old row would stay in the DB
  (upsert only) and still be listed. Today that can't happen, but it is worth knowing.
- No new dependencies. No files outside my ownership list were changed (`git diff --stat feature/NC-1-mission-tracker...HEAD`
  shows only the 11 owned files, plus this brief after the report commit).
