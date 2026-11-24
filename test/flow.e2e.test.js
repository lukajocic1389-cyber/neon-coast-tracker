// AC-4 (consistency part): one full flow from the event API to the rendered dashboard HTML.
// Totals shown on the page must equal what is derivable from the saved events.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { tempDb, buildApp, event } from './helpers.js';

const db = tempDb();
const { app, store } = buildApp(db.dbPath);
after(() => { store.close(); db.cleanup(); });

/** Read a data-testid hook's data-value from HTML (hooks defined in tasks/dashboard.md). */
const hook = (html, id) => {
  const m = html.match(new RegExp(`data-testid="${id}"[^>]*data-value="(-?\\d+)"`)) || html.match(new RegExp(`data-value="(-?\\d+)"[^>]*data-testid="${id}"`));
  assert.ok(m, `hook ${id} not found`);
  return Number(m[1]);
};
const crewHooks = (html) => {
  const out = {};
  for (const m of html.matchAll(/<[^>]*data-testid="rep-crew"[^>]*>/g)) {
    const crew = m[0].match(/data-crew="([^"]+)"/)[1];
    out[crew] = Number(m[0].match(/data-value="(-?\d+)"/)[1]);
  }
  return out;
};

test('POST events -> JSON dashboard -> HTML dashboard all agree', async () => {
  const sent = [
    event({ event_id: 'E2E-1', mission_id: 'M-12', crew: 'Harbor Crew', cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-20T15:00:00Z' }),
    event({ event_id: 'E2E-2', mission_id: 'M-21', crew: 'Lantern Row', cash_reward: 750, reputation_reward: 30, timestamp: '2026-11-20T15:05:00Z' }),
    event({ event_id: 'E2E-3', mission_id: 'M-31', crew: 'Static Choir', result: 'failed', cash_reward: 400, reputation_reward: 10, timestamp: '2026-11-20T15:10:00Z' }),
    event({ event_id: 'E2E-2', mission_id: 'M-21', crew: 'Lantern Row', cash_reward: 750, reputation_reward: 30, timestamp: '2026-11-20T15:05:00Z' }), // duplicate
    event({ event_id: 'E2E-4', player_id: 'P-99' }), // rejected
  ];
  const statuses = [];
  for (const e of sent) statuses.push((await request(app).post('/api/events').send(e)).status);
  assert.deepEqual(statuses, [201, 201, 201, 200, 400]);

  const json = (await request(app).get('/api/players/P-01/dashboard').expect(200)).body;
  assert.equal(json.player.player_id, 'P-01');
  assert.equal(json.completed_count, 2);
  assert.equal(json.failed_count, 1);
  assert.equal(json.cash_balance, 1250);
  assert.deepEqual(json.reputation_by_crew, { 'Harbor Crew': 20, 'Lantern Row': 30, 'Static Choir': 0 });
  // Newest first by event timestamp.
  assert.deepEqual(json.recent_history.map((h) => h.event_id), ['E2E-3', 'E2E-2', 'E2E-1']);
  assert.equal(json.recent_history[0].mission_title, 'Dead Air');
  // Totals equal the sum over the history (no drift between totals and saved events).
  assert.equal(json.recent_history.reduce((s, h) => s + h.cash_awarded, 0), json.cash_balance);

  const page = await request(app).get('/players/P-01').expect(200);
  assert.match(page.headers['content-type'], /text\/html/);
  const html = page.text;
  assert.equal(hook(html, 'completed-count'), json.completed_count);
  assert.equal(hook(html, 'failed-count'), json.failed_count);
  assert.equal(hook(html, 'cash-balance'), json.cash_balance);
  assert.equal(hook(html, 'total-reputation'), 50);
  assert.deepEqual(crewHooks(html), json.reputation_by_crew);
  const rows = [...html.matchAll(/data-testid="history-row"[^>]*/g)].map((m) => m[0]);
  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r.includes('data-event-id="E2E-3"') && r.includes('data-result="failed"')));
  assert.match(html, /<meta http-equiv="refresh" content="5">/);

  const index = (await request(app).get('/').expect(200)).text;
  assert.equal([...index.matchAll(/data-testid="player-row"/g)].length, 5);
  assert.match(index, /href="\/players\/P-01"/);

  const missing = await request(app).get('/players/P-99');
  assert.equal(missing.status, 404);
  const missingApi = await request(app).get('/api/players/P-99/dashboard');
  assert.equal(missingApi.status, 404);
  assert.equal(missingApi.body.status, 'not_found');
});

test('history shows only the 10 most recent events', async () => {
  for (let i = 0; i < 12; i++) {
    const ts = new Date(Date.UTC(2026, 10, 21, 10, i)).toISOString();
    await request(app).post('/api/events').send(event({ event_id: `HIST-${i}`, player_id: 'P-03', timestamp: ts })).expect(201);
  }
  const d = (await request(app).get('/api/players/P-03/dashboard').expect(200)).body;
  assert.equal(d.recent_history.length, 10);
  assert.equal(d.recent_history[0].event_id, 'HIST-11');
  assert.equal(d.completed_count, 12, 'counts cover all events, not only the visible 10');
});
