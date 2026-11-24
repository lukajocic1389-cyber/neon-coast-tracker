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
- Nothing blocking. Please confirm two decisions. If you accept them, record them in `docs/ai-decisions.md`, which is not mine to edit.
  1. **The `expectedCode` inclusion check** in `runPlan`'s `unexpected`. See Worker report, decision 1.
  2. **Exit code 64 for bad command-line usage.** See Worker report, decision 2.

## Worker report

**Worker:** simulator (Claude Code, Opus 5.5) · **Jira:** NC-4 · **Branch:** `feature/NC-1-simulator`

### What I built
- `src/sim/prng.js`: mulberry32 with `next`, `int(min,max)` (inclusive), `pick`, `chance`. Integer seeds only; `'42'` and `42`
  give the same stream. No `Math.random` in `src/sim/` or `scripts/`.
- `src/sim/generator.js`: `generatePlan({ seed = 42, count = 120 })`. The PRNG is consumed in a fixed order (valid events,
  then duplicates, then invalid events), so the output is stable.
  - **Valid:** `SIM-<seed>-<nnnn>`, mission with its catalog crew, cash `100 + 50·int(0,38)`, reputation 5–50, failed with p = 0.25,
    timestamp `2026-11-20T12:00:00.000Z + i min` (canonical).
  - **Duplicates:** `structuredClone` of a seeded valid event (the same original may be picked twice), spliced at `int(origIndex+1, len)`.
  - **Invalid:** a fully valid event plus exactly one defect, cycling through the 6 codes. Ids are `SIM-<seed>-BAD-<nn>` and
    positions are seeded. `UNKNOWN_MISSION` keeps a real crew name. `CREW_MISMATCH` uses another real crew.
  - Rejects a seed outside the integers 0–4294967295 (the PRNG is 32-bit, and `1e21` would break the id pattern),
    and a count outside 0–9999 (the id has 4 digits).
- `src/sim/expected.js`: `computeExpected(plan)`. Every roster player and every crew starts at 0. Only `kind: 'valid'` entries
  are applied (BR-1 / BR-2), and a repeated valid `event_id` counts once.
- `src/sim/client.js`: `runPlan` and `verifyDashboards`.
  - **`runPlan`** posts sequentially with `content-type: application/json`. It buckets by HTTP status:
    201 accepted, 200 duplicate, 409 duplicate_conflict, 400 rejected, anything else other.
  - **`verifyDashboards`** compares only `completed_count`, `failed_count`, `cash_balance` and each `reputation_by_crew` key.
    A non-200 dashboard becomes a `http_status` mismatch.
  - **Unreachable server:** a thrown `fetch` becomes `ServerUnreachableError`, carrying the partial `progress` from `runPlan`.
  - URLs are built with `apiUrl()`, so a trailing slash or base path on `--url` works.
- `scripts/simulate.js`: CLI with `--url --seed --count --verify --json --help`.
  - Exports `main(argv, io)` for tests. It runs only when invoked directly (a realpath'd `process.argv[1]` guard, not `import.meta.main`).
    Without the realpath, a run through a symlinked path printed nothing and exited 0. I reproduced that, fixed it and added a test.
  - Sets `process.exitCode` instead of calling `process.exit()`.
  - The text summary includes the expected-totals table and always the note "--verify assumes the database was empty before this run".
    `--json` prints exactly one JSON object, including on the unreachable and usage-error paths.

### Decisions and deviations (please review; recorded here because `docs/ai-decisions.md` is not mine)
1. **`unexpected` also flags a 400 whose `errors[].code` does not include the planned `expectedCode`**, with an extra optional
   `expectedCode` field on the entry. This is an inclusion check, so extra codes from the server are fine. It goes beyond the brief's
   status-only shape, which can't see a wrong 400. Like every unexpected entry, it does not change the exit code.
2. **Exit code 64 for bad command-line usage** (for example `--seed abc` or `--count 10000`). The brief defines only 0/1/2, and reusing 1 or 2
   would blur their meaning. This can easily be changed to another code if you prefer.
3. **The 201→200 "already sent" hint** appears only when that pattern actually occurs.

### Test output (real, `npm test` in this worktree, local Node v26.10.0)
```
ℹ tests 46
ℹ suites 0
ℹ pass 46
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 193.475125
```
Simulator test files:
- `sim-prng`: 7 tests.
- `sim-generator`: 13. Determinism, the 120/12/6 = 138 counts, each duplicate after its original and deep-equal, all 6 invalid codes
  with exactly one defect (checked by an independent §4.2 checker in the test file), and canonical increasing timestamps.
- `sim-expected`: 4. These include a hand-computed plan with completed, failed, duplicate and invalid entries.
- `sim-client`: 10. Against a `node:http` stub on port 0: order, header and body per request, tallies, the 409 / other / non-JSON
  paths, mismatch detection, and unreachable.
- `sim-cli`: 9. Exit codes 0/1/2/64, `--json` as one object, a second run that is reported but exits 0, and real child processes:
  one against a closed port giving exit 2, one started through a symlink.
- `catalog.test.js`: 3 (pre-existing, not mine).

### Manual run (real process vs. a throwaway `node:http` stub, not the real app; the stub is not committed)
- Fresh stub, `--seed 42 --count 120 --verify`: 138 sent, 120 accepted, 12 duplicate, 6 rejected, verification OK, exit 0.
  The 6 invalid events showed as unexpected only because that stub returned a dummy error code.
- Same seed again: 0 accepted and 132 duplicate, verification still OK (totals unchanged), exit 0, hint shown.
- A stub with one tampered `cash_balance` gave exit 1 and listed `P-02 cash_balance: expected 17400, actual 17450`.
  An unreachable port gave exit 2, and `--seed x` gave exit 64.
- Same seed on a second fresh stub: identical output apart from the url line.

### Known gaps and things I'm unsure about
- **Not yet run against the real API** (it is being built in parallel). The real core should return the exact §4.2 codes. If its
  validator stops at the first error, the inclusion check still holds, because each invalid event has only one defect.
- **The project targets Node 24, but I ran on Node v26.10.0.** I used only APIs available in 24.0: `parseArgs`, `structuredClone`,
  global `fetch` / `Response`. Not verified on a real Node 24 binary.
- **`--verify` against a non-empty DB** reports mismatches by design (it assumes an empty DB). The output states this.
- `git diff --stat feature/NC-1-mission-tracker...HEAD` lists only `scripts/simulate.js`, `src/sim/*.js`,
  `test/unit/sim-*.test.js`, and this file.

Requests are listed in the brief's "Requests to orchestrator" section above.
