# Spec — Neon Coast: Mission & Reputation Tracker

> Jira: NC-1. Status: **approved at GATE 1 (2026-11-24)**. The human accepted all recommendations D1–D19, with notes on
> D13 and D15. Tags `[Dx]` point to the decision table in §9. The answers are recorded in `docs/ai-decisions.md`.

## 1. Fixed business rules (from assignment PDF §3, not negotiable)

| ID | Input / situation | Expected system result |
|---|---|---|
| BR-1 | Completed mission | Add `cash_reward` and `reputation_reward` **once** to the correct player and crew. |
| BR-2 | Failed mission | Record the event but add **no** rewards. |
| BR-3 | Same `event_id` received again | Do not add a second record or repeat rewards. Return a clear duplicate response. |
| BR-4 | Unknown mission or player | Reject the event with a clear validation error. |
| BR-5 | App restart | Stored history, cash totals, and crew reputation remain available. |
| BR-6 | Reputation storage | Reputation totals are stored separately for each crew. |

Nothing else changes cash or reputation. There are no extra mechanics.

## 2. Domain and seed data (fictional)

### Crews
`Harbor Crew`, `Lantern Row`, `Static Choir`

### Mission catalog (7 missions; at least 5 required)

| mission_id | title | crew | description |
|---|---|---|---|
| M-10 | Fog Line Delivery | Harbor Crew | Move a sealed crate from the north pier to a waiting trawler before the fog lifts. |
| M-11 | Dockside Ledger | Harbor Crew | Recover a stolen shipping ledger from a customs shed. |
| M-12 | Tidewater Run | Harbor Crew | Escort a cargo boat through the channel past rival spotters. |
| M-20 | Paper Lanterns | Lantern Row | Deliver festival permits across the market district before dawn. |
| M-21 | Night Market Audit | Lantern Row | Count the night market's takings without tipping off the stallholders. |
| M-30 | Signal Ghost | Static Choir | Plant a relay on a rooftop antenna to boost a pirate radio broadcast. |
| M-31 | Dead Air | Static Choir | Silence a rival station's transmitter for one broadcast hour. |

### Player roster (seeded; there is no registration) `[D7]`

| player_id | name |
|---|---|
| P-01 | Nova Reyes |
| P-02 | Kit Marlow |
| P-03 | Juno Vance |
| P-04 | Ash Okafor |
| P-05 | Remy Sol |

Seed data lives in one module (`src/catalog.js`) and is inserted idempotently on startup.

## 3. Data model (SQLite) `[D1][D2]`

```sql
CREATE TABLE players  (player_id  TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE missions (mission_id TEXT PRIMARY KEY, title TEXT NOT NULL,
                       crew TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE events (
  seq                INTEGER PRIMARY KEY AUTOINCREMENT,   -- arrival order
  event_id           TEXT NOT NULL UNIQUE,                -- BR-3 enforced by the DB, not only in code
  player_id          TEXT NOT NULL REFERENCES players(player_id),
  mission_id         TEXT NOT NULL REFERENCES missions(mission_id),
  crew               TEXT NOT NULL,
  result             TEXT NOT NULL CHECK (result IN ('completed','failed')),
  cash_reward        INTEGER NOT NULL,   -- as reported by the engine
  reputation_reward  INTEGER NOT NULL,   -- as reported by the engine
  cash_awarded       INTEGER NOT NULL,   -- what the rules actually granted
  reputation_awarded INTEGER NOT NULL,
  timestamp          TEXT NOT NULL,      -- event time, canonical form (see below)
  received_at        TEXT NOT NULL,      -- server time, canonical form
  payload_hash       TEXT NOT NULL       -- for duplicate-conflict detection [D3]
);
```

- **Canonical timestamps.** Every stored timestamp is `new Date(input).toISOString()`, which is always
  `YYYY-MM-DDTHH:mm:ss.sssZ`. Text ordering is then chronological. API responses return the canonical form.
- **`payload_hash`** = SHA-256 (hex) of `JSON.stringify([event_id, player_id, mission_id, crew, result,
  cash_reward, reputation_reward, canonical_timestamp])`. Only the 8 known fields are hashed, in this fixed order.
  Key order and ignored extra fields `[D16]` therefore never change the hash.
- `event_id` is unique **globally**, not per player `[D8]`.
- Verified on 2026-11-24: `node:sqlite` works on Node v24.22.3 (`node:24-alpine`). A UNIQUE violation raises
  `ERR_SQLITE_ERROR` with `errcode` 2067 (`SQLITE_CONSTRAINT_UNIQUE`). That errcode is how the store detects a duplicate.

**Totals are derived, not stored separately** `[D11]`. Cash balance = `SUM(cash_awarded)`. Reputation by crew
= `SUM(reputation_awarded) GROUP BY crew`. Counts = `COUNT(*) GROUP BY result`. The dashboard can
therefore never drift from the saved events (acceptance criterion AC-4). Storing `*_awarded` per event
keeps the rule outcome explicit and auditable. It also leaves room for the interview change.

Each event is written in **one transaction**. The `UNIQUE(event_id)` constraint is the final guard
against double counting, even when two identical requests race.

## 4. API contract

Base path `/api`. JSON in, JSON out. No auth (local and fictional; listed as a limitation).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok" }`, used by Docker and the CI smoke test |
| GET | `/api/missions` | Mission catalog |
| GET | `/api/players` | Player summaries (shape in §4.5) |
| POST | `/api/events` | Submit one mission-result event |
| GET | `/api/players/:player_id/dashboard` | Dashboard data (JSON) |

### 4.1 POST /api/events — request

```json
{ "event_id": "RUN-1001", "player_id": "P-01", "mission_id": "M-12", "crew": "Harbor Crew",
  "result": "completed", "cash_reward": 500, "reputation_reward": 20,
  "timestamp": "2026-11-20T15:00:00Z" }
```

### 4.2 Validation rules (all errors are collected and returned together)

| Field | Rule | Error code |
|---|---|---|
| body | Must be a JSON object | `INVALID_JSON` / `INVALID_BODY` |
| any required field | Present and not null | `MISSING_FIELD` |
| `event_id` | String, 1–64 chars, `^[A-Za-z0-9_-]+$` | `INVALID_EVENT_ID` |
| `player_id` | Exists in the roster | `UNKNOWN_PLAYER` |
| `mission_id` | Exists in the catalog | `UNKNOWN_MISSION` |
| `crew` | Equals the mission's crew in the catalog `[D4]` | `CREW_MISMATCH` |
| `result` | `"completed"` or `"failed"` | `INVALID_RESULT` |
| `cash_reward` | Integer, 0 ≤ x ≤ 1,000,000 `[D5]` | `INVALID_CASH_REWARD` |
| `reputation_reward` | Integer, 0 ≤ x ≤ 1,000 `[D5]` | `INVALID_REPUTATION_REWARD` |
| `timestamp` | String matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$` that is a real date (e.g. not Feb 30) | `INVALID_TIMESTAMP` |
| extra fields | Ignored `[D16]` | — |

Processing order: (1) validate shape, values and references; (2) inside a transaction, insert. If the insert
hits the `event_id` UNIQUE constraint, it is a duplicate. **Rejected events are not stored** `[D10]`, so an
`event_id` that was rejected can be resubmitted once corrected.

### 4.3 POST /api/events — responses

| Case | HTTP | Body |
|---|---|---|
| Accepted, completed | 201 | `{"status":"accepted","event_id":"RUN-1001","result":"completed","awarded":{"cash":500,"reputation":20,"crew":"Harbor Crew"}}` |
| Accepted, failed (BR-2) | 201 | `{"status":"accepted","event_id":"RUN-1002","result":"failed","awarded":{"cash":0,"reputation":0,"crew":"Harbor Crew"}}` |
| Duplicate, same payload (BR-3) | 200 `[D3]` | `{"status":"duplicate","event_id":"RUN-1001","message":"Event RUN-1001 was already processed; no rewards were applied again."}` |
| Duplicate id, different payload | 409 `[D3]` | `{"status":"duplicate_conflict","event_id":"RUN-1001","message":"Event RUN-1001 was already processed with different data; this event was ignored."}` |
| Validation failure (BR-4 and others) | 400 | `{"status":"rejected","errors":[{"field":"player_id","code":"UNKNOWN_PLAYER","message":"Player 'P-99' does not exist."}]}` |

A failed event that reports non-zero rewards is **accepted and recorded with the reported values**, but
awards 0 `[D6]`.

### 4.4 GET /api/players/:player_id/dashboard

```json
{
  "player": { "player_id": "P-01", "name": "Nova Reyes" },
  "completed_count": 3, "failed_count": 1, "cash_balance": 1450,
  "reputation_by_crew": { "Harbor Crew": 40, "Lantern Row": 15, "Static Choir": 0 },
  "recent_history": [
    { "event_id": "RUN-1004", "mission_id": "M-20", "mission_title": "Paper Lanterns",
      "crew": "Lantern Row", "result": "completed", "cash_awarded": 450,
      "reputation_awarded": 15, "timestamp": "2026-11-20T16:10:00.000Z" }
  ]
}
```

- `reputation_by_crew` always lists every crew, with 0 when there is no reputation.
- `recent_history`: the latest 10 events `[D17]`, ordered by `timestamp` desc, then by arrival `seq` desc `[D9]`.
- Unknown player: 404 `{"status":"not_found","message":"Player 'P-99' does not exist."}`

### 4.5 Player summaries and the internal store contract (shared by the core and dashboard workers)

`GET /api/players` returns 200 with an array ordered by `player_id`:

```json
[ { "player_id": "P-01", "name": "Nova Reyes", "completed_count": 3, "failed_count": 1,
    "cash_balance": 1450, "total_reputation": 55 } ]
```

The core module `src/store.js` exports `createStore(dbPath)`, which returns an object with:

| Function | Returns |
|---|---|
| `submitEvent(rawBody)` | `{ httpStatus, body }`, exactly as in §4.3 |
| `getDashboard(playerId)` | The §4.4 object, or **`null`** if the player does not exist |
| `listPlayerSummaries()` | The §4.5 array (every roster player, including those with zero events) |
| `listMissions()` | The catalog array (`mission_id`, `title`, `crew`, `description`) |
| `close()` | Closes the DB handle (used by the restart tests) |

The dashboard router `src/dashboard/routes.js` exports `createDashboardRouter({ getDashboard, listPlayerSummaries })`.
It depends only on these two functions, so it can be built and tested with stubs.

## 5. UI behaviour (dashboard) `[D15]`

Server-rendered HTML with no client-side framework. It is readable without JavaScript.

- `GET /` lists players with their cash and completed/failed counts. Each player links to their dashboard.
- `GET /players/:player_id` shows the player's name, four stat tiles (completed, failed, cash,
  total reputation), a reputation-by-crew table (all crews), and a recent-history table (event, mission, crew,
  result, cash awarded, reputation awarded, time). Failed rows are visibly marked and show 0 awarded.
- Unknown player: a 404 page with a link back to `/`.
- **Look and feel (human request at GATE 1):** a polished dark neon theme (deep navy/black background, cyan and magenta
  accents, a subtle glow on stat tiles). It is CSS only, with no external fonts, images or scripts, and readable contrast.
- **Auto-refresh (human request at GATE 1):** both pages include `<meta http-equiv="refresh" content="5">`, so events posted
  by the simulator appear within about 5 seconds without a manual reload. The page shows a "Last updated" time.
- Empty state: a player with no events shows zeros and "No missions yet".

## 6. Simulator `[D12]`

`npm run simulate -- --url http://localhost:3000 --seed 42 --count 120`

- A deterministic PRNG (seeded) generates the events. Timestamps are `2026-11-20T12:00:00.000Z + i minutes`, so there is no
  wall-clock input. Event ids are `SIM-<seed>-<nnnn>` for valid events and `SIM-<seed>-BAD-<nn>` for invalid ones.
- `--count N` (default **120**) = the number of **unique valid** events. Each has a seeded random player, mission (its catalog
  crew), and rewards (cash 100–2,000 in steps of 50; reputation 5–50). Each is `failed` with probability 0.25, otherwise `completed`.
- On top of those, the simulator adds:
  - **Duplicates:** `floor(N/10)` re-sends (12 by default). Each is a byte-identical copy of an earlier **valid** event,
    inserted at a seeded position after its original. Only valid events are re-sent, because a re-sent invalid event would
    return 400, not `duplicate`.
  - **Invalid:** `max(5, floor(N/20))` events (6 by default), cycling through `UNKNOWN_PLAYER`, `UNKNOWN_MISSION`,
    `INVALID_CASH_REWARD` (negative), `CREW_MISMATCH`, `INVALID_RESULT`, and `INVALID_TIMESTAMP`.
- The default run submits **138** requests (120 + 12 + 6), which is ≥ 100. Against an empty DB the expected outcome is 120 accepted,
  12 duplicate, and 6 rejected.
- Output: counts of accepted, duplicate and rejected events, plus per-player expected totals computed locally from the
  rules. `--verify` fetches each dashboard and compares it with the expected totals (exit code 1 on mismatch).
- **Repeatability**: the same seed against an empty database gives identical responses and totals.
  Running the same seed again against the same database produces only duplicates and leaves the totals unchanged.

## 7. Configuration and runtime

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `./data/neon-coast.db` | SQLite file (Docker: `/data/neon-coast.db` on a named volume) |

## 8. Acceptance criteria (from PDF, made testable)

| AC | Criterion | Proven by (planned test) |
|---|---|---|
| AC-1 | API accepts valid mission results and rejects invalid ones with useful messages | `test/events.validation.test.js` |
| AC-2 | Rewards are given once for completed missions and never for failed ones | `test/rules.test.js`, `test/events.api.test.js` |
| AC-3 | Duplicate events cannot increase a player's cash or reputation | `test/duplicates.test.js` |
| AC-4 | Dashboard totals match saved events and remain correct after a restart | `test/persistence.test.js`, `test/flow.e2e.test.js` |
| AC-5 | The simulator submits 100+ events with repeatable results | `test/simulator.test.js` |
| AC-6 | Automated tests run on each push, and a documented local launch works | `.github/workflows/ci.yml`, README |
| AC-7 | The final report and GitHub/CI evidence are linked in Jira | Jira NC-1 comments and links |

---

## 9. Decisions (were open; all answered at GATE 1. Accepted = the recommendation)

**Outcome:** all accepted. D13: sub-tasks are used because the Subtask type exists in NC. D14: the board has only To Do / In
Progress / Done (no In Review column was added), so those three are used. D15: plus the dark neon theme and a 5-second meta
refresh. D19: `assignment.pdf` is gitignored.

**Product and rule interpretation**

| # | Question | Options | Recommendation |
|---|---|---|---|
| D3 | How should a repeated `event_id` be answered? | A) always 200 `duplicate`; B) always 409; C) 200 `duplicate` if the payload is identical, 409 `duplicate_conflict` if the same id has different data | **C.** Retries are normal and should not look like errors (200). A changed payload under a reused id is suspicious and is surfaced. Rewards are never re-applied in any case. |
| D4 | The event's `crew` differs from the mission's crew in the catalog | A) reject (`CREW_MISMATCH`); B) ignore the event's crew and use the catalog crew; C) trust the event's crew | **A.** It keeps reputation attached to the right crew (BR-1 "correct crew") and makes bad engine data visible. |
| D5 | Limits on reward values | A) non-negative integers only; B) non-negative integers plus sanity caps (cash ≤ 1,000,000, rep ≤ 1,000) | **B.** Caps are input validation, not a game mechanic. They catch corrupted values. |
| D6 | A failed event that reports non-zero rewards | A) accept, store the reported values, award 0; B) reject | **A.** BR-2 says "record the event". The engine may report the potential reward. |
| D7 | How players come to exist | A) fixed seeded roster (P-01…P-05); B) auto-create on first event; C) admin endpoint to add players | **A.** B contradicts BR-4 ("reject unknown player"). C is extra scope. |
| D8 | Scope of `event_id` uniqueness | A) global (any player); B) per player | **A.** The PDF says "same event_id received again", with no player qualifier. Global is the strict reading. |
| D9 | Order of recent history | A) by event `timestamp` desc; B) by arrival order desc | **A, with arrival order as tie-break.** History reflects when the mission happened. |
| D10 | Store rejected events? | A) no; B) yes, in a separate rejection log shown on the dashboard | **A.** Not required. Keep it small. Rejections are counted in the simulator output. |
| D16 | Unknown extra fields in the event | A) ignore; B) reject | **A.** It is tolerant of engine additions and does not affect any rule. |
| D17 | Size of "recent mission history" | 5 / 10 / 20 | **10** |

**Technical**

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | Stack | A) Node 24 LTS + Express 5 + built-in `node:sqlite` + `node:test` + supertest (plain JS, ESM); B) A in TypeScript; C) Python 3 + FastAPI + SQLite + pytest | **A.** Very few dependencies (one native-free SQLite in Node itself), fast CI, and easy to explain. TypeScript adds a build step without changing behaviour at this size. *You must be able to explain it in the interview, so pick the language you are most comfortable with.* |
| D2 | Persistence | A) SQLite file; B) JSON file; C) Postgres in compose | **A.** Transactions plus a UNIQUE constraint give real duplicate safety. It is one file on a Docker volume. |
| D11 | Totals | A) derived from the events table with SQL aggregates; B) separate counter tables updated with each event | **A.** One source of truth, so totals cannot drift from history. The data size is tiny. |
| D15 | Dashboard rendering | A) server-rendered HTML (no client JS); B) static page plus `fetch` to the JSON API; C) React SPA | **A.** It is the simplest option and can be tested with plain HTTP in the API-to-dashboard flow test. The JSON endpoint still exists for B-style use. |
| D12 | Simulator includes deliberately invalid events? | A) yes (about 5 of them); B) only valid, failed and duplicate events | **A.** "Realistic failures" then cover both failed missions and bad engine data. |

**Process**

| # | Question | Options | Recommendation |
|---|---|---|---|
| D13 | Jira structure in project NC | A) one Story (NC-1) only; B) Story NC-1 plus sub-tasks per work package (core API, simulator, dashboard, tests, CI/CD, report) | **B.** Commits reference the sub-task key (or NC-1), so the traceability is finer. Phase updates still go on NC-1. |
| D14 | Board workflow states | A) use what the new NC board has (likely To Do / In Progress / Done); B) you add "In Review" (and optionally "Testing") columns by hand **when you create the project** | **B** if you can. It shows a richer status history, and the Planning update moves the status right after GATE 1. I won't change board settings myself. |
| D19 | Commit `assignment.pdf`? | A) yes; B) no, gitignore it | **B.** It is the employer's document. |
| D18 | Branching | `main` ← PR ← `feature/NC-1-mission-tracker` ← worker branches `feature/NC-1-core`, `…-simulator`, `…-dashboard` (merged by me after review) | **As described.** `main` gets only an initial commit before the PR. |
