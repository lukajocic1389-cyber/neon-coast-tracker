# Testing (Jira NC-6, updated after review NC-8)

## How to run

```bash
npm ci
npm test                                   # full suite: node:test + supertest, about 1 s
node scripts/mutation-check.mjs            # break rules one at a time, confirm the suite goes red, restore
node --test --experimental-test-coverage --test-coverage-exclude='test/**' "test/**/*.test.js"   # coverage
```

The tests use temporary SQLite files in the OS temp dir and never touch `./data`. Several tests spawn the real server
(`node src/server.js`) as separate processes on free ports, so they can test real restarts and real cross-process races.

## Test groups required by the assignment (PDF Phase 4) → where they are

| Required group | Integration tests (orchestrator; first written from `spec.md` only) | Unit tests (workers) |
|---|---|---|
| Valid events | `test/events.validation.test.js` → "valid events" | `test/unit/core-validation.test.js`, `core-app.test.js` |
| Invalid events | `test/events.validation.test.js`: 13 cases plus missing field, several errors at once, INVALID_JSON/INVALID_BODY, rejected events not stored, a rejected id resubmitted once fixed | `core-validation.test.js` (one test per error code, boundaries, impossible dates); `core-app.test.js` (malformed URL encoding → 400, review R1) |
| Completed vs failed rewards | `test/rules.test.js` | `core-rules.test.js`, `core-store.test.js` |
| Duplicate event IDs | `test/duplicates.test.js`: 200 duplicate, reordered keys, 409 conflict, globally unique id, failed resend, ten identical POSTs to one process → 1 accepted (sequential, see the note) | `core-store.test.js` (including the DB-level UNIQUE errcode 2067) |
| Duplicates under a **real race** (added in review, R3) | `test/concurrency.test.js`: **two server processes on one DB file**, 25 event_ids × 20 identical parallel POSTs (10 to each process); each id must be accepted exactly once, and both processes must show single-counted totals. The two processes start together on a brand-new file, which also covers R5 | — |
| Persistent storage | `test/persistence.test.js`: **a real process restart** (SIGTERM, exit 0, start again on the same DB file), and duplicates still detected after the restart | `core-store.test.js` (close and reopen the store), `core-server.test.js` |
| Full API → dashboard flow | `test/flow.e2e.test.js`: POST 5 events (accepted, failed, duplicate, rejected) → JSON dashboard → **rendered HTML** values via `data-testid` hooks → index → 404s; history limit 10 | `dashboard-render.test.js`, `dashboard-routes.test.js` |
| Simulator repeatability (extra) | `test/simulator.test.js`: seed 42 on **two fresh DBs** → identical dashboards; 138 requests = 120/12/6; `--verify` has 0 mismatches; a re-run on the same DB → 0 accepted, 132 duplicate, totals unchanged | `sim-generator`, `sim-expected`, `sim-client`, `sim-cli` (including `--strict`, review R4), `sim-prng` |

**Note on "concurrent" in one process (review R3).** `node:sqlite` is synchronous, so requests to a single Node process are handled
one after another, even when they are fired together. The in-process test was therefore renamed. It proves repeated
submissions are counted once, but it is **not** race evidence. Race evidence comes only from `test/concurrency.test.js`, which uses two OS processes.

## Results (real output, saved in `docs/evidence/`)

- `docs/evidence/test-run-full.txt`: `npm test` on the final code. **tests 178 · pass 178 · fail 0**, exit code 0 (local Node v26.10.0).
  CI runs the same suite on Node **v24.22.3** for every push and pull request.
- `docs/evidence/coverage.txt`: **97.50% lines, 90.08% branches, 97.22% functions**. `rules.js`, `catalog.js` and `routes.js` are at
  100%. The main uncovered block is still `store.js` 112–121, the UNIQUE/2067 catch path. Even with two real processes it is not reached:
  `BEGIN IMMEDIATE` makes the second writer wait, and it then finds the row in the pre-check. It is exercised by mutation M3 instead. `server.js`
  and `db.js`'s retry path show lower coverage because they run in spawned child processes, where coverage is not collected.

## Mutation check: do the tests actually protect the rules?

`node scripts/mutation-check.mjs`. Real output is in `docs/evidence/mutation-check.txt` (final run: 178 tests).

| # | Mutation | Expected | Actual |
|---|---|---|---|
| M1 | Duplicate handling removed: skip the code pre-check **and** drop `UNIQUE` from `events.event_id` | red | **red: 18 of 178 fail** (all duplicate tests, the two-process race, the flow, persistence, simulator repeatability, store/app unit tests) |
| M2 | Reward rule broken: `failed` also pays | red | **red: 13 of 178 fail** (rules, the flow, persistence, simulator verify, store/app unit tests) |
| M4 | The reviewer's race mutation (R3): remove the transaction (`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`) **and** `UNIQUE`, and keep the pre-check | red | **red: 2 of 178 fail**: the new two-process race test and the schema assertion |
| M3 | Control: skip only the code pre-check and keep the DB `UNIQUE` | green | **green: 178 / 178**. The DB constraint plus the errcode-2067 handler alone stop double counting (defense in depth) |

After each mutation the source is restored and checked byte-for-byte. The final re-run is 178/178 green.

### Review R3: repeating the reviewer's mutation against the new two-process test

**Before the fix**, the independent reviewer applied M4 to a scratch copy. Only **1** test failed, a schema assertion. No behavioural
test noticed that the transaction was gone, and the in-process "concurrent" test still passed. (Source: the reviewer's PR comment.)

**After the fix**, the human asked for the reviewer's mutation to be repeated against the new test. The orchestrator removed `UNIQUE`
from `src/db.js` and the `BEGIN IMMEDIATE`/`ROLLBACK`/`COMMIT` lines from `src/store.js`, ran `node --test test/concurrency.test.js`
5 times, and then restored the files (`git diff --stat src/` was empty afterwards). Real output, one line per run:

```
ℹ pass 0 ℹ fail 1   AssertionError [ERR_ASSERTION]: RACE-0: statuses 201,201,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200
ℹ pass 0 ℹ fail 1   AssertionError [ERR_ASSERTION]: RACE-0: statuses 201,201,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200
ℹ pass 0 ℹ fail 1   AssertionError [ERR_ASSERTION]: RACE-0: statuses 201,201,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200
ℹ pass 0 ℹ fail 1   AssertionError [ERR_ASSERTION]: RACE-0: statuses 201,201,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200
ℹ pass 0 ℹ fail 1   AssertionError [ERR_ASSERTION]: RACE-0: statuses 201,201,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200
```

**5 of 5 runs failed.** Both processes accepted the same event (`201,201`), so the same reward was paid twice, which is exactly the bug the
transaction prevents. On the restored code the test passed 3 of 3 runs. It is now part of the mutation script as M4, which also turns red.

## How the AI-generated tests were checked

1. **Independent authorship.** The first integration tests were written by the orchestrator agent from `spec.md` alone, while the workers
   were still coding and without reading their code (decision #10). The workers wrote their own unit tests. 34/34 integration tests passed
   against the merged code on the first run.
2. **A first-run pass is not proof**, so the mutation check deliberately breaks the most important rules. All the "red" mutations turned the suite red.
3. **An independent AI review found weak spots that the mutation check had missed** (R3: no real race test; R2: the CI volume check didn't
   test the named volume). Both were fixed, and each fix was **proven by breaking the thing it guards** (M4 above;
   `docs/evidence/review-r2-volume-check.txt`).
4. **Assertions on real values, not only status codes.** The tests compare exact totals, the per-crew map, history order, the numbers in the
   rendered HTML (`data-value`), and that totals equal the sum over the saved history.
5. **Real processes, not mocks**, for restarts and races.
6. **Human review.** The human decided on every review finding (GATE 2) and reviews the PR.

## Failed cases and fixes

- **Testing phase (NC-6):** no test failed on the real code. The only red runs were the intentional mutations.
- **Review phase (NC-8):** the independent AI review reported 5 findings. Each was reproduced or confirmed, then fixed with a regression test
  or evidence (details in `docs/ai-decisions.md` R1–R5):
  - R1: a malformed URL gave 500. The new test fails on the old code and passes now.
  - R5: two processes on a new DB crashed in 4 of 5 trials before the fix and 0 of 5 after (`docs/evidence/review-r5-startup-race.txt`).
  - R2 and R4: CI checks were strengthened (the named-volume check; simulator `--strict`).
  - R3: real race test plus M4.
- **Overclaims corrected.** This document previously listed "10 concurrent identical POSTs" as concurrency evidence, and the CI step
  "check data persisted on the volume" did not test the named volume. Both were corrected. The Jira comments that repeated those claims stay
  as posted, and a correction comment was added to NC-1.
- Failures and fixes made earlier inside the worker sessions are described in each worker's report (`tasks/*.md`) and in
  `docs/ai-decisions.md` #12, #15, #16, #17. They come from the workers' own reports. The orchestrator verified the resulting code and tests, but
  did not watch every intermediate red run.
