#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `guard-precision/report.mjs`: the per-guard precision report. Every case builds
 * its journals under a temp `HOOK_STATE_DIR` with the real v2 writer; the real home is never touched.
 *
 * THE STATE SPACE: a guard with enough blocks and mixed outcomes / 9 blocks / exactly 10 blocks / 0 blocks;
 * a dismissal or report whose block does not exist (orphan), in the same or another mechanism; two outcomes
 * (or a repeated one) for one block; a block journaled twice; v1 lines in `journal.jsonl`, a torn line, a v2
 * record of an unknown kind or without a blockId, and legacy `*.jsonl` files beside the journal; a state
 * directory with no journal, a directory that is not a plain mechanism name; the table and `--json` outputs,
 * a bad argument, and the real process.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `report.mjs`, el informe de precisión por guard. Cada caso construye sus
 * journals bajo un `HOOK_STATE_DIR` temporal con el escritor v2 real; el home real no se toca. Espacio de
 * estados: un guard con bloqueos suficientes y desenlaces mixtos / 9 bloqueos / exactamente 10 / 0; un
 * descarte o informe de un bloqueo inexistente (huérfano), en el mismo u otro mecanismo; dos desenlaces (o
 * uno repetido) de un bloqueo; un bloqueo registrado dos veces; líneas v1 en `journal.jsonl`, una línea
 * cortada, un registro v2 de tipo desconocido o sin blockId y ficheros `*.jsonl` heredados junto al journal;
 * un directorio de estado sin journal, un directorio que no es nombre simple de mecanismo; la tabla y
 * `--json`, un argumento erróneo y el proceso real.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendRecord, digestInput, journalPath } from '../hook-state/journal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const saved = { HOOK_STATE_DIR: process.env.HOOK_STATE_DIR, HOOK_CLAUDE_HOME: process.env.HOOK_CLAUDE_HOME };
const scratch = mkdtempSync(path.join(tmpdir(), 'precision-selftest-'));
const stateRoot = path.join(scratch, 'state');
const claudeRoot = path.join(scratch, 'claude');
process.env.HOOK_STATE_DIR = stateRoot;
process.env.HOOK_CLAUDE_HOME = claudeRoot;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const decide = (mechanism, blockId) => appendRecord(mechanism, { kind: 'decision', blockId, inputDigest: digestInput(blockId) });
const outcome = (mechanism, kind, blockId) => appendRecord(mechanism, { kind, blockId, inputDigest: digestInput(blockId), reason: 'r' });
const decideMany = (mechanism, count) => Array.from({ length: count }, (_, index) => decide(mechanism, `B${index + 1}`));
const legacy = (mechanism, file, text) => {
  mkdirSync(path.dirname(journalPath(mechanism)), { recursive: true });
  writeFileSync(path.join(path.dirname(journalPath(mechanism)), file), text);
};

let loaded;

try {
  loaded = await import('./report.mjs');
} catch (error) {
  failures.push(`the module does not load — ${error.message}`);
}

if (loaded !== undefined) {
  const { buildReport, main } = loaded;
  const safe = (action) => {
    try {
      return action();
    } catch (error) {
      return { threw: error.message };
    }
  };
  const parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return 'not json';
    }
  };
  const guards = () => Object.fromEntries((safe(() => buildReport()).guards ?? []).map((guard) => [guard.mechanism, guard]));
  const shape = (guard = {}) => [guard.blocks, guard.dismissed, guard.falsePositive, guard.flagged, guard.orphaned, guard.unclassified, guard.precision, guard.status];

  // --- the exact figure: 12 blocks, 2 dismissals, 1 false-positive report ---
  decideMany('guard-a', 12);
  outcome('guard-a', 'dismissal', 'B1');
  outcome('guard-a', 'dismissal', 'B2');
  outcome('guard-a', 'false-positive-report', 'B3');

  // --- the thresholds: 9 blocks, exactly 10, 0 ---
  decideMany('guard-b', 9);
  outcome('guard-b', 'dismissal', 'B1');
  decideMany('guard-d', 10);
  mkdirSync(path.dirname(journalPath('guard-c')), { recursive: true });
  legacy('guard-c', 'refusals.jsonl', '{"ts":"x"}\n');

  // --- an orphan is listed, never counted; the same id in another mechanism does not join ---
  outcome('guard-d', 'dismissal', 'ZZ');
  decideMany('guard-g', 10);
  outcome('guard-h', 'dismissal', 'B1');

  // --- two outcomes for one block count once; a repeated outcome and a repeated block count once ---
  decideMany('guard-e', 10);
  decide('guard-e', 'B2');
  outcome('guard-e', 'dismissal', 'B1');
  outcome('guard-e', 'false-positive-report', 'B1');
  outcome('guard-e', 'false-positive-report', 'B1');
  outcome('guard-e', 'dismissal', 'B2');

  // --- v1 lines, a torn line, an unknown kind, a missing blockId, and legacy files ---
  decideMany('guard-f', 10);
  outcome('guard-f', 'dismissal', 'B1');
  const line = (fields) => JSON.stringify(fields);
  const unclassifiedLines = [
    '{"ts":"2026-09-01","decision":"block"}',
    '{"v":2,"kind":"decision"',
    line({ v: 2, kind: 'mystery', blockId: 'B1' }),
    line({ v: 2, kind: 'decision' }),
    'null',
    line({ kind: 'decision', blockId: 'NOV' }),
    line({ v: 1, kind: 'decision', blockId: 'V1' }),
    line({ v: 2, kind: 'decision', blockId: 7 }),
    line({ v: 2, kind: 'decision', blockId: '' })
  ];
  writeFileSync(journalPath('guard-f'), `${readJournal('guard-f')}${unclassifiedLines.join('\n')}\n\n   \n${line({ v: 2, kind: 'decision', blockId: 'B11', inputDigest: 'x' })}\n`);
  legacy('guard-f', 'refusals.jsonl', '{"a":1}\n{"a":2}\n\n  \n{"a":3}');
  legacy('guard-f', 'extra.jsonl', `${line({ v: 2, kind: 'decision', blockId: 'B50', inputDigest: 'x' })}\n`);
  legacy('guard-f', 'notes.txt', 'not a journal\nat all\n');
  mkdirSync(path.join(stateRoot, 'guard-f', 'dir.jsonl'), { recursive: true });
  mkdirSync(path.join(stateRoot, 'empty-guard'), { recursive: true });
  mkdirSync(path.join(stateRoot, '.hidden'), { recursive: true });
  writeFileSync(path.join(stateRoot, '.hidden', 'journal.jsonl'), '{"a":1}\n');
  writeFileSync(path.join(stateRoot, 'stray-file'), '{"a":1}\n');

  // --- orphans are listed sorted, each once, whether a dismissal or a report ---
  outcome('guard-i', 'dismissal', 'Y');
  outcome('guard-i', 'false-positive-report', 'Y');
  outcome('guard-i', 'false-positive-report', 'X');

  const report = new Proxy(guards(), { get: (target, key) => target[key] ?? {} });
  check('12 blocks, 2 dismissals, 1 false positive: precision is exactly 1 - 3/12', shape(report['guard-a']), [12, 2, 1, 3, [], 0, 0.75, 'ok']);
  check('9 blocks read insufficient data, with no figure', shape(report['guard-b']), [9, 1, 0, 1, [], 0, null, 'insufficient-data']);
  check('exactly 10 blocks is enough for a figure', [report['guard-d'].blocks, report['guard-d'].status, report['guard-d'].precision], [10, 'ok', 1]);
  check('0 blocks read no data, never 100%', shape(report['guard-c']), [0, 0, 0, 0, [], 1, null, 'no-data']);
  check('an orphan dismissal is listed and not counted', [report['guard-d'].orphaned, report['guard-d'].dismissed, report['guard-d'].flagged], [['ZZ'], 0, 0]);
  check('an outcome without any block reads no data and lists the orphan', shape(report['guard-h']), [0, 0, 0, 0, ['B1'], 0, null, 'no-data']);
  check('an outcome in another mechanism does not join the block of this one', [report['guard-g'].dismissed, report['guard-g'].orphaned], [0, []]);
  check('two outcomes for one block, a repeated outcome and a repeated block count once', shape(report['guard-e']), [10, 2, 1, 2, [], 0, 0.8, 'ok']);
  check('v1 lines, a torn line, a null, an unknown kind, a missing, numeric or empty blockId, a v2 record in a legacy file and legacy files are unclassified, blank lines and non-jsonl files are not', [report['guard-f'].blocks, report['guard-f'].unclassified, Object.entries(report['guard-f'].unclassifiedFiles ?? {}).sort()], [11, 13, [['extra.jsonl', 1], ['journal.jsonl', 9], ['refusals.jsonl', 3]]]);
  check('orphans are listed sorted and once each, from dismissals and from reports', shape(report['guard-i']), [0, 0, 0, 0, ['X', 'Y'], 0, null, 'no-data']);
  check('the report is sorted by mechanism and omits directories with no journal file', Object.keys(report), ['guard-a', 'guard-b', 'guard-c', 'guard-d', 'guard-e', 'guard-f', 'guard-g', 'guard-h', 'guard-i']);
  check('the report counts every unclassified line once', safe(() => buildReport()).unclassifiedTotal, 14);
  const reversed = safe(() => buildReport({ readDirectory: (directory, options) => readdirSync(directory, options).reverse() }));
  check('a listing in the opposite order gives the same report', reversed, safe(() => buildReport()));

  // --- the outputs ---
  const run = (argv) => {
    const out = [];
    const err = [];
    const code = safe(() => main(argv, { sink: { log: (text) => out.push(text), error: (text) => err.push(text) } }));

    return { code, out, err };
  };
  const json = run(['--json']);
  check('--json exits 0 and prints one untranslated JSON document, nothing on the error stream', [json.code, json.out.length, json.err, json.out.join('').includes('@es')], [0, 1, [], false]);
  check('--json is the report itself', parseJson(json.out[0]), safe(() => buildReport()));
  const table = run([]);
  check('the table exits 0 and every line is bilingual', [table.code, table.err, table.out.length > 0, table.out.every((line) => line.includes(' @es '))], [0, [], true, true]);
  const text = table.out.join('\n');
  check('the table says 75.0% for the 12-block guard', /guard-a: 12 blocks, 2 dismissed, 1 false positives, precision 75\.0%, 0 unclassified lines\./.test(text), true);
  check('the table says insufficient data and the minimum for 9 blocks', /guard-b: 9 blocks.*insufficient data \(fewer than 10 blocks\)/.test(text), true);
  check('the table says no data for 0 blocks', /guard-c: no data \(0 blocks\), 1 unclassified lines\./.test(text), true);
  check('the table lists the orphan block ids of a guard, and only of guards that have some', [/guard-d: .*not counted: ZZ\./.test(text), /guard-i: .*not counted: X, Y\./.test(text), text.split('\n').filter((row) => row.includes('does not exist, not counted')).length], [true, true, 3]);
  check('the table counts the unclassified lines of a guard and in total', [/guard-f: 11 blocks.*, 13 unclassified lines\./.test(text), /^14 lines of the guard journals could not be classified/m.test(text), text.includes('No guard journal was found')], [true, true, false]);
  const bad = run(['--nope']);
  check('an unknown argument exits 2 with a bilingual line on the error stream', [bad.code, bad.out, bad.err.length, bad.err.every((line) => line.includes(' @es ')), (bad.err[0] ?? '').includes('"--nope"')], [2, [], 1, true, true]);

  // --- the real process ---
  const spawned = spawnSync(process.execPath, [path.join(HERE, 'report.mjs'), '--json'], { encoding: 'utf8', env: process.env });
  check('the process exits 0 and prints the JSON report', [spawned.status, parseJson(spawned.stdout)?.guards?.length], [0, 9]);
  const empty = spawnSync(process.execPath, [path.join(HERE, 'report.mjs')], { encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: path.join(scratch, 'nothing-here') } });
  check('a home with no state at all exits 0 and says so, bilingual', [empty.status, empty.stdout.trim()], [0, 'No guard journal was found. @es No se encontró ningún journal de guards.']);
  const badRun = spawnSync(process.execPath, [path.join(HERE, 'report.mjs'), '--nope'], { encoding: 'utf8', env: process.env });
  check('the process exits 2 on an unknown argument and prints nothing on the output stream', [badRun.status, badRun.stdout], [2, '']);

  // --- no HOOK_STATE_DIR: the guards live in <Claude home>/<name>/state, a directory without one is skipped ---
  const home = path.join(scratch, 'home');
  mkdirSync(path.join(home, 'guard-z', 'state'), { recursive: true });
  mkdirSync(path.join(home, 'no-state-here'), { recursive: true });
  writeFileSync(path.join(home, 'guard-z', 'state', 'journal.jsonl'), `${JSON.stringify({ v: 2, kind: 'decision', blockId: 'Z1', inputDigest: 'x' })}\n`);
  const homed = spawnSync(process.execPath, [path.join(HERE, 'report.mjs'), '--json'], { encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: '', HOOK_CLAUDE_HOME: home } });
  check('without HOOK_STATE_DIR the Claude home is read and a directory without state is skipped', [homed.status, parseJson(homed.stdout)?.guards?.map((guard) => [guard.mechanism, guard.blocks])], [0, [['guard-z', 1]]]);
  const homedTable = spawnSync(process.execPath, [path.join(HERE, 'report.mjs')], { encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: '', HOOK_CLAUDE_HOME: home } });
  check('a table with nothing unclassified prints no total line and no orphan line', [homedTable.stdout.trim().split('\n').length, homedTable.stdout.includes('could not be classified')], [1, false]);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL(`file:///${path.join(HERE, 'report.mjs').replaceAll('\\', '/')}`).href)}); console.log('imported');`], { encoding: 'utf8', env: process.env });
  check('importing the module runs no command and prints nothing of its own', [imported.status, imported.stdout.trim(), imported.stderr], [0, 'imported', '']);
  check('nothing was written under the fallback Claude home', existsSync(claudeRoot), false);
}

function readJournal(mechanism) {
  return existsSync(journalPath(mechanism)) ? readFileSync(journalPath(mechanism), 'utf8') : '';
}

for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
