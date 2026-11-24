import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrng, normaliseSeed } from '../../src/sim/prng.js';

const sample = (seed, n = 20) => {
  const r = createPrng(seed);
  return Array.from({ length: n }, () => r.next());
};

test('prng: same seed gives the same sequence, numeric string seeds equal numbers', () => {
  assert.deepEqual(sample(42), sample(42));
  assert.deepEqual(sample('42'), sample(42));
});

test('prng: different seeds give different sequences', () => {
  assert.notDeepEqual(sample(42), sample(43));
});

test('prng: next() stays in [0, 1)', () => {
  for (const x of sample(7, 5000)) assert.ok(x >= 0 && x < 1, String(x));
});

test('prng: int() is inclusive on both ends and in range', () => {
  const r = createPrng(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.int(3, 6);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 6, String(v));
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
  assert.throws(() => r.int(5, 4), RangeError);
});

test('prng: pick() returns array members and rejects empty arrays', () => {
  const r = createPrng(2);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
  assert.throws(() => r.pick([]), RangeError);
});

test('prng: chance() roughly matches the probability', () => {
  const r = createPrng(3);
  let hits = 0;
  const n = 10000;
  for (let i = 0; i < n; i++) if (r.chance(0.25)) hits++;
  assert.ok(Math.abs(hits / n - 0.25) < 0.03, `ratio ${hits / n}`);
});

test('prng: non-integer seeds are rejected', () => {
  assert.throws(() => normaliseSeed('abc'), TypeError);
  assert.throws(() => normaliseSeed(1.5), TypeError);
});
