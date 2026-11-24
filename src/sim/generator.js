// Deterministic submission plan for the simulator (spec §6, tasks/simulator.md).
// Pure: the same { seed, count } always gives a deep-equal plan. No I/O, no wall clock.

import { CREWS, MISSIONS, PLAYERS } from '../catalog.js';
import { createPrng, normaliseSeed } from './prng.js';

export const DEFAULT_COUNT = 120;
export const BASE_TIMESTAMP_MS = Date.parse('2026-11-20T12:00:00.000Z');
export const MAX_COUNT = 9999; // valid ids use a 4-digit sequence number

/** The defect cycle for invalid events, in order. */
export const INVALID_CODES = Object.freeze([
  'UNKNOWN_PLAYER',
  'UNKNOWN_MISSION',
  'INVALID_CASH_REWARD',
  'CREW_MISMATCH',
  'INVALID_RESULT',
  'INVALID_TIMESTAMP',
]);

export const duplicateCountFor = (count) => Math.floor(count / 10);
export const invalidCountFor = (count) => Math.max(5, Math.floor(count / 20));

/** A valid event body (spec §4.1) built from the PRNG. */
function randomValidEvent(rng, eventId, timestampMs) {
  const player = rng.pick(PLAYERS);
  const mission = rng.pick(MISSIONS);
  return {
    event_id: eventId,
    player_id: player.player_id,
    mission_id: mission.mission_id,
    crew: mission.crew,
    result: rng.chance(0.25) ? 'failed' : 'completed',
    cash_reward: 100 + 50 * rng.int(0, 38), // 100..2000 in steps of 50
    reputation_reward: rng.int(5, 50),
    timestamp: new Date(timestampMs).toISOString(),
  };
}

/** Apply exactly one defect to an otherwise valid event. */
function applyDefect(rng, event, code) {
  switch (code) {
    case 'UNKNOWN_PLAYER':
      event.player_id = 'P-99';
      break;
    case 'UNKNOWN_MISSION':
      event.mission_id = 'M-99'; // crew stays a real crew name
      break;
    case 'INVALID_CASH_REWARD':
      event.cash_reward = -event.cash_reward;
      break;
    case 'CREW_MISMATCH':
      event.crew = rng.pick(CREWS.filter((c) => c !== event.crew));
      break;
    case 'INVALID_RESULT':
      event.result = 'abandoned';
      break;
    case 'INVALID_TIMESTAMP':
      event.timestamp = '2026-02-30T10:00:00Z';
      break;
    default:
      throw new Error(`Unknown defect code ${code}`);
  }
  return event;
}

function checkArgs(seed, count) {
  normaliseSeed(seed); // throws TypeError on non-integers
  if (Number(seed) < 0) throw new RangeError(`Seed must be >= 0, got ${seed}.`);
  if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) {
    throw new RangeError(`Count must be an integer from 0 to ${MAX_COUNT}, got ${count}.`);
  }
}

/**
 * Build the ordered list of submissions.
 * @param {{ seed?: number|string, count?: number }} [opts]
 * @returns {Array<{ kind: 'valid'|'duplicate'|'invalid', expectedStatus: 201|200|400, expectedCode?: string, event: object }>}
 */
export function generatePlan({ seed = 42, count = DEFAULT_COUNT } = {}) {
  const countN = Number(count);
  checkArgs(seed, countN);
  const seedLabel = String(Number(seed));
  const rng = createPrng(seed);

  // 1. Unique valid events, in timestamp order.
  const plan = [];
  for (let i = 0; i < countN; i++) {
    const id = `SIM-${seedLabel}-${String(i + 1).padStart(4, '0')}`;
    plan.push({ kind: 'valid', expectedStatus: 201, event: randomValidEvent(rng, id, BASE_TIMESTAMP_MS + i * 60_000) });
  }
  const validEntries = plan.slice();

  // 2. Duplicates: deep copies of earlier valid events, inserted strictly after their original.
  //    Later insertions never move an entry ahead of another, so "after" still holds at the end.
  for (let d = 0; d < duplicateCountFor(countN); d++) {
    const original = rng.pick(validEntries);
    const originalIndex = plan.indexOf(original);
    const at = rng.int(originalIndex + 1, plan.length);
    plan.splice(at, 0, { kind: 'duplicate', expectedStatus: 200, event: structuredClone(original.event) });
  }

  // 3. Invalid events: otherwise valid, with exactly one defect each, at seeded positions.
  for (let k = 0; k < invalidCountFor(countN); k++) {
    const code = INVALID_CODES[k % INVALID_CODES.length];
    const id = `SIM-${seedLabel}-BAD-${String(k + 1).padStart(2, '0')}`;
    const event = applyDefect(rng, randomValidEvent(rng, id, BASE_TIMESTAMP_MS + (countN + k) * 60_000), code);
    const at = rng.int(0, plan.length);
    plan.splice(at, 0, { kind: 'invalid', expectedStatus: 400, expectedCode: code, event });
  }

  return plan;
}
