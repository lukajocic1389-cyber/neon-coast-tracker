# Task brief: simulator (Jira NC-4)

**Worker:** simulator · **Branch:** `feature/NC-1-simulator` · **Worktree:** `../NeonCoast-wt-simulator`
**Commit prefix:** `NC-4 <type>: <summary>`

Read first: `CLAUDE.md`, `AGENTS.md`, `spec.md` (§2 seed data, §4 API contract, **§6 simulator** is your main contract).
The API server is being built in parallel by another worker. Code against the **spec**, not against their code, and do not import from `src/store.js`, `src/app.js` or similar.

## Goal
A deterministic, seeded simulator that plays the role of the game engine. It submits mission-result events over HTTP, reports
what happened, and can verify the dashboards against totals it computes itself from the business rules.

## Files you own (create or edit ONLY these)
- `src/sim/prng.js`: a small seeded PRNG (for example mulberry32) plus helpers (`int(min,max)`, `pick(arr)`, `chance(p)`). No `Math.random` anywhere in the simulator.
- `src/sim/generator.js`: a pure function `generatePlan({ seed, count })` → an ordered array of submissions
  `{ kind: 'valid'|'duplicate'|'invalid', expectedStatus: 201|200|400, expectedCode?: string, event }`:
  - `count` (default 120) unique **valid** events: id `SIM-<seed>-<nnnn>` (4-digit, 1-based), a random player from `PLAYERS`, a random
    mission from `MISSIONS` with **its catalog crew**, cash 100–2,000 in steps of 50, reputation 5–50,
    `failed` with probability 0.25, otherwise `completed`. Timestamp `2026-11-20T12:00:00.000Z + i minutes` (canonical ISO).
  - `floor(count/10)` **duplicates**: each is a deep copy of an earlier *valid* event, placed at a seeded position strictly **after** its
    original. `expectedStatus` 200.
  - `max(5, floor(count/20))` **invalid** events, ids `SIM-<seed>-BAD-<nn>`. Each one is otherwise valid except for exactly one defect,
    cycling through: `UNKNOWN_PLAYER` (`P-99`), `UNKNOWN_MISSION` (`M-99`), `INVALID_CASH_REWARD` (negative), `CREW_MISMATCH`
    (a crew that is not the mission's), `INVALID_RESULT` (`"abandoned"`), `INVALID_TIMESTAMP` (`"2026-02-30T10:00:00Z"`).
    `expectedStatus` 400 with `expectedCode`. Place them at seeded positions.
  - Same `seed` and `count` → deep-equal output. Default total = 138.
- `src/sim/expected.js`: a pure function `computeExpected(plan)` → `{ [player_id]: { completed_count, failed_count, cash_balance,
  reputation_by_crew: { <every crew>: n } } }`. It applies the spec rules to the **valid** events only (completed adds the rewards
  once, failed adds nothing). Duplicates and invalid events contribute nothing. Include every player in `PLAYERS`, even with zero events.
- `src/sim/client.js`: `runPlan(plan, { baseUrl, fetchImpl = fetch })` submits **sequentially, in order** (order matters for
  duplicates) via `POST /api/events` and returns `{ sent, byStatus: { accepted, duplicate, duplicate_conflict, rejected, other },
  unexpected: [ { event_id, expectedStatus, actualStatus, body } ] }`. Also add `verifyDashboards(expected, { baseUrl, fetchImpl })`,
  which GETs `/api/players/:id/dashboard` for each player and returns a list of field-level mismatches.
- `scripts/simulate.js`: the CLI. `--url` (default `http://localhost:3000`), `--seed` (42), `--count` (120), `--verify`, `--json`.
  It prints a readable summary: requests sent, accepted, duplicate, rejected, and a per-player expected totals table. With `--verify` it
  also prints the dashboard comparison. `--json` prints one machine-readable JSON object instead. Exit codes: 0 = ok,
  1 = `--verify` found mismatches, 2 = could not reach the server. It notes in its output that `--verify` assumes the DB was empty
  before the run. Unexpected statuses (for example a second run where valid events come back as duplicates) are reported but do
  **not** change the exit code.
- `test/unit/sim-*.test.js`: your tests.

You may **import** `src/catalog.js` (read-only).

## Files you must NOT touch
Everything else, including `src/catalog.js`, `package.json` (the `simulate` script already exists), `spec.md`, `src/*.js`
outside `src/sim/`, `src/dashboard/**` and `public/**`. **No new dependencies.** Use the global `fetch` from Node 24.
Put any requests under "Requests to orchestrator".

## Tests you must write (node:test)
- Determinism: the same seed gives a deep-equal plan; a different seed gives a different plan.
- Counts: the default is 120 valid + 12 duplicate + 6 invalid = 138; the total is ≥ 100.
- Every duplicate comes after its original and is deep-equal to it.
- The invalid events cover all 6 codes, and each has exactly that one defect (for valid events: the crew matches the catalog, rewards are in range and in steps).
- Timestamps are canonical and increasing for valid events.
- `computeExpected` on a small hand-made plan gives hand-computed totals (completed + failed + duplicate + invalid).
- `runPlan` and `verifyDashboards` against a tiny stub server built with `node:http` on port 0 (not the real app): requests are sent in
  order, statuses are tallied, and a mismatch is detected.

## Definition of done
- `npm test` passes in this worktree. Paste the real summary lines into your report.
- `git diff --stat feature/NC-1-mission-tracker...HEAD` shows only files you own.
- Small commits with the `NC-4` prefix. Do not push, merge or touch Jira or GitHub.
- When completely done: append a `## Worker report` section to the end of THIS file, commit it, then run `touch .worker-done` in the worktree root.

## Requests to orchestrator
_(none yet)_
