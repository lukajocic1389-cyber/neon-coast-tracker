// AC-1: API accepts valid mission results and rejects invalid ones with useful messages. (BR-4)
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { tempDb, buildApp, event } from './helpers.js';

const db = tempDb();
const { app, store } = buildApp(db.dbPath);
after(() => { store.close(); db.cleanup(); });

const codesOf = (res) => res.body.errors.map((e) => e.code);

describe('valid events', () => {
  test('the PDF example event is accepted with 201 and the awarded rewards', async () => {
    const res = await request(app).post('/api/events').send(event());
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'accepted');
    assert.equal(res.body.event_id, 'RUN-1001');
    assert.deepEqual(res.body.awarded, { cash: 500, reputation: 20, crew: 'Harbor Crew' });
  });

  test('a valid failed event is accepted (recorded) with 201', async () => {
    const res = await request(app).post('/api/events').send(event({ event_id: 'RUN-V2', result: 'failed' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'accepted');
  });

  test('boundary values 0 and the caps are accepted; extra fields are ignored', async () => {
    let res = await request(app).post('/api/events')
      .send(event({ event_id: 'RUN-V3', cash_reward: 0, reputation_reward: 0, engine_build: '7.1' }));
    assert.equal(res.status, 201);
    res = await request(app).post('/api/events')
      .send(event({ event_id: 'RUN-V4', cash_reward: 1_000_000, reputation_reward: 1_000 }));
    assert.equal(res.status, 201);
  });
});

describe('invalid events are rejected with 400, a code and a message naming the problem', () => {
  const cases = [
    ['unknown player', { player_id: 'P-99' }, 'player_id', 'UNKNOWN_PLAYER', /P-99/],
    ['unknown mission', { mission_id: 'M-99' }, 'mission_id', 'UNKNOWN_MISSION', /M-99/],
    ['crew does not match mission', { crew: 'Lantern Row' }, 'crew', 'CREW_MISMATCH', /Lantern Row|Harbor Crew/],
    ['bad result value', { result: 'abandoned' }, 'result', 'INVALID_RESULT', /abandoned|completed/],
    ['negative cash', { cash_reward: -100 }, 'cash_reward', 'INVALID_CASH_REWARD', /./],
    ['fractional cash', { cash_reward: 1.5 }, 'cash_reward', 'INVALID_CASH_REWARD', /./],
    ['cash as string', { cash_reward: '500' }, 'cash_reward', 'INVALID_CASH_REWARD', /./],
    ['cash above cap', { cash_reward: 1_000_001 }, 'cash_reward', 'INVALID_CASH_REWARD', /./],
    ['reputation above cap', { reputation_reward: 1_001 }, 'reputation_reward', 'INVALID_REPUTATION_REWARD', /./],
    ['negative reputation', { reputation_reward: -1 }, 'reputation_reward', 'INVALID_REPUTATION_REWARD', /./],
    ['impossible date', { timestamp: '2026-02-30T10:00:00Z' }, 'timestamp', 'INVALID_TIMESTAMP', /./],
    ['non-UTC timestamp', { timestamp: '2026-11-20T15:00:00+01:00' }, 'timestamp', 'INVALID_TIMESTAMP', /./],
    ['bad event_id characters', { event_id: 'RUN 1001!' }, 'event_id', 'INVALID_EVENT_ID', /./],
  ];
  for (const [name, override, field, code, msg] of cases) {
    test(name, async () => {
      const res = await request(app).post('/api/events').send(event({ event_id: `RUN-X-${code}`, ...override }));
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.status, 'rejected');
      const err = res.body.errors.find((e) => e.code === code);
      assert.ok(err, `expected ${code}, got ${codesOf(res)}`);
      assert.equal(err.field, field);
      assert.match(err.message, msg);
    });
  }

  test('a missing field is reported as MISSING_FIELD for that field', async () => {
    const body = event({ event_id: 'RUN-X-MISSING' });
    delete body.player_id;
    const res = await request(app).post('/api/events').send(body);
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some((e) => e.code === 'MISSING_FIELD' && e.field === 'player_id'), JSON.stringify(res.body));
  });

  test('several problems are reported together in one response', async () => {
    const res = await request(app).post('/api/events')
      .send(event({ event_id: 'RUN-X-MULTI', player_id: 'P-99', mission_id: 'M-99', result: 'won', cash_reward: -5 }));
    assert.equal(res.status, 400);
    for (const c of ['UNKNOWN_PLAYER', 'UNKNOWN_MISSION', 'INVALID_RESULT', 'INVALID_CASH_REWARD']) {
      assert.ok(codesOf(res).includes(c), `missing ${c} in ${codesOf(res)}`);
    }
  });

  test('malformed JSON gives INVALID_JSON and a non-object body gives INVALID_BODY', async () => {
    let res = await request(app).post('/api/events').set('content-type', 'application/json').send('{"event_id": ');
    assert.equal(res.status, 400);
    assert.equal(res.body.errors[0].code, 'INVALID_JSON');
    res = await request(app).post('/api/events').send([event()]);
    assert.equal(res.status, 400);
    assert.equal(res.body.errors[0].code, 'INVALID_BODY');
  });

  test('rejected events are not stored, so the player totals do not change', async () => {
    const before = store.getDashboard('P-02');
    await request(app).post('/api/events').send(event({ event_id: 'RUN-X-P02', player_id: 'P-02', cash_reward: -1 }));
    assert.deepEqual(store.getDashboard('P-02'), before);
  });

  test('an event_id that was rejected can be resubmitted once corrected', async () => {
    let res = await request(app).post('/api/events').send(event({ event_id: 'RUN-FIXME', mission_id: 'M-99' }));
    assert.equal(res.status, 400);
    res = await request(app).post('/api/events').send(event({ event_id: 'RUN-FIXME' }));
    assert.equal(res.status, 201);
  });
});
