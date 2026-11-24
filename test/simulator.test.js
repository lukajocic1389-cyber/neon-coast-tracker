// AC-5: the simulator submits 100+ events (with failures, duplicates and invalid events) with repeatable results.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tempDb, startServer, stopServer, getJson } from './helpers.js';
import { generatePlan } from '../src/sim/generator.js';
import { computeExpected } from '../src/sim/expected.js';
import { runPlan, verifyDashboards } from '../src/sim/client.js';
import { PLAYERS } from '../src/catalog.js';

const dbA = tempDb();
const dbB = tempDb();
after(() => { dbA.cleanup(); dbB.cleanup(); });

async function allDashboards(baseUrl) {
  const out = {};
  for (const p of PLAYERS) out[p.player_id] = (await getJson(baseUrl, `/api/players/${p.player_id}/dashboard`)).body;
  return out;
}

test('same seed on two fresh databases gives identical results; a re-run only produces duplicates', async () => {
  const plan = generatePlan({ seed: 42, count: 120 });
  assert.ok(plan.length >= 100, `only ${plan.length} submissions`);
  assert.equal(plan.length, 138);
  const expected = computeExpected(plan);

  const runs = [];
  for (const db of [dbA, dbB]) {
    const srv = await startServer(db.dbPath);
    try {
      const summary = await runPlan(plan, { baseUrl: srv.baseUrl });
      assert.equal(summary.sent, 138);
      assert.equal(summary.byStatus.accepted, 120);
      assert.equal(summary.byStatus.duplicate, 12);
      assert.equal(summary.byStatus.rejected, 6);
      assert.deepEqual(summary.unexpected, []);
      assert.deepEqual(await verifyDashboards(expected, { baseUrl: srv.baseUrl }), []);
      runs.push(await allDashboards(srv.baseUrl));
    } finally { await stopServer(srv); }
  }
  // Repeatability: identical dashboards (including history) from two independent runs.
  assert.deepEqual(runs[0], runs[1]);
  // The run really exercised failures.
  const failed = Object.values(runs[0]).reduce((s, d) => s + d.failed_count, 0);
  assert.ok(failed > 0, 'expected some failed missions');

  // Re-running the same seed against database A: every valid event is now a duplicate, totals unchanged.
  const srv = await startServer(dbA.dbPath);
  try {
    const again = await runPlan(plan, { baseUrl: srv.baseUrl });
    assert.equal(again.byStatus.accepted, 0);
    assert.equal(again.byStatus.duplicate, 132);
    assert.equal(again.byStatus.rejected, 6);
    assert.deepEqual(await allDashboards(srv.baseUrl), runs[0]);
  } finally { await stopServer(srv); }
});
