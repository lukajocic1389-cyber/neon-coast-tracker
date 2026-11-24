import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, canonicalTimestamp } from '../../src/validation.js';
import { MISSIONS, PLAYERS } from '../../src/catalog.js';

const refs = {
  playersById: new Map(PLAYERS.map((p) => [p.player_id, p])),
  missionsById: new Map(MISSIONS.map((m) => [m.mission_id, m])),
};

const valid = () => ({
  event_id: 'RUN-1001', player_id: 'P-01', mission_id: 'M-12', crew: 'Harbor Crew',
  result: 'completed', cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-20T15:00:00Z',
});

function errorsFor(overrides) {
  const r = validateEvent({ ...valid(), ...overrides }, refs);
  assert.equal(r.ok, false, 'expected validation to fail');
  return r.errors;
}

function onlyError(overrides, field, code) {
  const errors = errorsFor(overrides);
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.equal(errors[0].field, field);
  assert.equal(errors[0].code, code);
  assert.equal(typeof errors[0].message, 'string');
  return errors[0];
}

describe('valid events', () => {
  test('a valid event is accepted and its timestamp is normalised', () => {
    const r = validateEvent(valid(), refs);
    assert.equal(r.ok, true);
    assert.deepEqual(r.event, { ...valid(), timestamp: '2026-11-20T15:00:00.000Z' });
  });

  test('extra fields are ignored and not returned (D16)', () => {
    const r = validateEvent({ ...valid(), weather: 'fog', bonus: 9999 }, refs);
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.event).sort(), [
      'cash_reward', 'crew', 'event_id', 'mission_id', 'player_id', 'reputation_reward', 'result', 'timestamp',
    ]);
  });

  test('a failed event is valid', () => {
    assert.equal(validateEvent({ ...valid(), result: 'failed' }, refs).ok, true);
  });

  test('plain objects work as lookup tables too', () => {
    const objRefs = {
      playersById: Object.fromEntries(refs.playersById),
      missionsById: Object.fromEntries(refs.missionsById),
    };
    assert.equal(validateEvent(valid(), objRefs).ok, true);
  });
});

describe('one test per error code (spec §4.2)', () => {
  test('INVALID_BODY for non-object bodies', () => {
    for (const body of [null, undefined, [], [valid()], 'event', 42, true]) {
      const r = validateEvent(body, refs);
      assert.equal(r.ok, false);
      assert.deepEqual(r.errors.map((e) => [e.field, e.code]), [['body', 'INVALID_BODY']], String(body));
    }
  });

  test('MISSING_FIELD for an absent field', () => {
    const body = valid();
    delete body.player_id;
    const r = validateEvent(body, refs);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.map((e) => [e.field, e.code]), [['player_id', 'MISSING_FIELD']]);
    assert.match(r.errors[0].message, /player_id/);
  });

  test('MISSING_FIELD for a null field', () => {
    onlyError({ cash_reward: null }, 'cash_reward', 'MISSING_FIELD');
  });

  test('INVALID_EVENT_ID', () => {
    for (const event_id of ['', 'has space', 'semi;colon', 'x'.repeat(65), 123, {}]) {
      onlyError({ event_id }, 'event_id', 'INVALID_EVENT_ID');
    }
    assert.equal(validateEvent({ ...valid(), event_id: 'a'.repeat(64) }, refs).ok, true);
    assert.equal(validateEvent({ ...valid(), event_id: 'SIM-42_0001' }, refs).ok, true);
  });

  test('UNKNOWN_PLAYER names the bad value', () => {
    const e = onlyError({ player_id: 'P-99' }, 'player_id', 'UNKNOWN_PLAYER');
    assert.equal(e.message, "Player 'P-99' does not exist.");
  });

  test('UNKNOWN_PLAYER for prototype keys and non-strings', () => {
    for (const player_id of ['constructor', '__proto__', 'toString', 1, ['P-01']]) {
      onlyError({ player_id }, 'player_id', 'UNKNOWN_PLAYER');
    }
    const objRefs = { ...refs, playersById: Object.fromEntries(refs.playersById) };
    const r = validateEvent({ ...valid(), player_id: 'constructor' }, objRefs);
    assert.deepEqual(r.errors.map((e) => e.code), ['UNKNOWN_PLAYER']);
  });

  test('UNKNOWN_MISSION names the bad value and skips the crew check', () => {
    const e = onlyError({ mission_id: 'M-99', crew: 'Nobody' }, 'mission_id', 'UNKNOWN_MISSION');
    assert.equal(e.message, "Mission 'M-99' does not exist.");
  });

  test('CREW_MISMATCH when the crew differs from the catalog (D4)', () => {
    const e = onlyError({ crew: 'Lantern Row' }, 'crew', 'CREW_MISMATCH');
    assert.match(e.message, /'Lantern Row'/);
    assert.match(e.message, /Harbor Crew/);
    onlyError({ crew: 'harbor crew' }, 'crew', 'CREW_MISMATCH');
  });

  test('INVALID_RESULT', () => {
    for (const result of ['won', 'Completed', '', 1]) {
      onlyError({ result }, 'result', 'INVALID_RESULT');
    }
  });

  test('INVALID_CASH_REWARD', () => {
    onlyError({ cash_reward: -5 }, 'cash_reward', 'INVALID_CASH_REWARD');
  });

  test('INVALID_REPUTATION_REWARD', () => {
    onlyError({ reputation_reward: -1 }, 'reputation_reward', 'INVALID_REPUTATION_REWARD');
    onlyError({ reputation_reward: 1001 }, 'reputation_reward', 'INVALID_REPUTATION_REWARD');
  });

  test('INVALID_TIMESTAMP', () => {
    for (const timestamp of [
      'yesterday', '2026-11-20', '2026-11-20T15:00:00', '2026-11-20T15:00:00+01:00',
      '2026-11-20 15:00:00Z', '2026-11-20T15:00:00.1234Z', 1732114800000,
      '2026-02-30T00:00:00Z', '2026-02-29T00:00:00Z', '2026-13-01T00:00:00Z',
      '2026-11-20T24:00:00Z', '2026-11-20T23:60:00Z', '2026-11-20T23:59:60Z',
    ]) {
      onlyError({ timestamp }, 'timestamp', 'INVALID_TIMESTAMP');
    }
  });
});

describe('reward boundaries', () => {
  test('cash_reward: 0 and 1,000,000 are accepted', () => {
    assert.equal(validateEvent({ ...valid(), cash_reward: 0 }, refs).ok, true);
    assert.equal(validateEvent({ ...valid(), cash_reward: 1_000_000 }, refs).ok, true);
  });

  test('cash_reward: 1,000,001, 1.5, "500", booleans, objects and arrays are rejected', () => {
    for (const cash_reward of [1_000_001, 1.5, '500', true, {}, [500]]) {
      onlyError({ cash_reward }, 'cash_reward', 'INVALID_CASH_REWARD');
    }
  });

  test('reputation_reward: 0 and 1,000 are accepted, 1.5 and "20" rejected', () => {
    assert.equal(validateEvent({ ...valid(), reputation_reward: 0 }, refs).ok, true);
    assert.equal(validateEvent({ ...valid(), reputation_reward: 1000 }, refs).ok, true);
    onlyError({ reputation_reward: 1.5 }, 'reputation_reward', 'INVALID_REPUTATION_REWARD');
    onlyError({ reputation_reward: '20' }, 'reputation_reward', 'INVALID_REPUTATION_REWARD');
  });

  test('the "500" message makes clear it was text', () => {
    const e = onlyError({ cash_reward: '500' }, 'cash_reward', 'INVALID_CASH_REWARD');
    assert.match(e.message, /'500'/);
    assert.match(e.message, /text/);
  });
});

describe('error collection', () => {
  test('several errors are collected at once, in field order', () => {
    const r = validateEvent({
      event_id: 'bad id', player_id: 'P-99', mission_id: 'M-10', crew: 'Static Choir',
      result: 'won', cash_reward: -1, reputation_reward: 2.5, timestamp: 'never',
    }, refs);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.map((e) => e.code), [
      'INVALID_EVENT_ID', 'UNKNOWN_PLAYER', 'CREW_MISMATCH', 'INVALID_RESULT',
      'INVALID_CASH_REWARD', 'INVALID_REPUTATION_REWARD', 'INVALID_TIMESTAMP',
    ]);
  });

  test('an empty object reports MISSING_FIELD for all 8 fields and nothing else', () => {
    const r = validateEvent({}, refs);
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.map((e) => e.field), [
      'event_id', 'player_id', 'mission_id', 'crew', 'result', 'cash_reward', 'reputation_reward', 'timestamp',
    ]);
    assert.ok(r.errors.every((e) => e.code === 'MISSING_FIELD'));
  });

  test('a missing crew gives MISSING_FIELD and no CREW_MISMATCH', () => {
    onlyError({ crew: undefined }, 'crew', 'MISSING_FIELD');
  });

  test('a missing mission gives MISSING_FIELD and no CREW_MISMATCH', () => {
    onlyError({ mission_id: null, crew: 'Nobody' }, 'mission_id', 'MISSING_FIELD');
  });

  test('long bad values are truncated in messages', () => {
    const e = onlyError({ player_id: 'P'.repeat(500) }, 'player_id', 'UNKNOWN_PLAYER');
    assert.ok(e.message.length < 120, e.message);
  });
});

describe('canonicalTimestamp', () => {
  test('normalises to YYYY-MM-DDTHH:mm:ss.sssZ', () => {
    assert.equal(canonicalTimestamp('2026-11-20T15:00:00Z'), '2026-11-20T15:00:00.000Z');
    assert.equal(canonicalTimestamp('2026-11-20T15:00:00.5Z'), '2026-11-20T15:00:00.500Z');
    assert.equal(canonicalTimestamp('2026-11-20T15:00:00.50Z'), '2026-11-20T15:00:00.500Z');
    assert.equal(canonicalTimestamp('2026-11-20T15:00:00.007Z'), '2026-11-20T15:00:00.007Z');
  });

  test('accepts leap days and early years', () => {
    assert.equal(canonicalTimestamp('2024-02-29T00:00:00Z'), '2024-02-29T00:00:00.000Z');
    assert.equal(canonicalTimestamp('0050-01-01T00:00:00Z'), '0050-01-01T00:00:00.000Z');
  });
});
