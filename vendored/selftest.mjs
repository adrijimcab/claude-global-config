#!/usr/bin/env node
/**
 * Proves the vendored-code provenance check DISCRIMINATES, on constructed roots: untouched, a copy edited
 * in place, a source that moved on, a missing copy, and an absent source (a note, never a failure); then
 * proves both command lines (`vendored.mjs sync|check`, `provenance.mjs`) through real processes.
 * @es Prueba que la comprobación de procedencia DISCRIMINA, sobre raíces construidas, y las dos líneas de
 * órdenes con procesos reales.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { provenanceFindings, sha256Of } from '../fleet-kit/vendor/provenance.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'vendored-selftest-'));
const vendorRoot = path.join(root, 'vendor');
const sourceRoot = path.join(root, 'source');
let failed = 0;
let checks = 0;

const put = (base, relative, text) => {
  mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
  writeFileSync(path.join(base, relative), text);
};

function check(label, findings, expected) {
  const actual = JSON.stringify({ failures: findings.failures.map((line) => line.split(' ')[0]), notes: findings.notes.length });
  const ok = actual === JSON.stringify(expected);

  checks += 1;

  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  expected ${JSON.stringify(expected)} got ${actual}`}\n`);
}

try {
  put(sourceRoot, 'a/one.mjs', 'export const one = 1;\n');
  put(vendorRoot, 'a/one.mjs', 'export const one = 1;\n');

  const record = { files: [{ path: 'a/one.mjs', sha256: sha256Of(path.join(vendorRoot, 'a/one.mjs')) }] };
  // A throw inside the check is a verdict about it, reported as a failed case, never an uncaught crash.
  // @es Un throw de la comprobación es un veredicto: un caso fallido, nunca un crash sin capturar.
  const findings = () => {
    try {
      return provenanceFindings(record, { vendorRoot, sourceRoot });
    } catch (error) {
      return { failures: [`THREW ${error.message}`], notes: [] };
    }
  };

  check('untouched copy and unchanged source: no failure', findings(), { failures: [], notes: 0 });
  put(vendorRoot, 'a/one.mjs', 'export const one = 2;\n');
  check('a copy edited in the kit fails as EDITED', findings(), { failures: ['EDITED'], notes: 0 });
  put(vendorRoot, 'a/one.mjs', 'export const one = 1;\n');
  put(sourceRoot, 'a/one.mjs', 'export const one = 3;\n');
  check('a source that moved on fails as SOURCE', findings(), { failures: ['SOURCE'], notes: 0 });
  rmSync(path.join(sourceRoot, 'a/one.mjs'));
  check('an absent source is a note, never a failure', findings(), { failures: [], notes: 1 });
  rmSync(path.join(vendorRoot, 'a/one.mjs'));
  check('a missing copy fails as MISSING', findings(), { failures: ['MISSING'], notes: 1 });
} finally {
  rmSync(root, { recursive: true, force: true });
}

// --- Part two: the two command lines, through real processes, over an install this file BUILDS.
// `vendored.mjs` and `provenance.mjs` both locate their roots from their own path and the home directory,
// so each run gets a copy of the modules under a constructed `.claude/` and a constructed home.
// @es Parte dos: las dos líneas de órdenes, con procesos reales, sobre una instalación que este fichero
// CONSTRUYE. Cada módulo localiza sus raíces desde su propia ruta y el home, así que cada corrida usa una
// copia bajo un `.claude/` y un home construidos.

const { VENDORED } = await import('./vendored.mjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_VENDORED = path.join(HERE, 'vendored.mjs');
const REAL_KIT_VENDOR = path.join(HERE, '..', 'fleet-kit', 'vendor');

/**
 * One check. The condition is a thunk so that a throw while evaluating it (a file a broken mechanism never
 * wrote) is a FAILED check naming its cause, never an uncaught crash that hides which decision broke.
 * @es Un check. La condición es una función para que un throw al evaluarla sea un check FALLIDO con su
 * causa, nunca un crash sin capturar que oculta qué decisión se rompió.
 */
function expect(label, condition) {
  let ok = false;
  let cause = '';

  try {
    ok = condition() === true;
  } catch (error) {
    cause = `  threw ${error.message}`;
  }

  checks += 1;

  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${cause}\n`);
}

/** A fresh install: modules copied under `<base>/claude`, the reference fleet under `<base>/home`. @es Una instalación nueva. */
function installIn(base) {
  const claude = path.join(base, 'claude');
  const home = path.join(base, 'home');
  const sourceRoot = path.join(home, 'Desktop', 'Projects', 'b100-am-ui', '.claude');

  mkdirSync(path.join(claude, 'vendored'), { recursive: true });
  mkdirSync(path.join(claude, 'fleet-kit', 'vendor'), { recursive: true });
  copyFileSync(REAL_VENDORED, path.join(claude, 'vendored', 'vendored.mjs'));
  copyFileSync(path.join(REAL_KIT_VENDOR, 'provenance.mjs'), path.join(claude, 'fleet-kit', 'vendor', 'provenance.mjs'));
  copyFileSync(path.join(REAL_KIT_VENDOR, 'sources.mjs'), path.join(claude, 'fleet-kit', 'vendor', 'sources.mjs'));

  for (const relative of VENDORED) put(sourceRoot, relative, `// reference copy of ${relative}\n`);

  return { claude, home, sourceRoot };
}

const runNode = (install, args, extraEnv = {}) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', cwd: install.claude, env: { ...process.env, HOME: install.home, USERPROFILE: install.home, ...extraEnv } });
const vendoredCli = (install, ...args) => runNode(install, [path.join(install.claude, 'vendored', 'vendored.mjs'), ...args]);
const provenanceCli = (install) => runNode(install, [path.join(install.claude, 'fleet-kit', 'vendor', 'provenance.mjs')]);
// The extra argument gives `process.argv[1]` a value, as it has when a module is run as a script, so a broken
// main-module check cannot hide behind its own `argv[1] !== undefined` precondition.
// @es El argumento extra da valor a `process.argv[1]`, como cuando se ejecuta un script.
const importOf = (install, file) => runNode(install, ['--input-type=module', '-e', 'await import(process.env.TARGET_MODULE)', 'as-main-argument'], { TARGET_MODULE: pathToFileURL(file).href });
// A throw inside the check is a verdict about it, reported as a finding line, never an uncaught crash.
// @es Un throw de la comprobación es un veredicto, una línea de hallazgo, nunca un crash sin capturar.
const findingsOf = (run) => {
  try {
    return run();
  } catch (error) {
    return { failures: [`THREW ${error.message}`], notes: [] };
  }
};
const bilingual = (text) => text.includes(' @es ');

const cliRoot = mkdtempSync(path.join(os.tmpdir(), 'vendored-cli-selftest-'));

try {
  put(cliRoot, 'abc.txt', 'abc');
  expect('sha256Of is the real SHA-256 of a file (the standard "abc" vector)', () => sha256Of(path.join(cliRoot, 'abc.txt')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  const install = installIn(path.join(cliRoot, 'one'));
  const synced = vendoredCli(install, 'sync');
  const record = (() => {
    try {
      return JSON.parse(readFileSync(path.join(install.claude, 'vendored', 'PROVENANCE.json'), 'utf8'));
    } catch {
      return { sourceRoot: undefined, files: [] };
    }
  })();

  expect('sync exits 0 and names the count and the source', () => synced.status === 0 && synced.stdout.includes(`vendored ${VENDORED.length} module(s) from ${install.sourceRoot}`));
  expect('sync reports in both languages', () => bilingual(synced.stdout));
  expect('sync copies every module byte-identical under the install', () => VENDORED.every((relative) => sha256Of(path.join(install.claude, relative)) === sha256Of(path.join(install.sourceRoot, relative))));
  expect('sync records the source root home-relative, so the record never depends on the machine that synced, and every module in order', () => record.sourceRoot === '~/Desktop/Projects/b100-am-ui/.claude' && JSON.stringify(record.files.map((entry) => entry.path)) === JSON.stringify(VENDORED));
  expect('sync records the real hash of each copy', () => record.files.every((entry) => entry.sha256 === sha256Of(path.join(install.claude, entry.path))));

  const green = vendoredCli(install, 'check');

  expect('check right after sync exits 0 and counts the modules', () => green.status === 0 && green.stdout.includes(`provenance: ${VENDORED.length} vendored module(s), 0 failure(s)`));
  expect('check reports in both languages', () => bilingual(green.stdout));

  put(install.claude, VENDORED[0], 'edited in the kit\n');

  const edited = vendoredCli(install, 'check');

  expect('check fails on a copy edited in the kit and names it', () => edited.status === 1 && edited.stdout.includes(`EDITED IN THE KIT   ${VENDORED[0]}`) && edited.stdout.includes('1 failure(s)'));

  put(install.claude, VENDORED[0], readFileSync(path.join(install.sourceRoot, VENDORED[0]), 'utf8'));
  put(install.sourceRoot, VENDORED[1], 'the reference fleet moved on\n');

  const moved = vendoredCli(install, 'check');

  expect('check fails when a source moved on and names it', () => moved.status === 1 && moved.stdout.includes(`SOURCE MOVED ON     ${VENDORED[1]}`));

  rmSync(install.sourceRoot, { recursive: true, force: true });
  put(install.claude, VENDORED[0], 'edited again\n');

  const absent = vendoredCli(install, 'check');
  const absentLines = absent.stdout.split('\n');

  expect('with the reference fleet absent every module is a note and the edited copy still fails', () => absentLines.filter((line) => line.startsWith('source absent')).length === VENDORED.length && absent.status === 1);
  expect('notes print before failures', () => absentLines.findIndex((line) => line.startsWith('source absent')) < absentLines.findIndex((line) => line.startsWith('EDITED IN THE KIT')));

  const missingCommand = vendoredCli(install);
  const unknownCommand = vendoredCli(install, 'bogus');

  expect('no command exits 2 with a bilingual usage line', () => missingCommand.status === 2 && missingCommand.stdout.includes('usage: vendored.mjs check | sync') && bilingual(missingCommand.stdout));
  expect('an unknown command exits 2 as well', () => unknownCommand.status === 2 && unknownCommand.stdout.includes('usage:'));

  const imported = importOf(install, path.join(install.claude, 'vendored', 'vendored.mjs'));

  expect('importing vendored.mjs runs no command: no output, exit 0', () => imported.status === 0 && imported.stdout === '');

  const kit = installIn(path.join(cliRoot, 'two'));
  const vendorDir = path.join(kit.claude, 'fleet-kit', 'vendor');
  const kitFiles = VENDORED.map((relative) => {
    put(vendorDir, relative, `// reference copy of ${relative}\n`);

    return { path: relative, sha256: sha256Of(path.join(vendorDir, relative)) };
  });

  writeFileSync(path.join(vendorDir, 'PROVENANCE.json'), JSON.stringify({ files: kitFiles }));

  const kitGreen = provenanceCli(kit);

  expect('provenance.mjs on an untouched kit exits 0 and counts the modules', () => kitGreen.status === 0 && kitGreen.stdout.includes(`provenance: ${VENDORED.length} vendored module(s), 0 failure(s)`) && bilingual(kitGreen.stdout));

  writeFileSync(path.join(vendorDir, VENDORED[0]), 'edited in the kit\n');
  rmSync(kit.sourceRoot, { recursive: true, force: true });

  const kitRed = provenanceCli(kit);
  const kitLines = kitRed.stdout.split('\n');

  expect('provenance.mjs fails on an edited copy, lists absent sources as notes first', () => kitRed.status === 1 && kitLines[0].startsWith('source absent') && kitLines.some((line) => line.startsWith(`EDITED IN THE KIT   ${VENDORED[0]}`)));

  const kitImported = importOf(kit, path.join(vendorDir, 'provenance.mjs'));

  const lines = (() => {
    const base = path.join(cliRoot, 'three');
    const vendorSide = path.join(base, 'vendor');
    const sourceSide = path.join(base, 'source');

    put(vendorSide, 'edited.mjs', 'changed\n');
    put(sourceSide, 'edited.mjs', 'original\n');
    put(vendorSide, 'moved.mjs', 'kept\n');
    put(sourceSide, 'moved.mjs', 'moved on\n');
    put(vendorSide, 'noted.mjs', 'kept\n');

    const recordOf = (name, text) => ({ path: name, sha256: createHash('sha256').update(text).digest('hex') });
    const found = findingsOf(() => provenanceFindings({ files: [recordOf('edited.mjs', 'original\n'), recordOf('moved.mjs', 'kept\n'), recordOf('noted.mjs', 'kept\n'), recordOf('gone.mjs', 'x')] }, { vendorRoot: vendorSide, sourceRoot: sourceSide }));

    return [...found.notes, ...found.failures];
  })();

  expect('every finding line is bilingual: edited, moved on, missing and absent source', () => ['EDITED IN THE KIT', 'SOURCE MOVED ON', 'MISSING IN THE KIT', 'source absent'].every((kind) => lines.some((line) => line.startsWith(kind) && bilingual(line))));

  expect('importing provenance.mjs runs no check: no output, exit 0', () => kitImported.status === 0 && kitImported.stdout === '');
} finally {
  rmSync(cliRoot, { recursive: true, force: true });
}

process.stdout.write(`vendored provenance selftest: ${checks - failed}/${checks} passed\n`);
process.exitCode = failed === 0 ? 0 : 1;
