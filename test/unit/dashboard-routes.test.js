import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createDashboardRouter } from '../../src/dashboard/routes.js';

const NOW = new Date('2026-11-24T10:15:30.000Z');

const SUMMARIES = [
  { player_id: 'P-01', name: 'Nova Reyes', completed_count: 3, failed_count: 1, cash_balance: 1450, total_reputation: 55 },
  { player_id: 'P-02', name: 'Kit Marlow', completed_count: 0, failed_count: 0, cash_balance: 0, total_reputation: 0 },
  { player_id: 'P-03', name: 'Juno Vance', completed_count: 1, failed_count: 0, cash_balance: 300, total_reputation: 10 },
];

const DASHBOARDS = {
  'P-01': {
    player: { player_id: 'P-01', name: 'Nova Reyes' },
    completed_count: 1, failed_count: 1, cash_balance: 500,
    reputation_by_crew: { 'Harbor Crew': 20, 'Lantern Row': 0, 'Static Choir': 0 },
    recent_history: [
      { event_id: 'RUN-1002', mission_id: 'M-31', mission_title: 'Dead Air', crew: 'Static Choir',
        result: 'failed', cash_awarded: 0, reputation_awarded: 0, timestamp: '2026-11-20T15:30:00.000Z' },
      { event_id: 'RUN-1001', mission_id: 'M-12', mission_title: 'Tidewater Run', crew: 'Harbor Crew',
        result: 'completed', cash_awarded: 500, reputation_awarded: 20, timestamp: '2026-11-20T15:00:00.000Z' },
    ],
  },
};

function makeApp(overrides = {}) {
  const calls = [];
  const app = express();
  app.use('/', createDashboardRouter({
    getDashboard: (id) => { calls.push(id); return DASHBOARDS[id] ?? null; },
    listPlayerSummaries: () => SUMMARIES,
    now: () => NOW,
    ...overrides,
  }));
  return { app, calls };
}

const COMMON = [
  '<meta http-equiv="refresh" content="5">',
  '<link rel="stylesheet" href="/static/styles.css">',
  'Last updated 2026-11-24T10:15:30.000Z',
];

test('GET / returns 200 HTML with one row per summary', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  const ids = [...res.text.matchAll(/data-testid="player-row" data-player-id="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['P-01', 'P-02', 'P-03']);
  for (const s of COMMON) assert.ok(res.text.includes(s), s);
});

test('GET /players/P-01 returns 200 with the dashboard', async () => {
  const { app, calls } = makeApp();
  const res = await request(app).get('/players/P-01');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.deepEqual(calls, ['P-01']);
  assert.match(res.text, /data-testid="cash-balance" data-value="500"/);
  assert.match(res.text, /data-testid="history-row" data-event-id="RUN-1002" data-result="failed"/);
  for (const s of COMMON) assert.ok(res.text.includes(s), s);
});

test('GET /players/<unknown> returns 404 with the not-found page', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/players/P-99');
  assert.equal(res.status, 404);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(res.text, /Player <code class="id">P-99<\/code> does not exist\./);
  assert.match(res.text, /<a class="button-link" href="\/">/);
  for (const s of COMMON) assert.ok(res.text.includes(s), s);
});

test('a hostile player id in the URL is escaped on the 404 page', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/players/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  assert.equal(res.status, 404);
  assert.ok(res.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.doesNotMatch(res.text, /<script/i);
});

test('async stub functions are awaited', async () => {
  const { app } = makeApp({
    getDashboard: async (id) => DASHBOARDS[id] ?? null,
    listPlayerSummaries: async () => SUMMARIES.slice(0, 1),
  });
  const index = await request(app).get('/');
  assert.equal(index.status, 200);
  assert.equal([...index.text.matchAll(/data-testid="player-row"/g)].length, 1);
  const player = await request(app).get('/players/P-01');
  assert.equal(player.status, 200);
  assert.equal((await request(app).get('/players/P-42')).status, 404);
});

test('the router does not answer other paths', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Neon Coast/);
});

test('createDashboardRouter requires both functions', () => {
  assert.throws(() => createDashboardRouter({ getDashboard: () => null }), TypeError);
  assert.throws(() => createDashboardRouter(), TypeError);
});
