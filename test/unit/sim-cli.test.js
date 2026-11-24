import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CREWS } from '../../src/catalog.js';
import { main, EXIT } from '../../scripts/simulate.js';
import { INVALID_CODES } from '../../src/sim/generator.js';

const SCRIPT = fileURLToPath(new URL('../../scripts/simulate.js', import.meta.url));

// In-memory fake fetch that follows the spec §4 rules closely enough for the CLI tests.
// `tamper(playerId, dashboard)` lets a test corrupt one dashboard.
function fakeFetch({ tamper, specCodes = false } = {}) {
  const events = new Map();
  return async (url, init = {}) => {
    const { pathname } = new URL(url);
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (init.method === 'POST' && pathname === '/api/events') {
      const e = JSON.parse(init.body);
      if (e.event_id.includes('-BAD-')) {
        // specCodes: answer with every spec §4.2 code the simulator can expect, so the inclusion check passes.
        const errors = specCodes ? INVALID_CODES.map((code) => ({ code })) : [{ code: 'X' }];
        return json(400, { status: 'rejected', errors });
      }
      if (events.has(e.event_id)) return json(200, { status: 'duplicate', event_id: e.event_id });
      events.set(e.event_id, e);
      return json(201, { status: 'accepted', event_id: e.event_id });
    }
    const m = pathname.match(/^\/api\/players\/([^/]+)\/dashboard$/);
    if (m) {
      const d = { completed_count: 0, failed_count: 0, cash_balance: 0, reputation_by_crew: Object.fromEntries(CREWS.map((c) => [c, 0])) };
      for (const e of events.values()) {
        if (e.player_id !== m[1]) continue;
        if (e.result === 'completed') {
          d.completed_count++;
          d.cash_balance += e.cash_reward;
          d.reputation_by_crew[e.crew] += e.reputation_reward;
        } else d.failed_count++;
      }
      return json(200, tamper ? tamper(m[1], d) : d);
    }
    return json(404, {});
  };
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } };
}

test('cli: default run prints the summary and exits 0', async () => {
  const c = capture();
  const code = await main([], { fetchImpl: fakeFetch(), ...c.io });
  const text = c.out.join('');
  assert.equal(code, EXIT.OK);
  assert.match(text, /requests sent\s+138/);
  assert.match(text, /accepted \(201\)\s+120/);
  assert.match(text, /duplicate \(200\)\s+12/);
  assert.match(text, /rejected \(400\)\s+6/);
  assert.match(text, /P-01\s+Nova Reyes/);
  assert.match(text, /--verify assumes the database was empty before this run/);
  assert.doesNotMatch(text, /Dashboard verification/);
});

test('cli: --verify with matching dashboards exits 0', async () => {
  const c = capture();
  const code = await main(['--verify', '--seed', '5', '--count', '40'], { fetchImpl: fakeFetch(), ...c.io });
  assert.equal(code, EXIT.OK);
  assert.match(c.out.join(''), /Dashboard verification: OK \(5 players, 0 mismatches\)/);
});

test('cli: --verify with a wrong dashboard exits 1 and lists the mismatch', async () => {
  const c = capture();
  const tamper = (id, d) => (id === 'P-03' ? { ...d, failed_count: d.failed_count + 1 } : d);
  const code = await main(['--verify'], { fetchImpl: fakeFetch({ tamper }), ...c.io });
  assert.equal(code, EXIT.MISMATCH);
  assert.match(c.out.join(''), /1 mismatch\(es\)\n\s+P-03 failed_count: expected \d+, actual \d+/);
});

test('cli: --json prints exactly one JSON object', async () => {
  const c = capture();
  const code = await main(['--json', '--verify'], { fetchImpl: fakeFetch(), ...c.io });
  assert.equal(code, EXIT.OK);
  assert.equal(c.out.length, 1);
  const obj = JSON.parse(c.out[0]);
  assert.equal(obj.ok, true);
  assert.equal(obj.sent, 138);
  assert.deepEqual(obj.byStatus, { accepted: 120, duplicate: 12, duplicate_conflict: 0, rejected: 6, other: 0 });
  assert.deepEqual(obj.verify, { ok: true, mismatches: [] });
  assert.equal(Object.keys(obj.expected).length, 5);
  assert.match(obj.note, /empty/);
  assert.equal(obj.exitCode, 0);
});

test('cli: a second run reports unexpected duplicates but still exits 0', async () => {
  const fetchImpl = fakeFetch();
  await main(['--count', '20'], { fetchImpl, ...capture().io });
  const c = capture();
  const code = await main(['--count', '20', '--json'], { fetchImpl, ...c.io });
  const obj = JSON.parse(c.out[0]);
  assert.equal(code, EXIT.OK);
  assert.equal(obj.byStatus.accepted, 0);
  // The fake rejects with code 'X', so invalid entries are also flagged; check the valid ones here.
  const dupes = obj.unexpected.filter((u) => u.expectedStatus === 201);
  assert.equal(dupes.length, 20);
  assert.ok(dupes.every((u) => u.actualStatus === 200));
});

test('cli: --strict exits 0 when every response is as planned (review R4)', async () => {
  const c = capture();
  const code = await main(['--strict', '--verify', '--json'], { fetchImpl: fakeFetch({ specCodes: true }), ...c.io });
  const obj = JSON.parse(c.out[0]);
  assert.deepEqual(obj.unexpected, []);
  assert.equal(code, EXIT.OK);
});

test('cli: --strict exits 3 on unexpected responses; without it the same run exits 0 (review R4)', async () => {
  const fetchImpl = fakeFetch({ specCodes: true });
  await main(['--count', '20'], { fetchImpl, ...capture().io }); // first run fills the fake DB
  assert.equal(await main(['--count', '20'], { fetchImpl, ...capture().io }), EXIT.OK);
  const c = capture();
  assert.equal(await main(['--count', '20', '--strict'], { fetchImpl, ...c.io }), EXIT.UNEXPECTED);
  assert.match(c.out.join(''), /--strict: these fail the run, exit 3/);
});

test('cli: a wrong error code on a 400 fails --strict (review R4)', async () => {
  const c = capture();
  const code = await main(['--strict'], { fetchImpl: fakeFetch(), ...c.io }); // fake answers code 'X'
  assert.equal(code, EXIT.UNEXPECTED);
});

test('cli: a dashboard mismatch (exit 1) takes precedence over --strict (exit 3)', async () => {
  const fetchImpl = fakeFetch({ tamper: (id, d) => (id === 'P-01' ? { ...d, cash_balance: -1 } : d) });
  assert.equal(await main(['--verify', '--strict'], { fetchImpl, ...capture().io }), EXIT.MISMATCH);
});

test('cli: an unreachable server exits 2 (text and json)', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const t = capture();
  assert.equal(await main([], { fetchImpl, ...t.io }), EXIT.UNREACHABLE);
  assert.match(t.err.join(''), /Could not reach the server/);
  const j = capture();
  assert.equal(await main(['--json'], { fetchImpl, ...j.io }), EXIT.UNREACHABLE);
  assert.equal(JSON.parse(j.out[0]).error, 'unreachable');
});

test('cli: bad arguments exit 64 with usage', async () => {
  for (const args of [['--seed', 'abc'], ['--seed', '-1'], ['--seed', '4294967296'], ['--seed', '1e21'],['--count', '1.5'], ['--count', '10000'], ['--url', 'ftp://x'], ['--nope']]) {
    const c = capture();
    assert.equal(await main(args, { fetchImpl: fakeFetch(), ...c.io }), EXIT.USAGE, args.join(' '));
    assert.match(c.err.join(''), /Usage:/);
  }
});

const runNode = (args) => new Promise((resolve) => {
  execFile(process.execPath, args, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});

test('cli: the real process runs when started through a symlink', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nc-sim-'));
  const link = join(dir, 'simulate.js');
  symlinkSync(SCRIPT, link);
  try {
    const { code, stdout } = await runNode([link, '--help']);
    assert.equal(code, 0);
    assert.match(stdout, /Usage:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli: the real process exits 2 against a closed port', async () => {
  const closed = http.createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${closed.address().port}`;
  await new Promise((r) => closed.close(r));
  const { code, stderr } = await runNode([SCRIPT, '--url', url, '--count', '5']);
  assert.equal(code, 2);
  assert.match(stderr, /Could not reach the server/);
});
