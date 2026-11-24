// The store: the only module that reads and writes events (spec §3, §4.3–§4.5).
import { createHash } from 'node:crypto';
import { openDb } from './db.js';
import { CREWS } from './catalog.js';
import { validateEvent } from './validation.js';
import { computeAward } from './rules.js';

export const HISTORY_LIMIT = 10; // D17
const SQLITE_CONSTRAINT_UNIQUE = 2067;

/** SHA-256 over the 8 known fields in fixed order (spec §3, D3). Expects a normalised event. */
export function payloadHash(event) {
  return createHash('sha256').update(JSON.stringify([
    event.event_id, event.player_id, event.mission_id, event.crew, event.result,
    event.cash_reward, event.reputation_reward, event.timestamp,
  ])).digest('hex');
}

function duplicateResponse(eventId, samePayload) {
  if (samePayload) {
    return {
      httpStatus: 200,
      body: {
        status: 'duplicate',
        event_id: eventId,
        message: `Event ${eventId} was already processed; no rewards were applied again.`,
      },
    };
  }
  return {
    httpStatus: 409,
    body: {
      status: 'duplicate_conflict',
      event_id: eventId,
      message: `Event ${eventId} was already processed with different data; this event was ignored.`,
    },
  };
}

/**
 * @param {string} dbPath SQLite file path (or ':memory:')
 */
export function createStore(dbPath) {
  const db = openDb(dbPath);

  const players = db.prepare('SELECT player_id, name FROM players ORDER BY player_id').all()
    .map((r) => ({ player_id: r.player_id, name: r.name }));
  const missions = db.prepare('SELECT mission_id, title, crew, description FROM missions ORDER BY mission_id').all()
    .map((r) => ({ mission_id: r.mission_id, title: r.title, crew: r.crew, description: r.description }));
  const playersById = new Map(players.map((p) => [p.player_id, p]));
  const missionsById = new Map(missions.map((m) => [m.mission_id, m]));

  const findEvent = db.prepare('SELECT payload_hash FROM events WHERE event_id = ?');
  const insertEvent = db.prepare(`
    INSERT INTO events (event_id, player_id, mission_id, crew, result, cash_reward, reputation_reward,
                        cash_awarded, reputation_awarded, timestamp, received_at, payload_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const playerTotals = db.prepare(`
    SELECT COUNT(CASE WHEN result = 'completed' THEN 1 END) AS completed_count,
           COUNT(CASE WHEN result = 'failed' THEN 1 END)    AS failed_count,
           COALESCE(SUM(cash_awarded), 0)                   AS cash_balance
    FROM events WHERE player_id = ?`);
  const reputationByCrew = db.prepare(`
    SELECT crew, COALESCE(SUM(reputation_awarded), 0) AS reputation
    FROM events WHERE player_id = ? GROUP BY crew`);
  const recentHistory = db.prepare(`
    SELECT e.event_id, e.mission_id, m.title AS mission_title, e.crew, e.result,
           e.cash_awarded, e.reputation_awarded, e.timestamp
    FROM events e JOIN missions m ON m.mission_id = e.mission_id
    WHERE e.player_id = ?
    ORDER BY e.timestamp DESC, e.seq DESC
    LIMIT ${HISTORY_LIMIT}`);
  const summaries = db.prepare(`
    SELECT p.player_id, p.name,
           COUNT(CASE WHEN e.result = 'completed' THEN 1 END) AS completed_count,
           COUNT(CASE WHEN e.result = 'failed' THEN 1 END)    AS failed_count,
           COALESCE(SUM(e.cash_awarded), 0)                   AS cash_balance,
           COALESCE(SUM(e.reputation_awarded), 0)             AS total_reputation
    FROM players p LEFT JOIN events e ON e.player_id = p.player_id
    GROUP BY p.player_id, p.name
    ORDER BY p.player_id`);

  let closed = false;

  function submitEvent(rawBody) {
    const validation = validateEvent(rawBody, { playersById, missionsById });
    if (!validation.ok) {
      return { httpStatus: 400, body: { status: 'rejected', errors: validation.errors } };
    }
    const event = validation.event;
    const hash = payloadHash(event);
    const award = computeAward(event);

    let inTransaction = false;
    try {
      db.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      const existing = findEvent.get(event.event_id);
      if (existing) {
        db.exec('ROLLBACK'); // nothing was written
        inTransaction = false;
        return duplicateResponse(event.event_id, existing.payload_hash === hash);
      }
      insertEvent.run(
        event.event_id, event.player_id, event.mission_id, event.crew, event.result,
        event.cash_reward, event.reputation_reward, award.cash, award.reputation,
        event.timestamp, new Date().toISOString(), hash,
      );
      db.exec('COMMIT');
      inTransaction = false;
    } catch (err) {
      if (inTransaction) {
        try { db.exec('ROLLBACK'); } catch { /* keep the original error */ }
      }
      // DB-level safety net (BR-3): another writer stored this event_id first.
      if (err?.errcode === SQLITE_CONSTRAINT_UNIQUE) {
        const stored = findEvent.get(event.event_id);
        if (stored) return duplicateResponse(event.event_id, stored.payload_hash === hash);
      }
      throw err;
    }

    return {
      httpStatus: 201,
      body: {
        status: 'accepted',
        event_id: event.event_id,
        result: event.result,
        awarded: { cash: award.cash, reputation: award.reputation, crew: event.crew },
      },
    };
  }

  function getDashboard(playerId) {
    const player = playersById.get(playerId);
    if (!player) return null;

    const totals = playerTotals.get(player.player_id);
    const reputation_by_crew = Object.fromEntries(CREWS.map((c) => [c, 0]));
    for (const row of reputationByCrew.all(player.player_id)) {
      reputation_by_crew[row.crew] = row.reputation;
    }
    const recent_history = recentHistory.all(player.player_id).map((r) => ({
      event_id: r.event_id,
      mission_id: r.mission_id,
      mission_title: r.mission_title,
      crew: r.crew,
      result: r.result,
      cash_awarded: r.cash_awarded,
      reputation_awarded: r.reputation_awarded,
      timestamp: r.timestamp,
    }));

    return {
      player: { player_id: player.player_id, name: player.name },
      completed_count: totals.completed_count,
      failed_count: totals.failed_count,
      cash_balance: totals.cash_balance,
      reputation_by_crew,
      recent_history,
    };
  }

  function listPlayerSummaries() {
    return summaries.all().map((r) => ({
      player_id: r.player_id,
      name: r.name,
      completed_count: r.completed_count,
      failed_count: r.failed_count,
      cash_balance: r.cash_balance,
      total_reputation: r.total_reputation,
    }));
  }

  function listMissions() {
    return missions.map((m) => ({ ...m }));
  }

  function close() {
    if (closed) return;
    closed = true;
    db.close();
  }

  return { submitEvent, getDashboard, listPlayerSummaries, listMissions, close };
}
