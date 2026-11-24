// AC-4 (restart part): stored history, cash totals and crew reputation survive a real process restart. (BR-5)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tempDb, startServer, stopServer, postEvent, getJson, event } from './helpers.js';

const db = tempDb();
after(() => db.cleanup());

test('data survives stopping and starting the server process on the same DB file', async () => {
  let srv = await startServer(db.dbPath);
  try {
    assert.equal((await postEvent(srv.baseUrl, event())).status, 201);
    assert.equal((await postEvent(srv.baseUrl, event({ event_id: 'RUN-1002', mission_id: 'M-20', crew: 'Lantern Row', cash_reward: 450, reputation_reward: 15 }))).status, 201);
    assert.equal((await postEvent(srv.baseUrl, event({ event_id: 'RUN-1003', result: 'failed' }))).status, 201);
  } finally {
    const code = await stopServer(srv);
    assert.equal(code, 0, `server should exit cleanly on SIGTERM:\n${srv.output()}`);
  }
  srv = await startServer(db.dbPath);
  try {
    const { status, body } = await getJson(srv.baseUrl, '/api/players/P-01/dashboard');
    assert.equal(status, 200);
    assert.equal(body.cash_balance, 950);
    assert.equal(body.completed_count, 2);
    assert.equal(body.failed_count, 1);
    assert.deepEqual(body.reputation_by_crew, { 'Harbor Crew': 20, 'Lantern Row': 15, 'Static Choir': 0 });
    assert.deepEqual(body.recent_history.map((h) => h.event_id).sort(), ['RUN-1001', 'RUN-1002', 'RUN-1003']);

    // Duplicate protection also survives the restart.
    const dup = await postEvent(srv.baseUrl, event());
    assert.equal(dup.status, 200);
    assert.equal(dup.body.status, 'duplicate');
    assert.equal((await getJson(srv.baseUrl, '/api/players/P-01/dashboard')).body.cash_balance, 950);
  } finally {
    await stopServer(srv);
  }
});
