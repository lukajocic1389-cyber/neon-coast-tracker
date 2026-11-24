# Jira Story draft (historical)

> This draft was shown to the human at GATE 1. After the answers it was regenerated and **created as NC-1** on 2026-11-24
> (https://lukajocic1389.atlassian.net/browse/NC-1). The Jira issue is the source of truth. Differences from this draft:
> D4 resolved, the dashboard got a neon theme and a 5 s auto-refresh (D15), and the tasks became sub-tasks NC-2…NC-9.

**Issue type:** Story · **Project:** NC (Neon Coast) · **Summary:** Build Neon Coast Mission & Reputation Tracker

## Business objective
Give players of the fictional open-world city Neon Coast a trustworthy companion dashboard for their progress.
A simulated game engine sends mission results as JSON. The tracker validates them, applies the fixed progression
rules exactly once, and shows cash, per-crew reputation, and mission history. The assessment goal is to show
an AI-native SDLC from idea to working, tested and deployed software, with a truthful evidence trail.

## Scope
**In:** mission catalog (7 fictional missions, 3 crews), fixed player roster (5), event API with validation and duplicate
handling, progression rules, SQLite persistence, server-rendered dashboard, seeded simulator (100+ events),
automated tests, GitHub Actions CI, Docker/compose launch, final report.
**Out:** game engine or 3D, authentication, player registration, spending or other mechanics, hosting, and
mission replay protection (interview change; practised separately).

## Requirements
1. Mission catalog: at least 5 missions, each with ID, title, crew, and description.
2. Event API `POST /api/events`: validate fields; reject unknown players or missions and invalid values with clear errors;
   ignore duplicate `event_id`s so rewards are never counted twice.
3. Progression: completed adds `cash_reward` and `reputation_reward` to the player; failed awards nothing;
   reputation is stored per crew.
4. Dashboard: completed and failed counts, cash balance, reputation by crew, and recent mission history per player.
5. Simulator: a script submits 100+ seeded events, including failed missions, duplicates, and invalid events.
6. Persistence: progress and history survive an application restart.

## Non-functional requirements
- Correctness first: duplicate safety is enforced at the database level (UNIQUE constraint plus a transaction).
- Reproducible: a one-command local start and Docker compose start with a persistent volume; a deterministic simulator.
- Testable: automated tests run on every push and PR in GitHub Actions.
- Simple and explainable: minimal dependencies, server-rendered UI, documented API contract.
- Fictional content only; no third-party game IP.
- Response time is not a concern at this scale (local, single instance).

## Acceptance criteria
- [ ] AC-1 The API accepts valid mission results and rejects invalid ones with useful messages.
- [ ] AC-2 Rewards are given once for completed missions and never for failed missions.
- [ ] AC-3 Duplicate events cannot increase a player's cash or reputation.
- [ ] AC-4 Dashboard totals match the saved events and remain correct after a restart.
- [ ] AC-5 The simulator submits 100 or more events with repeatable results.
- [ ] AC-6 Automated tests run on each push, and a documented local launch works.
- [ ] AC-7 The final report and relevant GitHub/CI evidence are linked in Jira.

## Implementation tasks
1. Planning artifacts: intent.md, spec.md, plan.md, CLAUDE.md, AGENTS.md
2. Scaffold and seed catalog
3. Core: data model, validation, rules, persistence, event API
4. Simulator: 100+ seeded events with failures, duplicates and invalid events
5. Dashboard: server-rendered player pages
6. Test suite (valid, invalid, completed vs failed, duplicates, persistence, API→dashboard flow, simulator repeatability) and a mutation check
7. CI/CD: GitHub Actions, Dockerfile, compose with a volume, README
8. PR plus an independent AI review, fixes, and merge
9. Final report (Markdown and PDF) linked here

## Assumptions
- Players are a fixed, seeded fictional roster. Events for any other player are rejected.
- Rewards come from the event (the engine is the source of reward amounts). The catalog defines mission and crew.
- The event's `crew` must match the mission's catalog crew (pending decision D4).
- A failed event may carry reward values. They are stored but never awarded.
- Single-instance local deployment; no authentication.

## Risks
- Double counting under retries or races → DB-level uniqueness and a dedicated test plus a mutation check.
- AI-written tests that do not actually test the rule → mutation check and human review.
- `node:sqlite` maturity → pinned Node 24; `better-sqlite3` fallback.
- Parallel AI workers conflicting → exclusive file ownership per worker, orchestrator review before merge.

## Expected deliverables
GitHub repository (source, README, intent/spec/plan, CLAUDE.md and AGENTS.md, tests, CI workflow); working app plus simulator;
a green CI run link; Docker and local startup steps; final report (MD and PDF); this Story with phase updates and evidence links.
