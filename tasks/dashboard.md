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
- Please record the dashboard judgment calls listed in the Worker report below in `docs/ai-decisions.md`. I am not allowed to edit that file.

## Worker report

**Worker:** dashboard (Claude Code, Opus 5.5) · **Jira:** NC-5 · **Branch:** `feature/NC-1-dashboard` · **Date:** 2026-11-24

### What was built
- `src/dashboard/render.js`: pure functions `escapeHtml`, `formatCash`, `formatInt`, `formatTimestamp`, `renderIndex`,
  `renderPlayer` and `renderNotFound`. Every page has the doctype, `lang="en"`, the viewport meta, `<meta http-equiv="refresh" content="5">`,
  `/static/styles.css` and a title ending in "· Neon Coast". The footer reads "Last updated <ISO UTC>" (contiguous plain text) plus the
  "Fictional companion app…" line. Every dynamic value is escaped, in text, attributes and `<title>`. Player links use
  `encodeURIComponent` and are then escaped.
- The test hooks match the brief exactly. The stat hooks are bare `<span data-testid="…" data-value="…">` elements inside a styled wrapper, e.g.
  `<span data-testid="cash-balance" data-value="1450">$1,450</span>`, and a test asserts that exact string. The hooks are: `completed-count`, `failed-count`, `cash-balance` and `total-reputation`, each with a raw `data-value`;
  `rep-crew` with `data-crew` and `data-value`; `history-row` with `data-event-id` and `data-result`; and `player-row` with `data-player-id`. Each of the
  four stat hooks appears exactly once, on the player page only. The index rows use plain cells and do not reuse them. The "No missions yet"
  empty state is a `<p>`, not a `history-row`, so row counts stay correct.
- `src/dashboard/routes.js`: `createDashboardRouter({ getDashboard, listPlayerSummaries, now })` provides `GET /`, `GET /players/:player_id`
  and a 404 when `getDashboard` returns `null`. It sends `Content-Type: text/html; charset=utf-8`. Both injected functions are `await`ed,
  so sync and async stores both work. There is no catch-all route, because the router is mounted at `/`. It throws a `TypeError` if
  either function is missing.
- `public/styles.css`: the dark neon theme. It has a navy/black background, cyan/magenta/violet/green accents and glowing tiles and
  headings, with system fonts only and no `url(`, `@import` or fonts. Tables are inside a horizontal-scroll wrapper. Tiles wrap
  (auto-fit at ≥ 12rem each; 2 columns under 40rem, 1 under 22rem). There are no animations, and a `prefers-reduced-motion` guard is included anyway. `color-scheme: dark` prevents a white flash on refresh.
  Failed rows have a text badge "FAILED" (not colour alone), a magenta left edge and muted amounts.
- **Contrast** was computed with the WCAG formula for every text colour against the page, panel, alternate-row, hover and failed-badge
  backgrounds. The lowest value is magenta on the failed-badge tint at **5.80:1**. Body text is **15.4–17.2:1**, and muted text is ≥ 7.1:1 (7.16 at its lowest).

### Judgment calls (please log in `docs/ai-decisions.md` if you agree; I may not edit it)
1. **`renderNotFound(playerId, { now } = {})`**: the brief's signature has no `now`, but "every page" needs a deterministic
   "Last updated". I added an optional second argument, and the route passes `now()`. It is backward compatible.
2. **Total reputation on the player page** is the sum of `reputation_by_crew`, because §4.4 has no total field. The index uses
   `total_reputation` from §4.5.
3. **Crew rows** iterate `CREWS` from `src/catalog.js` (0 if missing) and then any extra crews in the data, so "all crews" holds even
   if the store omits one. The bars are relative to the highest crew value, and an all-zero max is guarded.
4. The view shows `cash_awarded` and `reputation_awarded` **as given**. It does not re-implement the failed → 0 rule. That rule belongs to the core.
5. Footer text: "Last updated <ISO> · refreshes every 5 seconds", with the ISO string as plain contiguous text so that a `Last updated <ISO>` substring check works.

### Test output (real, `npm test` in this worktree, Node **v26.10.0** locally, not 24)
```
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
22 of the 25 tests are mine (15 in `test/unit/dashboard-render.test.js`, 7 in `test/unit/dashboard-routes.test.js`). The other 3 are the existing catalog tests.
They cover: hook values, failed-row marking and 0 awarded, every crew (including a missing one), the empty history, escaping of a hostile name, event id and
URL param on the 404, the meta refresh and stylesheet on every page, the deterministic footer via `now`, the routes 200/200/404, async stubs,
the router not answering other paths, and the constructor guard.

### Visual check: yes, I actually looked
I ran a throwaway Express preview (stub data, `/static` served from `public/`) from the session scratchpad, outside the repo, and
viewed it with Playwright screenshots. I checked the player page at 1280 px and 390 px, the index at 1100 px, the empty player (P-05) and the 404. I did not look at the intermediate
  (~800 px, 3+1 tile) layout. The screenshots predate `f146ce2`, which only changed the footer `<time>` element and added a nested hook span with no styling of its own.
- The first look showed event ids, mission ids and crew names breaking mid-token. This was fixed in `7e57cec` (only the mission title may wrap now).
- At 390 px I measured the DOM: document width = client width (375 + 15 px scrollbar), 16 px gutters, and no element outside `.table-wrap`
  overflows. Only the history table scrolls horizontally, as intended.
- Browser console: only `/favicon.ico` 404 and the intentional 404 status of `/players/P-99`.
- The preview server was stopped. Playwright's `.playwright-mcp/` output folder (written into the worktree) was deleted, and no preview files were committed.

### Scope check
`git diff --stat feature/NC-1-mission-tracker...HEAD` before this report: `public/styles.css`, `src/dashboard/render.js`,
`src/dashboard/routes.js`, `test/unit/dashboard-render.test.js` and `test/unit/dashboard-routes.test.js` (5 files, 917 insertions). This report
adds `tasks/dashboard.md` itself, as the brief requires. No dependencies were added, and `src/store.js` and `src/app.js` are not imported.

### Commits
`82ed232` render functions + tests · `fb34d3a` router + tests · `d55175c` stylesheet · `7e57cec` CSS wrap fix · `597a7ca` report · `f146ce2` footer and stat-hook markup aligned with the brief · (this report correction)

### Known gaps / notes for integration
- The app must serve `public/` at `/static` (per `tasks/core.md`, `app.use('/static', express.static(...))`), or the pages render unstyled.
- No favicon, so browsers log a harmless `/favicon.ico` 404. This is out of scope and needs no image asset.
- Untested against the real store. The integration e2e (T4/T5) will be the first real-data run.
