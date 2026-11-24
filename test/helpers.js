// Shared helpers for integration tests (Phase 3, NC-6). Written by the orchestrator from spec.md,
// independently of the worker implementations.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { createDashboardRouter } from '../src/dashboard/routes.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Fresh temp directory with a DB path inside; call cleanup() when done. */
export function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'neon-coast-test-'));
  return { dir, dbPath: join(dir, 'neon-coast.db'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** In-process app wired exactly like production (API + dashboard). */
export function buildApp(dbPath) {
  const store = createStore(dbPath);
  const dashboardRouter = createDashboardRouter({
    getDashboard: (id) => store.getDashboard(id),
    listPlayerSummaries: () => store.listPlayerSummaries(),
  });
  return { store, app: createApp({ store, dashboardRouter }) };
}

/** The example event from the assignment PDF, with overrides. */
export function event(overrides = {}) {
  return {
    event_id: 'RUN-1001', player_id: 'P-01', mission_id: 'M-12', crew: 'Harbor Crew',
    result: 'completed', cash_reward: 500, reputation_reward: 20, timestamp: '2026-11-20T15:00:00Z',
    ...overrides,
  };
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

/** Start the real server (`node src/server.js`) as a separate OS process. */
export async function startServer(dbPath) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(ROOT, 'src/server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode}):\n${output}`);
    try { const r = await fetch(`${baseUrl}/api/health`); if (r.ok) return { child, baseUrl, output: () => output }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill('SIGKILL');
  throw new Error(`server did not become healthy:\n${output}`);
}

/** Stop the server process the way Docker/Ctrl-C would and wait for it to exit. */
export async function stopServer({ child }, signal = 'SIGTERM') {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => { child.once('exit', (code) => resolve(code)); child.kill(signal); });
}

export async function postEvent(baseUrl, body) {
  const r = await fetch(`${baseUrl}/api/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

export async function getJson(baseUrl, path) {
  const r = await fetch(`${baseUrl}${path}`);
  return { status: r.status, body: await r.json() };
}
