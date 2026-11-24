# CLAUDE.md — project instructions for Claude Code

Neon Coast: Mission & Reputation Tracker. It is a small, fictional companion web app for an AI-native SDLC assessment.
Read `intent.md`, `spec.md` and `plan.md` before changing anything. `spec.md` is the contract.

## Non-negotiables
- **Fixed business rules (spec §1)**: completed adds rewards once; failed is recorded with no reward; a duplicate `event_id`
  gets no new record and no reward, and returns a clear duplicate response; an unknown player or mission is rejected;
  data survives a restart. **Do not add game mechanics** that are not in the spec.
- **Fictional content only.** No GTA, Rockstar or other real game names, characters, art or trademarks.
- **Never fabricate** test results, CI results, commits, Jira history or reviews. Report real command output.
- Every commit message starts with the Jira key: `NC-<n> <type>: <summary>`. Keep commits small and meaningful.
- Stay inside the files your task brief (`tasks/<name>.md`) assigns to you. Do not touch other files.

## Stack (see spec D1/D2 for the final decision)
Node 24 LTS, ESM (`"type": "module"`), Express 5, built-in `node:sqlite` (`DatabaseSync`), `node:test` + `supertest`.

## Commands
- `npm install`: install dependencies
- `npm test`: run the full test suite (must pass before any commit that touches `src/`)
- `npm start`: start the server (`PORT`, default 3000; `DB_PATH`, default `./data/neon-coast.db`)
- `npm run simulate -- --url http://localhost:3000 --seed 42 --count 120 [--verify]`

## Code conventions
- Small modules with pure functions where possible. `rules.js` and `validation.js` have no I/O.
- All writes for one event happen in one SQLite transaction. Duplicate protection relies on `UNIQUE(event_id)`.
- Totals are derived from the `events` table. Do not add separate counter tables.
- Errors use the codes listed in spec §4.2. Responses use the shapes in spec §4.3–4.4.
- Tests use temporary DB files (`os.tmpdir()`), never `./data`.
- No new dependencies without recording the reason in `docs/ai-decisions.md`.

## Docs to keep current
- `docs/ai-decisions.md`: each significant suggestion, whether it was accepted, changed or rejected, why, and who decided.
- `docs/jira-log.md`: a copy of every Jira update posted, appended in real time.
