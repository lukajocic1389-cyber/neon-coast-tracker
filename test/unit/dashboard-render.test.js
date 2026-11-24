import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREWS } from '../../src/catalog.js';
import {
  escapeHtml, formatCash, formatTimestamp, renderIndex, renderPlayer, renderNotFound,
} from '../../src/dashboard/render.js';

const NOW = new Date('2026-11-24T10:15:30.000Z');

const DASHBOARD = {
  player: { player_id: 'P-01', name: 'Nova Reyes' },
  completed_count: 3,
  failed_count: 1,
  cash_balance: 1450,
  reputation_by_crew: { 'Harbor Crew': 40, 'Lantern Row': 15, 'Static Choir': 0 },
  recent_history: [
    { event_id: 'RUN-1004', mission_id: 'M-20', mission_title: 'Paper Lanterns', crew: 'Lantern Row',
      result: 'completed', cash_awarded: 450, reputation_awarded: 15, timestamp: '2026-11-20T16:10:00.000Z' },
    { event_id: 'RUN-1003', mission_id: 'M-31', mission_title: 'Dead Air', crew: 'Static Choir',
      result: 'failed', cash_awarded: 0, reputation_awarded: 0, timestamp: '2026-11-20T15:30:00.000Z' },
    { event_id: 'RUN-1002', mission_id: 'M-11', mission_title: 'Dockside Ledger', crew: 'Harbor Crew',
      result: 'completed', cash_awarded: 500, reputation_awarded: 20, timestamp: '2026-11-20T15:10:00.000Z' },
    { event_id: 'RUN-1001', mission_id: 'M-12', mission_title: 'Tidewater Run', crew: 'Harbor Crew',
      result: 'completed', cash_awarded: 500, reputation_awarded: 20, timestamp: '2026-11-20T15:00:00.000Z' },
  ],
};

const EMPTY_DASHBOARD = {
  player: { player_id: 'P-05', name: 'Remy Sol' },
  completed_count: 0, failed_count: 0, cash_balance: 0,
  reputation_by_crew: { 'Harbor Crew': 0, 'Lantern Row': 0, 'Static Choir': 0 },
  recent_history: [],
};

const SUMMARIES = [
  { player_id: 'P-01', name: 'Nova Reyes', completed_count: 3, failed_count: 1, cash_balance: 1450, total_reputation: 55 },
  { player_id: 'P-02', name: 'Kit Marlow', completed_count: 0, failed_count: 0, cash_balance: 0, total_reputation: 0 },
];

/** Value of data-value on the element carrying the given data-testid. */
function hookValue(html, testId) {
  const matches = [...html.matchAll(new RegExp(`data-testid="${testId}" data-value="([^"]*)"`, 'g'))];
  assert.equal(matches.length, 1, `expected exactly one ${testId} hook, found ${matches.length}`);
  return matches[0][1];
}

function historyRows(html) {
  return [...html.matchAll(/<tr data-testid="history-row" data-event-id="([^"]*)" data-result="([^"]*)">([\s\S]*?)<\/tr>/g)]
    .map(([, eventId, result, inner]) => ({ eventId, result, inner }));
}

function assertCommonPage(html) {
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<meta http-equiv="refresh" content="5">/);
  assert.match(html, /<link rel="stylesheet" href="\/static\/styles.css">/);
  assert.match(html, /<title>[^<]*Neon Coast[^<]*<\/title>/);
  assert.ok(html.includes('Last updated <time datetime="2026-11-24T10:15:30.000Z">2026-11-24T10:15:30.000Z</time>'),
    'footer shows the injected now as ISO UTC');
  assert.ok(html.includes('Fictional companion app. Not affiliated with any game publisher.'));
  assert.doesNotMatch(html, /<script/i, 'pages contain no scripts');
}

test('escapeHtml escapes & < > " and \'', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(42), '42');
});

test('formatCash uses en-US grouping with a dollar sign', () => {
  assert.equal(formatCash(1450), '$1,450');
  assert.equal(formatCash(0), '$0');
  assert.equal(formatCash(1000000), '$1,000,000');
});

test('formatTimestamp renders YYYY-MM-DD HH:mm UTC', () => {
  assert.equal(formatTimestamp('2026-11-20T16:10:00.000Z'), '2026-11-20 16:10 UTC');
  assert.equal(formatTimestamp('2026-11-20T23:59:59Z'), '2026-11-20 23:59 UTC');
  assert.equal(formatTimestamp('not a date'), 'not a date');
});

test('renderPlayer puts the correct raw numbers in the stat test hooks', () => {
  const html = renderPlayer(DASHBOARD, { now: NOW });
  assert.equal(hookValue(html, 'completed-count'), '3');
  assert.equal(hookValue(html, 'failed-count'), '1');
  assert.equal(hookValue(html, 'cash-balance'), '1450');
  assert.equal(hookValue(html, 'total-reputation'), '55');
  assert.ok(html.includes('<span class="tile-value" data-testid="cash-balance" data-value="1450">$1,450</span>'));
  assert.match(html, /Nova Reyes/);
  assert.match(html, /P-01/);
  assert.match(html, /<a href="\/">/, 'links back to the index');
});

test('renderPlayer lists every crew with its reputation hook', () => {
  const html = renderPlayer(DASHBOARD, { now: NOW });
  for (const crew of CREWS) {
    const expected = DASHBOARD.reputation_by_crew[crew];
    assert.ok(html.includes(`data-testid="rep-crew" data-crew="${crew}" data-value="${expected}"`), crew);
  }
});

test('renderPlayer shows every catalog crew with 0 even if the data omits one', () => {
  const html = renderPlayer({ ...DASHBOARD, reputation_by_crew: { 'Harbor Crew': 40 } }, { now: NOW });
  assert.ok(html.includes('data-testid="rep-crew" data-crew="Lantern Row" data-value="0"'));
  assert.ok(html.includes('data-testid="rep-crew" data-crew="Static Choir" data-value="0"'));
  assert.equal(hookValue(html, 'total-reputation'), '40');
});

test('renderPlayer renders history rows in order, marks failed rows and shows 0 awarded', () => {
  const html = renderPlayer(DASHBOARD, { now: NOW });
  const rows = historyRows(html);
  assert.deepEqual(rows.map((r) => r.eventId), ['RUN-1004', 'RUN-1003', 'RUN-1002', 'RUN-1001']);
  assert.deepEqual(rows.map((r) => r.result), ['completed', 'failed', 'completed', 'completed']);

  const failed = rows[1];
  assert.match(failed.inner, /class="badge badge-failed">Failed</);
  assert.match(failed.inner, /<td class="num cash">\$0<\/td>/);
  assert.match(failed.inner, /<td class="num rep">0<\/td>/);
  assert.match(failed.inner, /Dead Air/);
  assert.match(failed.inner, /M-31/);

  const done = rows[0];
  assert.match(done.inner, /class="badge badge-completed">Completed</);
  assert.match(done.inner, /<td class="num cash">\$450<\/td>/);
  assert.match(done.inner, /<td class="num rep">15<\/td>/);
  assert.match(done.inner, /Paper Lanterns/);
  assert.match(done.inner, /Lantern Row/);
  assert.match(done.inner, /2026-11-20 16:10 UTC/);
  assert.doesNotMatch(done.inner, /badge-failed/);
});

test('renderPlayer with no history shows zeros and "No missions yet"', () => {
  const html = renderPlayer(EMPTY_DASHBOARD, { now: NOW });
  assert.match(html, /No missions yet/);
  assert.equal(historyRows(html).length, 0);
  assert.doesNotMatch(html, /data-testid="history-row"/);
  for (const id of ['completed-count', 'failed-count', 'cash-balance', 'total-reputation']) {
    assert.equal(hookValue(html, id), '0', id);
  }
  for (const crew of CREWS) {
    assert.ok(html.includes(`data-crew="${crew}" data-value="0"`), crew);
  }
});

test('renderPlayer escapes a hostile player name and history fields', () => {
  const evil = '<script>alert(1)</script>';
  const html = renderPlayer({
    ...DASHBOARD,
    player: { player_id: 'P-"x"', name: evil },
    recent_history: [{ ...DASHBOARD.recent_history[0], event_id: 'E"><b>', mission_title: evil }],
  }, { now: NOW });
  assert.ok(!html.includes(evil), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('<title>&lt;script&gt;alert(1)&lt;/script&gt; · Neon Coast</title>'));
  assert.ok(html.includes('data-event-id="E&quot;&gt;&lt;b&gt;"'));
  assert.ok(html.includes('P-&quot;x&quot;'));
  assert.doesNotMatch(html, /<script/i);
});

test('renderIndex lists one linked row per player with totals', () => {
  const html = renderIndex(SUMMARIES, { now: NOW });
  const rows = [...html.matchAll(/<tr data-testid="player-row" data-player-id="([^"]*)">([\s\S]*?)<\/tr>/g)];
  assert.deepEqual(rows.map((r) => r[1]), ['P-01', 'P-02']);
  const first = rows[0][2];
  assert.match(first, /<a class="player-link" href="\/players\/P-01">Nova Reyes<\/a>/);
  assert.match(first, /\$1,450/);
  assert.match(first, /<td class="num">3<\/td>/);
  assert.match(first, /<td class="num">1<\/td>/);
  assert.match(first, /<td class="num rep">55<\/td>/);
});

test('renderIndex escapes names and ids in links', () => {
  const html = renderIndex([{ ...SUMMARIES[0], player_id: 'P 1/"x"', name: '<script>alert(1)</script>' }], { now: NOW });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('href="/players/P%201%2F%22x%22"'));
  assert.ok(html.includes('data-player-id="P 1/&quot;x&quot;"'));
  assert.doesNotMatch(html, /<script/i);
});

test('renderIndex shows an empty state for an empty array', () => {
  const html = renderIndex([], { now: NOW });
  assert.match(html, /No players yet/);
  assert.doesNotMatch(html, /data-testid="player-row"/);
});

test('renderNotFound shows the id escaped and links back to /', () => {
  const html = renderNotFound('<img src=x>', { now: NOW });
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /<a class="button-link" href="\/">/);
});

test('every page has doctype, lang, viewport, 5 s refresh, stylesheet, title, and deterministic footer', () => {
  for (const html of [
    renderIndex(SUMMARIES, { now: NOW }),
    renderIndex([], { now: NOW }),
    renderPlayer(DASHBOARD, { now: NOW }),
    renderPlayer(EMPTY_DASHBOARD, { now: NOW }),
    renderNotFound('P-99', { now: NOW }),
  ]) {
    assertCommonPage(html);
  }
});

test('the same input and now produce identical output', () => {
  assert.equal(renderPlayer(DASHBOARD, { now: NOW }), renderPlayer(DASHBOARD, { now: NOW }));
  assert.equal(renderIndex(SUMMARIES, { now: NOW }), renderIndex(SUMMARIES, { now: NOW }));
});
