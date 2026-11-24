import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS } from '../../src/catalog.js';
import { computeExpected } from '../../src/sim/expected.js';
import { generatePlan } from '../../src/sim/generator.js';

const ev = (over) => ({
  event_id: 'X-1', player_id: 'P-01', mission_id: 'M-10', crew: 'Harbor Crew', result: 'completed',
  cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-20T12:00:00.000Z', ...over,
});
const zeroCrews = { 'Harbor Crew': 0, 'Lantern Row': 0, 'Static Choir': 0 };

test('expected: hand-made plan gives hand-computed totals', () => {
  const a = ev({ event_id: 'A' });                                                   // P-01 +500, Harbor +20
  const b = ev({ event_id: 'B', mission_id: 'M-20', crew: 'Lantern Row', cash_reward: 450, reputation_reward: 15 });
  const c = ev({ event_id: 'C', result: 'failed', cash_reward: 900, reputation_reward: 40 }); // P-01 failed, +0
  const d = ev({ event_id: 'D', player_id: 'P-03', mission_id: 'M-31', crew: 'Static Choir', cash_reward: 100, reputation_reward: 5 });
  const plan = [
    { kind: 'valid', expectedStatus: 201, event: a },
    { kind: 'valid', expectedStatus: 201, event: b },
    { kind: 'duplicate', expectedStatus: 200, event: structuredClone(a) },           // no effect
    { kind: 'valid', expectedStatus: 201, event: c },
    { kind: 'invalid', expectedStatus: 400, expectedCode: 'UNKNOWN_PLAYER', event: ev({ event_id: 'BAD-1', player_id: 'P-99' }) },
    { kind: 'invalid', expectedStatus: 400, expectedCode: 'INVALID_RESULT', event: ev({ event_id: 'BAD-2', result: 'abandoned' }) },
    { kind: 'valid', expectedStatus: 201, event: d },
  ];
  const exp = computeExpected(plan);

  assert.deepEqual(Object.keys(exp).sort(), PLAYERS.map((p) => p.player_id).sort());
  assert.deepEqual(exp['P-01'], {
    completed_count: 2, failed_count: 1, cash_balance: 950,
    reputation_by_crew: { 'Harbor Crew': 20, 'Lantern Row': 15, 'Static Choir': 0 },
  });
  assert.deepEqual(exp['P-03'], {
    completed_count: 1, failed_count: 0, cash_balance: 100,
    reputation_by_crew: { 'Harbor Crew': 0, 'Lantern Row': 0, 'Static Choir': 5 },
  });
  for (const id of ['P-02', 'P-04', 'P-05']) {
    assert.deepEqual(exp[id], { completed_count: 0, failed_count: 0, cash_balance: 0, reputation_by_crew: zeroCrews });
  }
});

test('expected: empty plan lists every player with zeros and every crew', () => {
  const exp = computeExpected([]);
  assert.equal(Object.keys(exp).length, PLAYERS.length);
  for (const t of Object.values(exp)) assert.deepEqual(t.reputation_by_crew, zeroCrews);
});

test('expected: a repeated valid event_id is counted once', () => {
  const a = ev({ event_id: 'A' });
  const exp = computeExpected([{ kind: 'valid', event: a }, { kind: 'valid', event: structuredClone(a) }]);
  assert.equal(exp['P-01'].completed_count, 1);
  assert.equal(exp['P-01'].cash_balance, 500);
});

test('expected: generated plan totals equal the sums over its valid events only', () => {
  const plan = generatePlan({ seed: 42 });
  const exp = computeExpected(plan);
  const valid = plan.filter((s) => s.kind === 'valid').map((s) => s.event);
  const sum = (arr, f) => arr.reduce((n, e) => n + f(e), 0);
  const totalCompleted = sum(Object.values(exp), (t) => t.completed_count);
  const totalFailed = sum(Object.values(exp), (t) => t.failed_count);
  assert.equal(totalCompleted + totalFailed, 120);
  assert.equal(totalFailed, valid.filter((e) => e.result === 'failed').length);
  assert.equal(
    sum(Object.values(exp), (t) => t.cash_balance),
    sum(valid.filter((e) => e.result === 'completed'), (e) => e.cash_reward),
  );
  // Pure: computing twice gives the same result and does not mutate the plan.
  const before = structuredClone(plan);
  assert.deepEqual(computeExpected(plan), exp);
  assert.deepEqual(plan, before);
});
