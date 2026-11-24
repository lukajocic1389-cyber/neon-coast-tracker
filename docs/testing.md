# Testing (Jira NC-6)

## How to run

```bash
npm ci
npm test                                   # full suite: node:test + supertest, about 1 s
node scripts/mutation-check.mjs            # break rules one at a time, confirm the suite goes red, restore
node --test --experimental-test-coverage --test-coverage-exclude='test/**' "test/**/*.test.js"   # coverage
```

The tests use temporary SQLite files in the OS temp dir and never touch `./data`. Some tests spawn the real server
(`node src/server.js`) as a separate process on a free port to test real restarts.

## Test groups required by the assignment (PDF Phase 4) → where they are

| Required group | Integration tests (orchestrator, written from `spec.md` only) | Unit tests (workers) |
|---|---|---|
| Valid events | `test/events.validation.test.js` → "valid events" | `test/unit/core-validation.test.js`, `core-app.test.js` |
| Invalid events | `test/events.validation.test.js`: 13 cases plus missing field, several errors at once, INVALID_JSON/INVALID_BODY, rejected events not stored, a rejected id resubmitted once fixed | `core-validation.test.js` (one test per error code, boundaries, impossible dates) |
| Completed vs failed rewards | `test/rules.test.js` | `core-rules.test.js`, `core-store.test.js` |
| Duplicate event IDs | `test/duplicates.test.js`: 200 duplicate, reordered keys, 409 conflict, globally unique id, failed resend, 10 concurrent identical POSTs → 1 accepted | `core-store.test.js` (including the DB-level UNIQUE errcode 2067) |
| Persistent storage | `test/persistence.test.js`: **a real process restart** (SIGTERM, exit 0, start again on the same DB file), and duplicates still detected after the restart | `core-store.test.js` (close and reopen the store), `core-server.test.js` |
| Full API → dashboard flow | `test/flow.e2e.test.js`: POST 5 events (accepted, failed, duplicate, rejected) → JSON dashboard → **rendered HTML** values via `data-testid` hooks → index → 404s; history limit 10 | `dashboard-render.test.js`, `dashboard-routes.test.js` |
| Simulator repeatability (extra) | `test/simulator.test.js`: seed 42 on **two fresh DBs** → identical dashboards; 138 requests = 120/12/6; `--verify` has 0 mismatches; a re-run on the same DB → 0 accepted, 132 duplicate, totals unchanged | `sim-generator`, `sim-expected`, `sim-client`, `sim-cli`, `sim-prng` |

## Results (real output, saved in `docs/evidence/`)

- `docs/evidence/test-run-full.txt`: `npm test`. **tests 172 · pass 172 · fail 0**, exit code 0 (local Node v26.10.0).
  The core worker separately ran the suite on Node **v24.22.3** (`node:24-alpine`): 73/73 at the time. CI runs on Node 24 for every push.
- `docs/evidence/coverage.txt`: **97.22% lines, 88.62% branches, 97.20% functions** overall. `rules.js`, `catalog.js` and `routes.js` are at
  100%. The main uncovered block is `store.js` 112–121, the UNIQUE/2067 catch path. It cannot be reached by a real race in one
  synchronous process, so it is exercised by mutation M3 instead (below). `server.js` looks low (84%) because coverage is not collected
  from the spawned child processes that test it.

## Mutation check: do the tests actually protect the rules?

`node scripts/mutation-check.mjs`. Real output is in `docs/evidence/mutation-check.txt`.

| # | Mutation | Expected | Actual |
|---|---|---|---|
| M1 | Duplicate handling removed: skip the code pre-check **and** drop `UNIQUE` from `events.event_id` | red | **red: 17 of 172 tests fail** (all duplicate tests, the flow, persistence, simulator repeatability, and store/app unit tests) |
| M2 | Reward rule broken: `failed` also pays | red | **red: 13 of 172 tests fail** (rules, the flow, persistence, simulator verify, and store/app unit tests) |
| M3 | Control: skip only the code pre-check and keep the DB `UNIQUE` | green | **green: 172 / 172**. The DB constraint plus the errcode-2067 handler alone stop double counting (defense in depth) |

After each mutation the source is restored and checked byte-for-byte. The final re-run is 172/172 green. Mutation M3 exists because the
core worker found, in its own quick mutation run, that disabling only the pre-check broke no tests. That is correct behaviour, not a
weak test. So "breaking duplicate handling" means removing **both** layers (M1).

## How the AI-generated tests were checked

1. **Independent authorship.** The integration tests were written by the orchestrator agent from `spec.md` alone, while the workers were still
   coding and without reading their code (decision #10). The workers wrote their own unit tests. Two independent readings of the spec agree:
   34/34 integration tests passed against the merged code on the first run.
2. **A first-run pass is not proof**, so the mutation check deliberately breaks the two most important rules. Both turned the suite red, and
   both were caught by the **independent** integration tests as well as by the unit tests.
3. **Assertions on real values, not only status codes.** The tests compare exact totals, the per-crew map, history order, and the numbers in the rendered
   HTML (`data-value`), and they check that totals equal the sum over the saved history.
4. **Real restarts, not mocks.** Persistence is tested by killing and restarting the real server process on the same file.
5. **Human review.** The human is asked to review this document and the PR (GATE 2).

## Failed cases and fixes

- **During this testing phase no test failed** on the restored code. The only red runs were the intentional mutations above.
- The failures and fixes that happened earlier, inside the worker sessions, are described in each worker's report (`tasks/*.md`) and
  in `docs/ai-decisions.md` #12, #15, #16 and #17. Examples: id wrapping found in screenshots; the CLI silently doing nothing when started through a symlink; JS rolling Feb 30
  over to Mar 2. These come from the workers' own reports. The orchestrator verified the resulting code and tests, but did not watch every intermediate red run.
