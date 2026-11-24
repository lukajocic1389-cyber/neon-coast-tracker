// SQLite connection, schema (spec §3) and idempotent seed (spec §2).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MISSIONS, PLAYERS } from './catalog.js';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players  (player_id  TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS missions (mission_id TEXT PRIMARY KEY, title TEXT NOT NULL,
                                     crew TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  seq                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id           TEXT NOT NULL UNIQUE,
  player_id          TEXT NOT NULL REFERENCES players(player_id),
  mission_id         TEXT NOT NULL REFERENCES missions(mission_id),
  crew               TEXT NOT NULL,
  result             TEXT NOT NULL CHECK (result IN ('completed','failed')),
  cash_reward        INTEGER NOT NULL,
  reputation_reward  INTEGER NOT NULL,
  cash_awarded       INTEGER NOT NULL,
  reputation_awarded INTEGER NOT NULL,
  timestamp          TEXT NOT NULL,
  received_at        TEXT NOT NULL,
  payload_hash       TEXT NOT NULL
);
`;

function seed(db) {
  const upsertPlayer = db.prepare(
    `INSERT INTO players (player_id, name) VALUES (?, ?)
     ON CONFLICT(player_id) DO UPDATE SET name = excluded.name`,
  );
  const upsertMission = db.prepare(
    `INSERT INTO missions (mission_id, title, crew, description) VALUES (?, ?, ?, ?)
     ON CONFLICT(mission_id) DO UPDATE SET
       title = excluded.title, crew = excluded.crew, description = excluded.description`,
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const p of PLAYERS) upsertPlayer.run(p.player_id, p.name);
    for (const m of MISSIONS) upsertMission.run(m.mission_id, m.title, m.crew, m.description);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Open (creating if needed) the SQLite database at dbPath, apply the schema and seed data.
 * @param {string} dbPath file path, or ':memory:'
 * @returns {DatabaseSync}
 */
export function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    // Wait instead of failing at once if another connection holds the write lock.
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(SCHEMA);
    seed(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}
