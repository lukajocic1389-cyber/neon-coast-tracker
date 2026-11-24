import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createStore, payloadHash } from '../../src/store.js';
import { openDb } from '../../src/db.js';
import { CREWS, MISSIONS, PLAYERS } from '../../src/catalog.js';

let tmpRoot;
let counter = 0;
const freshDbPath = () => path.join(tmpRoot, `store-${++counter}.db`);

before(() => { tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'neon-core-store-')); });
after(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

const event = (overrides = {}) => ({
  event_id: 'RUN-1001', player_id: 'P-01', mission_id: 'M-12', crew: 'Harbor Crew',
  result: 'completed', cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-20T15:00:00Z',
  ...overrides,
});

function countEvents(dbPath) {
  const db = openDb(dbPath);
  try { return db.prepare('SELECT COUNT(*) AS n FROM events').get().n; } finally { db.close(); }
}

describe('openDb', () => {
  test('creates missing parent directories, the schema and the seed data', () => {
    const dbPath = path.join(tmpRoot, 'nested', 'deeper', 'neon.db');
    const db = openDb(dbPath);
    try {
      assert.ok(existsSync(dbPath));
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n, PLAYERS.length);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM missions').get().n, MISSIONS.length);
      assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
      assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    } finally { db.close(); }
  });

  test('re-opening is idempotent and keeps existing events', () => {
    const dbPath = freshDbPath();
    const store = createStore(dbPath);
    store.submitEvent(event());
    store.close();
    const db = openDb(dbPath);
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM players').get().n, PLAYERS.length);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM missions').get().n, MISSIONS.length);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 1);
    } finally { db.close(); }
  });

  test('the database itself rejects a second row with the same event_id (errcode 2067)', () => {
    const db = openDb(freshDbPath());
    try {
      const insert = db.prepare(`INSERT INTO events (event_id, player_id, mission_id, crew, result, cash_reward,
        reputation_reward, cash_awarded, reputation_awarded, timestamp, received_at, payload_hash)
        VALUES ('X-1', 'P-01', 'M-10', 'Harbor Crew', 'completed', 1, 1, 1, 1, 't', 't', 'h')`);
      insert.run();
      assert.throws(() => insert.run(), (err) => err.errcode === 2067);
    } finally { db.close(); }
  });
});

describe('store', () => {
  let store;
  let dbPath;
  beforeEach(() => { dbPath = freshDbPath(); store = createStore(dbPath); });
  afterEach(() => { store.close(); });

  test('accepts a completed event and raises the totals (BR-1)', () => {
    const res = store.submitEvent(event());
    assert.deepEqual(res, {
      httpStatus: 201,
      body: { status: 'accepted', event_id: 'RUN-1001', result: 'completed',
        awarded: { cash: 500, reputation: 20, crew: 'Harbor Crew' } },
    });
    const d = store.getDashboard('P-01');
    assert.equal(d.completed_count, 1);
    assert.equal(d.failed_count, 0);
    assert.equal(d.cash_balance, 500);
    assert.deepEqual(d.reputation_by_crew, { 'Harbor Crew': 20, 'Lantern Row': 0, 'Static Choir': 0 });
  });

  test('accepts a failed event: counts rise, totals unchanged, reported values stored (BR-2, D6)', () => {
    store.submitEvent(event());
    const res = store.submitEvent(event({ event_id: 'RUN-1002', result: 'failed', cash_reward: 900, reputation_reward: 40 }));
    assert.deepEqual(res, {
      httpStatus: 201,
      body: { status: 'accepted', event_id: 'RUN-1002', result: 'failed',
        awarded: { cash: 0, reputation: 0, crew: 'Harbor Crew' } },
    });
    const d = store.getDashboard('P-01');
    assert.equal(d.completed_count, 1);
    assert.equal(d.failed_count, 1);
    assert.equal(d.cash_balance, 500);
    assert.equal(d.reputation_by_crew['Harbor Crew'], 20);

    const db = openDb(dbPath);
    try {
      const row = db.prepare('SELECT * FROM events WHERE event_id = ?').get('RUN-1002');
      assert.equal(row.cash_reward, 900);
      assert.equal(row.reputation_reward, 40);
      assert.equal(row.cash_awarded, 0);
      assert.equal(row.reputation_awarded, 0);
      assert.equal(row.timestamp, '2026-11-20T15:00:00.000Z');
      assert.match(row.received_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      // Spec §3 formula, written out independently of payloadHash().
      const expected = createHash('sha256').update(JSON.stringify(['RUN-1002', 'P-01', 'M-12', 'Harbor Crew',
        'failed', 900, 40, '2026-11-20T15:00:00.000Z'])).digest('hex');
      assert.equal(row.payload_hash, expected);
      assert.equal(payloadHash({ ...event({ event_id: 'RUN-1002', result: 'failed', cash_reward: 900,
        reputation_reward: 40 }), timestamp: '2026-11-20T15:00:00.000Z' }), expected);
    } finally { db.close(); }
  });

  test('an identical duplicate returns 200 and leaves totals unchanged (BR-3)', () => {
    store.submitEvent(event());
    const before = store.getDashboard('P-01');
    const res = store.submitEvent(event());
    assert.deepEqual(res, {
      httpStatus: 200,
      body: { status: 'duplicate', event_id: 'RUN-1001',
        message: 'Event RUN-1001 was already processed; no rewards were applied again.' },
    });
    assert.deepEqual(store.getDashboard('P-01'), before);
    assert.equal(countEvents(dbPath), 1);
  });

  test('key order, extra fields and an equivalent timestamp form still count as the same payload', () => {
    store.submitEvent(event());
    const reordered = Object.fromEntries(Object.entries(event()).reverse());
    assert.equal(store.submitEvent(reordered).httpStatus, 200);
    assert.equal(store.submitEvent({ ...event(), note: 'retry' }).httpStatus, 200);
    assert.equal(store.submitEvent(event({ timestamp: '2026-11-20T15:00:00.000Z' })).httpStatus, 200);
    assert.equal(countEvents(dbPath), 1);
  });

  test('the same id with different data returns 409 and leaves totals unchanged', () => {
    store.submitEvent(event());
    const before = store.getDashboard('P-01');
    const res = store.submitEvent(event({ cash_reward: 99999 }));
    assert.deepEqual(res, {
      httpStatus: 409,
      body: { status: 'duplicate_conflict', event_id: 'RUN-1001',
        message: 'Event RUN-1001 was already processed with different data; this event was ignored.' },
    });
    assert.deepEqual(store.getDashboard('P-01'), before);
    assert.equal(countEvents(dbPath), 1);
  });

  test('event_id is unique globally, not per player (D8)', () => {
    store.submitEvent(event());
    const res = store.submitEvent(event({ player_id: 'P-02' }));
    assert.equal(res.httpStatus, 409);
    assert.equal(store.getDashboard('P-02').cash_balance, 0);
  });

  test('a failed event resent as completed cannot gain rewards', () => {
    store.submitEvent(event({ result: 'failed' }));
    assert.equal(store.submitEvent(event()).httpStatus, 409);
    assert.equal(store.getDashboard('P-01').cash_balance, 0);
  });

  test('a rejected event is not stored and its id can be reused once corrected (D10)', () => {
    const res = store.submitEvent(event({ player_id: 'P-99' }));
    assert.equal(res.httpStatus, 400);
    assert.deepEqual(res.body, { status: 'rejected', errors: [
      { field: 'player_id', code: 'UNKNOWN_PLAYER', message: "Player 'P-99' does not exist." },
    ] });
    assert.equal(countEvents(dbPath), 0);
    assert.equal(store.submitEvent(event()).httpStatus, 201);
  });

  test('a non-object body is rejected with INVALID_BODY instead of throwing', () => {
    for (const body of [undefined, null, [], 'text']) {
      const res = store.submitEvent(body);
      assert.equal(res.httpStatus, 400);
      assert.equal(res.body.errors[0].code, 'INVALID_BODY');
    }
  });

  test('getDashboard returns null for an unknown player', () => {
    assert.equal(store.getDashboard('P-99'), null);
    assert.equal(store.getDashboard('constructor'), null);
    assert.equal(store.getDashboard(undefined), null);
  });

  test('a player with no events gets an all-zero dashboard', () => {
    store.submitEvent(event()); // someone else's activity must not leak in
    assert.deepEqual(store.getDashboard('P-05'), {
      player: { player_id: 'P-05', name: 'Remy Sol' },
      completed_count: 0, failed_count: 0, cash_balance: 0,
      reputation_by_crew: { 'Harbor Crew': 0, 'Lantern Row': 0, 'Static Choir': 0 },
      recent_history: [],
    });
  });

  test('reputation is kept separately per crew (BR-6)', () => {
    store.submitEvent(event({ event_id: 'A', mission_id: 'M-10', crew: 'Harbor Crew', reputation_reward: 10 }));
    store.submitEvent(event({ event_id: 'B', mission_id: 'M-11', crew: 'Harbor Crew', reputation_reward: 5 }));
    store.submitEvent(event({ event_id: 'C', mission_id: 'M-20', crew: 'Lantern Row', reputation_reward: 15 }));
    store.submitEvent(event({ event_id: 'D', mission_id: 'M-30', crew: 'Static Choir', reputation_reward: 7, result: 'failed' }));
    const d = store.getDashboard('P-01');
    assert.deepEqual(d.reputation_by_crew, { 'Harbor Crew': 15, 'Lantern Row': 15, 'Static Choir': 0 });
    assert.deepEqual(Object.keys(d.reputation_by_crew), [...CREWS]);
  });

  test('recent history: 10 newest by timestamp desc, then arrival order desc, with mission titles', () => {
    // 12 events; arrival order differs from timestamp order, and two pairs share a timestamp.
    const minutes = [5, 1, 9, 3, 9, 7, 0, 11, 2, 11, 6, 4];
    minutes.forEach((m, i) => {
      const ts = `2026-11-20T12:${String(m).padStart(2, '0')}:00Z`;
      const res = store.submitEvent(event({ event_id: `H-${i}`, mission_id: 'M-20', crew: 'Lantern Row', timestamp: ts }));
      assert.equal(res.httpStatus, 201);
    });
    const history = store.getDashboard('P-01').recent_history;
    assert.equal(history.length, 10);
    assert.deepEqual(history.map((h) => h.event_id),
      ['H-9', 'H-7', 'H-4', 'H-2', 'H-5', 'H-10', 'H-0', 'H-11', 'H-3', 'H-8']);
    assert.deepEqual(history[0], {
      event_id: 'H-9', mission_id: 'M-20', mission_title: 'Paper Lanterns', crew: 'Lantern Row',
      result: 'completed', cash_awarded: 500, reputation_awarded: 20, timestamp: '2026-11-20T12:11:00.000Z',
    });
  });

  test('history shows failed events with 0 awarded', () => {
    store.submitEvent(event({ result: 'failed' }));
    const [h] = store.getDashboard('P-01').recent_history;
    assert.equal(h.result, 'failed');
    assert.equal(h.cash_awarded, 0);
    assert.equal(h.reputation_awarded, 0);
  });

  test('listPlayerSummaries lists every roster player in id order, including those with no events', () => {
    store.submitEvent(event());
    store.submitEvent(event({ event_id: 'F-1', result: 'failed' }));
    store.submitEvent(event({ event_id: 'L-1', mission_id: 'M-21', crew: 'Lantern Row', cash_reward: 300, reputation_reward: 12 }));
    store.submitEvent(event({ event_id: 'K-1', player_id: 'P-02', mission_id: 'M-31', crew: 'Static Choir', cash_reward: 100, reputation_reward: 5 }));
    const summaries = store.listPlayerSummaries();
    assert.deepEqual(summaries.map((s) => s.player_id), PLAYERS.map((p) => p.player_id));
    assert.deepEqual(summaries[0], { player_id: 'P-01', name: 'Nova Reyes', completed_count: 2, failed_count: 1,
      cash_balance: 800, total_reputation: 32 });
    assert.deepEqual(summaries[1], { player_id: 'P-02', name: 'Kit Marlow', completed_count: 1, failed_count: 0,
      cash_balance: 100, total_reputation: 5 });
    assert.deepEqual(summaries[4], { player_id: 'P-05', name: 'Remy Sol', completed_count: 0, failed_count: 0,
      cash_balance: 0, total_reputation: 0 });
  });

  test('listMissions returns the catalog', () => {
    assert.deepEqual(store.listMissions(), MISSIONS.map((m) => ({ ...m })));
  });

  test('summaries agree with the dashboards', () => {
    store.submitEvent(event());
    store.submitEvent(event({ event_id: 'X', mission_id: 'M-30', crew: 'Static Choir', reputation_reward: 9 }));
    for (const s of store.listPlayerSummaries()) {
      const d = store.getDashboard(s.player_id);
      assert.equal(s.cash_balance, d.cash_balance);
      assert.equal(s.completed_count, d.completed_count);
      assert.equal(s.failed_count, d.failed_count);
      assert.equal(s.total_reputation, Object.values(d.reputation_by_crew).reduce((a, b) => a + b, 0));
    }
  });
});

describe('persistence (BR-5)', () => {
  test('reopening the same DB file with a new store gives an identical dashboard', () => {
    const dbPath = freshDbPath();
    const first = createStore(dbPath);
    first.submitEvent(event());
    first.submitEvent(event({ event_id: 'RUN-1002', result: 'failed' }));
    first.submitEvent(event({ event_id: 'RUN-1003', mission_id: 'M-20', crew: 'Lantern Row', cash_reward: 450, reputation_reward: 15 }));
    const dashboard = first.getDashboard('P-01');
    const summaries = first.listPlayerSummaries();
    first.close();
    first.close(); // closing twice is harmless

    const second = createStore(dbPath);
    try {
      assert.deepEqual(second.getDashboard('P-01'), dashboard);
      assert.deepEqual(second.listPlayerSummaries(), summaries);
      assert.equal(dashboard.cash_balance, 950);
      // Duplicate protection survives the restart too.
      assert.equal(second.submitEvent(event()).httpStatus, 200);
      assert.deepEqual(second.getDashboard('P-01'), dashboard);
    } finally { second.close(); }
  });
});
