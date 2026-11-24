// AC-2: rewards are given once for completed missions and never for failed missions. (BR-1, BR-2, BR-6)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { tempDb, buildApp, event } from './helpers.js';

let db, app, store;
beforeEach(() => { db = tempDb(); ({ app, store } = buildApp(db.dbPath)); });
afterEach(() => { store.close(); db.cleanup(); });

test('a completed mission adds cash and reputation once, to the correct player and crew', async () => {
  await request(app).post('/api/events').send(event()).expect(201);
  const d = store.getDashboard('P-01');
  assert.equal(d.cash_balance, 500);
  assert.equal(d.completed_count, 1);
  assert.equal(d.failed_count, 0);
  assert.deepEqual(d.reputation_by_crew, { 'Harbor Crew': 20, 'Lantern Row': 0, 'Static Choir': 0 });
  // Other players untouched.
  assert.equal(store.getDashboard('P-02').cash_balance, 0);
});

test('a failed mission is recorded but adds no cash or reputation, even if rewards were reported', async () => {
  const res = await request(app).post('/api/events')
    .send(event({ event_id: 'RUN-F1', result: 'failed', cash_reward: 900, reputation_reward: 40 })).expect(201);
  assert.deepEqual(res.body.awarded, { cash: 0, reputation: 0, crew: 'Harbor Crew' });
  const d = store.getDashboard('P-01');
  assert.equal(d.failed_count, 1);
  assert.equal(d.completed_count, 0);
  assert.equal(d.cash_balance, 0);
  assert.deepEqual(d.reputation_by_crew, { 'Harbor Crew': 0, 'Lantern Row': 0, 'Static Choir': 0 });
  assert.equal(d.recent_history.length, 1, 'failed event must still be recorded');
  assert.equal(d.recent_history[0].result, 'failed');
  assert.equal(d.recent_history[0].cash_awarded, 0);
});

test('reputation is stored separately for each crew and cash accumulates across crews', async () => {
  await request(app).post('/api/events').send(event({ event_id: 'A', mission_id: 'M-12', crew: 'Harbor Crew', cash_reward: 500, reputation_reward: 20 })).expect(201);
  await request(app).post('/api/events').send(event({ event_id: 'B', mission_id: 'M-20', crew: 'Lantern Row', cash_reward: 300, reputation_reward: 15 })).expect(201);
  await request(app).post('/api/events').send(event({ event_id: 'C', mission_id: 'M-10', crew: 'Harbor Crew', cash_reward: 100, reputation_reward: 5 })).expect(201);
  await request(app).post('/api/events').send(event({ event_id: 'D', mission_id: 'M-30', crew: 'Static Choir', result: 'failed', cash_reward: 700, reputation_reward: 30 })).expect(201);
  const d = store.getDashboard('P-01');
  assert.equal(d.cash_balance, 900);
  assert.deepEqual(d.reputation_by_crew, { 'Harbor Crew': 25, 'Lantern Row': 15, 'Static Choir': 0 });
  assert.equal(d.completed_count, 3);
  assert.equal(d.failed_count, 1);
});
