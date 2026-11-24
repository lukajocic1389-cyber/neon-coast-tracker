import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREWS, MISSIONS, PLAYERS } from '../../src/catalog.js';
import { generatePlan, INVALID_CODES } from '../../src/sim/generator.js';

// Independent re-statement of the spec §4.2 checks, used to prove "exactly one defect".
// Deliberately not imported from src/ so the test does not share code with what it checks.
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
function realTimestamp(s) {
  if (typeof s !== 'string' || !TS_RE.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 19) === s.slice(0, 19); // rejects rolled-over dates such as Feb 30
}
function specErrors(e) {
  const codes = [];
  if (typeof e.event_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(e.event_id)) codes.push('INVALID_EVENT_ID');
  if (!PLAYERS.some((p) => p.player_id === e.player_id)) codes.push('UNKNOWN_PLAYER');
  const mission = MISSIONS.find((m) => m.mission_id === e.mission_id);
  if (!mission) codes.push('UNKNOWN_MISSION');
  else if (e.crew !== mission.crew) codes.push('CREW_MISMATCH');
  if (!['completed', 'failed'].includes(e.result)) codes.push('INVALID_RESULT');
  if (!Number.isInteger(e.cash_reward) || e.cash_reward < 0 || e.cash_reward > 1_000_000) codes.push('INVALID_CASH_REWARD');
  if (!Number.isInteger(e.reputation_reward) || e.reputation_reward < 0 || e.reputation_reward > 1000) {
    codes.push('INVALID_REPUTATION_REWARD');
  }
  if (!realTimestamp(e.timestamp)) codes.push('INVALID_TIMESTAMP');
  return codes;
}

const byKind = (plan, kind) => plan.filter((s) => s.kind === kind);

test('generator: same seed and count give a deep-equal plan', () => {
  assert.deepEqual(generatePlan({ seed: 42, count: 120 }), generatePlan({ seed: 42, count: 120 }));
  assert.deepEqual(generatePlan({ seed: '42', count: 120 }), generatePlan({ seed: 42, count: 120 }));
  assert.deepEqual(generatePlan(), generatePlan({ seed: 42, count: 120 }));
});

test('generator: a different seed gives a different plan', () => {
  const a = generatePlan({ seed: 42 }).map((s) => ({ ...s.event, event_id: null }));
  const b = generatePlan({ seed: 43 }).map((s) => ({ ...s.event, event_id: null }));
  assert.notDeepEqual(a, b);
});

test('generator: default counts are 120 valid + 12 duplicate + 6 invalid = 138', () => {
  const plan = generatePlan();
  assert.equal(byKind(plan, 'valid').length, 120);
  assert.equal(byKind(plan, 'duplicate').length, 12);
  assert.equal(byKind(plan, 'invalid').length, 6);
  assert.equal(plan.length, 138);
  assert.ok(plan.length >= 100);
});

test('generator: counts follow floor(N/10) duplicates and max(5, floor(N/20)) invalid', () => {
  for (const count of [0, 7, 30, 250]) {
    const plan = generatePlan({ seed: 9, count });
    assert.equal(byKind(plan, 'valid').length, count, `valid for ${count}`);
    assert.equal(byKind(plan, 'duplicate').length, Math.floor(count / 10), `dup for ${count}`);
    assert.equal(byKind(plan, 'invalid').length, Math.max(5, Math.floor(count / 20)), `invalid for ${count}`);
  }
});

test('generator: expected statuses match the kind', () => {
  for (const s of generatePlan()) {
    const want = { valid: 201, duplicate: 200, invalid: 400 }[s.kind];
    assert.equal(s.expectedStatus, want, s.event.event_id);
    if (s.kind === 'invalid') assert.ok(INVALID_CODES.includes(s.expectedCode));
    else assert.equal(s.expectedCode, undefined);
  }
});

test('generator: valid ids are SIM-<seed>-<nnnn>, unique and 1-based', () => {
  const valid = byKind(generatePlan({ seed: 42 }), 'valid');
  assert.deepEqual(
    valid.map((s) => s.event.event_id),
    Array.from({ length: 120 }, (_, i) => `SIM-42-${String(i + 1).padStart(4, '0')}`),
  );
});

test('generator: every duplicate comes after its original and is deep-equal to it', () => {
  for (const seed of [1, 42, 1234]) {
    const plan = generatePlan({ seed });
    plan.forEach((s, i) => {
      if (s.kind !== 'duplicate') return;
      const origIndex = plan.findIndex((o) => o.kind === 'valid' && o.event.event_id === s.event.event_id);
      assert.ok(origIndex >= 0, `original of ${s.event.event_id} exists`);
      assert.ok(origIndex < i, `${s.event.event_id}: original at ${origIndex}, duplicate at ${i}`);
      assert.deepEqual(s.event, plan[origIndex].event);
      assert.notEqual(s.event, plan[origIndex].event, 'duplicate is a copy, not the same object');
      assert.equal(JSON.stringify(s.event), JSON.stringify(plan[origIndex].event), 'byte-identical JSON');
    });
  }
});

test('generator: valid and duplicate events pass every spec §4.2 check', () => {
  for (const s of generatePlan({ seed: 42 })) {
    if (s.kind === 'invalid') continue;
    assert.deepEqual(specErrors(s.event), [], s.event.event_id);
    const e = s.event;
    assert.equal(e.crew, MISSIONS.find((m) => m.mission_id === e.mission_id).crew);
    assert.ok(e.cash_reward >= 100 && e.cash_reward <= 2000 && e.cash_reward % 50 === 0, `cash ${e.cash_reward}`);
    assert.ok(e.reputation_reward >= 5 && e.reputation_reward <= 50, `rep ${e.reputation_reward}`);
  }
});

test('generator: invalid events cover all 6 codes, each with exactly that one defect', () => {
  const invalid = byKind(generatePlan({ seed: 42 }), 'invalid');
  assert.deepEqual(invalid.map((s) => s.expectedCode).sort(), [...INVALID_CODES].sort());
  for (const s of invalid) {
    assert.match(s.event.event_id, /^SIM-42-BAD-\d{2}$/);
    assert.deepEqual(specErrors(s.event), [s.expectedCode], s.event.event_id);
  }
  const ids = invalid.map((s) => s.event.event_id).sort();
  assert.deepEqual(ids, ['SIM-42-BAD-01', 'SIM-42-BAD-02', 'SIM-42-BAD-03', 'SIM-42-BAD-04', 'SIM-42-BAD-05', 'SIM-42-BAD-06']);
});

test('generator: invalid defects use the brief\'s values', () => {
  const invalid = byKind(generatePlan({ seed: 5, count: 240 }), 'invalid'); // 12 invalid: two full cycles
  for (const s of invalid) {
    const e = s.event;
    if (s.expectedCode === 'UNKNOWN_PLAYER') assert.equal(e.player_id, 'P-99');
    if (s.expectedCode === 'UNKNOWN_MISSION') {
      assert.equal(e.mission_id, 'M-99');
      assert.ok(CREWS.includes(e.crew));
    }
    if (s.expectedCode === 'INVALID_CASH_REWARD') assert.ok(e.cash_reward < 0);
    if (s.expectedCode === 'CREW_MISMATCH') assert.ok(CREWS.includes(e.crew));
    if (s.expectedCode === 'INVALID_RESULT') assert.equal(e.result, 'abandoned');
    if (s.expectedCode === 'INVALID_TIMESTAMP') assert.equal(e.timestamp, '2026-02-30T10:00:00Z');
    assert.deepEqual(specErrors(e), [s.expectedCode], e.event_id);
  }
});

test('generator: valid timestamps are canonical and increase by one minute', () => {
  const valid = byKind(generatePlan(), 'valid');
  valid.forEach((s, i) => {
    const ts = s.event.timestamp;
    assert.equal(ts, new Date(ts).toISOString(), 'canonical');
    assert.equal(ts, new Date(Date.parse('2026-11-20T12:00:00.000Z') + i * 60_000).toISOString());
    if (i > 0) assert.ok(ts > valid[i - 1].event.timestamp);
  });
});

test('generator: failure ratio is roughly 0.25 and players and missions vary', () => {
  const valid = byKind(generatePlan({ seed: 42, count: 2000 }), 'valid');
  const failed = valid.filter((s) => s.event.result === 'failed').length;
  assert.ok(Math.abs(failed / valid.length - 0.25) < 0.04, `ratio ${failed / valid.length}`);
  assert.equal(new Set(valid.map((s) => s.event.player_id)).size, PLAYERS.length);
  assert.equal(new Set(valid.map((s) => s.event.mission_id)).size, MISSIONS.length);
});

test('generator: rejects bad seed and count', () => {
  assert.throws(() => generatePlan({ seed: 'abc' }), TypeError);
  assert.throws(() => generatePlan({ seed: 1.5 }), TypeError);
  assert.throws(() => generatePlan({ seed: -1 }), RangeError);
  assert.throws(() => generatePlan({ count: -1 }), RangeError);
  assert.throws(() => generatePlan({ count: 10000 }), RangeError);
  assert.throws(() => generatePlan({ count: 2.5 }), RangeError);
});
