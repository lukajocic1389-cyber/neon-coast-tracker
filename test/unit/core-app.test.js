import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createStore } from '../../src/store.js';
import { MISSIONS, PLAYERS } from '../../src/catalog.js';

let tmpRoot;
let counter = 0;
before(() => { tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'neon-core-app-')); });
after(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

const event = (overrides = {}) => ({
  event_id: 'RUN-1001', player_id: 'P-01', mission_id: 'M-12', crew: 'Harbor Crew',
  result: 'completed', cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-20T15:00:00Z',
  ...overrides,
});

describe('API routes', () => {
  let store;
  let app;
  beforeEach(() => {
    store = createStore(path.join(tmpRoot, `app-${++counter}.db`));
    app = createApp({ store });
  });
  afterEach(() => { store.close(); });

  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health').expect(200).expect('Content-Type', /json/);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  test('GET /api/missions returns the catalog', async () => {
    const res = await request(app).get('/api/missions').expect(200).expect('Content-Type', /json/);
    assert.deepEqual(res.body, MISSIONS.map((m) => ({ ...m })));
  });

  test('GET /api/players returns every player summary in id order', async () => {
    await request(app).post('/api/events').send(event()).expect(201);
    const res = await request(app).get('/api/players').expect(200).expect('Content-Type', /json/);
    assert.deepEqual(res.body.map((p) => p.player_id), PLAYERS.map((p) => p.player_id));
    assert.deepEqual(res.body[0], { player_id: 'P-01', name: 'Nova Reyes', completed_count: 1, failed_count: 0,
      cash_balance: 500, total_reputation: 20 });
  });

  test('POST /api/events: accepted completed → 201', async () => {
    const res = await request(app).post('/api/events').send(event()).expect(201).expect('Content-Type', /json/);
    assert.deepEqual(res.body, { status: 'accepted', event_id: 'RUN-1001', result: 'completed',
      awarded: { cash: 500, reputation: 20, crew: 'Harbor Crew' } });
  });

  test('POST /api/events: accepted failed → 201 with nothing awarded', async () => {
    const res = await request(app).post('/api/events').send(event({ event_id: 'RUN-1002', result: 'failed' })).expect(201);
    assert.deepEqual(res.body, { status: 'accepted', event_id: 'RUN-1002', result: 'failed',
      awarded: { cash: 0, reputation: 0, crew: 'Harbor Crew' } });
  });

  test('POST /api/events: identical duplicate → 200, different data → 409', async () => {
    await request(app).post('/api/events').send(event()).expect(201);
    const dup = await request(app).post('/api/events').send(event()).expect(200);
    assert.deepEqual(dup.body, { status: 'duplicate', event_id: 'RUN-1001',
      message: 'Event RUN-1001 was already processed; no rewards were applied again.' });
    const conflict = await request(app).post('/api/events').send(event({ reputation_reward: 21 })).expect(409);
    assert.deepEqual(conflict.body, { status: 'duplicate_conflict', event_id: 'RUN-1001',
      message: 'Event RUN-1001 was already processed with different data; this event was ignored.' });
    const dash = await request(app).get('/api/players/P-01/dashboard').expect(200);
    assert.equal(dash.body.cash_balance, 500);
    assert.equal(dash.body.completed_count, 1);
  });

  test('POST /api/events: validation failure → 400 with every error', async () => {
    const res = await request(app).post('/api/events')
      .send(event({ player_id: 'P-99', mission_id: 'M-99' })).expect(400);
    assert.deepEqual(res.body, { status: 'rejected', errors: [
      { field: 'player_id', code: 'UNKNOWN_PLAYER', message: "Player 'P-99' does not exist." },
      { field: 'mission_id', code: 'UNKNOWN_MISSION', message: "Mission 'M-99' does not exist." },
    ] });
  });

  test('POST /api/events: malformed JSON → 400 INVALID_JSON', async () => {
    const res = await request(app).post('/api/events')
      .set('Content-Type', 'application/json').send('{"event_id": "RUN-1", ').expect(400)
      .expect('Content-Type', /json/);
    assert.equal(res.body.status, 'rejected');
    assert.equal(res.body.errors.length, 1);
    assert.equal(res.body.errors[0].field, 'body');
    assert.equal(res.body.errors[0].code, 'INVALID_JSON');
    assert.equal(typeof res.body.errors[0].message, 'string');
  });

  test('POST /api/events: array, string, number and null bodies → 400 INVALID_BODY', async () => {
    for (const raw of ['[]', '[{"event_id":"A"}]', '"hello"', '42', 'null']) {
      const res = await request(app).post('/api/events')
        .set('Content-Type', 'application/json').send(raw).expect(400);
      assert.equal(res.body.status, 'rejected', raw);
      assert.deepEqual(res.body.errors.map((e) => [e.field, e.code]), [['body', 'INVALID_BODY']], raw);
    }
  });

  test('POST /api/events: no body or a non-JSON content type → 400 INVALID_BODY', async () => {
    let res = await request(app).post('/api/events').expect(400);
    assert.equal(res.body.errors[0].code, 'INVALID_BODY');
    res = await request(app).post('/api/events').set('Content-Type', 'text/plain')
      .send(JSON.stringify(event())).expect(400);
    assert.equal(res.body.errors[0].code, 'INVALID_BODY');
  });

  test('GET /api/players/:player_id/dashboard returns the §4.4 shape', async () => {
    await request(app).post('/api/events').send(event()).expect(201);
    const res = await request(app).get('/api/players/P-01/dashboard').expect(200).expect('Content-Type', /json/);
    assert.deepEqual(res.body, {
      player: { player_id: 'P-01', name: 'Nova Reyes' },
      completed_count: 1, failed_count: 0, cash_balance: 500,
      reputation_by_crew: { 'Harbor Crew': 20, 'Lantern Row': 0, 'Static Choir': 0 },
      recent_history: [{ event_id: 'RUN-1001', mission_id: 'M-12', mission_title: 'Tidewater Run',
        crew: 'Harbor Crew', result: 'completed', cash_awarded: 500, reputation_awarded: 20,
        timestamp: '2026-11-20T15:00:00.000Z' }],
    });
  });

  test('GET dashboard for an unknown player → 404', async () => {
    const res = await request(app).get('/api/players/P-99/dashboard').expect(404).expect('Content-Type', /json/);
    assert.deepEqual(res.body, { status: 'not_found', message: "Player 'P-99' does not exist." });
  });

  test('unknown /api routes → 404 JSON', async () => {
    for (const [method, url] of [['get', '/api/nope'], ['get', '/api'], ['post', '/api/health'], ['delete', '/api/events']]) {
      const res = await request(app)[method](url).expect(404).expect('Content-Type', /json/);
      assert.equal(res.body.status, 'not_found', `${method} ${url}`);
    }
  });

  test('GET / without a dashboard router points to /api/players', async () => {
    const res = await request(app).get('/').expect(200).expect('Content-Type', /json/);
    assert.equal(res.body.players, '/api/players');
  });
});

describe('app wiring', () => {
  test('a dashboard router is mounted at / and does not shadow /api', async () => {
    const dashboardRouter = express.Router();
    dashboardRouter.get('/', (req, res) => res.type('html').send('<h1>dashboard</h1>'));
    const store = { listMissions: () => [{ mission_id: 'M-1' }] };
    const app = createApp({ store, dashboardRouter });
    const res = await request(app).get('/').expect(200).expect('Content-Type', /html/);
    assert.equal(res.text, '<h1>dashboard</h1>');
    await request(app).get('/api/missions').expect(200, [{ mission_id: 'M-1' }]);
  });

  test('unhandled errors → 500 JSON without a stack trace', async (t) => {
    t.mock.method(console, 'error', () => {});
    const store = { listPlayerSummaries: () => { throw new Error('disk on fire at /secret/path'); } };
    const res = await request(createApp({ store })).get('/api/players').expect(500).expect('Content-Type', /json/);
    assert.deepEqual(res.body, { status: 'error', message: 'Internal server error.' });
    assert.doesNotMatch(JSON.stringify(res.body), /secret|stack|at /);
  });

  test('malformed %-encoding in a path param → 400, not 500, and no error is logged (review R1)', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const store = { getDashboard: () => null, listPlayerSummaries: () => [] };
    const router = express.Router();
    router.get('/players/:player_id', (req, res) => res.send('ok'));
    const app = createApp({ store, dashboardRouter: router });
    for (const url of ['/api/players/%E0%A4%A/dashboard', '/players/%E0%A4%A']) {
      const res = await request(app).get(url);
      assert.equal(res.status, 400, url);
      assert.equal(res.body.status, 'error');
      assert.match(res.body.message, /Malformed URL/);
    }
    assert.equal(logged.mock.callCount(), 0);
  });

  test('/static: a missing file is a plain 404, not an error', async () => {
    const res = await request(createApp({ store: {} })).get('/static/does-not-exist.css');
    assert.equal(res.status, 404);
  });
});
