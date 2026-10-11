#!/usr/bin/env node
/**
 * Proof that `check-budgets.mjs` DISCRIMINATES. Every case builds its own `angular.json` in a temporary folder
 * that is removed at the end. State space: all three budgets present and exactly at their cap; each cap
 * exceeded by one byte; each budget type missing; a budget with only a warning limit; an invalid size; the
 * units b, kb, mb (and upper case) at the cap and just over it; a missing, unreadable or project-less
 * `angular.json`; a project with no build target beside one with it; the `targets` spelling; two projects with
 * one bad; the CLI exit codes and its default directory; and every printed line carrying its `@es` half.
 *
 * @es Prueba de que `check-budgets.mjs` DISCRIMINA. Cada caso construye su propio `angular.json` en una
 * carpeta temporal que se borra al final. Espacio de estados: los tres presupuestos justo en su tope; cada
 * tope superado por un byte; cada tipo ausente; un presupuesto solo con aviso; un tamaño inválido; las
 * unidades b, kb, mb (y mayúsculas) en el tope y justo encima; un `angular.json` ausente, ilegible o sin
 * proyectos; un proyecto sin build junto a otro con build; la forma `targets`; dos proyectos con uno malo;
 * los códigos de salida del CLI y su directorio por defecto; y que cada línea impresa lleve su mitad `@es`.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeSpeaker } from '../../../bilingual-output/speaker.mjs';
import { main } from './check-budgets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = {
  passed: { en: 'check-budgets selftest: {count} assertion(s) passed.', es: 'selftest de check-budgets: {count} aserción(es) correcta(s).' },
  failed: { en: 'FAILED: {label}', es: 'FALLÓ: {label}' },
  failures: { en: 'check-budgets selftest: {count} assertion(s) failed.', es: 'selftest de check-budgets: {count} aserción(es) fallida(s).' },
};
const speaker = makeSpeaker(TABLE);

let passed = 0;
const failures = [];
const roots = [];
// Every root is removed on every exit, a throw included: a selftest leaves nothing behind it. @es Toda raíz se
// elimina en toda salida, también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

function budgetsOf(initial, style, script) {
  return [
    ...(initial === undefined ? [] : [{ type: 'initial', maximumWarning: '1mb', maximumError: initial }]),
    ...(style === undefined ? [] : [{ type: 'anyComponentStyle', maximumWarning: '1kb', maximumError: style }]),
    ...(script === undefined ? [] : [{ type: 'anyScript', maximumWarning: '1kb', maximumError: script }]),
  ];
}

function projectOf(budgets, key = 'architect') {
  return { [key]: { build: { configurations: { production: { budgets } } } } };
}

/** Builds a temporary folder holding `angular.json` with the given text (or none). @es Carpeta temporal con `angular.json`. */
function folderWith(text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-budgets-'));

  roots.push(dir);
  if (text !== undefined) writeFileSync(path.join(dir, 'angular.json'), typeof text === 'string' ? text : JSON.stringify(text));

  return dir;
}

/** Runs `main` over a folder and returns `{ code, out, err }`. @es Corre `main` y devuelve salida y errores. */
function run(dir) {
  const out = [];
  const err = [];
  let code;

  try {
    code = main(dir, { log: (line) => out.push(line), error: (line) => err.push(line) });
  } catch (error) {
    code = -1;
    err.push(`threw: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { code, out, err };
}

const ofBudgets = (...budgets) => run(folderWith({ projects: { app: projectOf(budgetsOf(...budgets)) } }));

// Every cap exactly met: the unit decides, so the same cap is written in each unit.
check('every cap exactly met passes', ofBudgets('2mb', '8kb', '1mb').code === 0);
check('the cap in bytes passes (mb is 1024 squared)', ofBudgets('2097152b', '8192b', '1048576b').code === 0);
check('the cap in kb passes (kb is 1024)', ofBudgets('2048kb', '8kb', '1024kb').code === 0);
check('the cap in upper case units passes', ofBudgets('2MB', '8KB', '1048576B').code === 0);
check('a decimal under the cap passes', ofBudgets('1.5mb', '0.5kb', '0.5mb').code === 0);
check('a limit far under the cap passes', ofBudgets('1b', '1b', '1b').code === 0);

// Each cap exceeded by exactly one unit of the smallest size.
check('initial one byte over the cap fails', ofBudgets('2097153b', '8kb', '1mb').code === 1);
check('anyComponentStyle one byte over the cap fails', ofBudgets('2mb', '8193b', '1mb').code === 1);
check('anyScript one byte over the cap fails', ofBudgets('2mb', '8kb', '1048577b').code === 1);
check('initial over the cap in mb fails', ofBudgets('3mb', '8kb', '1mb').code === 1);
check('anyComponentStyle over the cap in kb fails', ofBudgets('2mb', '9kb', '1mb').code === 1);
check('anyScript over the cap in decimal mb fails', ofBudgets('2mb', '8kb', '1.5mb').code === 1);

{
  const over = ofBudgets('5mb', '8kb', '1mb');

  check('an over-cap report names the type, the value and the cap', over.err.length === 1 && over.err[0]?.includes('initial') && over.err[0]?.includes('5mb') && over.err[0]?.includes('2mb'));
  check('an over-cap report prints nothing on the success stream', over.out.length === 0);
}

// Each missing budget type, and a budget with only a warning limit.
for (const [position, type] of [['initial', 'initial'], ['style', 'anyComponentStyle'], ['script', 'anyScript']]) {
  const limits = { initial: '2mb', style: '8kb', script: '1mb' };

  delete limits[position];

  const result = ofBudgets(limits.initial, limits.style, limits.script);

  check(`a missing ${type} budget fails`, result.code === 1);
  check(`a missing ${type} budget is named`, result.err.length === 1 && result.err[0]?.includes(type));
}

{
  const warningOnly = run(folderWith({ projects: { app: projectOf([{ type: 'initial', maximumWarning: '1mb' }, ...budgetsOf(undefined, '8kb', '1mb')]) } }));

  check('a budget with only a warning limit counts as missing', warningOnly.code === 1);
  check('a warning-only budget is reported as missing, not as invalid', warningOnly.err.length === 1 && warningOnly.err[0]?.includes('no initial budget'));
}
check('a project without a production configuration fails every type', run(folderWith({ projects: { app: { architect: { build: {} } } } })).err.length === 3);
check('an unknown size unit fails and is named', (() => { const result = ofBudgets('2gb', '8kb', '1mb'); return result.code === 1 && result.err[0]?.includes('2gb'); })());
check('a size that is not a number fails', ofBudgets('large', '8kb', '1mb').code === 1);
check('an upper case unit over the cap fails', ofBudgets('3MB', '8kb', '1mb').code === 1);
check('a size with leading text fails', ofBudgets('about 1mb', '8kb', '1mb').code === 1);
check('a size padded with spaces is read', ofBudgets(' 2mb ', '8kb', '1mb').code === 0);
check('an invalid size is reported as invalid, not as missing', (() => { const result = ofBudgets('large', '8kb', '1mb'); return result.err.length === 1 && result.err[0]?.includes('is not a size'); })());
check('a size with a trailing word fails', ofBudgets('1mb extra', '8kb', '1mb').code === 1);

// Discovery of the target.
check('no angular.json exits 2', run(folderWith(undefined)).code === 2);
check('an unreadable angular.json exits 2', run(folderWith('{ not json')).code === 2);
check('an angular.json without projects exits 2', run(folderWith({})).code === 2);
check('an angular.json whose projects have no build target exits 2', run(folderWith({ projects: { lib: { architect: { test: {} } } } })).code === 2);
check('a no-target report names the folder and uses the error stream', (() => { const dir = folderWith(undefined); const result = run(dir); return result.err.length === 1 && result.err[0]?.includes(dir) && result.out.length === 0; })());
check('a project without a build target is not checked beside one that has it', run(folderWith({ projects: { lib: { architect: { test: {} } }, app: projectOf(budgetsOf('2mb', '8kb', '1mb')) } })).code === 0);
check('the targets spelling is read', run(folderWith({ projects: { app: projectOf(budgetsOf('2mb', '8kb', '1mb'), 'targets') } })).code === 0);
check('the targets spelling is checked too', run(folderWith({ projects: { app: projectOf(budgetsOf('9mb', '8kb', '1mb'), 'targets') } })).code === 1);

{
  const result = run(folderWith({ projects: { good: projectOf(budgetsOf('2mb', '8kb', '1mb')), bad: projectOf(budgetsOf('2mb', '80kb', '1mb')) } }));

  check('two projects with one bad fail', result.code === 1);
  check('only the bad project is named', result.err.length === 1 && result.err[0]?.includes('bad') && !result.err[0]?.includes('good'));
}

// What a clean run reports, and that every printed line is bilingual.
{
  const clean = ofBudgets('2mb', '8kb', '1mb');
  const two = run(folderWith({ projects: { a: projectOf(budgetsOf('2mb', '8kb', '1mb')), b: projectOf(budgetsOf('2mb', '8kb', '1mb')) } }));
  const lines = [...clean.out, ...clean.err, ...ofBudgets('5mb').err, ...run(folderWith(undefined)).err];

  check('a clean run reports its declaration count on the success stream', clean.out.length === 1 && clean.out[0]?.includes('3 budget') && clean.err.length === 0);
  check('the declaration count is projects times types', two.out[0]?.includes('6 budget'));
  check('every printed line carries its @es half', lines.length > 0 && lines.every((line) => line.includes(' @es ')));
  check('the Spanish half keeps its accents', clean.out[0]?.includes('declaración'));
}

// The caps are the values measured in Discovery-FE/angular.json, never loosened.
{
  const caps = JSON.parse(readFileSync(path.join(HERE, 'config.json'), 'utf8')).caps;

  check('the caps are the measured 2mb, 8kb and 1mb', caps.initial.maximumError === '2mb' && caps.anyComponentStyle.maximumError === '8kb' && caps.anyScript.maximumError === '1mb' && Object.keys(caps).length === 3);
}

// The CLI: exit codes pass through and the folder defaults to the current one.
function cli(dir, ...args) {
  return spawnSync(process.execPath, [path.join(HERE, 'check-budgets.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
}

{
  const good = folderWith({ projects: { app: projectOf(budgetsOf('2mb', '8kb', '1mb')) } });
  const bad = folderWith({ projects: { app: projectOf(budgetsOf('9mb', '8kb', '1mb')) } });
  const none = folderWith(undefined);

  check('the CLI exits 0 on a clean folder given as an argument', cli(none, good).status === 0);
  check('the CLI exits 1 on a bad folder given as an argument', cli(none, bad).status === 1);
  check('the CLI exits 2 on a folder without angular.json', cli(good, none).status === 2);
  check('the CLI defaults to the current folder (clean)', cli(good).status === 0);
  check('the CLI defaults to the current folder (bad)', cli(bad).status === 1);
  check('the CLI prints the success line on its standard output', cli(none, good).stdout.includes(' @es '));
  check('the CLI prints a problem on its standard error', cli(none, bad).stderr.includes(' @es '));
}

for (const label of failures) speaker.complain('failed', { label });

if (failures.length > 0) {
  speaker.complain('failures', { count: failures.length });
  process.exit(1);
}

speaker.say('passed', { count: passed });
