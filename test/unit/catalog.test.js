import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREWS, MISSIONS, PLAYERS } from '../../src/catalog.js';

test('catalog has at least five missions with id, title, crew and description', () => {
  assert.ok(MISSIONS.length >= 5);
  for (const m of MISSIONS) {
    for (const f of ['mission_id', 'title', 'crew', 'description']) {
      assert.equal(typeof m[f], 'string', `${m.mission_id}.${f}`);
      assert.ok(m[f].length > 0, `${m.mission_id}.${f} is empty`);
    }
    assert.ok(CREWS.includes(m.crew), `${m.mission_id} has unknown crew ${m.crew}`);
  }
});

test('mission and player ids are unique', () => {
  assert.equal(new Set(MISSIONS.map((m) => m.mission_id)).size, MISSIONS.length);
  assert.equal(new Set(PLAYERS.map((p) => p.player_id)).size, PLAYERS.length);
});

test('every crew has at least one mission', () => {
  for (const c of CREWS) assert.ok(MISSIONS.some((m) => m.crew === c), c);
});
