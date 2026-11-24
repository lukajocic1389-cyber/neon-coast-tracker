// BR-3 / AC-3 under a REAL race (review R3): two separate server processes share one SQLite file and receive the
// same events at the same time. Within one process node:sqlite is synchronous, so only separate processes can race.
// What protects us: BEGIN IMMEDIATE + the duplicate pre-check inside the transaction, backed by UNIQUE(event_id).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tempDb, startServer, stopServer, getJson, event } from './helpers.js';

const db = tempDb();
after(() => db.cleanup());

const ROUNDS = 25;            // distinct event_ids
const COPIES_PER_SERVER = 10; // identical POSTs per event_id per server, all in flight at once

async function post(baseUrl, body) {
  const r = await fetch(`${baseUrl}/api/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.status;
}

test('two server processes on one DB file: each event_id is accepted exactly once and paid once', async () => {
  // Started together on a brand-new file: also covers review R5 (both must come up).
  const [a, b] = await Promise.all([startServer(db.dbPath), startServer(db.dbPath)]);
  try {
    const statuses = [];
    let expectedCash = 0;
    let expectedRep = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const e = event({ event_id: `RACE-${i}`, cash_reward: 100 + i, reputation_reward: 1 + (i % 7) });
      expectedCash += e.cash_reward;
      expectedRep += e.reputation_reward;
      const requests = [];
      for (let c = 0; c < COPIES_PER_SERVER; c++) requests.push(post(a.baseUrl, e), post(b.baseUrl, e));
      const round = await Promise.all(requests);
      statuses.push(...round);
      assert.equal(round.filter((s) => s === 201).length, 1, `RACE-${i}: statuses ${round.join(',')}`);
      assert.equal(round.filter((s) => s === 200).length, round.length - 1, `RACE-${i}: statuses ${round.join(',')}`);
    }

    // Both processes see the same, single-counted totals.
    for (const srv of [a, b]) {
      const d = (await getJson(srv.baseUrl, '/api/players/P-01/dashboard')).body;
      assert.equal(d.completed_count, ROUNDS);
      assert.equal(d.cash_balance, expectedCash);
      assert.equal(d.reputation_by_crew['Harbor Crew'], expectedRep);
    }
    assert.equal(statuses.length, ROUNDS * COPIES_PER_SERVER * 2);
  } finally {
    await Promise.all([stopServer(a), stopServer(b)]);
  }
});
