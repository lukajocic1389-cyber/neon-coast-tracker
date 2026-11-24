// AC-3: duplicate events cannot increase a player's cash or reputation. (BR-3)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { tempDb, buildApp, event } from './helpers.js';

let db, app, store;
beforeEach(() => { db = tempDb(); ({ app, store } = buildApp(db.dbPath)); });
afterEach(() => { store.close(); db.cleanup(); });

test('the same event sent again returns 200 duplicate and changes nothing', async () => {
  await request(app).post('/api/events').send(event()).expect(201);
  const before = store.getDashboard('P-01');
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/events').send(event());
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'duplicate');
    assert.equal(res.body.event_id, 'RUN-1001');
    assert.match(res.body.message, /RUN-1001/);
  }
  const afterDup = store.getDashboard('P-01');
  assert.deepEqual(afterDup, before);
  assert.equal(afterDup.cash_balance, 500);
  assert.equal(afterDup.recent_history.length, 1, 'no second record');
});

test('a duplicate with keys in a different order and extra fields is still a plain duplicate', async () => {
  await request(app).post('/api/events').send(event()).expect(201);
  const e = event();
  const reordered = Object.fromEntries(Object.entries(e).reverse());
  const res = await request(app).post('/api/events').send({ ...reordered, note: 'retry' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'duplicate');
});

test('the same event_id with different data returns 409 duplicate_conflict and changes nothing', async () => {
  await request(app).post('/api/events').send(event()).expect(201);
  const before = store.getDashboard('P-01');
  const res = await request(app).post('/api/events').send(event({ cash_reward: 99_999 }));
  assert.equal(res.status, 409);
  assert.equal(res.body.status, 'duplicate_conflict');
  assert.deepEqual(store.getDashboard('P-01'), before);
});

test('event_id is unique globally: reuse for another player is not a new event', async () => {
  await request(app).post('/api/events').send(event()).expect(201);
  const res = await request(app).post('/api/events').send(event({ player_id: 'P-02' }));
  assert.equal(res.status, 409);
  assert.equal(store.getDashboard('P-02').cash_balance, 0);
});

test('a failed event resent does not count as a second failure', async () => {
  await request(app).post('/api/events').send(event({ event_id: 'F-1', result: 'failed' })).expect(201);
  await request(app).post('/api/events').send(event({ event_id: 'F-1', result: 'failed' })).expect(200);
  assert.equal(store.getDashboard('P-01').failed_count, 1);
});

// Not a real race: node:sqlite is synchronous, so in one process these requests are handled one after another
// (review R3). The real two-process race is in test/concurrency.test.js.
test('ten identical submissions fired together at one process are counted once', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => request(app).post('/api/events').send(event())));
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 201).length, 1, `statuses: ${statuses}`);
  assert.equal(statuses.filter((s) => s === 200).length, 9, `statuses: ${statuses}`);
  assert.equal(store.getDashboard('P-01').cash_balance, 500);
});
