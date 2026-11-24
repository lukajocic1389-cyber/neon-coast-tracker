// Server-rendered HTML for the Neon Coast dashboard (spec §4.4, §4.5, §5).
// Pure functions: data in, HTML string out. No I/O. Every dynamic value goes through escapeHtml.

import { CREWS } from '../catalog.js';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use in HTML text nodes and double- or single-quoted attribute values. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const intFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 1450 → "$1,450"; -50 → "-$50". */
export function formatCash(amount) {
  const n = Number(amount) || 0;
  return `${n < 0 ? '-' : ''}$${intFormatter.format(Math.abs(n))}`;
}

/** 1234 → "1,234". */
export function formatInt(value) {
  return intFormatter.format(Number(value) || 0);
}

/** Any parseable timestamp → "YYYY-MM-DD HH:mm UTC". Unparseable input is returned unchanged. */
export function formatTimestamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  const iso = d.toISOString(); // always UTC: YYYY-MM-DDTHH:mm:ss.sssZ
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function toDate(now) {
  const d = now instanceof Date ? now : new Date(now ?? Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function playerHref(playerId) {
  return `/players/${encodeURIComponent(String(playerId ?? ''))}`;
}

function layout({ title, now, body }) {
  const updated = toDate(now).toISOString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>${escapeHtml(title)} · Neon Coast</title>
<link rel="stylesheet" href="/static/styles.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="/"><span class="brand-neon">Neon</span> <span class="brand-coast">Coast</span></a>
  <span class="brand-sub">Mission &amp; Reputation Tracker</span>
</header>
<main class="container">
${body}
</main>
<footer class="site-footer">
  <p>Last updated ${escapeHtml(updated)} · refreshes every 5 seconds</p>
  <p>Fictional companion app. Not affiliated with any game publisher.</p>
</footer>
</body>
</html>
`;
}

/** GET / — all players with their totals. `summaries` is the spec §4.5 array. */
export function renderIndex(summaries, { now } = {}) {
  const list = Array.isArray(summaries) ? summaries : [];
  let content;
  if (list.length === 0) {
    content = '<p class="empty">No players yet.</p>';
  } else {
    const rows = list.map((p) => `      <tr data-testid="player-row" data-player-id="${escapeHtml(p.player_id)}">
        <td><a class="player-link" href="${escapeHtml(playerHref(p.player_id))}">${escapeHtml(p.name)}</a></td>
        <td><code class="id">${escapeHtml(p.player_id)}</code></td>
        <td class="num">${formatInt(p.completed_count)}</td>
        <td class="num">${formatInt(p.failed_count)}</td>
        <td class="num cash">${formatCash(p.cash_balance)}</td>
        <td class="num rep">${formatInt(p.total_reputation)}</td>
      </tr>`).join('\n');
    content = `<div class="table-wrap">
  <table class="data-table">
    <caption class="visually-hidden">All players</caption>
    <thead>
      <tr><th scope="col">Player</th><th scope="col">ID</th><th scope="col" class="num">Completed</th><th scope="col" class="num">Failed</th><th scope="col" class="num">Cash</th><th scope="col" class="num">Total reputation</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
  }

  const body = `<h1 class="page-title">Crew Roster</h1>
<p class="lede">Every runner on the coast. Pick a name to open their dashboard.</p>
<section class="panel" aria-label="Players">
${content}
</section>`;
  return layout({ title: 'Players', now, body });
}

function statTile(testId, label, value, display, modifier) {
  return `  <div class="tile tile-${modifier}">
    <span class="tile-label">${escapeHtml(label)}</span>
    <span class="tile-value"><span data-testid="${testId}" data-value="${escapeHtml(value)}">${display}</span></span>
  </div>`;
}

function crewTable(reputationByCrew) {
  const rep = reputationByCrew && typeof reputationByCrew === 'object' ? reputationByCrew : {};
  // All catalog crews first (spec: "all crews"), then any extra crews the data happens to contain.
  const crews = [...CREWS, ...Object.keys(rep).filter((c) => !CREWS.includes(c))];
  const values = crews.map((c) => Number(rep[c]) || 0);
  const max = Math.max(0, ...values);
  const rows = crews.map((crew, i) => {
    const value = values[i];
    const pct = max > 0 ? Math.round((Math.max(0, value) / max) * 100) : 0;
    return `      <tr>
        <th scope="row">${escapeHtml(crew)}</th>
        <td class="num"><span data-testid="rep-crew" data-crew="${escapeHtml(crew)}" data-value="${escapeHtml(value)}">${formatInt(value)}</span></td>
        <td class="bar-cell" aria-hidden="true"><span class="bar"><span class="bar-fill" style="width: ${pct}%"></span></span></td>
      </tr>`;
  }).join('\n');
  return `<div class="table-wrap">
  <table class="data-table crew-table">
    <caption class="visually-hidden">Reputation by crew</caption>
    <thead>
      <tr><th scope="col">Crew</th><th scope="col" class="num">Reputation</th><th scope="col" class="bar-head"><span class="visually-hidden">Share</span></th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
}

function historyTable(history) {
  const list = Array.isArray(history) ? history : [];
  if (list.length === 0) {
    return '<p class="empty">No missions yet</p>';
  }
  const rows = list.map((e) => {
    const failed = e.result === 'failed';
    const badge = failed
      ? '<span class="badge badge-failed">Failed</span>'
      : `<span class="badge badge-completed">${e.result === 'completed' ? 'Completed' : escapeHtml(e.result)}</span>`;
    return `      <tr data-testid="history-row" data-event-id="${escapeHtml(e.event_id)}" data-result="${escapeHtml(e.result)}">
        <td><code class="id">${escapeHtml(e.event_id)}</code></td>
        <td>${escapeHtml(e.mission_title)} <code class="id dim">${escapeHtml(e.mission_id)}</code></td>
        <td>${escapeHtml(e.crew)}</td>
        <td>${badge}</td>
        <td class="num cash">${formatCash(e.cash_awarded)}</td>
        <td class="num rep">${formatInt(e.reputation_awarded)}</td>
        <td class="nowrap"><time datetime="${escapeHtml(e.timestamp)}">${escapeHtml(formatTimestamp(e.timestamp))}</time></td>
      </tr>`;
  }).join('\n');
  return `<div class="table-wrap">
  <table class="data-table history-table">
    <caption class="visually-hidden">Recent mission history</caption>
    <thead>
      <tr><th scope="col">Event</th><th scope="col">Mission</th><th scope="col">Crew</th><th scope="col">Result</th><th scope="col" class="num">Cash awarded</th><th scope="col" class="num">Rep awarded</th><th scope="col">Time</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
}

/** GET /players/:player_id — the spec §4.4 dashboard object. */
export function renderPlayer(dashboard, { now } = {}) {
  const d = dashboard ?? {};
  const player = d.player ?? {};
  const rep = d.reputation_by_crew ?? {};
  const completed = Number(d.completed_count) || 0;
  const failed = Number(d.failed_count) || 0;
  const cash = Number(d.cash_balance) || 0;
  // §4.4 has no total field: the total is the sum of the per-crew totals.
  const totalRep = Object.values(rep).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const body = `<nav class="crumbs"><a href="/">&larr; All players</a></nav>
<h1 class="page-title">${escapeHtml(player.name)} <code class="id title-id">${escapeHtml(player.player_id)}</code></h1>
<section class="tiles" aria-label="Totals">
${statTile('completed-count', 'Completed', completed, formatInt(completed), 'completed')}
${statTile('failed-count', 'Failed', failed, formatInt(failed), 'failed')}
${statTile('cash-balance', 'Cash', cash, formatCash(cash), 'cash')}
${statTile('total-reputation', 'Total reputation', totalRep, formatInt(totalRep), 'rep')}
</section>
<section class="panel" aria-labelledby="crew-heading">
<h2 id="crew-heading">Reputation by crew</h2>
${crewTable(rep)}
</section>
<section class="panel" aria-labelledby="history-heading">
<h2 id="history-heading">Recent history</h2>
${historyTable(d.recent_history)}
</section>`;
  return layout({ title: player.name || 'Player', now, body });
}

/** 404 page for an unknown player. `now` is optional so the footer can be deterministic in tests. */
export function renderNotFound(playerId, { now } = {}) {
  const body = `<section class="panel notfound">
<h1 class="page-title">Signal lost</h1>
<p>Player <code class="id">${escapeHtml(playerId)}</code> does not exist.</p>
<p><a class="button-link" href="/">&larr; Back to all players</a></p>
</section>`;
  return layout({ title: 'Player not found', now, body });
}
