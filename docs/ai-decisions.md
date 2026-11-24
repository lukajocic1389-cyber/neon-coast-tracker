# AI decision log

Every significant suggestion is logged with: who suggested it, the outcome (accepted / changed / rejected), why, and who decided.
"Agent" = Claude Code orchestrator session unless stated otherwise. "Human" = the repository owner who runs this session and answers the gates.

| # | Date | Phase | Suggestion (by) | Outcome | Why | Decided by |
|---|---|---|---|---|---|---|
| 1 | 2026-11-24 | Preflight | The agent noticed that the instructions contained unfilled placeholders `<GITHUB_USER>` and `<KEY>` and asked for them instead of guessing (agent) | Accepted | Guessing an account or project would risk pushing or posting to the wrong place | Human |
| 2 | 2026-11-24 | Preflight | Use GitHub account `lukajocic1389-cyber`, the git identity `Luka <lukajocic1389@gmail.com>` | Accepted | Confirmed as correct by the human | Human |
| 3 | 2026-11-24 | Preflight | Use the existing Jira project `KAN` (agent listed `KAN` and `SAM1` as the only options) | **Rejected → changed** | The human wants a dedicated project: "Neon Coast", key `NC` | Human |
| 4 | 2026-11-24 | Preflight | Create Jira project NC via the Atlassian MCP (agent) | **Not possible** | The MCP exposes no Jira project-creation operation (checked with `discover` twice). The human creates NC by hand. | Agent found it; human acts |
| 5 | 2026-11-24 | Preflight | Use CodeRabbit for the PR review (original instructions) | **Rejected → changed** | The human chose to skip CodeRabbit. Replacement: a fresh subagent that has not seen the implementation reviews the PR diff against spec.md and the PDF and posts a PR comment labelled AI review. GATE 2 unchanged. | Human |
| 6 | 2026-11-24 | Planning | The instruction was to stop if the MCP could not create project NC. The agent stopped all Jira writes and commits, but kept drafting the Phase 1 documents locally while waiting, because the drafts do not depend on Jira (agent) | **Pending human acceptance at GATE 1** | It saves time and nothing external was touched. The human may reject it and ask for the drafts to be discarded or redone. | Agent (to be confirmed by the human) |
| 7 | 2026-11-24 | Planning | Before GATE 1, the agent consulted an advisor model to review the drafts (agent) | **Accepted** (agent) | The advisor found real gaps, and all of them were fixed before the gate: ambiguous simulator counts, missing summary/store contract between workers, undefined duplicate-hash input, mixed timestamp precision breaking order, Node 24 not verified (then verified in `node:24-alpine`), and two unsupported statements in this log (an invented reason for skipping CodeRabbit, and naming the human from git config) | Agent |

| 8 | 2026-11-24 | Planning | Human created Jira project NC by hand (team-managed Kanban). The agent read its real configuration via the MCP: work types Epic, Story, Subtask, Task, Bug; statuses To Do, In Progress, Done | — (fact) | — | Human acted; agent verified |

### GATE 1 — answers to spec.md §9 (2026-11-24)

The agent proposed every option and recommendation below. The human answered: *"I accept all recommendations D1–D19"*, with two notes (D13, D15).

| D | Question | Agent recommendation | Outcome | Why (from spec §9) | Decided by |
|---|---|---|---|---|---|
| D1 | Stack | Node 24 + Express 5 + `node:sqlite` + `node:test`/supertest, plain JS | Accepted | Few dependencies, fast CI, easy to explain | Human |
| D2 | Persistence | SQLite file | Accepted | Transactions plus a UNIQUE constraint give real duplicate safety | Human |
| D3 | Duplicate response | 200 `duplicate` if identical; 409 `duplicate_conflict` if the same id has different data | Accepted | Retries are not errors; a reused id with changed data is surfaced | Human |
| D4 | Crew mismatch | Reject (`CREW_MISMATCH`) | Accepted | Keeps reputation on the correct crew | Human |
| D5 | Reward bounds | Non-negative integers, cash ≤ 1,000,000, reputation ≤ 1,000 | Accepted | Input validation, not a mechanic | Human |
| D6 | Failed event with rewards | Accept, store the reported values, award 0 | Accepted | BR-2 says "record the event" | Human |
| D7 | Players | Fixed seeded roster P-01…P-05 | Accepted | Auto-create would contradict BR-4 | Human |
| D8 | `event_id` scope | Global | Accepted | Strict reading of the PDF | Human |
| D9 | History order | Event timestamp desc, arrival seq tie-break | Accepted | Reflects when the mission happened | Human |
| D10 | Store rejected events | No | Accepted | Not required | Human |
| D11 | Totals | Derived from the events table | Accepted | Single source of truth | Human |
| D12 | Invalid events in the simulator | Yes (6) | Accepted | Realistic engine errors | Human |
| D13 | Jira structure | Story plus sub-tasks | **Accepted with a condition**: sub-tasks only if the Subtask type exists in NC, otherwise a checklist in the Story. The type exists, so sub-tasks NC-2…NC-9 were created | Finer traceability | Human (condition); agent verified the type exists |
| D14 | Board columns | The human adds In Review / Testing | **Accepted, but not available**: the NC board has only To Do / In Progress / Done, and the human said "use what exists". The status history will therefore use those three | No extra columns were added; the agent does not change board settings | Human |
| D15 | Dashboard | Server-rendered HTML | **Changed by the human**: plus a polished dark neon theme (CSS only) and a meta refresh so new events appear without a reload. Agent chose a 5 s interval | Visual quality for the demo; live view during the simulator run | Human (agent picked 5 s) |
| D16 | Unknown extra fields | Ignore | Accepted | Tolerant of engine additions | Human |
| D17 | History size | 10 | Accepted | — | Human |
| D18 | Branching | main ← PR ← `feature/NC-1-mission-tracker` ← worker branches | Accepted | — | Human |
| D19 | Commit assignment.pdf | No, gitignore it | Accepted | It is the employer's document | Human |

**Decision #6** (the agent kept drafting after "stop"): **accepted by the human** — "since nothing external was touched".

### Jira mapping
NC-1 Story · NC-2 Planning · NC-3 Core · NC-4 Simulator · NC-5 Dashboard · NC-6 Tests and mutation check · NC-7 CI/CD · NC-8 PR and AI review · NC-9 Final report

### Implementation (Phase 2)

| # | Date | Phase | Suggestion (by) | Outcome | Why | Decided by |
|---|---|---|---|---|---|---|
| 9 | 2026-11-24 | Impl | Run 3 worker Claude Code sessions in parallel, each in its own git worktree and cmux workspace, started with `--permission-mode acceptEdits`. File edits are auto-accepted inside the worktree; other shell commands still follow `.claude/settings.json` (agent) | Accepted | Visible, isolated parallel work. Not `--dangerously-skip-permissions`, so a permission prompt would stop a worker instead of letting it act | Agent (within the human's "max 3 workers, own worktree" rule) |
| 10 | 2026-11-24 | Impl | The orchestrator writes the Phase 4 integration tests itself, **from spec.md only, without reading the worker code**, while the workers build (agent) | Accepted | Avoids the AI implementing code and then writing tests that just mirror that implementation. The tests are a second, independent reading of the spec | Agent |
| 11 | 2026-11-24 | Impl | The dashboard worker made 5 judgment calls (see `tasks/dashboard.md` → Worker report): optional `now` on `renderNotFound`; total reputation = sum of crews on the player page; crew rows iterate the catalog `CREWS`; the view shows awarded values without re-applying rules; footer wording (worker) | **Accepted, all 5** | Each is backward compatible with the spec, and #4 keeps the reward rule in exactly one place (`rules.js`) | Agent (orchestrator review) |
| 12 | 2026-11-24 | Impl | The dashboard worker's own visual check found ids and crew names breaking mid-token and fixed it (`7e57cec`). It also found a markup mismatch with the brief's hook format and fixed it (`f146ce2`) (worker self-correction) | Accepted | A real AI self-correction, caught by looking at screenshots rather than by tests | Worker; verified by orchestrator diff review |
| 13 | 2026-11-24 | Impl | The simulator's `runPlan` also flags a 400 whose `errors[].code` does not include the planned `expectedCode` (inclusion check) (worker) | **Accepted** | Without it, a wrong 400 (for example a crew check firing instead of an unknown-mission check) would look correct. It is reported, not fatal | Agent (orchestrator review) |
| 14 | 2026-11-24 | Impl | Exit code 64 for bad CLI usage, beyond the brief's 0/1/2 (worker) | **Accepted** | Keeps 1 (verify mismatch) and 2 (unreachable) unambiguous. 64 is the BSD `EX_USAGE` convention | Agent (orchestrator review) |
| 15 | 2026-11-24 | Impl | The simulator worker found its own bug: started through a symlinked path, the CLI printed nothing and exited 0. It reproduced the bug, fixed it with a realpath guard and added a regression test (`9fc0373`). It also capped the seed at 2^32-1 so ids cannot alias (worker self-correction) | Accepted | Real self-correction caught by manual testing, now covered by a test | Worker; verified by orchestrator review |
| 16 | 2026-11-24 | Impl | The core worker's 6 decisions (see `tasks/core.md` → Worker report): `express.json({ strict: false })` so top-level non-objects give `INVALID_BODY`; `busy_timeout=5000`; a real-date check that compares parsed UTC parts back against the input (V8 rolls Feb 30 over to Mar 2); `ROLLBACK` on the duplicate path; response shapes for 500 / other 4xx / unknown `/api` route; wording of error messages (worker) | **Accepted, all 6** | Each is inside the spec or fills a gap the spec left open, without changing a business rule. #1 is backed by the worker's own mutation (strict parser → a test fails). #3 closes a real JS date pitfall | Agent (orchestrator review) |
| 17 | 2026-11-24 | Impl | The core worker ran its own quick mutation check. Disabling only the duplicate pre-check broke **0** tests, because the `UNIQUE` + errcode 2067 safety net caught every duplicate. Disabling both broke 7 (worker) | Noted. Both layers are kept | It shows the DB-level guard works on its own, and that the full mutation check (Phase 3) must break **both** layers to count as "breaking duplicate handling" | Agent |
| 18 | 2026-11-24 | Impl | The orchestrator's 34 independent integration tests (decision #10) were run against the merged worker code: **34 / 34 passed on the first run**. Full suite: 172 / 172 (orchestrator) | Noted | Two independent readings of the spec agree. On its own a first-run pass does not prove the tests are strong; the Phase 3 mutation check is what shows that | Agent |
| 19 | 2026-11-24 | CI/CD | The first green CI run showed "Node.js 20 is deprecated" for `actions/checkout@v4` and `actions/setup-node@v4`. The agent checked the actions' own `action.yml` on GitHub (v7 = `using: node24`) and upgraded to `@v7` (agent) | Accepted | It removes the deprecation without guessing a version. The re-run (45434677399) was green with 0 deprecation lines | Agent |
| 20 | 2026-11-24 | CI/CD | The CI also runs a Docker job: compose up, the simulator with `--verify` against the container, then a container restart and a check that the data is unchanged (agent) | Accepted | The PDF asks CI only for tests. This job also proves the documented Docker launch and the persistence on every push | Agent |
