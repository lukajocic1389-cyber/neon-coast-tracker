# Plan — Neon Coast: Mission & Reputation Tracker

> Jira Story: **NC-1**. Status: **approved at GATE 1 (2026-11-24)**. Board states available: To Do → In Progress → Done.
> Spec: [`spec.md`](spec.md) · Intent: [`intent.md`](intent.md) · Decisions: [`docs/ai-decisions.md`](docs/ai-decisions.md) · Jira log: [`docs/jira-log.md`](docs/jira-log.md)

## Roles

| Who | Does |
|---|---|
| **Human** (repo owner) | Answers gate decisions, creates the Jira project and board columns, approves the review findings, moves the ticket to Done. |
| **Orchestrator agent** (Claude Code, this session) | Plans, writes the briefs, creates the scaffold, reviews every worker diff, merges, runs the full suite after each merge, updates Jira, and writes the docs and report. |
| **Worker agents** (Claude Code, one cmux workspace and git worktree each, max 3 at once) | Implement one task brief each, on their own branch, touching only the files the brief lists. |
| **Independent reviewer agent** | A fresh subagent that has not seen the implementation. It reviews the PR diff against `spec.md` and the PDF, and posts its findings as a PR comment labelled AI review. |

## Milestones

| M | Phase | Exit criterion | Jira update |
|---|---|---|---|
| M1 | Planning | GATE 1 answered. Story created. Docs committed. | Planning comment, status → In Progress |
| M2 | Implementation | Workers merged into the feature branch. The app runs and the simulator runs against it. | Mid and end comments |
| M3 | Testing | All PDF Phase 4 test groups pass. Mutation check recorded. | Testing comment |
| M4 | CI/CD | Green GitHub Actions run. Docker compose starts from a fresh clone. | CI comment with run link |
| M5 | Review | PR open, independent AI review posted, GATE 2 decisions applied, CI green, merged | Review comment, status → In Review (if column exists) |
| M6 | Report | `docs/final-report.md` and PDF, linked in Jira. GATE 3. | Completion comment. Human moves to Done. |
| M7 | Interview pack | `private/interview-guide.pdf` and the `practice/replay-protection` branch (not merged) | — (private) |

## Tasks and dependencies

Jira: NC-2 = planning, T0/T4 = NC-1, T1 = **NC-3**, T2 = **NC-4**, T3 = **NC-5**, T5 = **NC-6**, T6 = **NC-7**, T7 = **NC-8**, T8 = **NC-9**.
Commits use the sub-task key of the work they belong to.

| T | Task | Owner | Depends on | Files (exclusive ownership) |
|---|---|---|---|---|
| T0 | Scaffold: `package.json` (scripts, deps), `src/catalog.js` (seed data), folder skeleton, `.gitignore`, empty test runner | Orchestrator | GATE 1 | `package.json`, `package-lock.json`, `src/catalog.js`, `.gitignore` |
| T1 | **Core**: DB schema and migrations, validation, rules, store (insert event, duplicate handling, dashboard query, player summaries), Express app with the `/api` routes, server entry, and unit tests | Worker **core** | T0 | `src/db.js`, `src/validation.js`, `src/rules.js`, `src/store.js`, `src/app.js`, `src/server.js`, `test/unit/core-*.test.js` |
| T2 | **Simulator**: seeded PRNG, event generator, HTTP submitter, local expected-totals calculator, `--verify`, CLI, and unit tests (generator determinism, mix ratios, count ≥ 100) | Worker **simulator** | T0 (codes against the API contract in spec §4, not against T1 code) | `scripts/simulate.js`, `src/sim/*.js`, `test/unit/sim-*.test.js` |
| T3 | **Dashboard**: HTML render functions (index and player page, 404, empty state), CSS, an Express router factory that takes `{ getDashboard, listPlayerSummaries }`, and unit tests with stub data | Worker **dashboard** | T0 (codes against the dashboard JSON shape in spec §4.4) | `src/dashboard/*.js`, `public/styles.css`, `test/unit/dashboard-*.test.js` |
| T4 | Integration: mount the dashboard router in the app, wire the simulator to the real API, and run the simulator 2× against a live server | Orchestrator | T1, T2, T3 merged | `src/app.js` (mount line only, after T1 merged) |
| T5 | Test suite for the PDF Phase 4 groups: valid, invalid, completed vs failed, duplicates, persistence (real restart), API→dashboard flow, simulator repeatability. Then the mutation check. | Orchestrator (may delegate to one worker) | T4 | `test/*.test.js`, `docs/testing.md` |
| T6 | CI/CD: `.github/workflows/ci.yml` (push and PR), `Dockerfile`, `docker-compose.yml` with a named volume, README run steps, private GitHub repo, green run, fresh-clone verification | Orchestrator | T5 | `.github/`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md` |
| T7 | PR, independent AI review, GATE 2, apply the approved fixes, merge | Orchestrator plus reviewer agent | T6 | — |
| T8 | Final report (md to PDF via Playwright) with screenshots, and the Jira link. GATE 3. | Orchestrator | T7 | `docs/final-report.md`, `docs/final-report.pdf`, `docs/img/` |
| T9 | Interview pack and the `practice/replay-protection` branch | Orchestrator | T8 | `private/` (gitignored) |

T1, T2 and T3 run **in parallel** (three workers). Their file sets don't overlap. The shared contracts are
`spec.md` §4 (API and dashboard JSON) and `src/catalog.js` (seed data), which are frozen before the workers start.

## Worker protocol

1. The orchestrator writes `tasks/<name>.md`: goal, owned files, forbidden files, contract, definition of done, test command.
2. `git worktree add ../NeonCoast-wt-<name> -b feature/NC-1-<name> feature/NC-1-mission-tracker`
3. A worker starts in its own cmux workspace (`claude` in that worktree) with the brief as its prompt.
4. The worker commits small, key-prefixed commits on its branch and does not push or merge.
5. The orchestrator reviews `git diff feature/NC-1-mission-tracker...feature/NC-1-<name>` against the brief and the spec. It requests fixes or merges with `--no-ff`, then runs the **full** `npm test`.
6. Findings and corrections go into `docs/ai-decisions.md` (who caught what).

## Commit convention

`NC-<n> <type>: <summary>`. For example: `NC-1 feat: reject events for unknown players`. Every commit starts with the Jira key.

## Risks

| Risk | Mitigation |
|---|---|
| Double-counting under retries or races | DB `UNIQUE(event_id)` plus a single transaction. A dedicated duplicate test and a mutation check. |
| Tests that pass but prove nothing (AI-written) | Mutation check: break duplicate handling and the reward rule one at a time, confirm the tests go red, then restore. |
| `node:sqlite` is newer and has experimental warnings on some Node versions | Pin Node 24 in CI, Docker and `engines`. Fallback: `better-sqlite3`. |
| Worker drift outside its brief | File ownership lists. The orchestrator diff review rejects out-of-scope changes. |
| Jira project creation not possible via MCP | The human creates project NC by hand (already requested). |
| Scope creep (extra mechanics) | PDF §3 table copied into the spec as fixed rules. Replay protection is explicitly out of scope. |
