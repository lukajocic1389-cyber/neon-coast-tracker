# Neon Coast: Mission & Reputation Tracker

A small, fictional companion web app for an open-world city. A simulated game engine sends mission results as JSON. The
tracker validates them, applies the progression rules **exactly once**, stores everything in SQLite, and shows a per-player
dashboard. Built for an AI-native SDLC assessment.

> Fictional content only. Not affiliated with any game or game publisher.

- **Jira:** [NC-1](https://lukajocic1389.atlassian.net/browse/NC-1) (Story) with sub-tasks NC-2 … NC-9
- **Planning:** [`intent.md`](intent.md) · [`spec.md`](spec.md) (API contract, rules, decisions) · [`plan.md`](plan.md)
- **AI instructions:** [`CLAUDE.md`](CLAUDE.md) · [`AGENTS.md`](AGENTS.md) · worker briefs in [`tasks/`](tasks)
- **Evidence:** [`docs/testing.md`](docs/testing.md) · [`docs/ai-decisions.md`](docs/ai-decisions.md) · [`docs/jira-log.md`](docs/jira-log.md) · [`docs/evidence/`](docs/evidence)

## Business rules

| Situation | Result |
|---|---|
| Completed mission | `cash_reward` and `reputation_reward` are added once, to the player and to that mission's crew |
| Failed mission | Recorded, but nothing is awarded |
| Same `event_id` again | No second record and no reward. `200 duplicate` (or `409 duplicate_conflict` if the data differs) |
| Unknown player or mission | `400 rejected` with an error code and a message |
| App restart | History, cash and crew reputation are kept (SQLite file on disk or on a Docker volume) |

## Run it

### Option A: Docker (recommended, only Docker needed)

```bash
docker compose up -d --build
open http://localhost:3000            # dashboard (or just visit it in a browser)
```

Data lives in the named volume `tracker-data`, so it survives `docker compose restart` and `docker compose down` / `up`.
`docker compose down -v` deletes it. Use `PORT=3100 docker compose up -d` to publish on another port.

### Option B: Local Node

Requires **Node 24+** (it uses the built-in `node:sqlite`).

```bash
npm ci
npm start                              # http://localhost:3000, DB at ./data/neon-coast.db
# options: PORT=4000 DB_PATH=/tmp/nc.db npm start
```

### Feed it simulated events

With the app running (either option), in a second terminal:

```bash
npm run simulate -- --url http://localhost:3000 --seed 42 --count 120 --verify
```

This sends **138 requests**: 120 valid events (about 25% failed missions), 12 duplicate resends and 6 deliberately invalid
events. It prints the results and the expected per-player totals. `--verify` then checks every dashboard against those totals
(it assumes the DB was empty before the run). The dashboard refreshes itself every 5 seconds, so you can watch the numbers arrive.
Run the same command again: every valid event now comes back as a duplicate and the totals don't move.

## API (full contract in [`spec.md`](spec.md) §4)

| Method | Path | |
|---|---|---|
| GET | `/api/health` | `{"status":"ok"}` |
| GET | `/api/missions` | mission catalog (7 missions, 3 crews) |
| GET | `/api/players` | player summaries |
| POST | `/api/events` | submit a mission result → 201 / 200 / 409 / 400 |
| GET | `/api/players/:id/dashboard` | dashboard data as JSON (404 for an unknown player) |
| GET | `/` and `/players/:id` | HTML dashboard |

```bash
curl -s -X POST localhost:3000/api/events -H 'content-type: application/json' -d '{
  "event_id":"RUN-1001","player_id":"P-01","mission_id":"M-12","crew":"Harbor Crew",
  "result":"completed","cash_reward":500,"reputation_reward":20,"timestamp":"2026-11-20T15:00:00Z"}'
# {"status":"accepted","event_id":"RUN-1001","result":"completed","awarded":{"cash":500,"reputation":20,"crew":"Harbor Crew"}}
```

## Tests

```bash
npm test                               # 172 tests: unit + integration (real server restarts), about 1 s
node scripts/mutation-check.mjs        # breaks duplicate handling / the reward rule, confirms tests fail, restores
```

See [`docs/testing.md`](docs/testing.md) for how each required test group is covered, coverage, and the mutation results.
CI (GitHub Actions, `.github/workflows/ci.yml`) runs on every push and pull request:
1. `npm ci` + `npm test` on Node 24.
2. A Docker job: `docker compose up --build`, the simulator with `--verify` against the container, then a container restart and a check that the data is unchanged.

## Project layout

```
src/
  catalog.js        seed data: crews, missions, players (fictional)
  validation.js     event validation, all error codes      rules.js   the reward rule (only place)
  db.js             SQLite schema + seeding                store.js   submit / duplicates / dashboard queries
  app.js            Express app and /api routes            server.js  entry point, graceful shutdown
  dashboard/        server-rendered HTML pages + router
  sim/              seeded PRNG, plan generator, expected totals, HTTP client
public/styles.css   dark neon theme (CSS only)
scripts/            simulate.js (CLI), mutation-check.mjs
test/               integration tests;  test/unit/  unit tests
```

## How it was built

Planned, implemented, tested and reviewed with Claude Code: an orchestrator agent plus three parallel worker agents in separate
git worktrees, with human gates for the decisions. Who did what is recorded in [`docs/ai-decisions.md`](docs/ai-decisions.md) and,
at the end, in `docs/final-report.md`.
