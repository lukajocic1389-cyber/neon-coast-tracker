import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../../src/server.js', import.meta.url));
let tmpRoot;
before(() => { tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'neon-core-server-')); });
after(() => { rmSync(tmpRoot, { recursive: true, force: true }); });

/** Start src/server.js on a free port; resolves with { child, baseUrl, output }. */
async function startServer(dbPath) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = { text: '' };
  child.stderr.on('data', (d) => { output.text += d; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${output.text}`)), 10_000);
    child.stdout.on('data', (d) => {
      output.text += d;
      const m = /listening on (http:\/\/localhost:\d+) \(db: (.+)\)/.exec(output.text);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited (${code}):\n${output.text}`)); });
  });
  return { child, baseUrl, output };
}

async function stopServer(child, signal) {
  const exited = once(child, 'exit');
  child.kill(signal);
  const [code] = await exited;
  return code;
}

test('server starts, serves the API, exits 0 on SIGTERM/SIGINT, and keeps data across a restart', async () => {
  const dbPath = path.join(tmpRoot, 'nested', 'server.db');

  const first = await startServer(dbPath);
  try {
    assert.match(first.output.text, new RegExp(`\\(db: ${dbPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
    const health = await fetch(`${first.baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const post = await fetch(`${first.baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_id: 'SRV-1', player_id: 'P-03', mission_id: 'M-30', crew: 'Static Choir',
        result: 'completed', cash_reward: 250, reputation_reward: 12, timestamp: '2026-11-20T12:00:00Z' }),
    });
    assert.equal(post.status, 201);
  } finally {
    assert.equal(await stopServer(first.child, 'SIGTERM'), 0, first.output.text);
  }

  const second = await startServer(dbPath);
  try {
    const res = await fetch(`${second.baseUrl}/api/players/P-03/dashboard`);
    const body = await res.json();
    assert.equal(body.cash_balance, 250);
    assert.equal(body.reputation_by_crew['Static Choir'], 12);
    assert.equal(body.recent_history[0].event_id, 'SRV-1');
  } finally {
    assert.equal(await stopServer(second.child, 'SIGINT'), 0, second.output.text);
  }
});
