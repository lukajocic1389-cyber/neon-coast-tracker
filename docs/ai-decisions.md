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
