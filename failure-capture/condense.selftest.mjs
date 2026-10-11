#!/usr/bin/env node
/**
 * Proof of `condense`: it shortens only the ledger lines it can prove it has not lost, under the ledger lock,
 * after storing a pre-image, and a second run changes nothing. Every fixture is CONSTRUCTED in a temporary
 * directory with its own home: the real ledger and evidence are never read, and `condense` never runs on them.
 *
 * @es Prueba de `condense`: acorta solo las líneas del ledger cuya conservación puede probar, bajo el lock del
 * ledger y tras guardar una imagen previa, y una segunda ejecución no cambia nada. Todo fixture se CONSTRUYE en
 * un directorio temporal con su propio home: nunca se lee el ledger ni la evidencia reales ni se corre
 * `condense` sobre ellos.
 */

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runCondense } from './condense.mjs';
import { holdsWholeLine } from './conservation.mjs';
import { appendEvidence } from './evidence.mjs';
import { HEADER } from './ledgers.mjs';
import { FAT_MECHANISM, FAT_NONE, HOOKS_KEY, KEYED, MARKERLESS, PROJECT_KEY, PROJECT_LINE, PROJECT_MARKERLESS, SHORT_KEYED, SHORT_MARKERLESS, SHORT_PROJECT, SHORT_PROJECT_MARKERLESS, STUB_MECHANISM, STUB_NONE, TIERED_BARE, TWO_LABELS } from './condense-fixtures.mjs';
import { readMarker } from './ledger-line.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'condense-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 400)}`}`);
}

const OTHERS = ['---', TIERED_BARE];

const SENTINEL = '# promoted rules, hand-written\n';
const markersOf = (text) => text.split('\n').map((line) => readMarker(line)).filter((found) => found !== undefined).map((found) => `${found.key}#${String(found.count)}`);
const readOr = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const listOf = (dir) => (existsSync(dir) ? readdirSync(dir) : []);

/** A fresh repository holding a copy of the loop, and a home whose ledger holds `lines`. @es Un repositorio con copia del loop y un home cuyo ledger tiene `lines`. */
function world(name, lines) {
  const repo = path.join(scratch, name, 'repo');
  const home = path.join(scratch, name, 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');
  const ledger = path.join(home, '.claude', 'lessons-ledger.md');

  mkdirSync(path.join(loop, 'state'), { recursive: true });
  mkdirSync(path.join(home, '.claude', 'rules'), { recursive: true });
  provisionLoop(loop);
  writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n', 'utf8');
  writeFileSync(path.join(home, '.claude', 'rules', 'promoted-rules.md'), SENTINEL, 'utf8');
  writeFileSync(ledger, `${HEADER('global', '`x`')}${lines.join('\n')}\n`, 'utf8');

  return { repo, home, loop, ledger, text: readFileSync(ledger, 'utf8'), lock: path.join(loop, 'state', 'ledger.lock'), runs: path.join(loop, 'state', 'condense'), evidence: (key) => path.join(home, '.claude', 'lessons', 'evidence', `${key}.md`) };
}

/** Runs `condense` in a world: `{ status, out }`. @es Ejecuta `condense` en un mundo. */
function condense(target, extra = []) {
  try {
    const out = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), 'condense', ...extra], { cwd: target.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: worldEnv(target.home, { loop: target.loop }), timeout: 60_000 });

    return { status: 0, out };
  } catch (error) {
    return { status: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}${error?.stderr ?? ''}` };
  }
}

const keysFile = (target, keys) => {
  const file = path.join(target.repo, 'keys.json');

  writeFileSync(file, JSON.stringify({ keys }), 'utf8');

  return file;
};

// --- a write run: what is shortened, what is left, what is kept ----------------------------------------
{
  const target = world('write', [KEYED, TWO_LABELS, FAT_MECHANISM, FAT_NONE, MARKERLESS, ...OTHERS]);
  const run = condense(target, ['--write']);
  const after = readOr(target.ledger);
  const lines = after.split('\n');

  check('a keyed line, both promoted lines are shortened to their tiered form, in place', lines.includes(SHORT_KEYED) && lines.includes(STUB_MECHANISM) && lines.includes(STUB_NONE) && !lines.includes(KEYED), after);
  check('...every line it could not prove or was not eligible for is byte-identical', [TWO_LABELS, MARKERLESS, ...OTHERS].every((line) => lines.includes(line)) && after.startsWith(HEADER('global', '`x`')), after);
  check('...the ordered marker list is unchanged', markersOf(after).join() === markersOf(target.text).join(), markersOf(after));
  check('...each original is a whole line of its evidence file', [[KEYED, 'signal-lesson'], [FAT_MECHANISM, 'guard-key'], [FAT_NONE, 'soft-key']].every(([line, key]) => holdsWholeLine(readOr(target.evidence(key)), line)));
  check('...a line left unchanged archives nothing', !existsSync(target.evidence('two-labels')) && listOf(path.dirname(target.evidence('x'))).length === 3);
  check('the exit status is 1 while a line is left unchanged, and each reason is named in both languages', run.status === 1 && run.out.includes('more than one "RULE: " label') && run.out.includes('no marker and no key-map entry') && run.out.includes(' @es '), `exit ${run.status}: ${run.out}`);
  check('...the report gives the characters before and after', run.out.includes(String(target.text.length)) && run.out.includes(String(after.length)), run.out);
  check('the pre-image of the run holds the ledger as it was', (() => {
    const [id, ...more] = listOf(target.runs);

    return id !== undefined && id.startsWith('20') && id.includes('T') && more.length === 0 && readOr(path.join(target.runs, id, 'global.ledger')) === target.text;
  })(), listOf(target.runs));
  check('the hand-written promoted rules are never written', readOr(path.join(target.home, '.claude', 'rules', 'promoted-rules.md')) === SENTINEL);

  const evidenceBefore = readOr(target.evidence('signal-lesson'));
  const again = condense(target, ['--write']);

  check('a second run is byte-identical: ledger, evidence and pre-images', readOr(target.ledger) === after && readOr(target.evidence('signal-lesson')) === evidenceBefore && listOf(target.runs).length === 1 && again.status === 1, `exit ${again.status}`);
}

// --- a dry run changes nothing and says what it would need ---------------------------------------------
{
  const target = world('dry', [KEYED, MARKERLESS]);
  const run = condense(target);

  check('without --write the ledger, the evidence and the state are untouched', readOr(target.ledger) === target.text && !existsSync(path.dirname(target.evidence('x'))) && !existsSync(target.runs), run.out);
  check('...the plan names the line that needs a key and prints a key-map skeleton with its prefix', run.status === 1 && run.out.includes('"keys"') && run.out.includes(MARKERLESS.slice(0, 40)) && run.out.includes('would be shortened'), `exit ${run.status}: ${run.out}`);

  const held = world('dry-locked', [KEYED]);

  writeFileSync(held.lock, '');

  const again = condense(held);

  check('...and a dry run neither needs nor takes the ledger lock: a held lock does not refuse it', again.status === 0 && readOr(held.ledger) === held.text && existsSync(held.lock), `exit ${again.status}: ${again.out}`);
}

// --- a marker-less line is shortened only under an operator key, and never gets a marker ---------------
{
  const target = world('keyed', [MARKERLESS, KEYED]);
  const keys = keysFile(target, [{ line: MARKERLESS.slice(0, 60), key: HOOKS_KEY }]);
  const run = condense(target, ['--write', '--keys', keys]);
  const after = readOr(target.ledger);

  check('a mapped marker-less line is shortened with no marker added, and the run is clean', run.status === 0 && after.split('\n').includes(SHORT_MARKERLESS) && !SHORT_MARKERLESS.includes('<!--fc:') && markersOf(after).join() === 'signal-lesson#4', `exit ${run.status}: ${run.out}\n${after}`);
  check('...its original is archived under the operator key', holdsWholeLine(readOr(target.evidence(HOOKS_KEY)), MARKERLESS));
  check('...the same map run again changes nothing and stays clean', condense(target, ['--write', '--keys', keys]).status === 0 && readOr(target.ledger) === after);
}

// --- a project's own ledger is condensed by the same command, beside its own evidence --------------------
{
  const target = world('project', [KEYED]);
  const claude = path.join(target.repo, '.claude');
  const ledger = path.join(claude, 'lessons-ledger.md');
  const evidence = (key) => path.join(claude, 'lessons', 'evidence', `${key}.md`);
  const projectText = `${HEADER('b100-am-ui', '`y`')}${[PROJECT_LINE, PROJECT_MARKERLESS].join('\n')}\n`;

  writeFileSync(path.join(claude, 'failure-capture.json'), '{ "scope": "b100-am-ui" }', 'utf8');
  writeFileSync(ledger, projectText, 'utf8');

  const keys = keysFile(target, [{ line: PROJECT_MARKERLESS.slice(0, 60), key: PROJECT_KEY }]);
  const dry = condense(target, ['--keys', keys]);

  check('a dry run plans the project ledger too and touches neither ledger', dry.status === 0 && dry.out.includes('b100-am-ui') && readOr(ledger) === projectText && readOr(target.ledger) === target.text && !existsSync(path.dirname(evidence('x'))), `exit ${dry.status}: ${dry.out}`);

  const run = condense(target, ['--write', '--keys', keys]);
  const after = readOr(ledger);
  const lines = after.split('\n');

  check('a keyed project line and a project line named by the key map are shortened in the project ledger, and the run is clean', run.status === 0 && lines.includes(SHORT_PROJECT) && lines.includes(SHORT_PROJECT_MARKERLESS) && after.startsWith(HEADER('b100-am-ui', '`y`')), `exit ${run.status}: ${run.out}\n${after}`);
  check('...each project original is a whole line of the evidence file beside the PROJECT ledger, not the home one', holdsWholeLine(readOr(evidence('project-one')), PROJECT_LINE) && holdsWholeLine(readOr(evidence(PROJECT_KEY)), PROJECT_MARKERLESS) && !existsSync(target.evidence('project-one')), run.out);
  check('...the home ledger of the same run is shortened as before', readOr(target.ledger).split('\n').includes(SHORT_KEYED));
  check('...the pre-image holds the project ledger as it was', readOr(path.join(target.runs, listOf(target.runs)[0] ?? '', 'b100-am-ui.ledger')) === projectText, listOf(target.runs));
  check('...a second run changes nothing', condense(target, ['--write', '--keys', keys]).status === 0 && readOr(ledger) === after);
}

// --- a key map is operator input: a problem in it is a failure even when no line is left over -------------
{
  const target = world('map-problem', [KEYED]);
  const run = condense(target, ['--write', '--keys', keysFile(target, [{ line: 'x'.repeat(40), key: 'some-key' }])]);

  check('a key-map problem alone (no line left unchanged) gives exit 1 and names its entry in both languages', run.status === 1 && run.out.includes('key-map entry 1:') && run.out.includes('(ABSENT)') && run.out.includes(' @es '), `exit ${run.status}: ${run.out}`);
}

for (const [name, content] of [['a keys file that does not exist', undefined], ['a keys file without a "keys" array', '{"nokeys":[]}']]) {
  const target = world(`keys-file-${String(passed)}`, [KEYED]);
  const file = path.join(target.repo, 'absent.json');

  if (content !== undefined) writeFileSync(file, content, 'utf8');

  const run = condense(target, ['--write', '--keys', file]);

  check(`${name} is refused in both languages and the ledger is untouched`, run.status === 1 && run.out.includes('condense REFUSED') && run.out.includes(' @es ') && readOr(target.ledger) === target.text, `exit ${run.status}: ${run.out}`);
}

// --- a held lock refuses without writing ---------------------------------------------------------------
{
  const target = world('locked', [KEYED]);

  writeFileSync(target.lock, '');

  const run = condense(target, ['--write']);

  check('a held ledger lock gives exit 2 and writes nothing: no ledger change, no evidence, no pre-image, the holder\'s lock stays', run.status === 2 && readOr(target.ledger) === target.text && !existsSync(path.dirname(target.evidence('x'))) && !existsSync(target.runs) && existsSync(target.lock), `exit ${run.status}: ${run.out}`);
  check('...the refusal is in both languages and says why', run.out.includes('locked by another writer') && run.out.includes(' @es '), run.out);
}

// --- a line whose evidence cannot be written stays as it was -------------------------------------------
{
  const target = world('lossy', [KEYED, FAT_MECHANISM]);

  mkdirSync(target.evidence('signal-lesson'), { recursive: true });

  const run = condense(target, ['--write']);
  const lines = readOr(target.ledger).split('\n');

  check('evidence that cannot be written leaves that line byte-identical, names why, exits 1; the other line still shortens', run.status === 1 && lines.includes(KEYED) && !lines.includes(FAT_MECHANISM) && run.out.includes('could not be written') && run.out.includes('no se pudo escribir la evidencia'), `exit ${run.status}: ${run.out}`);
}

// --- the proof and the write-back, with the file system made to lie ------------------------------------
/** Condenses one keyed line in a fresh ledger with `deps` replacing the real archive and write. @es Condensa una línea con `deps` en lugar del archivo y la escritura reales. */
function withDeps(name, deps) {
  const target = world(name, [KEYED]);
  const run = () => runCondense({ load: () => [{ scope: 'global', file: target.ledger, lines: readFileSync(target.ledger, 'utf8').split('\n') }], keyMap: [], write: true, date: '2026-09-30', runId: 'run-1', lockFile: target.lock, preImageRoot: target.runs, deps });
  // A run that throws is a failed check, never a crash of this proof. @es Una ejecución que lanza es un check fallido, nunca un crash de esta prueba.
  const outcome = (() => {
    try {
      return run();
    } catch (error) {
      return { status: 'threw', problems: [String(error)], ledgers: [{ restored: false }] };
    }
  })();

  return { target, outcome, after: readOr(target.ledger) };
}

{
  const halfArchive = ({ ledgerFile, key, line, date, kind }) => appendEvidence({ ledgerFile, key, line: line.slice(0, 50), date, kind });
  const { target, outcome, after } = withDeps('half-archive', { appendEvidence: halfArchive });

  check('an archive that kept only part of the line leaves the ledger byte-identical, names the deficit and fails the run', after === target.text && outcome.status === 1 && JSON.stringify(outcome).includes('not a whole line of the evidence file') && JSON.stringify(outcome).includes('no es una línea entera de la evidencia'), JSON.stringify(outcome));
}

{
  // Nothing proved means nothing to write: the ledger file is not even touched.
  // @es Nada probado significa nada que escribir: ni siquiera se toca el fichero del ledger.
  let writes = 0;
  const { target, after } = withDeps('nothing-proved', { appendEvidence: () => ({ ok: false, problem: 'refused. @es rechazado.' }), writeText: () => { writes += 1; } });

  check('a ledger whose lines all failed the proof is not written at all', writes === 0 && after === target.text, `writes: ${String(writes)}`);
}

{
  // The ledger is read only once the lock is held: a line another writer adds while this run waits must survive.
  // @es El ledger se lee solo con el lock ya tomado: una línea que otro escritor añade mientras esta ejecución espera debe sobrevivir.
  const target = world('ledger-changed-while-waiting', [KEYED]);
  const late = '- [global] 2026-09-30 — a lesson captured while condense waited -> RULE: keep me around for a while. <!--fc:late-lesson#1-->';

  writeFileSync(target.lock, '');

  const child = spawn(process.execPath, [path.join(target.loop, 'capture.mjs'), 'condense', '--write'], { cwd: target.repo, stdio: 'ignore', env: worldEnv(target.home, { loop: target.loop }) });
  const closed = new Promise((resolve) => child.on('close', resolve));

  await new Promise((resolve) => setTimeout(resolve, 1200));
  appendFileSync(target.ledger, `${late}\n`, 'utf8');
  rmSync(target.lock, { force: true });

  const status = await closed;
  const lines = readOr(target.ledger).split('\n');

  check('a run that waited for the lock keeps the line written meanwhile, and shortens it too', status === 0 && lines.includes(SHORT_KEYED) && lines.some((line) => line.includes('<!--fc:late-lesson#1-->') && line.includes('Evidence:')), `exit ${String(status)}: ${lines.join('\n')}`);
}

for (const [name, mangle] of [['drops its last characters', (text) => text.slice(0, -5)], ['changes a counter', (text) => text.replace('#4', '#5')], ['fails', () => { throw new Error('disk full'); }]]) {
  const { target, outcome, after } = withDeps(`write-${name.split(' ')[0]}`, { writeText: (file, text) => writeFileSync(file, mangle(text), 'utf8') });

  check(`a ledger write that ${name} is detected on re-read and the pre-image is restored`, after === target.text && outcome.status === 1 && outcome.ledgers[0].restored === true, `${JSON.stringify(outcome)}\n${after}`);
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture condense selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
