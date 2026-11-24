# Jira update log (project NC)

A copy of every update posted to Jira, appended at the moment it is posted. Times are local (Europe/Belgrade, CET).
Each entry notes who posted it (the agent via the Atlassian MCP, or the human by hand) and any status transitions.

Jira: https://lukajocic1389.atlassian.net/browse/NC-1

---

## 2026-11-24 ~16:50 CET: issues created (agent, via MCP)
- Story **NC-1** "Build Neon Coast Mission & Reputation Tracker", with all Phase 1 fields (objective, scope, requirements,
  NFRs, acceptance criteria, tasks, assumptions, risks, deliverables). Labels: `ai-native-sdlc`, `assessment`.
- Sub-tasks: NC-2 Planning · NC-3 Core · NC-4 Simulator · NC-5 Dashboard · NC-6 Tests and mutation check · NC-7 CI/CD ·
  NC-8 PR and AI review · NC-9 Final report.
- Before this, the **human** created project NC by hand, because the Atlassian MCP has no project-creation operation.

## 2026-11-24 16:54 CET: Phase update: Planning (agent, via MCP), comment id 10000
**Transitions:** NC-1 To Do → **In Progress** · NC-2 → **Done**

> **[Phase update: Planning] posted by the Claude Code orchestrator agent via the Atlassian MCP**
>
> **Interpretation**
> - Build a small, reliable companion web app, not a game.
> - The fixed rules from brief §3: completed missions reward exactly once; failed missions are recorded with no reward; a repeated `event_id` gives a duplicate response with no second record; unknown players or missions are rejected; data survives a restart.
> - Nothing beyond those rules. Mission replay protection is explicitly out of scope; it is the interview change.
>
> **Decisions:** the human answered GATE 1 and accepted all 19 recommendations (D1–D19), with two notes:
> - **D13:** sub-tasks are used because the Subtask type exists (NC-2…NC-9).
> - **D15:** the dashboard gets a dark neon theme and a 5-second auto-refresh.
> - **D14:** this board only has To Do / In Progress / Done, so the status history uses those three.
>
> **Key assumptions:** fixed roster of 5 fictional players; reward amounts come from the event; the event crew must match the catalog crew; a failed event stores its reported rewards but awards 0; `event_id` is unique globally (200 duplicate if the payload is identical, 409 if the data differs); rejected events are not stored; local only, single instance, no auth.
>
> **Stack:** Node 24, Express 5, built-in `node:sqlite`, `node:test` + supertest, and server-rendered HTML.
>
> **Planning artifacts** are committed locally on branch `feature/NC-1-mission-tracker`: `681b539` (on main, repository init), `9c0f277` (intent.md, spec.md, plan.md), `b278d2c` (CLAUDE.md, AGENTS.md), `141dbfc` (docs/ai-decisions.md). The GitHub repository is created and pushed in the CI/CD phase (NC-7) as planned. Links to intent.md, spec.md and plan.md will be posted here then. Until then the links are not available.
>
> **AI review of the plan:** before GATE 1, an advisor model reviewed the drafts and found 9 gaps, all fixed. Examples: the simulator counts were ambiguous; the contract between the core and dashboard workers was missing; Node 24 support was unverified (then verified on v24.22.3); two unsupported statements were removed from the decision log.
>
> **Next:** Implementation (NC-3 core, NC-4 simulator, NC-5 dashboard) by three parallel worker agents, each in its own git worktree.
>
> **Status:** NC-1 To Do → In Progress · NC-2 → Done

## 2026-11-24 17:05 CET: Phase update: Implementation (mid) (agent, via MCP), comment id 10001
**Transitions (made earlier, when the workers started):** NC-3, NC-4, NC-5 → **In Progress**

> **[Phase update: Implementation (mid)] posted by the Claude Code orchestrator agent via the Atlassian MCP**
>
> **Setup:** scaffold committed (`78ad089`): Node 24 project, Express 5.3.0 and supertest 7.3.2 pinned, and a frozen seed catalog with 7 missions, 3 crews and 5 players. Three worker Claude Code agents run in parallel, each in its own git worktree and cmux workspace, from written briefs (`tasks/core.md`, `tasks/simulator.md`, `tasks/dashboard.md`). No two workers own the same file.
>
> **What works now:** **NC-5 Dashboard: merged** (`c4a7fda`) after orchestrator diff review: server-rendered player index, player page and 404; dark neon CSS theme with a 5 s meta refresh; all dynamic text HTML-escaped; stable `data-testid` hooks for end-to-end tests. Full suite on the feature branch after the merge: **25 tests, 25 pass, 0 fail**. The dashboard worker checked its pages visually with Playwright screenshots, and found and fixed a layout bug where ids broke mid-token and a markup mismatch with its brief (`7e57cec`, `f146ce2`).
>
> **Work remaining:** NC-3 Core (DB, validation, rules, store, API): the worker is in progress. NC-4 Simulator: the worker is in progress. Integration (mount the dashboard in the app, run the simulator against the live server), then the end-of-implementation update.
>
> **Blockers:** none.
>
> **Changes in scope:** none. One process note: the orchestrator is writing the integration tests from spec.md only, without reading the worker code, so the tests are an independent check (decision #10 in docs/ai-decisions.md).
>
> **Status:** NC-1 In Progress · NC-3 / NC-4 / NC-5 In Progress. NC-5 moves to Done after the integration end-to-end test passes against the real store.
