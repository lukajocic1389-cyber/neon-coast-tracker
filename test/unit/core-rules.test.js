import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAward } from '../../src/rules.js';

test('completed awards the reported cash and reputation', () => {
  assert.deepEqual(
    computeAward({ result: 'completed', cash_reward: 500, reputation_reward: 20 }),
    { cash: 500, reputation: 20 },
  );
});

test('completed with zero rewards awards zero', () => {
  assert.deepEqual(
    computeAward({ result: 'completed', cash_reward: 0, reputation_reward: 0 }),
    { cash: 0, reputation: 0 },
  );
});

test('failed awards nothing', () => {
  assert.deepEqual(
    computeAward({ result: 'failed', cash_reward: 0, reputation_reward: 0 }),
    { cash: 0, reputation: 0 },
  );
});

test('failed with non-zero reported rewards still awards nothing (D6)', () => {
  assert.deepEqual(
    computeAward({ result: 'failed', cash_reward: 750, reputation_reward: 30 }),
    { cash: 0, reputation: 0 },
  );
});
