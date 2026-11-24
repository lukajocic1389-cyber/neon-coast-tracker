// Event validation (spec §4.2). Pure: no I/O.
// Collects ALL errors. Extra fields are ignored (D16).

export const EVENT_FIELDS = Object.freeze([
  'event_id', 'player_id', 'mission_id', 'crew', 'result',
  'cash_reward', 'reputation_reward', 'timestamp',
]);

export const RESULTS = Object.freeze(['completed', 'failed']);
export const MAX_CASH_REWARD = 1_000_000;
export const MAX_REPUTATION_REWARD = 1_000;

const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

/** True for a plain JSON object (not null, not an array). */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Canonical form of a valid timestamp string, or null if it is not a real UTC date in the §4.2 format.
 * V8 rolls impossible dates over (Feb 30 → Mar 2, 24:00 → next day), so the parsed components
 * are compared back against the input.
 */
export function canonicalTimestamp(value) {
  if (typeof value !== 'string') return null;
  const m = TIMESTAMP_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac = '0'] = m;
  const ms = Number(frac.padEnd(3, '0'));
  // setUTCFullYear avoids Date.UTC's mapping of years 0–99 to 1900–1999.
  const date = new Date(0);
  date.setUTCFullYear(Number(y), Number(mo) - 1, Number(d));
  date.setUTCHours(Number(h), Number(mi), Number(s), ms);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d) || date.getUTCHours() !== Number(h) ||
    date.getUTCMinutes() !== Number(mi) || date.getUTCSeconds() !== Number(s)
  ) {
    return null;
  }
  return date.toISOString();
}

/** Short, human-readable rendering of a bad value for error messages. */
function show(value) {
  let text;
  if (typeof value === 'string') text = `'${value}'`;
  else {
    try { text = JSON.stringify(value) ?? String(value); } catch { text = String(value); }
  }
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function lookup(collection, key) {
  if (typeof key !== 'string' || collection == null) return undefined;
  if (collection instanceof Map) return collection.get(key);
  return Object.hasOwn(collection, key) ? collection[key] : undefined;
}

function isIntInRange(value, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function rewardMessage(label, value, max) {
  const hint = typeof value === 'string' ? ' (it was sent as text)' : '';
  return `${label} ${show(value)} is invalid: it must be a whole number from 0 to ${max.toLocaleString('en-US')}${hint}.`;
}

/**
 * Validate a raw event body.
 * @param {unknown} body parsed JSON body
 * @param {{ playersById: Map|object, missionsById: Map|object }} refs known players and missions
 * @returns {{ ok: true, event: object } | { ok: false, errors: {field, code, message}[] }}
 */
export function validateEvent(body, { playersById, missionsById } = {}) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      errors: [{ field: 'body', code: 'INVALID_BODY', message: 'Request body must be a JSON object.' }],
    };
  }

  const errors = [];
  const add = (field, code, message) => errors.push({ field, code, message });
  const present = {};
  for (const field of EVENT_FIELDS) {
    const value = Object.hasOwn(body, field) ? body[field] : undefined;
    if (value === undefined || value === null) {
      add(field, 'MISSING_FIELD', `Field '${field}' is required.`);
      present[field] = false;
    } else {
      present[field] = true;
    }
    if (!present[field]) continue;

    switch (field) {
      case 'event_id':
        if (typeof value !== 'string' || !EVENT_ID_RE.test(value)) {
          add(field, 'INVALID_EVENT_ID',
            `Event id ${show(value)} is invalid: use 1 to 64 letters, digits, '_' or '-'.`);
        }
        break;
      case 'player_id':
        if (lookup(playersById, value) === undefined) {
          add(field, 'UNKNOWN_PLAYER', `Player ${show(value)} does not exist.`);
        }
        break;
      case 'mission_id':
        if (lookup(missionsById, value) === undefined) {
          add(field, 'UNKNOWN_MISSION', `Mission ${show(value)} does not exist.`);
        }
        break;
      case 'crew': {
        // Only checked when the mission exists (D4).
        const mission = present.mission_id ? lookup(missionsById, body.mission_id) : undefined;
        if (mission && value !== mission.crew) {
          add(field, 'CREW_MISMATCH',
            `Crew ${show(value)} does not match mission ${mission.mission_id}, which belongs to '${mission.crew}'.`);
        }
        break;
      }
      case 'result':
        if (!RESULTS.includes(value)) {
          add(field, 'INVALID_RESULT', `Result ${show(value)} is invalid: use 'completed' or 'failed'.`);
        }
        break;
      case 'cash_reward':
        if (!isIntInRange(value, MAX_CASH_REWARD)) {
          add(field, 'INVALID_CASH_REWARD', rewardMessage('Cash reward', value, MAX_CASH_REWARD));
        }
        break;
      case 'reputation_reward':
        if (!isIntInRange(value, MAX_REPUTATION_REWARD)) {
          add(field, 'INVALID_REPUTATION_REWARD', rewardMessage('Reputation reward', value, MAX_REPUTATION_REWARD));
        }
        break;
      case 'timestamp':
        if (canonicalTimestamp(value) === null) {
          add(field, 'INVALID_TIMESTAMP',
            `Timestamp ${show(value)} is invalid: use a real UTC date such as '2026-11-20T15:00:00Z'.`);
        }
        break;
      default:
        break;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    event: {
      event_id: body.event_id,
      player_id: body.player_id,
      mission_id: body.mission_id,
      crew: body.crew,
      result: body.result,
      cash_reward: body.cash_reward,
      reputation_reward: body.reputation_reward,
      timestamp: canonicalTimestamp(body.timestamp),
    },
  };
}
