#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `guard-precision/report.mjs` (and `blocks.mjs`, which it reads through): the
 * per-guard false-block rate report. Every case builds its journals under a temp `HOOK_STATE_DIR` with the
 * real v2 writer; the real home is never touched.
 *
 * THE STATE SPACE: a guard with enough SAMPLED labels and mixed labels / 9 sampled / exactly 10 sampled / 10
 * blocks and none labelled (the case the old precision formula read as 100%) / 10 blocks only dismissed
 * (self-reported: never in the rate) / 0 blocks; a sampled flag that is exactly `true` and one that is not; the
 * three label kinds (`dismissal`, `false-positive-report`, `true-positive-report`) and a block holding
 * several, in either order (the LAST label decides, and decides whether the block counts as sampled); an
 * outcome whose block does not exist (orphan), in the same or another mechanism, of each kind; a block
 * journaled twice; v1 lines in `journal.jsonl`, a torn line, a v2 record of an unknown kind or without a
 * blockId, and legacy `*.jsonl` files beside the journal; a state directory with no journal, a directory that
 * is not a plain mechanism name; the Wilson interval at its edges (0 of n, n of n, no population); the table
 * and `--json` outputs, a bad argument, and the real process.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `report.mjs` (y de `blocks.mjs`, que lee a través de él): el informe de
 * tasa de falsos bloqueos por guard. Cada caso construye sus journals bajo un `HOOK_STATE_DIR` temporal con
 * el escritor v2 real; el home real no se toca. Espacio de estados: un guard con etiquetas de MUESTRA
 * suficientes y etiquetas mixtas / 9 de muestra / exactamente 10 / 10 bloqueos sin ninguno etiquetado (el
 * caso que la antigua fórmula de precisión leía como 100 %) / 10 bloqueos solo descartados (autoinformados:
 * nunca en la tasa) / 0 bloqueos; una marca de muestra que es exactamente `true` y una que no; los tres
 * tipos de etiqueta (`dismissal`, `false-positive-report`, `true-positive-report`) y un bloqueo con varias,
 * en cualquier orden (decide la ÚLTIMA, y decide si el bloqueo cuenta como de muestra); un desenlace de un
 * bloqueo inexistente (huérfano), en el mismo u otro mecanismo, de cada tipo; un bloqueo registrado dos
 * veces; líneas v1 en `journal.jsonl`, una línea cortada, un registro v2 de tipo desconocido o sin blockId y
 * ficheros `*.jsonl` heredados junto al journal; un directorio de estado sin journal, un directorio que no es
 * nombre simple de mecanismo; el intervalo de Wilson en sus bordes (0 de n, n de n, sin población); la tabla
 * y `--json`, un argumento erróneo y el proceso real.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendRecord, digestInput, journalPath } from '../hook-state/journal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const saved = { HOOK_STATE_DIR: process.env.HOOK_STATE_DIR, HOOK_CLAUDE_HOME: process.env.HOOK_CLAUDE_HOME };
const scratch = mkdtempSync(path.join(tmpdir(), 'false-block-rate-selftest-'));
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
const outcome = (mechanism, kind, blockId, sampled = false) => appendRecord(mechanism, { kind, blockId, inputDigest: digestInput(blockId), reason: 'r', ...(sampled ? { sampled: true, seed: 'S' } : {}) });
const drawn = (mechanism, kind, blockId) => outcome(mechanism, kind, blockId, true);
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
  const { MIN_LABELLED, buildReport, main, wilsonInterval } = loaded;
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
  const round = (value) => (typeof value === 'number' ? Math.round(value * 10_000) / 10_000 : value);
  const guards = () => Object.fromEntries((safe(() => buildReport()).guards ?? []).map((guard) => [guard.mechanism, guard]));
  const shape = (guard = {}) => [guard.blocks, guard.labelled, guard.falseBlocks, guard.correctBlocks, guard.falseBlockRate, guard.selfReportedFalse, guard.selfReportedCorrect, guard.orphaned, guard.unclassified, guard.status];
  const bounds = (guard = {}) => (guard.interval === null || guard.interval === undefined ? guard.interval : [round(guard.interval.low), round(guard.interval.high)]);

  // --- the Wilson interval, pinned to published values and to its edges ---
  const wilson = (falseCount, total) => {
    const interval = safe(() => wilsonInterval(falseCount, total));

    return interval === null || interval.threw ? interval : [round(interval.low), round(interval.high)];
  };
  check('Wilson 3 of 10', wilson(3, 10), [0.1078, 0.6032]);
  check('Wilson 2 of 10', wilson(2, 10), [0.0567, 0.5098]);
  check('Wilson 1 of 100', wilson(1, 100), [0.0018, 0.0545]);
  check('Wilson 5 of 10 is symmetric around one half', wilson(5, 10), [0.2366, 0.7634]);
  check('Wilson 0 of 10 starts at exactly 0, not below', safe(() => wilsonInterval(0, 10)).low, 0);
  check('Wilson 0 of 10 ends at 0.2775', wilson(0, 10)[1], 0.2775);
  check('Wilson 5 of 5 ends at exactly 1, not above', safe(() => wilsonInterval(5, 5)).high, 1);
  check('Wilson 10 of 10 starts at 0.7225', wilson(10, 10)[0], 0.7225);
  check('Wilson of an empty population has no interval', safe(() => wilsonInterval(0, 0)), null);
  check('the minimum of labelled blocks is 10', MIN_LABELLED, 10);

  // --- the block of a decision keeps its FIRST record as evidence ---
  const { classifyBlocks } = await import('./blocks.mjs');
  const classified = classifyBlocks([
    { kind: 'decision', blockId: 'X', id: 'first' },
    { kind: 'decision', blockId: 'X', id: 'second' },
    { kind: 'decision', blockId: 'Y', id: 'only' }
  ]);
  check('a block journaled twice keeps its first decision as the evidence', [[...classified.decisions.keys()], classified.decisions.get('X')?.id, classified.labels.size, classified.orphaned], [['X', 'Y'], 'first', 0, []]);
  const marked = classifyBlocks([
    { kind: 'decision', blockId: 'X' },
    { kind: 'dismissal', blockId: 'X' },
    { kind: 'true-positive-report', blockId: 'X', sampled: true, seed: 'S' },
    { kind: 'decision', blockId: 'Y' },
    { kind: 'false-positive-report', blockId: 'Y', sampled: 'true' }
  ]);
  check('a label is its value and whether the sample drew it, the last one deciding', [...marked.labels], [['X', { label: 'correct', sampled: true }], ['Y', { label: 'false', sampled: false }]]);

  // --- the figure: 20 blocks; 10 labelled BY THE SAMPLE (2 false, 8 correct); and blocks nobody sampled that
  // people reported on their own: 2 dismissals + 1 report (false), 1 confirmation (correct) ---
  decideMany('guard-a', 20);
  drawn('guard-a', 'false-positive-report', 'B3');
  drawn('guard-a', 'false-positive-report', 'B4');
  for (let index = 5; index <= 12; index += 1) drawn('guard-a', 'true-positive-report', `B${index}`);
  outcome('guard-a', 'dismissal', 'B1');
  outcome('guard-a', 'dismissal', 'B2');
  outcome('guard-a', 'false-positive-report', 'B13');
  outcome('guard-a', 'true-positive-report', 'B14');

  // --- the thresholds: 9 sampled labels, exactly 10, 0 blocks ---
  decideMany('guard-b', 9);
  drawn('guard-b', 'false-positive-report', 'B1');
  for (let index = 2; index <= 9; index += 1) drawn('guard-b', 'true-positive-report', `B${index}`);
  decideMany('guard-d', 10);
  for (let index = 1; index <= 10; index += 1) drawn('guard-d', 'true-positive-report', `B${index}`);
  mkdirSync(path.dirname(journalPath('guard-c')), { recursive: true });
  legacy('guard-c', 'refusals.jsonl', '{"ts":"x"}\n');

  // --- no sampled label, no rate: 10 blocks nobody labelled, and 10 blocks only dismissed (self-reported) ---
  outcome('guard-d', 'dismissal', 'ZZ');
  decideMany('guard-g', 10);
  outcome('guard-h', 'dismissal', 'B1');
  decideMany('guard-k', 10);
  for (let index = 1; index <= 10; index += 1) outcome('guard-k', 'dismissal', `B${index}`);

  // --- a block with several labels counts once; the LAST label decides, and decides whether it was sampled ---
  decideMany('guard-e', 12);
  decide('guard-e', 'B2');
  outcome('guard-e', 'dismissal', 'B1');
  drawn('guard-e', 'false-positive-report', 'B1');
  drawn('guard-e', 'false-positive-report', 'B1');
  drawn('guard-e', 'false-positive-report', 'B2');
  outcome('guard-e', 'dismissal', 'B2');
  for (let index = 3; index <= 12; index += 1) drawn('guard-e', 'true-positive-report', `B${index}`);
  decideMany('guard-j', 11);
  outcome('guard-j', 'dismissal', 'B1');
  drawn('guard-j', 'true-positive-report', 'B1');
  drawn('guard-j', 'false-positive-report', 'B2');
  drawn('guard-j', 'true-positive-report', 'B2');
  drawn('guard-j', 'true-positive-report', 'B3');
  outcome('guard-j', 'dismissal', 'B3');
  for (let index = 4; index <= 11; index += 1) drawn('guard-j', 'true-positive-report', `B${index}`);

  // --- only a sampled flag that is exactly `true` makes a label a sampled one ---
  decideMany('guard-m', 10);
  writeFileSync(journalPath('guard-m'), `${readJournal('guard-m')}${Array.from({ length: 10 }, (_, index) => JSON.stringify({ v: 2, kind: 'true-positive-report', blockId: `B${index + 1}`, inputDigest: 'x', sampled: index % 2 === 0 ? 'true' : 1 })).join('\n')}\n`);

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

  // --- orphans are listed sorted, each once, whatever their kind and whether sampled or not ---
  outcome('guard-i', 'dismissal', 'Y');
  outcome('guard-i', 'false-positive-report', 'Y');
  drawn('guard-i', 'false-positive-report', 'X');
  outcome('guard-i', 'true-positive-report', 'W');

  const report = new Proxy(guards(), { get: (target, key) => target[key] ?? {} });
  check('20 blocks, 10 sampled labels (2 false, 8 correct): the rate is 2 of 10; the dismissals, the report and the confirmation nobody sampled are not in it', shape(report['guard-a']), [20, 10, 2, 8, 0.2, 3, 1, [], 0, 'ok']);
  check('the interval of that rate is the Wilson interval of 2 of 10', bounds(report['guard-a']), [0.0567, 0.5098]);
  check('9 sampled labels read insufficient, with no rate and no interval', [shape(report['guard-b']), report['guard-b'].interval], [[9, 9, 1, 8, null, 0, 0, [], 0, 'insufficient'], null]);
  check('exactly 10 sampled labels is enough for a rate', [report['guard-d'].labelled, report['guard-d'].status, report['guard-d'].falseBlockRate, bounds(report['guard-d'])], [10, 'ok', 0, [0, 0.2775]]);
  check('0 blocks read insufficient, never a rate', shape(report['guard-c']), [0, 0, 0, 0, null, 0, 0, [], 1, 'insufficient']);
  check('10 blocks and none labelled read insufficient: an unlabelled population is never 0% or 100%', [shape(report['guard-g']), report['guard-g'].interval], [[10, 0, 0, 0, null, 0, 0, [], 0, 'insufficient'], null]);
  check('10 blocks all dismissed are 10 self-reported false blocks and still no rate: nobody sampled them', [shape(report['guard-k']), report['guard-k'].interval], [[10, 0, 0, 0, null, 10, 0, [], 0, 'insufficient'], null]);
  check('a sampled flag that is not exactly true makes a label a self-reported one', shape(report['guard-m']), [10, 0, 0, 0, null, 0, 10, [], 0, 'insufficient']);
  check('an orphan dismissal is listed and not counted', [report['guard-d'].orphaned, report['guard-d'].falseBlocks, report['guard-d'].selfReportedFalse, report['guard-d'].labelled], [['ZZ'], 0, 0, 10]);
  check('an outcome without any block reads insufficient and lists the orphan', shape(report['guard-h']), [0, 0, 0, 0, null, 0, 0, ['B1'], 0, 'insufficient']);
  check('an outcome in another mechanism does not join the block of this one', [report['guard-g'].falseBlocks, report['guard-g'].selfReportedFalse, report['guard-g'].orphaned], [0, 0, []]);
  check('several labels of one block, a repeated label and a repeated block count once; a sampled false then a dismissal is self-reported', shape(report['guard-e']), [12, 11, 1, 10, 1 / 11, 1, 0, [], 0, 'ok']);
  check('the LAST label of a block decides, and whether it was sampled: dismissed then confirmed by the sample is a sampled correct, confirmed by the sample then dismissed is self-reported', shape(report['guard-j']), [11, 10, 0, 10, 0, 1, 0, [], 0, 'ok']);
  check('v1 lines, a torn line, a null, an unknown kind, a missing, numeric or empty blockId, a v2 record in a legacy file and legacy files are unclassified, blank lines and non-jsonl files are not', [report['guard-f'].blocks, report['guard-f'].unclassified, Object.entries(report['guard-f'].unclassifiedFiles ?? {}).sort()], [11, 13, [['extra.jsonl', 1], ['journal.jsonl', 9], ['refusals.jsonl', 3]]]);
  check('orphans are listed sorted and once each, from every label kind', shape(report['guard-i']), [0, 0, 0, 0, null, 0, 0, ['W', 'X', 'Y'], 0, 'insufficient']);
  check('the report is sorted by mechanism and omits directories with no journal file', Object.keys(report), ['guard-a', 'guard-b', 'guard-c', 'guard-d', 'guard-e', 'guard-f', 'guard-g', 'guard-h', 'guard-i', 'guard-j', 'guard-k', 'guard-m']);
  check('the report counts every unclassified line once', safe(() => buildReport()).unclassifiedTotal, 14);
  check('no figure is called precision', JSON.stringify(safe(() => buildReport())).includes('recision'), false);
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
  const rowOf = (mechanism) => table.out.find((row) => row.startsWith(`${mechanism}: `)) ?? '';
  check('the table says 20.0% and its interval for the 20-block guard, with the self-reported false blocks apart, in both languages', /^guard-a: 20 blocks, 10 labelled by sample, 2 false, false-block rate 20\.0% \(95% interval 5\.7% to 51\.0%\), 3 self-reported false blocks \(not in the rate\), 0 unclassified lines\. @es guard-a: 20 bloqueos, 10 etiquetados por muestra, 2 falsos, tasa de falsos bloqueos 20\.0 % \(intervalo del 95 % de 5\.7 % a 51\.0 %\), 3 falsos bloqueos autoinformados \(fuera de la tasa\), 0 líneas sin clasificar\.$/.test(rowOf('guard-a')), true);
  check('the table says insufficient and the minimum for 9 sampled labels', /^guard-b: 9 blocks, 9 labelled by sample, 1 false, insufficient \(fewer than 10 blocks labelled by sample; draw one with label\.mjs\), 0 self-reported false blocks \(not in the rate\), 0 unclassified lines\./.test(rowOf('guard-b')), true);
  check('an insufficient row never prints a percent, in either language', ['guard-b', 'guard-c', 'guard-g', 'guard-h', 'guard-i', 'guard-k', 'guard-m'].map((mechanism) => rowOf(mechanism).includes('%')), [false, false, false, false, false, false, false]);
  check('the table says 0 blocks and insufficient for a guard with no blocks', /^guard-c: 0 blocks, 0 labelled by sample, 0 false, insufficient \(fewer than 10 blocks labelled by sample; draw one with label\.mjs\), 0 self-reported false blocks \(not in the rate\), 1 unclassified lines\./.test(rowOf('guard-c')), true);
  check('the table says 10 self-reported false blocks and no rate for a guard that was only dismissed', /^guard-k: 10 blocks, 0 labelled by sample, 0 false, insufficient .*, 10 self-reported false blocks \(not in the rate\), 0 unclassified lines\./.test(rowOf('guard-k')), true);
  check('the table says 10 blocks and 0 labelled for a guard nobody labelled', /^guard-g: 10 blocks, 0 labelled by sample, 0 false, insufficient/.test(rowOf('guard-g')), true);
  check('the table lists the orphan block ids of a guard, and only of guards that have some', [/guard-d: .*not counted: ZZ\./.test(text), /guard-i: .*not counted: W, X, Y\./.test(text), text.split('\n').filter((row) => row.includes('does not exist, not counted')).length], [true, true, 3]);
  check('the table counts the unclassified lines of a guard and in total', [/guard-f: 11 blocks.*, 13 unclassified lines\./.test(text), /^14 lines of the guard journals could not be classified/m.test(text), text.includes('No guard journal was found')], [true, true, false]);
  check('the table never says precision', /recision|precisión/.test(text), false);
  const bad = run(['--nope']);
  check('an unknown argument exits 2 with a bilingual line on the error stream', [bad.code, bad.out, bad.err.length, bad.err.every((line) => line.includes(' @es ')), (bad.err[0] ?? '').includes('"--nope"')], [2, [], 1, true, true]);

  // --- the real process ---
  const spawned = spawnSync(process.execPath, [path.join(HERE, 'report.mjs'), '--json'], { encoding: 'utf8', env: process.env });
  check('the process exits 0 and prints the JSON report', [spawned.status, parseJson(spawned.stdout)?.guards?.length], [0, 12]);
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
