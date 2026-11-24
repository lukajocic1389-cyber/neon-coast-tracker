# Task brief: dashboard (Jira NC-5)

**Worker:** dashboard · **Branch:** `feature/NC-1-dashboard` · **Worktree:** `../NeonCoast-wt-dashboard`
**Commit prefix:** `NC-5 <type>: <summary>`

Read first: `CLAUDE.md`, `AGENTS.md`, `spec.md` (**§4.4, §4.5 and §5** are your contract). The store and app are being
built in parallel by another worker. Code against the **spec shapes** and test with stub data. Do not import `src/store.js` or `src/app.js`.

## Goal
Server-rendered HTML pages for the dashboard: a polished **dark neon** look, CSS only, auto-refreshing every 5 seconds.
The human asked for this look at GATE 1, so make it genuinely good-looking, but keep it simple and accessible.

## Files you own (create or edit ONLY these)
- `src/dashboard/render.js`: pure functions that return HTML strings:
  - `renderIndex(summaries, { now })`: a list or table of all players (name, id, completed, failed, cash, total reputation),
    each linking to `/players/<id>`. Empty state if the array is empty.
  - `renderPlayer(dashboard, { now })`: name and id; four stat tiles (completed, failed, cash, total reputation); a
    reputation-by-crew table (all crews, simple CSS bars are welcome); a recent-history table (event id, mission title + id, crew,
    result, cash awarded, reputation awarded, time). Failed rows are visibly marked (a badge or colour) and show 0 awarded.
    Empty history shows "No missions yet". Include a link back to `/`.
  - `renderNotFound(playerId)`: a 404 page with a link back to `/`.
  - Every page: `<!doctype html>`, `lang="en"`, a viewport meta, `<meta http-equiv="refresh" content="5">`, a `<link rel="stylesheet"
    href="/static/styles.css">`, a title containing "Neon Coast", and a footer reading "Last updated <now as ISO UTC>" plus a
    "Fictional companion app. Not affiliated with any game publisher." line.
  - **Escape all dynamic text** (a `escapeHtml` helper covering `& < > " '`).
  - Formatting: cash as `$1,450` (`en-US` grouping), timestamps shown as `YYYY-MM-DD HH:mm UTC`.
  - **Stable test hooks** (the orchestrator's end-to-end test depends on them; use exactly these):
    `data-testid="completed-count"`, `"failed-count"`, `"cash-balance"`, `"total-reputation"`. Each holds the **raw integer** in a
    `data-value` attribute too, e.g. `<span data-testid="cash-balance" data-value="1450">$1,450</span>`. Per crew:
    `data-testid="rep-crew" data-crew="Harbor Crew" data-value="40"`. Each history row: `<tr data-testid="history-row"
    data-event-id="…" data-result="completed|failed">`. Index rows: `<tr data-testid="player-row" data-player-id="P-01">`.
- `src/dashboard/routes.js`: `createDashboardRouter({ getDashboard, listPlayerSummaries, now = () => new Date() })` → an Express
  `Router` with `GET /` → `renderIndex`, `GET /players/:player_id` → `renderPlayer`, or 404 + `renderNotFound` when
  `getDashboard` returns `null`. Content type `text/html; charset=utf-8`.
- `public/styles.css`: the dark neon theme:
  - Deep navy or black background, cyan and magenta accents, a subtle glow on tiles and headings.
  - System font stack only, with **no external fonts, images or scripts**.
  - Readable contrast (body text ≥ 4.5:1).
  - Responsive: tiles wrap and tables scroll horizontally on narrow screens.
  - `prefers-reduced-motion` respected if you add any animation.
- `test/unit/dashboard-*.test.js`: your tests.

## Files you must NOT touch
Everything else, including `src/catalog.js` (you may import `CREWS` from it read-only), `package.json`, `spec.md`,
`src/*.js` outside `src/dashboard/`, `src/sim/**` and `scripts/**`. **No new dependencies** (Express 5 and supertest are installed).
Put any requests under "Requests to orchestrator".

## Tests you must write (node:test, plus supertest on a tiny Express app that mounts your router with stub functions)
- `renderPlayer` shows the correct numbers in the test hooks (`data-value`) for a stub dashboard; failed rows are marked; every crew
  appears; empty history shows "No missions yet".
- HTML escaping: a stub player name like `<script>alert(1)</script>` is escaped.
- The meta refresh `content="5"` and the stylesheet link are present on every page.
- Routes: `GET /` → 200 HTML with one row per summary; `GET /players/P-01` → 200; an unknown player → 404 with the not-found page.
- The `now` injection makes "Last updated" deterministic in tests.

## Definition of done
- `npm test` passes in this worktree. Paste the real summary lines into your report.
- Visual check: build a throwaway preview HTML file (outside the repo, e.g. in `/tmp`) from stub data with `renderPlayer` and open it
  if you can. Say in your report whether you actually looked at it. **Do not commit preview files.**
- `git diff --stat feature/NC-1-mission-tracker...HEAD` shows only files you own.
- Small commits with the `NC-5` prefix. Do not push, merge or touch Jira or GitHub.
- When completely done: append a `## Worker report` section to the end of THIS file, commit it, then run `touch .worker-done` in the worktree root.

## Requests to orchestrator
_(none yet)_
