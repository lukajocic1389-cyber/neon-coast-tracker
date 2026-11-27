// Test console (GET/POST /console) against the real store: the form must behave exactly like POST /api/events.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { tempDb, buildApp } from './helpers.js';

let db, app, store;
beforeEach(() => { db = tempDb(); ({ app, store } = buildApp(db.dbPath)); });
afterEach(() => { store.close(); db.cleanup(); });

const send = (fields) => request(app).post('/console').type('form').send({ action: 'send', ...fields });
const statusOf = (res) => Number(/data-testid="console-result" data-status="(\d+)"/.exec(res.text)?.[1]);
const sentEvent = (res) => {
  const raw = /name="last_event" value="([^"]*)"/.exec(res.text)[1];
  return JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
};

test('GET /console renders the form', async () => {
  const res = await request(app).get('/console').expect(200).expect('Content-Type', /text\/html/);
  assert.match(res.text, /data-testid="console-form"/);
});

test('sending a completed event is accepted and updates the player dashboard', async () => {
  const res = await send({ player_id: 'P-03', mission_id: 'M-21', crew: 'auto', result: 'completed', cash_reward: '450', reputation_reward: '15' });
  assert.equal(res.status, 200);
  assert.equal(statusOf(res), 201);
  const d = store.getDashboard('P-03');
  assert.equal(d.completed_count, 1);
  assert.equal(d.cash_balance, 450);
  assert.equal(d.reputation_by_crew['Lantern Row'], 15);
});

test('a failed event is recorded with no reward', async () => {
  const res = await send({ player_id: 'P-01', mission_id: 'M-10', result: 'failed', cash_reward: '900' });
  assert.equal(statusOf(res), 201);
  const d = store.getDashboard('P-01');
  assert.equal(d.failed_count, 1);
  assert.equal(d.cash_balance, 0);
});

test('"Resend this exact event" is a duplicate: 200, no new record, no extra reward', async () => {
  const first = await send({ player_id: 'P-01', mission_id: 'M-12' });
  const resend = await request(app).post('/console').type('form')
    .send({ action: 'resend', last_event: JSON.stringify(sentEvent(first)) });
  assert.equal(statusOf(resend), 200);
  assert.match(resend.text, /duplicate/);
  const d = store.getDashboard('P-01');
  assert.equal(d.recent_history.length, 1);
  assert.equal(d.cash_balance, 500);
});

test('each normal "Send" gets a new event_id, so two sends are two events', async () => {
  const a = sentEvent(await send({}));
  const b = sentEvent(await send({}));
  assert.notEqual(a.event_id, b.event_id);
  assert.equal(store.getDashboard('P-01').completed_count, 2);
});

test('test values are rejected with the same error codes as the API', async () => {
  const cases = [
    [{ player_id: 'P-99' }, 'UNKNOWN_PLAYER'],
    [{ mission_id: 'M-99' }, 'UNKNOWN_MISSION'],
    [{ result: 'abandoned' }, 'INVALID_RESULT'],
    [{ cash_reward: '12.5' }, 'INVALID_CASH_REWARD'],
    [{ timestamp: 'yesterday' }, 'INVALID_TIMESTAMP'],
  ];
  for (const [fields, code] of cases) {
    const res = await send(fields);
    assert.equal(statusOf(res), 400, code);
    assert.match(res.text, new RegExp(code));
  }
  assert.equal(store.getDashboard('P-01').recent_history.length, 0, 'nothing was stored');
});

test('resend with no previous event shows an error instead of crashing', async () => {
  const res = await request(app).post('/console').type('form').send({ action: 'resend', last_event: '' });
  assert.equal(res.status, 400);
  assert.match(res.text, /Nothing to resend/);
});
