import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CREWS, MISSIONS, PLAYERS } from '../../src/catalog.js';
import { generatePlan } from '../../src/sim/generator.js';
import { computeExpected } from '../../src/sim/expected.js';
import { runPlan, verifyDashboards, apiUrl, ServerUnreachableError } from '../../src/sim/client.js';

// A tiny in-memory stand-in for the API (spec §4), built on node:http. It is NOT the real app.
// It records every request so the tests can check order, headers and bodies.
function createStub() {
  const state = { requests: [], events: new Map(), dashboardOverride: null };

  function firstError(e) {
    if (!PLAYERS.some((p) => p.player_id === e.player_id)) return 'UNKNOWN_PLAYER';
    const m = MISSIONS.find((x) => x.mission_id === e.mission_id);
    if (!m) return 'UNKNOWN_MISSION';
    if (m.crew !== e.crew) return 'CREW_MISMATCH';
    if (!['completed', 'failed'].includes(e.result)) return 'INVALID_RESULT';
    if (!Number.isInteger(e.cash_reward) || e.cash_reward < 0) return 'INVALID_CASH_REWARD';
    const d = new Date(e.timestamp);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 19) !== String(e.timestamp).slice(0, 19)) return 'INVALID_TIMESTAMP';
    return null;
  }

  function dashboard(playerId) {
    const t = { completed_count: 0, failed_count: 0, cash_balance: 0, reputation_by_crew: Object.fromEntries(CREWS.map((c) => [c, 0])) };
    for (const e of state.events.values()) {
      if (e.player_id !== playerId) continue;
      if (e.result === 'completed') {
        t.completed_count++;
        t.cash_balance += e.cash_reward;
        t.reputation_by_crew[e.crew] += e.reputation_reward;
      } else t.failed_count++;
    }
    return { player: { player_id: playerId }, ...t, recent_history: [], ...(state.dashboardOverride?.(playerId) ?? {}) };
  }

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      state.requests.push({ method: req.method, url: req.url, contentType: req.headers['content-type'], raw });
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'POST' && req.url === '/api/events') {
        const e = JSON.parse(raw);
        const code = firstError(e);
        if (code) return send(400, { status: 'rejected', errors: [{ field: 'x', code, message: code }] });
        if (state.events.has(e.event_id)) {
          const same = JSON.stringify(state.events.get(e.event_id)) === JSON.stringify(e);
          return same
            ? send(200, { status: 'duplicate', event_id: e.event_id, message: 'dup' })
            : send(409, { status: 'duplicate_conflict', event_id: e.event_id, message: 'conflict' });
        }
        state.events.set(e.event_id, e);
        return send(201, { status: 'accepted', event_id: e.event_id });
      }
      const m = req.method === 'GET' && req.url.match(/^\/api\/players\/([^/]+)\/dashboard$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!PLAYERS.some((p) => p.player_id === id)) return send(404, { status: 'not_found', message: 'nope' });
        return send(200, dashboard(id));
      }
      return send(404, { status: 'not_found' });
    });
  });
  return { server, state };
}

let stub;
let baseUrl;

before(async () => {
  stub = createStub();
  await new Promise((r) => stub.server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${stub.server.address().port}`;
});
after(() => new Promise((r) => stub.server.close(r)));
beforeEach(() => {
  stub.state.requests.length = 0;
  stub.state.events.clear();
  stub.state.dashboardOverride = null;
});

test('apiUrl joins paths with or without a trailing slash and keeps a base path', () => {
  assert.equal(apiUrl('http://h:1', '/api/events'), 'http://h:1/api/events');
  assert.equal(apiUrl('http://h:1/', '/api/events'), 'http://h:1/api/events');
  assert.equal(apiUrl('http://h:1/nc', '/api/events'), 'http://h:1/nc/api/events');
});

test('runPlan sends every event in order as JSON and tallies the statuses', async () => {
  const plan = generatePlan({ seed: 42, count: 120 });
  const run = await runPlan(plan, { baseUrl });

  assert.equal(run.sent, 138);
  assert.deepEqual(run.byStatus, { accepted: 120, duplicate: 12, duplicate_conflict: 0, rejected: 6, other: 0 });
  assert.deepEqual(run.unexpected, []);

  assert.equal(stub.state.requests.length, plan.length);
  stub.state.requests.forEach((r, i) => {
    assert.equal(r.method, 'POST');
    assert.equal(r.url, '/api/events');
    assert.match(r.contentType, /^application\/json/);
    assert.deepEqual(JSON.parse(r.raw), plan[i].event, `request ${i} is plan entry ${i}`);
  });
});

test('runPlan run twice: the second run reports valid events as unexpected duplicates', async () => {
  const plan = generatePlan({ seed: 7, count: 20 });
  await runPlan(plan, { baseUrl });
  const second = await runPlan(plan, { baseUrl });
  assert.equal(second.byStatus.accepted, 0);
  assert.equal(second.byStatus.duplicate, 20 + 2);
  assert.equal(second.unexpected.length, 20);
  assert.ok(second.unexpected.every((u) => u.expectedStatus === 201 && u.actualStatus === 200));
  assert.equal(second.unexpected[0].body.status, 'duplicate');
});

test('runPlan counts 409 conflicts and other statuses and records them as unexpected', async () => {
  const e = generatePlan({ seed: 1, count: 1 }).find((s) => s.kind === 'valid').event;
  const plan = [
    { kind: 'valid', expectedStatus: 201, event: e },
    { kind: 'duplicate', expectedStatus: 200, event: { ...e, cash_reward: e.cash_reward + 50 } },
  ];
  const run = await runPlan(plan, { baseUrl });
  assert.deepEqual(run.byStatus, { accepted: 1, duplicate: 0, duplicate_conflict: 1, rejected: 0, other: 0 });
  assert.deepEqual(run.unexpected.map((u) => [u.event_id, u.actualStatus]), [[e.event_id, 409]]);

  const other = await runPlan(plan.slice(0, 1), { baseUrl: `${baseUrl}/nowhere` });
  assert.equal(other.byStatus.other, 1);
  assert.equal(other.unexpected[0].actualStatus, 404);
});

test('runPlan flags a 400 that lacks the planned error code', async () => {
  const bad = generatePlan({ seed: 3, count: 0 }).find((s) => s.expectedCode === 'UNKNOWN_PLAYER');
  const run = await runPlan([{ ...bad, expectedCode: 'INVALID_RESULT' }], { baseUrl });
  assert.equal(run.byStatus.rejected, 1);
  assert.equal(run.unexpected.length, 1);
  assert.equal(run.unexpected[0].expectedCode, 'INVALID_RESULT');
  assert.equal(run.unexpected[0].actualStatus, 400);
});

test('runPlan tolerates non-JSON bodies', async () => {
  const fetchImpl = async () => new Response('plain text', { status: 500 });
  const run = await runPlan(generatePlan({ seed: 1, count: 1 }).slice(0, 1), { baseUrl, fetchImpl });
  assert.equal(run.byStatus.other, 1);
  assert.equal(run.unexpected[0].body, 'plain text');
});

test('verifyDashboards finds no mismatch when the server applied the rules', async () => {
  const plan = generatePlan({ seed: 42, count: 120 });
  await runPlan(plan, { baseUrl });
  stub.state.requests.length = 0;
  const mismatches = await verifyDashboards(computeExpected(plan), { baseUrl });
  assert.deepEqual(mismatches, []);
  assert.deepEqual(
    stub.state.requests.map((r) => `${r.method} ${r.url}`),
    PLAYERS.map((p) => `GET /api/players/${p.player_id}/dashboard`),
  );
});

test('verifyDashboards reports field-level mismatches', async () => {
  const plan = generatePlan({ seed: 42, count: 30 });
  await runPlan(plan, { baseUrl });
  const expected = computeExpected(plan);
  stub.state.dashboardOverride = (id) => (id === 'P-02'
    ? { cash_balance: expected['P-02'].cash_balance + 100,
      reputation_by_crew: { ...expected['P-02'].reputation_by_crew, 'Lantern Row': 999 } }
    : {});
  const mismatches = await verifyDashboards(expected, { baseUrl });
  assert.deepEqual(mismatches, [
    { player_id: 'P-02', field: 'cash_balance', expected: expected['P-02'].cash_balance, actual: expected['P-02'].cash_balance + 100 },
    { player_id: 'P-02', field: 'reputation_by_crew.Lantern Row', expected: expected['P-02'].reputation_by_crew['Lantern Row'], actual: 999 },
  ]);
});

test('verifyDashboards reports a non-200 dashboard as a mismatch', async () => {
  const mismatches = await verifyDashboards({ 'P-99': computeExpected([])['P-01'] }, { baseUrl });
  assert.deepEqual(mismatches, [{ player_id: 'P-99', field: 'http_status', expected: 200, actual: 404 }]);
});

test('an unreachable server raises ServerUnreachableError with partial progress', async () => {
  const closed = http.createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const deadUrl = `http://127.0.0.1:${closed.address().port}`;
  await new Promise((r) => closed.close(r));

  const plan = generatePlan({ seed: 1, count: 3 });
  await assert.rejects(runPlan(plan, { baseUrl: deadUrl }), (err) => {
    assert.ok(err instanceof ServerUnreachableError);
    assert.equal(err.progress.sent, 0);
    return true;
  });
  await assert.rejects(verifyDashboards(computeExpected(plan), { baseUrl: deadUrl }), ServerUnreachableError);
});
