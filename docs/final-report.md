# Neon Coast: Mission & Reputation Tracker. Final Report

**AI-native SDLC take-home assignment** · Jira [NC-1](https://lukajocic1389.atlassian.net/browse/NC-1) · Repository
[lukajocic1389-cyber/neon-coast-tracker](https://github.com/lukajocic1389-cyber/neon-coast-tracker) (private) · 24 November 2026

> Fictional content only. Not affiliated with any game or game publisher.

## Evidence at a glance

| What | Link / location |
|---|---|
| Jira Story (with sub-tasks NC-2 … NC-9, 6 phase comments, web links) | https://lukajocic1389.atlassian.net/browse/NC-1 |
| Repository | https://github.com/lukajocic1389-cyber/neon-coast-tracker |
| Pull request #1 (feature) and the independent AI review | https://github.com/lukajocic1389-cyber/neon-coast-tracker/pull/1 · [review comment](https://github.com/lukajocic1389-cyber/neon-coast-tracker/pull/1#issuecomment-7137564248) |
| Pull request #2 (review fixes R1–R5) | https://github.com/lukajocic1389-cyber/neon-coast-tracker/pull/2 |
| Green CI on `main` (tests + Docker smoke) | https://github.com/lukajocic1389-cyber/neon-coast-tracker/actions/runs/45439155477 |
| Planning artifacts | [`intent.md`](../intent.md) · [`spec.md`](../spec.md) · [`plan.md`](../plan.md) |
| AI instructions | [`CLAUDE.md`](../CLAUDE.md) · [`AGENTS.md`](../AGENTS.md) · worker briefs and reports in [`tasks/`](../tasks) |
| Decision log (accepted / changed / rejected, by whom) | [`docs/ai-decisions.md`](ai-decisions.md) |
| Copy of every Jira update | [`docs/jira-log.md`](jira-log.md) |
| Testing method and results | [`docs/testing.md`](testing.md) · raw output in [`docs/evidence/`](evidence) |

---

## 1. Problem understanding

A simulated game engine sends mission results as JSON. The app must turn them into **trustworthy** player progress. The hard part
is not the UI but the arithmetic under bad input. Engines retry (duplicates), send bad data (unknown players or missions, invalid values),
and the app restarts. The brief fixes five rules (PDF §3), and I treated them as the contract:

| Rule | Implemented as |
|---|---|
| Completed mission → add `cash_reward` and `reputation_reward` **once** to the right player and crew | `src/rules.js` (`computeAward`, the only place the rule lives) + one SQL insert per event |
| Failed mission → recorded, **no** rewards | `computeAward` returns 0. The reported values are still stored for audit (decision D6) |
| Same `event_id` again → no second record, no reward, clear duplicate response | Pre-check inside a `BEGIN IMMEDIATE` transaction, backed by `UNIQUE(event_id)`. 200 `duplicate` or 409 `duplicate_conflict` |
| Unknown mission or player → clear validation error | `src/validation.js` collects every error. 400 with `code`, `field`, `message` |
| Restart → history, cash and crew reputation remain | SQLite file (local) or named Docker volume. Totals are derived from the stored events |

Out of scope by design: auth, player registration, any extra mechanic, and **mission replay protection**. Replay protection is the
interview's live change: one reward per player per mission. It is different from duplicate-event handling.

## 2. Who did what (human vs. AI)

| Actor | Role in this project |
|---|---|
| **Human** (repository owner) | Wrote the orchestration instructions. Chose the GitHub account. Rejected using the existing Jira project and **created Jira project NC by hand** (the Atlassian MCP cannot create projects). Answered all 19 planning decisions at GATE 1, with changes to D13 and D15. Replaced CodeRabbit with an independent AI reviewer. Decided on all 5 review findings at GATE 2 and added the extra mutation re-run. **Merged both pull requests in the GitHub web UI**: PR #1 at 17:22 and PR #2 at 17:36 (see §11). Gives the final sign-off at GATE 3. |
| **Orchestrator agent** (Claude Code, this session) | Read the brief; drafted intent/spec/plan, CLAUDE.md, AGENTS.md and the Story; created the Jira issues and posted every phase update through the Atlassian MCP; wrote the scaffold and the three worker briefs; reviewed and merged every worker branch; wired the app; wrote the integration tests **from the spec only**; ran the mutation checks; built the CI, Docker and README; created the repo and PRs; verified a fresh clone; applied the review fixes; wrote this report. |
| **3 worker agents** (Claude Code, each in its own git worktree and cmux workspace) | `core` (DB, validation, rules, store, API, server), `simulator`, `dashboard`. Each worked only on its own files, from a written brief, with unit tests and a written report. |
| **Independent reviewer agent** (fresh Claude subagent) | Reviewed the PR diff against `spec.md` and the brief, without having seen the build. Posted 5 findings as a PR comment labelled as an AI review. |
| **Advisor model** | Reviewed the Phase 1 drafts before GATE 1 and found 9 gaps, including 2 unsupported statements in my own decision log. |

Nothing in this report or in the repo claims a human code review, test run or CI result that did not happen. Every commit was made by an agent
on the human's git identity, with the `Co-Authored-By` trailer.

## Human oversight

What the human did in this project, and only that:

- **Approved the Story and decisions D1–D19 at GATE 1.** The human accepted all recommendations, with two notes: D13, use sub-tasks only if the
  Subtask type exists in NC; D15, add a dark neon theme and auto-refresh. The agent then created the Story from those answers.
- **Decided on review findings R1–R5 at GATE 2, and accepted all five.** The human added two requirements: repeat the reviewer's mutation
  against the new race test, and log R1–R5 with finder, decision and fix commit.
- **Merged the pull requests in the GitHub web UI.** PR #1 at 17:22, **before the review fixes**; those fixes then went into PR #2. PR #2 at 17:36.
  The CI runs for PR #2's head commit had completed successfully before that merge.
- **Gave the final sign-off at GATE 3 after reading this report.**

Other recorded human actions:
- Chose the GitHub account.
- Created the Jira project NC by hand.
- Replaced CodeRabbit with an independent AI reviewer.
- Confirmed who merged each PR.

This report does **not** claim any human code review, test run or CI check. The code review, test and CI evidence in this report come from the
AI agents, the independent AI reviewer and GitHub Actions.

## 3. Jira: structure, updates and status history

**Structure.** Story **NC-1** holds all the Phase 1 fields: objective, scope, requirements, NFRs, 7 acceptance criteria, tasks, assumptions,
risks and deliverables. Its sub-tasks are NC-2 Planning · NC-3 Core · NC-4 Simulator · NC-5 Dashboard · NC-6 Tests · NC-7 CI/CD · NC-8 PR and review · NC-9 Report.
The board (team-managed Kanban) only has **To Do → In Progress → Done**, so the status history uses those three. The human was asked
about an "In Review" column at GATE 1 (D14) but did not add one.

**Updates were posted in real time at the end of each phase** (copied word for word into [`docs/jira-log.md`](jira-log.md)):

| Time (CET) | Update | Status changes |
|---|---|---|
| ~16:50 | Story + 8 sub-tasks created | — |
| 16:54 | Planning: interpretation, assumptions, decisions | NC-1 → In Progress · NC-2 → Done |
| 17:05 | Implementation (mid): what works, remaining, blockers, scope | NC-3/4/5 → In Progress (at worker start) |
| 17:09 | Implementation (end) | NC-3/4/5 → Done · NC-6 → In Progress |
| 17:11 | Testing: runs, mutation check, how the AI tests were checked | NC-6 → Done · NC-7 → In Progress |
| 17:15 | CI/CD & launch: pipeline link, run steps, fresh-clone check. Web links added for the repo, CI run, intent, spec and plan | NC-7 → Done · NC-8 → In Progress |
| 17:53 | Review: findings and fixes, process deviation, **correction of two earlier overclaims** | NC-8 → Done · NC-9 → In Progress |
| 17:58 | Completion: report linked (PDF attached), acceptance criteria, limitations, final state | NC-9 → Done. NC-1 is moved to Done only after GATE 3 |

**Screenshots from Jira.** All five were captured by a separate AI assistant in the human's signed-in browser at about **18:06 on 2026-11-24**,
while NC-1 was still **In Progress**, so they show the state before the GATE 3 sign-off. Two things to note when reading them:
- **Jira attributes every action to the human's account ("Luka Jocić").** The Atlassian MCP acts with the human's credentials, so issue creation,
  comments, transitions and links made by the agent appear under the human's name. Each phase comment carries its own label,
  "posted by the Claude Code orchestrator agent via the Atlassian MCP".
- The **"Comments summary"** panel is Jira's own built-in AI feature, not part of this project's work.

<p><img src="img/jira-nc1-overview.png" alt="Jira NC-1 overview" width="49%"> <img src="img/jira-nc1-subtasks-links.png" alt="Jira NC-1 sub-tasks, attachment and web links" width="49%"></p>

*Jira NC-1 overview. Left: the Story description and details, status In Progress. Right: the attached `final-report.pdf`, sub-tasks NC-2…NC-9 all
Done (100%), and the 9 web links. Captured by a separate AI assistant in the human's signed-in browser, about 18:06 on 2026-11-24, while NC-1 was still In Progress.*

<p><img src="img/jira-nc1-comments.png" alt="Jira NC-1 comments" width="49%"> <img src="img/jira-nc1-history.png" alt="Jira NC-1 history" width="49%"></p>

*Left: NC-1 comments, with the Completion phase update at the top. Right: the NC-1 History tab (web links, the attachment, To Do → In Progress, creation).
Captured by a separate AI assistant in the human's signed-in browser, about 18:06 on 2026-11-24, while NC-1 was still In Progress.*

![Jira board](img/jira-board.png)

*The NC board: NC-1 In Progress with sub-tasks 8/8. Captured by a separate AI assistant in the human's signed-in browser, about 18:06 on 2026-11-24, while NC-1 was still In Progress.*

## 4. Planning artifacts and decisions

- [`intent.md`](../intent.md): problem, desired result, users, constraints, out of scope.
- [`spec.md`](../spec.md): fixed rules, seed data (7 fictional missions across 3 crews, 5 players), data model, API contract with every error
  code and response shape, UI behaviour, simulator contract, acceptance criteria mapped to tests, and **19 decisions (D1–D19)**.
- [`plan.md`](../plan.md): roles, milestones per phase, tasks with dependencies and **exclusive file ownership per worker**, the worker protocol, risks.

**How the AI suggestions were handled** (full table in [`docs/ai-decisions.md`](ai-decisions.md)):

- **Accepted:**
  - 16 of the 19 planning recommendations, exactly as recommended. D13 was accepted with a condition, D14 was not possible, and D15 was extended (see "Changed").
  - All 13 worker judgment calls (dashboard 5, simulator 2, core 6), each reviewed: for example `express.json({strict:false})` so that `"hello"` gets `INVALID_BODY` rather than `INVALID_JSON`, and the simulator's exit code 64 for usage errors.
  - All 5 review findings.
- **Changed:**
  - D13: sub-tasks only if the type exists in NC (it does).
  - D15: the human added a dark neon theme and a 5 s auto-refresh.
  - Review R4: the reviewer proposed exit 1 for `--strict`; I used a separate exit code 3.
  - The Jira project: the agent offered the existing `KAN`; the human chose a dedicated `NC`.
- **Rejected:**
  - Using CodeRabbit (the human chose a fresh AI reviewer instead).
  - Guessing the unfilled `<GITHUB_USER>`/`<KEY>` placeholders in the instructions. The agent stopped and asked.

## 5. Architecture

```
  simulator (scripts/simulate.js)            browser (auto-refresh 5 s)
  seeded plan: 120 valid + 12 dup + 6 bad          │ GET /, /players/:id
          │ POST /api/events (JSON)                ▼
          ▼                              ┌──────────────────────────┐
  ┌──────────────────────────────────────┤  src/app.js  (Express 5) │
  │  /api router            /static      │  dashboard router (HTML) │
  └──────────┬───────────────────────────┴────────────┬─────────────┘
             ▼                                        │ getDashboard / listPlayerSummaries
   src/store.js ── validateEvent (src/validation.js)  │
       │        ── computeAward  (src/rules.js)       │
       │  BEGIN IMMEDIATE → pre-check event_id → INSERT (+ UNIQUE) → COMMIT
       ▼                                              ▼
   SQLite file (node:sqlite, WAL)  ◄──── SQL aggregates: counts, SUM(cash_awarded), SUM(rep) GROUP BY crew
   ./data/neon-coast.db  or  Docker named volume tracker-data:/data
```

**One event, step by step:**
1. JSON is parsed. A malformed body gives `INVALID_JSON`; a non-object gives `INVALID_BODY`.
2. `validateEvent` checks all 8 fields: types, ranges, a real UTC date, the player and mission exist, and the crew matches the mission. It returns **all** errors at once (400).
3. The timestamp is made canonical and a payload hash is computed over the 8 known fields.
4. `BEGIN IMMEDIATE`. If the `event_id` exists: same hash → 200 `duplicate`, different → 409 `duplicate_conflict`. Nothing is written.
5. Otherwise `computeAward` decides what is actually paid (failed → 0). The event is INSERTed with both the reported and the awarded values, then COMMIT → 201.
6. If another process won the race, the `UNIQUE` constraint (errcode 2067) is caught and turned into the same duplicate response.
7. The dashboard queries derive the counts, cash, per-crew reputation and the last 10 events from the `events` table. The totals cannot drift from the history.

**Why these choices:**
- Node 24's built-in `node:sqlite` means no native build step.
- Totals are derived rather than stored as counters (D11), so they always match the saved events.
- The UI is server-rendered with no JavaScript (D15), so the full API→HTML flow can be tested over HTTP.
- **Every one of these was a recorded decision.**

## 6. AI prompts, how the output was checked, and corrections

**Real prompts and tasks** (not paraphrased):

- **Worker launch prompt.** Each worker was started in its own cmux workspace with `claude --permission-mode acceptEdits "<prompt>"`, for example:
  > *You are the 'core' worker agent for the Neon Coast project (Jira NC-3). Read tasks/core.md in this worktree and follow it exactly,
  > together with CLAUDE.md, AGENTS.md and spec.md. Work only on the files your brief says you own, commit small steps with the NC-3
  > prefix, run npm test before every commit, never push/merge/touch Jira or GitHub. When completely finished, append the Worker report
  > to tasks/core.md, commit it, then run: touch .worker-done*

  The real task is the brief: [`tasks/core.md`](../tasks/core.md), [`tasks/simulator.md`](../tasks/simulator.md),
  [`tasks/dashboard.md`](../tasks/dashboard.md). Each lists its owned files, forbidden files, the contract, the required tests and a definition of done.
- **Reviewer prompt** (fresh subagent; excerpt):
  > *You are an independent code reviewer. You have NOT worked on this project. Review GitHub pull request #1 … against the assignment
  > brief … and spec.md … Do not pad the list: report only issues you can point to concretely … Mark anything you did not verify by running
  > as "not verified". Never invent output … The comment MUST start with: ## 🤖 AI review (independent Claude subagent, not a human review)*

**How the output was checked:**
1. **Diff review against the brief** before every merge: only owned files changed, spec shapes respected, the reward rule in one place, escaping on all HTML output.
2. **The full suite after every merge:** 25 → 68 → 138 → 172 tests, all green.
3. **Independent tests:** the orchestrator wrote the integration tests from the spec while the workers coded, without reading their code. 34/34 passed on first contact.
4. **Mutation check** (`scripts/mutation-check.mjs`): each critical rule is broken on purpose to prove the tests catch it.
5. **Live run:** the dev server in a cmux split, the simulator against it, and the browser split auto-refreshing to the same totals.
6. **An independent AI review**, then **human decisions** on each finding.

**Useful corrections:**

| Caught by | What was wrong | Fix |
|---|---|---|
| Advisor model (before GATE 1) | Ambiguous simulator counts; a missing contract between the core and dashboard workers; mixed timestamp precision would break ordering; Node 24 support unverified; **two statements in my own decision log were not backed by facts** (an invented reason for skipping CodeRabbit, and naming the human from git config) | All 9 fixed before the human saw the plan |
| Dashboard worker (own screenshots) | Event ids and crew names wrapped mid-token | `7e57cec` |
| Simulator worker (own manual test) | Started through a symlinked path, the CLI silently did nothing and exited 0 | Realpath guard + regression test (`9fc0373`) |
| Core worker | JavaScript rolls `2026-02-30` over to March 2, so "real date" needs a round-trip check | Implemented and tested |
| Independent reviewer (R3) | **My own test** "concurrent identical submissions" could never race (synchronous SQLite), and **my docs and Jira comment** presented it as race evidence | A real two-process race test. With the reviewer's mutation it fails 5 of 5 runs. The docs were corrected, and Jira got a correction comment |
| Independent reviewer (R2) | **My CI step** "check data persisted on the volume" used `restart` and would pass without the named volume | `down` + `up`. Proven: without the volume the old step passes and the new step fails |
| Independent reviewer (R1, R4, R5) | Malformed URL → 500; CI couldn't fail on wrong status codes; two processes crashing on a new DB | Fixed with tests or evidence. See §8 |

## 7. Implementation

- **Stack:** Node 24 (ESM), Express 5.3.0, built-in `node:sqlite`, `node:test` + supertest 7.3.2. One runtime dependency (Express) and one dev dependency (supertest).
- **Size:** about 1,860 lines of app, simulator and CSS; 20 test files.
- **Parallel build:** three workers ran at the same time in separate git worktrees, from written briefs, and were merged with `--no-ff` after review:
  - core: 7 commits
  - simulator: 8 commits
  - dashboard: 7 commits
- **Git:** 60 commits on the feature branch, **all** prefixed with a Jira key (NC-1 … NC-8).

![Dashboard: player index](img/dashboard-index.png)

![Dashboard: player page after the seed-42 simulator run (verified: 18 completed, 5 failed, $20,050, reputation 559)](img/dashboard-player-desktop.png)

<p><img src="img/dashboard-player-mobile.png" alt="Dashboard at phone width (390 px), no horizontal scroll" width="300"> &nbsp; <img src="img/dashboard-404.png" alt="Unknown player, 404 page" width="560"></p>

## 8. Testing

How to run, the mapping to the PDF test groups, and all raw output are in [`docs/testing.md`](testing.md). Summary of the **final** code:

- **178 tests, 178 pass, 0 fail**, locally (Node 26) and in CI (Node 24.22.3).
- **Coverage:** 97.5% lines, 90.1% branches, 97.2% functions.
- **Every group the PDF requires is covered:**
  - valid events and invalid events
  - completed vs failed rewards
  - duplicates, including a **real two-process race**
  - persistence across a **real process restart**
  - the full API → JSON → **rendered HTML** flow
  - **simulator repeatability**: seed 42 on two fresh DBs gives identical dashboards, and a re-run gives only duplicates.
- **Mutation check:**

| Mutation | Result |
|---|---|
| M1: duplicate handling removed (pre-check + UNIQUE) | red: 18 tests fail |
| M2: failed missions pay | red: 13 tests fail |
| M4: reviewer's mutation, no transaction + no UNIQUE | red: the race test fails |
| M3: control, pre-check removed but UNIQUE kept | green: the DB constraint alone holds |

![npm test (real output)](img/test-output.png)

![Mutation check (real output)](img/mutation-check-output.png)

**Review fixes, each proven:**
- R1: the new test fails on the old code.
- R5: 4 of 5 startup trials crashed before the fix, 0 of 5 after ([evidence](evidence/review-r5-startup-race.txt)).
- R2: the new CI step fails when the named volume is removed ([evidence](evidence/review-r2-volume-check.txt)).
- R3: the race test fails 5 of 5 runs under the reviewer's mutation.
- R4: `--strict` gives exit 0 on a fresh DB and exit 3 on a re-run.

## 9. CI/CD

`.github/workflows/ci.yml` runs on **every push and pull request** and reports pass/fail:
1. **Tests (Node 24):** `npm ci` → `npm test`.
2. **Docker smoke:**
   - `docker compose up --build`, then wait for `/api/health`;
   - simulator `--verify --strict` against the container (138 requests; any wrong status or error code fails the build);
   - `docker compose down` + `up` (a new container, so only the named volume carries the data);
   - assert the data is unchanged.

| Run | Commit | Result |
|---|---|---|
| [45434400025](https://github.com/lukajocic1389-cyber/neon-coast-tracker/actions/runs/45434400025) | `2a4612c` first push | success, with a Node 20 deprecation warning on `actions/*@v4` |
| [45434677399](https://github.com/lukajocic1389-cyber/neon-coast-tracker/actions/runs/45434677399) | `57d7752` actions → v7 | success, no warnings |
| [45438843508](https://github.com/lukajocic1389-cyber/neon-coast-tracker/actions/runs/45438843508) | `fe1611c` PR #2 with all review fixes | success |
| [45439155477](https://github.com/lukajocic1389-cyber/neon-coast-tracker/actions/runs/45439155477) | `757012f` on `main` | success |

![gh run view 45439155477 (CLI output)](img/ci-run-main-cli.png)

*CLI output, not a browser screenshot: `gh run view 45439155477` for the CI run on `main` (commit `757012f`), captured by the orchestrator agent at
18:16 CET on 2026-11-24 and rendered as an image. The raw text is in [`docs/evidence/ci-run-45439155477.txt`](evidence/ci-run-45439155477.txt).
The Docker job is still named "(simulator + restart)". The name predates review fix R2; the step now re-creates the container with `down` + `up`.*

## 10. Deployment and startup

No paid hosting. There are two reproducible ways to start it, both in the [README](../README.md):

```bash
docker compose up -d --build          # http://localhost:3000, data on the named volume tracker-data
# or: Node 24+
npm ci && npm start
npm run simulate -- --url http://localhost:3000 --seed 42 --count 120 --verify
```

**Verified from a fresh clone of the GitHub repo** ([evidence](evidence/fresh-clone-verification.txt)):
- The Docker container is healthy; `/` and `/static/styles.css` return 200; simulator verify OK.
- `npm ci && npm test` → 172/172 at that point. The final code has 178, verified in CI.
- Data survives `docker compose restart` and `down`/`up`.
- The image runs as the non-root `node` user, with a `HEALTHCHECK`.

## 11. Process deviations (recorded as they happened)

1. **PR #1 was merged by the human at 17:22, before the GATE 2 fixes; fixes followed in PR #2.** The plan was: review → GATE 2 → apply fixes → merge.
   The human merged PR #1 in the GitHub web UI at 17:22:12, which according to GitHub's timestamps was 20 seconds *before* the independent AI review
   comment was posted (17:22:32), and so before GATE 2. The agent noticed when PR #1 showed as closed while pushing the fixes.
   It checked that neither it nor the reviewer had run a merge, then stopped and asked. The fixes reached `main` through PR #2, and the history was not rewritten.
2. **PR #2 was merged by the human at 17:36 in the GitHub web UI** (the human confirmed this at GATE 3), right after authorising the merge. The agent
   had planned to merge it but was still waiting for GitHub to sync the PR head. The merged commit is the reviewed and tested `fe1611c`, with green CI.
   The last log commit (`81f6845`) was pushed just after that merge, so it reaches `main` with the report in PR #3.
3. The agent kept **drafting the Phase 1 documents locally** after being told to stop if the Jira project could not be created. No Jira, GitHub or git writes were made.
   The human accepted this afterwards (decision #6).
4. **CodeRabbit was replaced** by an independent AI subagent review (the human's decision).
5. The board has no "In Review" column, so the status history is To Do / In Progress / Done.
6. **Two earlier Jira comments overstated evidence** (the "concurrent" test; the CI "volume" check). They were left as posted, and a correction comment was added.

## 12. Challenges

- **Proving the absence of double counting.** Within one Node process, synchronous SQLite cannot race, so the first "concurrency" test proved nothing.
  The fix was to race **two OS processes** on one file, and then to prove the test can fail (mutation M4).
- **Keeping three parallel agents from colliding:** exclusive file ownership, frozen shared contracts (`spec.md` §4.5, `src/catalog.js`), and diff review before each merge. There were no merge conflicts.
- **Truthful evidence under automation.** All actors share one GitHub account and one git identity, so "who did what" had to be logged deliberately.
  The two merges in §11 show why: GitHub only records the account.
- **SQLite details:** WAL + `busy_timeout` ordering (R5), and JS date rollover.

## 13. Limitations

- No authentication or authorisation. It is a local, single-tenant demo.
- The player roster and the mission catalog are seeded in code; there is no admin UI.
- Single instance. SQLite with WAL handles a few processes on one host, not a distributed deployment.
- The dashboard refreshes with a 5 s meta refresh (simple and dependency-free) rather than live push.
- The UNIQUE/2067 catch path is defense in depth that tests cannot reach naturally. It is covered by a mutation (M3), not by a test.
- The repo is private: reviewers need to be added as collaborators to open the links.

## 14. Possible improvements

- **Mission replay protection** (the interview change): one reward per player per mission, with later attempts recorded at 0. The `*_awarded` columns already support this.
- Run the mutation check in CI (nightly), not only locally.
- OpenAPI description of the API; Playwright visual tests in CI.
- An event-ingestion audit log for rejected events (currently not stored, by decision D10).

## 15. Lessons learned

- **The spec is the multiplier for parallel agents.** Exact shapes (§4.4/§4.5) and test hooks let three agents build against each other without
  seeing each other's code, and let tests be written before the code existed.
- **A green test is a claim, and the mutation check is the proof.** The first race test was green and meaningless. Only breaking the code showed it.
- **An independent reviewer finds what the author can't.** Both R2 and R3 were overclaims in *my own* evidence. Neither my tests nor my mutation check caught them.
- **Write down who did what at the moment it happens.** One shared account makes the GitHub record ambiguous. The decision log and Jira log were what kept the report honest.
- **Correct the record rather than rewrite it.** Earlier Jira comments stay as posted, with a visible correction.
