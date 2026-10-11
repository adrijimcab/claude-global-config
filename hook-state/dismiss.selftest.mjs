#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/dismiss.mjs`: the CLI and functions that record a dismissal or a
 * false-positive report for a block, and the question "is block B lifted?". Every case writes under a temp
 * `HOOK_STATE_DIR`; the real home is never written.
 *
 * THE STATE SPACE: a dismissal / a false-positive report / both in either order / a dismissal repeated /
 * a report repeated; each required option absent, empty, blank, or followed by another option instead of a
 * value; an unknown option, a stray positional, a mechanism name that climbs out; a journal that is absent,
 * holds a torn line or a non-object line; another block and another mechanism with the same journal; a state
 * directory that cannot be created; and the real process (exit code and the two output streams).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `dismiss.mjs`: el CLI y las funciones que registran un descarte o un
 * informe de falso positivo de un bloqueo, y la pregunta «¿está levantado el bloqueo B?». Todo se escribe
 * bajo un `HOOK_STATE_DIR` temporal; el home real no se escribe nunca. Espacio de estados: descarte / informe
 * / ambos en cualquier orden / descarte repetido / informe repetido; cada opción obligatoria ausente, vacía,
 * en blanco o seguida de otra opción; una opción desconocida, un posicional suelto, un nombre de mecanismo
 * que sale de su carpeta; un journal ausente, con una línea cortada o no objeto; otro bloqueo y otro
 * mecanismo; un directorio de estado que no se puede crear; y el proceso real (código de salida y flujos).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { digestInput, journalPath } from './journal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const saved = { HOOK_STATE_DIR: process.env.HOOK_STATE_DIR, HOOK_CLAUDE_HOME: process.env.HOOK_CLAUDE_HOME };
const scratch = mkdtempSync(path.join(tmpdir(), 'dismiss-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
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

const records = (mechanism) => (existsSync(journalPath(mechanism)) ? readFileSync(journalPath(mechanism), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)) : []);
const everyLineBilingual = (lines) => lines.length > 0 && lines.every((line) => / @es /.test(line));

let loaded;

try {
  loaded = await import('./dismiss.mjs');
} catch (error) {
  failures.push(`the module does not load — ${error.message}`);
}

if (loaded !== undefined) {
  const { isLifted: rawIsLifted, main, recordOutcome } = loaded;
  const { bilingual } = await import('./message-table.mjs');

  /** The value of `action`, or the text of what it threw, so a broken decision fails a check instead of crashing. @es El valor de `action`, o el texto de lo que lanzó, para que una decisión rota falle un check en vez de caer. */
  const safe = (action) => {
    try {
      return action();
    } catch (error) {
      return `threw: ${error.message}`;
    }
  };
  const isLifted = (mechanism, blockId) => safe(() => rawIsLifted(mechanism, blockId));
  const CLOCK = Date.UTC(2026, 9, 4, 12, 0, 0);

  /** Runs the CLI function and returns its exit code and what it printed. @es Corre el CLI y devuelve su código y lo impreso. */
  const run = (argv) => {
    const out = [];
    const err = [];
    const code = safe(() => main(argv, { sink: { log: (text) => out.push(text), error: (text) => err.push(text) }, now: CLOCK }));

    return { code, out, err };
  };
  const STARTS = { 'missing-argument': /^Option /, 'unknown-option': /^Unknown option /, 'bad-mechanism': /^A mechanism name / };
  const refusal = (argv, mechanism, id) => {
    const { code, out, err } = run(argv);

    return { code, out, bilingual: everyLineBilingual(err), says: STARTS[id].test(err[0] ?? ''), written: records(mechanism).length };
  };

  // --- a dismissal lifts its block, once ---
  const first = run(['--mechanism', 'guard-a', '--block', 'B', '--reason', 'the rule was wrong here']);
  check('a dismissal exits 0', first.code, 0);
  check('a dismissal prints one bilingual line through the table, nothing on the error stream', [first.out, first.err], [[bilingual('dismissed', { blockId: 'B', mechanism: 'guard-a' })], []]);
  check('a dismissal appends exactly one record', records('guard-a').length, 1);
  const [dismissal = {}] = records('guard-a');
  check('the record is a dismissal of block B with the reason, the clock, no tool use and the digest of the block id', [dismissal.v, dismissal.kind, dismissal.blockId, dismissal.reason, dismissal.ts, dismissal.toolUseId, dismissal.inputDigest], [2, 'dismissal', 'B', 'the rule was wrong here', new Date(CLOCK).toISOString(), null, digestInput('B')]);
  check('block B reads lifted after the dismissal', isLifted('guard-a', 'B'), true);
  check('another block of the same mechanism is not lifted', isLifted('guard-a', 'C'), false);
  check('the same block id of another mechanism is not lifted', isLifted('guard-b', 'B'), false);
  check('a block of a mechanism with no journal is not lifted', isLifted('guard-none', 'B'), false);

  // --- a second dismissal of the same block is refused and recorded once ---
  const again = run(['--mechanism', 'guard-a', '--block', 'B', '--reason', 'second try']);
  check('a second dismissal of the same block exits 2', again.code, 2);
  check('a second dismissal is refused bilingual through the table, nothing on the output stream', [again.err, again.out], [[bilingual('already-dismissed', { blockId: 'B', mechanism: 'guard-a' })], []]);
  check('a second dismissal is recorded once, the first stays as it was', records('guard-a'), [dismissal]);
  check('a dismissal of another block of the same mechanism is recorded', [run(['--mechanism', 'guard-a', '--block', 'C', '--reason', 'r']).code, records('guard-a').length], [0, 2]);
  check('a dismissal of the same block id in another mechanism is recorded', [run(['--mechanism', 'guard-b', '--block', 'B', '--reason', 'r']).code, records('guard-b').length], [0, 1]);

  // --- a false-positive report never lifts ---
  const report = run(['--mechanism', 'guard-c', '--block', 'F', '--reason', 'it blocked a harmless call', '--false-positive']);
  check('a false-positive report exits 0', report.code, 0);
  check('a false-positive report prints its own bilingual line saying the block stays', [report.out, report.err], [[bilingual('false-positive-recorded', { blockId: 'F', mechanism: 'guard-c' })], []]);
  check('a false-positive report appends exactly one record of its own kind', records('guard-c').map((record) => [record.kind, record.blockId, record.reason]), [['false-positive-report', 'F', 'it blocked a harmless call']]);
  check('a false-positive report leaves the block in force', isLifted('guard-c', 'F'), false);
  check('the flag can come before the options', [run(['--false-positive', '--mechanism', 'guard-c', '--block', 'G', '--reason', 'r']).code, records('guard-c').length, isLifted('guard-c', 'G')], [0, 2, false]);
  check('a false-positive report can be repeated for the same block, each recorded', [run(['--mechanism', 'guard-c', '--block', 'F', '--reason', 'again', '--false-positive']).code, records('guard-c').length], [0, 3]);
  check('a dismissal after a report lifts the block', [run(['--mechanism', 'guard-c', '--block', 'F', '--reason', 'confirmed']).code, isLifted('guard-c', 'F')], [0, true]);
  check('a report after a dismissal keeps the block lifted and is recorded', [run(['--mechanism', 'guard-c', '--block', 'F', '--reason', 'late', '--false-positive']).code, isLifted('guard-c', 'F'), records('guard-c').length], [0, true, 5]);

  // --- the function, not only the CLI ---
  const direct = safe(() => recordOutcome('guard-d', { blockId: 'D', reason: 'direct', falsePositive: false }, { now: CLOCK }));
  check('recordOutcome returns the record it appended', [direct.kind, direct.blockId, records('guard-d').length], ['dismissal', 'D', 1]);
  check('recordOutcome refuses a second dismissal with its bilingual error', (() => {
    try {
      recordOutcome('guard-d', { blockId: 'D', reason: 'again', falsePositive: false }, { now: CLOCK });
    } catch (error) {
      return [error.message === bilingual('already-dismissed', { blockId: 'D', mechanism: 'guard-d' }), records('guard-d').length];
    }

    return 'did not throw';
  })(), [true, 1]);

  // --- the journal as it really is ---
  mkdirSync(path.dirname(journalPath('guard-e')), { recursive: true });
  const real = JSON.stringify({ v: 2, kind: 'dismissal', blockId: 'E', reason: 'r', inputDigest: 'x' });
  writeFileSync(journalPath('guard-e'), `null\n7\n"text"\n{"v":2,"kind":"dismissal","blockId":"E"\n${JSON.stringify({ kind: 'decision', blockId: 'E' })}\n${JSON.stringify({ kind: 'false-positive-report', blockId: 'E' })}\n`);
  check('garbage, a torn line, a decision and a report do not lift a block', isLifted('guard-e', 'E'), false);
  writeFileSync(journalPath('guard-e'), `null\n{"v":2,"kind":"dismissal","blockId":"E"\n${real}\n`);
  check('a real dismissal among garbage lifts its block', isLifted('guard-e', 'E'), true);
  check('a dismissal of another block does not lift this one', isLifted('guard-e', 'e'), false);

  mkdirSync(journalPath('guard-f'), { recursive: true });
  check('a journal that cannot be read for a reason other than absence is not read as empty', /EISDIR/.test(String(isLifted('guard-f', 'F'))), true);

  // --- refusals: exit 2, bilingual, nothing written ---
  const good = ['--mechanism', 'guard-r', '--block', 'R', '--reason', 'why'];
  const refused = (name, argv, id = 'missing-argument') => check(name, refusal(argv, 'guard-r', id), { code: 2, out: [], bilingual: true, says: true, written: 0 });
  refused('a missing mechanism is refused', ['--block', 'R', '--reason', 'why']);
  refused('a missing block is refused', ['--mechanism', 'guard-r', '--reason', 'why']);
  refused('a missing reason is refused', ['--mechanism', 'guard-r', '--block', 'R']);
  refused('no options at all are refused', []);
  refused('an empty mechanism is refused', ['--mechanism', '', '--block', 'R', '--reason', 'why']);
  refused('an empty block is refused', ['--mechanism', 'guard-r', '--block', '', '--reason', 'why']);
  refused('an empty reason is refused', ['--mechanism', 'guard-r', '--block', 'R', '--reason', '']);
  refused('a blank reason is refused', ['--mechanism', 'guard-r', '--block', 'R', '--reason', '   ']);
  refused('an option with no value at the end is refused', ['--mechanism', 'guard-r', '--block', 'R', '--reason']);
  refused('an option followed by another option instead of its value is refused', ['--mechanism', 'guard-r', '--reason', '--block', 'R']);
  refused('a missing reason is refused even with the false-positive flag', ['--mechanism', 'guard-r', '--block', 'R', '--false-positive']);
  refused('an unknown option is refused', [...good, '--nope'], 'unknown-option');
  refused('an unknown option is refused even when everything else is missing', ['--nope'], 'unknown-option');
  refused('a stray positional argument is refused', [...good, 'stray'], 'unknown-option');
  refused('the equals form of an option is refused as unknown', ['--mechanism=guard-r', '--block', 'R', '--reason', 'why'], 'unknown-option');
  refused('a mechanism name that climbs out of its folder is refused', ['--mechanism', '../x', '--block', 'R', '--reason', 'why'], 'bad-mechanism');
  check('the unknown-option refusal names the offending token', run(['--nope']).err[0], bilingual('unknown-option', { option: '--nope' }));
  check('the missing-argument refusal names the option', run(['--block', 'R', '--reason', 'why']).err[0], bilingual('missing-argument', { option: '--mechanism' }));
  check('the first missing option is the one named, in the order mechanism, block, reason', [run([]).err[0], run(['--mechanism', 'm']).err[0], run(['--mechanism', 'm', '--block', 'b']).err[0]], [bilingual('missing-argument', { option: '--mechanism' }), bilingual('missing-argument', { option: '--block' }), bilingual('missing-argument', { option: '--reason' })]);
  check('a refused mechanism name creates no state directory', existsSync(path.join(scratch, 'x')) || existsSync(path.join(stateRoot, '..', 'x')), false);

  // --- the real process ---
  const cli = (argv, env = {}) => spawnSync(process.execPath, [path.join(HERE, 'dismiss.mjs'), ...argv], { encoding: 'utf8', env: { ...process.env, ...env } });
  const ok = cli(['--mechanism', 'guard-p', '--block', 'P', '--reason', 'via the process']);
  check('the process exits 0 and prints the bilingual line on stdout only', [ok.status, ok.stdout.trim(), ok.stderr], [0, bilingual('dismissed', { blockId: 'P', mechanism: 'guard-p' }), '']);
  check('the process wrote the dismissal under HOOK_STATE_DIR', [isLifted('guard-p', 'P'), existsSync(path.join(stateRoot, 'guard-p', 'journal.jsonl'))], [true, true]);
  const bad = cli(['--mechanism', 'guard-p']);
  check('the process exits 2 on a refusal and prints it on stderr only', [bad.status, bad.stdout, bad.stderr.trim()], [2, '', bilingual('missing-argument', { option: '--block' })]);
  const dup = cli(['--mechanism', 'guard-p', '--block', 'P', '--reason', 'again']);
  check('the process exits 2 on a second dismissal', [dup.status, records('guard-p').length], [2, 1]);
  const blocker = path.join(scratch, 'a-file');
  writeFileSync(blocker, 'x');
  const broken = cli(['--mechanism', 'guard-q', '--block', 'Q', '--reason', 'r'], { HOOK_STATE_DIR: blocker });
  check('a state directory that cannot be created exits 1 with a bilingual message, not a stack trace', [broken.status, broken.stdout, /^The entry could not be recorded: .+\. @es No se pudo registrar la entrada: .+\.$/.test(broken.stderr.trim()), broken.stderr.includes('    at ')], [1, '', true, false]);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(HERE, 'dismiss.mjs')).href)}); console.log('imported');`], { encoding: 'utf8', env: process.env });
  check('importing the module runs no command and prints nothing of its own', [imported.status, imported.stdout.trim(), imported.stderr], [0, 'imported', '']);

  // --- nothing leaked into the real locations ---
  check('nothing was written under the fallback Claude home', existsSync(claudeRoot), false);
}

for (const [key, value] of Object.entries(saved)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
