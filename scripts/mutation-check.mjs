#!/usr/bin/env node
// Mutation check (NC-6): deliberately break a business rule, run the full test suite, confirm it goes red,
// then restore the original source. Proves the tests actually guard the rules, not just pass.
//
// Usage: node scripts/mutation-check.mjs            (run from the repo root, with a clean git tree for src/)
// Every mutated file is restored in a finally block, and the script verifies the restore byte-for-byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MUTATIONS = [
  {
    id: 'M1',
    title: 'Duplicate handling removed (both layers: code pre-check AND DB UNIQUE constraint)',
    rule: 'BR-3 / AC-3: a repeated event_id must not add a second record or repeat rewards',
    expect: 'red',
    edits: [
      { file: 'src/store.js', find: 'if (existing) {', replace: 'if (false && existing) {' },
      { file: 'src/db.js', find: 'event_id           TEXT NOT NULL UNIQUE,', replace: 'event_id           TEXT NOT NULL,' },
    ],
  },
  {
    id: 'M2',
    title: 'Reward rule broken: failed missions also pay cash and reputation',
    rule: 'BR-2 / AC-2: a failed mission is recorded but awards nothing',
    expect: 'red',
    edits: [
      { file: 'src/rules.js', find: "if (result === 'completed') {", replace: "if (result === 'completed' || result === 'failed') {" },
    ],
  },
  {
    id: 'M4',
    title: "Reviewer's race mutation (review R3): no transaction AND no UNIQUE constraint (code pre-check kept)",
    rule: 'BR-3 under a real two-process race: the same event_id must still be accepted only once',
    expect: 'red',
    edits: [
      { file: 'src/store.js', find: "      db.exec('BEGIN IMMEDIATE');", replace: '      /* MUTATION: no transaction */' },
      { file: 'src/store.js', find: "        db.exec('ROLLBACK'); // nothing was written", replace: '        /* MUTATION: no rollback */' },
      { file: 'src/store.js', find: "      db.exec('COMMIT');", replace: '      /* MUTATION: no commit */' },
      { file: 'src/db.js', find: 'event_id           TEXT NOT NULL UNIQUE,', replace: 'event_id           TEXT NOT NULL,' },
    ],
  },
  {
    id: 'M3',
    title: 'Control: only the code-level duplicate pre-check removed (DB UNIQUE constraint kept)',
    rule: 'Defense in depth: the UNIQUE(event_id) + errcode 2067 safety net alone must still stop double counting',
    expect: 'green',
    edits: [
      { file: 'src/store.js', find: 'if (existing) {', replace: 'if (false && existing) {' },
    ],
  },
];

function runTests() {
  const r = spawnSync('npm', ['test'], { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (label) => Number((out.match(new RegExp(`ℹ ${label} (\\d+)`)) || [])[1] ?? NaN);
  const failing = [...out.matchAll(/^\s*✖ (.+?)(?: \(\d[\d.]*m?s\))?$/gm)]
    .map((m) => m[1].trim())
    .filter((name, i, all) => all.indexOf(name) === i && !/^failing tests:?$/i.test(name));
  return { exitCode: r.status, tests: num('tests'), pass: num('pass'), fail: num('fail'), failing };
}

const results = [];
for (const m of MUTATIONS) {
  const originals = new Map();
  let outcome;
  try {
    for (const e of m.edits) {
      const src = readFileSync(e.file, 'utf8'); // current text (may already carry an earlier edit of this mutation)
      if (!originals.has(e.file)) originals.set(e.file, src);
      const count = src.split(e.find).length - 1;
      if (count !== 1) throw new Error(`${m.id}: expected exactly 1 match of ${JSON.stringify(e.find)} in ${e.file}, found ${count}`);
      writeFileSync(e.file, src.replace(e.find, e.replace));
    }
    outcome = runTests();
  } finally {
    for (const [file, text] of originals) writeFileSync(file, text);
    for (const [file, text] of originals) {
      if (readFileSync(file, 'utf8') !== text) throw new Error(`RESTORE FAILED for ${file}`);
    }
  }
  const actual = outcome.fail > 0 ? 'red' : 'green';
  results.push({ ...m, ...outcome, actual, ok: actual === m.expect });
}

const baseline = runTests();

const lines = [];
lines.push(`Mutation check: ${new Date().toISOString()} · node ${process.version}`);
lines.push('');
for (const r of results) {
  lines.push(`${r.id}  ${r.title}`);
  lines.push(`    rule:     ${r.rule}`);
  for (const e of r.edits) lines.push(`    mutation: ${e.file}: ${e.find}  →  ${e.replace}`);
  lines.push(`    result:   tests ${r.tests}, pass ${r.pass}, fail ${r.fail}, npm exit ${r.exitCode}`);
  lines.push(`    expected: ${r.expect.toUpperCase()} · actual: ${r.actual.toUpperCase()} · ${r.ok ? 'OK' : 'UNEXPECTED'}`);
  if (r.failing.length) {
    lines.push('    failing tests:');
    for (const name of r.failing) lines.push(`      ✖ ${name}`);
  }
  lines.push('');
}
lines.push(`Restored source, baseline re-run: tests ${baseline.tests}, pass ${baseline.pass}, fail ${baseline.fail}, npm exit ${baseline.exitCode}`);
const allOk = results.every((r) => r.ok) && baseline.fail === 0;
lines.push(allOk ? 'MUTATION CHECK PASSED: every mutation behaved as expected and the restored suite is green.'
  : 'MUTATION CHECK FAILED: see UNEXPECTED above.');
console.log(lines.join('\n'));
process.exitCode = allOk ? 0 : 1;
