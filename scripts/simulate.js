#!/usr/bin/env node
// Neon Coast simulator CLI (spec §6). Plays the game engine: submits a seeded plan of mission-result events,
// prints what happened and, with --verify, checks the dashboards against locally computed totals.
//
//   npm run simulate -- --url http://localhost:3000 --seed 42 --count 120 [--verify] [--json]
//
// Exit codes: 0 = ok, 1 = --verify found mismatches, 2 = could not reach the server, 64 = bad command-line usage.
// Unexpected statuses (for example a second run where valid events come back as duplicates) are reported only.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CREWS, PLAYERS } from '../src/catalog.js';
import { generatePlan, DEFAULT_COUNT, MAX_COUNT } from '../src/sim/generator.js';
import { computeExpected } from '../src/sim/expected.js';
import { runPlan, verifyDashboards, ServerUnreachableError } from '../src/sim/client.js';

export const EXIT = Object.freeze({ OK: 0, MISMATCH: 1, UNREACHABLE: 2, USAGE: 64 });
const VERIFY_NOTE = '--verify assumes the database was empty before this run.';

const USAGE = `Usage: npm run simulate -- [--url URL] [--seed N] [--count N] [--verify] [--json]
  --url     API base URL (default http://localhost:3000)
  --seed    integer seed, >= 0 (default 42)
  --count   number of unique valid events, 0-${MAX_COUNT} (default ${DEFAULT_COUNT})
  --verify  compare each player's dashboard with the expected totals (exit 1 on mismatch)
  --json    print one machine-readable JSON object instead of the text summary`;

class UsageError extends Error {}

function parseCli(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        url: { type: 'string', default: 'http://localhost:3000' },
        seed: { type: 'string', default: '42' },
        count: { type: 'string', default: String(DEFAULT_COUNT) },
        verify: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }));
  } catch (err) {
    throw new UsageError(err.message);
  }
  if (!/^\d+$/.test(values.seed)) throw new UsageError(`--seed must be a non-negative integer, got '${values.seed}'.`);
  if (!/^\d+$/.test(values.count) || Number(values.count) > MAX_COUNT) {
    throw new UsageError(`--count must be an integer from 0 to ${MAX_COUNT}, got '${values.count}'.`);
  }
  let url;
  try {
    url = new URL(values.url);
  } catch {
    throw new UsageError(`--url is not a valid URL: '${values.url}'.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UsageError(`--url must be http or https: '${values.url}'.`);
  return { url: values.url, seed: Number(values.seed), count: Number(values.count),
    verify: values.verify, json: values.json, help: values.help };
}

const pad = (v, n) => String(v).padStart(n);
const padEnd = (v, n) => String(v).padEnd(n);

function expectedTable(expected) {
  const names = Object.fromEntries(PLAYERS.map((p) => [p.player_id, p.name]));
  const cols = ['completed', 'failed', 'cash', ...CREWS];
  const widths = cols.map((c) => Math.max(c.length, 9));
  const lines = [`  ${padEnd('player', 6)}  ${padEnd('name', 12)}  ${cols.map((c, i) => pad(c, widths[i])).join('  ')}`];
  for (const [id, t] of Object.entries(expected)) {
    const cells = [t.completed_count, t.failed_count, t.cash_balance, ...CREWS.map((c) => t.reputation_by_crew[c])];
    lines.push(`  ${padEnd(id, 6)}  ${padEnd(names[id] ?? '', 12)}  ${cells.map((v, i) => pad(v, widths[i])).join('  ')}`);
  }
  return lines.join('\n');
}

function textReport({ opts, plan, run, expected, mismatches }) {
  const kinds = { valid: 0, duplicate: 0, invalid: 0 };
  for (const s of plan) kinds[s.kind] += 1;
  const out = [];
  out.push('Neon Coast simulator');
  out.push(`  url: ${opts.url}   seed: ${opts.seed}   count: ${opts.count}`);
  out.push(`  planned: ${plan.length} requests (${kinds.valid} valid, ${kinds.duplicate} duplicate, ${kinds.invalid} invalid)`);
  out.push('');
  out.push('Results');
  out.push(`  requests sent        ${pad(run.sent, 5)}`);
  out.push(`  accepted (201)       ${pad(run.byStatus.accepted, 5)}`);
  out.push(`  duplicate (200)      ${pad(run.byStatus.duplicate, 5)}`);
  out.push(`  dup. conflict (409)  ${pad(run.byStatus.duplicate_conflict, 5)}`);
  out.push(`  rejected (400)       ${pad(run.byStatus.rejected, 5)}`);
  out.push(`  other                ${pad(run.byStatus.other, 5)}`);
  out.push(`  unexpected           ${pad(run.unexpected.length, 5)}`);
  if (run.unexpected.length > 0) {
    out.push('');
    out.push('Unexpected responses (reported only; they do not change the exit code)');
    for (const u of run.unexpected.slice(0, 10)) {
      const code = u.expectedCode ? ` ${u.expectedCode}` : '';
      out.push(`  ${u.event_id}: expected ${u.expectedStatus}${code}, got ${u.actualStatus} ${JSON.stringify(u.body)}`);
    }
    if (run.unexpected.length > 10) out.push(`  ... and ${run.unexpected.length - 10} more (use --json for all)`);
    if (run.unexpected.some((u) => u.expectedStatus === 201 && u.actualStatus === 200)) {
      out.push('  Hint: valid events answered as 200 duplicate mean this seed was already sent to this database.');
    }
  }
  out.push('');
  out.push('Expected totals for this plan (computed locally from the rules; valid events only)');
  out.push(expectedTable(expected));
  out.push('');
  out.push(`Note: ${VERIFY_NOTE}`);
  if (mismatches) {
    out.push('');
    if (mismatches.length === 0) {
      out.push(`Dashboard verification: OK (${Object.keys(expected).length} players, 0 mismatches)`);
    } else {
      out.push(`Dashboard verification: ${mismatches.length} mismatch(es)`);
      for (const m of mismatches) {
        out.push(`  ${m.player_id} ${m.field}: expected ${JSON.stringify(m.expected)}, actual ${JSON.stringify(m.actual)}`);
      }
    }
  }
  return out.join('\n');
}

/**
 * Run the CLI. Returns the exit code instead of exiting, so it can be tested.
 * @param {string[]} argv arguments after the script name
 * @param {{ fetchImpl?: typeof fetch, stdout?: (s: string) => void, stderr?: (s: string) => void }} [io]
 */
export async function main(argv, { fetchImpl = fetch, stdout = (s) => process.stdout.write(s),
  stderr = (s) => process.stderr.write(s) } = {}) {
  let opts;
  try {
    opts = parseCli(argv);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    if (argv.includes('--json')) stdout(`${JSON.stringify({ ok: false, error: 'usage', message: err.message, exitCode: EXIT.USAGE })}\n`);
    else stderr(`Error: ${err.message}\n\n${USAGE}\n`);
    return EXIT.USAGE;
  }
  if (opts.help) {
    stdout(`${USAGE}\n`);
    return EXIT.OK;
  }

  const plan = generatePlan({ seed: opts.seed, count: opts.count });
  const expected = computeExpected(plan);
  const base = { url: opts.url, seed: opts.seed, count: opts.count, planned: plan.length };

  let run;
  let mismatches = null;
  try {
    run = await runPlan(plan, { baseUrl: opts.url, fetchImpl });
    if (opts.verify) mismatches = await verifyDashboards(expected, { baseUrl: opts.url, fetchImpl });
  } catch (err) {
    if (!(err instanceof ServerUnreachableError)) throw err;
    if (opts.json) {
      stdout(`${JSON.stringify({ ok: false, ...base, error: 'unreachable', message: err.message,
        progress: err.progress ?? run ?? null, exitCode: EXIT.UNREACHABLE })}\n`);
    } else {
      stderr(`Error: ${err.message}\nIs the server running? Start it with: npm start\n`);
      const progress = err.progress ?? run;
      if (progress) stderr(`Requests sent before the failure: ${progress.sent}\n`);
    }
    return EXIT.UNREACHABLE;
  }

  const exitCode = mismatches && mismatches.length > 0 ? EXIT.MISMATCH : EXIT.OK;
  if (opts.json) {
    stdout(`${JSON.stringify({
      ok: exitCode === EXIT.OK, ...base,
      sent: run.sent, byStatus: run.byStatus, unexpected: run.unexpected,
      expected,
      verify: mismatches ? { ok: mismatches.length === 0, mismatches } : null,
      note: VERIFY_NOTE, exitCode,
    })}\n`);
  } else {
    stdout(`${textReport({ opts, plan, run, expected, mismatches })}\n`);
  }
  return exitCode;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
