#!/usr/bin/env node
/**
 * Proves the vendored-code provenance check DISCRIMINATES, on constructed roots: untouched, a copy edited
 * in place, a source that moved on, a missing copy, and an absent source (a note, never a failure); then
 * proves the command line (`vendored.mjs sync|check`) through real processes.
 * @es Prueba que la comprobación de procedencia DISCRIMINA, sobre raíces construidas, y la línea de órdenes
 * con procesos reales.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { provenanceFindings, sha256Of } from './provenance.mjs';
import { duplicateFinding, RECORD_FILE_NAME, undeclaredDuplicates } from './duplicates.mjs';

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

// --- Part two: the command line, through real processes, over an install this file BUILDS.
// `vendored.mjs` locates its roots from its own path and the home directory, so each run gets a copy of the
// modules under a constructed `.claude/` and a constructed home.
// @es Parte dos: la línea de órdenes, con procesos reales, sobre una instalación que este fichero CONSTRUYE.
// `vendored.mjs` localiza sus raíces desde su propia ruta y el home, así que cada corrida usa una copia bajo
// un `.claude/` y un home construidos.

const { VENDORED } = await import('./vendored.mjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_VENDORED = path.join(HERE, 'vendored.mjs');

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
  copyFileSync(REAL_VENDORED, path.join(claude, 'vendored', 'vendored.mjs'));
  copyFileSync(path.join(HERE, 'duplicates.mjs'), path.join(claude, 'vendored', 'duplicates.mjs'));
  copyFileSync(path.join(HERE, 'provenance.mjs'), path.join(claude, 'vendored', 'provenance.mjs'));

  for (const relative of VENDORED) put(sourceRoot, relative, `// reference copy of ${relative}\n`);

  return { claude, home, sourceRoot };
}

const runNode = (install, args, extraEnv = {}) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', cwd: install.claude, env: { ...process.env, HOME: install.home, USERPROFILE: install.home, ...extraEnv } });
const vendoredCli = (install, ...args) => runNode(install, [path.join(install.claude, 'vendored', 'vendored.mjs'), ...args]);
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
  expect('a source that moved on names the command that re-syncs it', () => lines.some((line) => line.startsWith('SOURCE MOVED ON') && line.includes('run vendored/vendored.mjs sync, then the selftests')));

  // --- Part three: undeclared duplicates, a module byte-identical under both roots that nobody declared.
  // @es Parte tres: duplicados sin declarar, un módulo idéntico bajo ambas raíces que nadie declaró.
  const twinsIn = (name, files) => {
    const base = path.join(cliRoot, name);

    for (const [relative, installText, sourceText] of files) {
      if (installText !== undefined) put(path.join(base, 'install'), relative, installText);
      if (sourceText !== undefined) put(path.join(base, 'source'), relative, sourceText);
    }

    return { installRoot: path.join(base, 'install'), sourceRoot: path.join(base, 'source') };
  };
  const duplicatesOf = (roots, extra = {}) => {
    try {
      return undeclaredDuplicates({ ...roots, declared: [], ...extra });
    } catch (error) {
      return [`THREW ${error.message}`];
    }
  };
  const same = 'export const same = 1;\n';
  const pinningRecord = (...paths) => JSON.stringify({ files: paths.map((one) => ({ path: one, sha256: 'x' })) });

  expect('a module byte-identical under both roots and declared nowhere is a duplicate', () => JSON.stringify(duplicatesOf(twinsIn('d-plain', [['a/twin.mjs', same, same]]))) === '["a/twin.mjs"]');
  expect('duplicates are named with forward slashes, nested folders included, and sorted', () => JSON.stringify(duplicatesOf(twinsIn('d-nested', [['z/y/deep.mjs', same, same], ['a/first.mjs', same, same], ['m.mjs', same, same]]))) === '["a/first.mjs","m.mjs","z/y/deep.mjs"]');
  expect('a declared module is never a duplicate', () => JSON.stringify(duplicatesOf(twinsIn('d-declared', [['a/one.mjs', same, same], ['a/two.mjs', same, same]]), { declared: ['a/one.mjs'] })) === '["a/two.mjs"]');
  expect('copies that diverge on purpose are no finding', () => duplicatesOf(twinsIn('d-diverge', [['a/twin.mjs', same, 'export const same = 2;\n']])).length === 0);
  expect('a module present under one root only is no finding, on either side', () => duplicatesOf(twinsIn('d-one-sided', [['a/mine.mjs', same, undefined], ['a/theirs.mjs', undefined, same]])).length === 0);
  expect('only .mjs modules count: an identical .json, .md or .mjs.bak is no finding', () => duplicatesOf(twinsIn('d-kinds', [['a/data.json', same, same], ['a/notes.md', same, same], ['a/twin.mjs.bak', same, same], ['a/mjs', same, same]])).length === 0);
  expect('an identical module under .git, node_modules or worktrees is no finding', () => duplicatesOf(twinsIn('d-skipped', [['.git/x.mjs', same, same], ['node_modules/x.mjs', same, same], ['worktrees/w/x.mjs', same, same], ['a/node_modules/x.mjs', same, same]])).length === 0);
  expect('findings come out sorted whatever order the file system lists in', () => JSON.stringify(duplicatesOf(twinsIn('d-order', [['z.mjs', same, same], ['a.mjs', same, same], ['m.mjs', same, same]]), { walk: () => ['z.mjs', 'a.mjs', 'm.mjs'] })) === '["a.mjs","m.mjs","z.mjs"]');
  expect('a folder named like a module is no module', () => duplicatesOf(twinsIn('d-folder', [['a/folder.mjs/inner.txt', same, same]])).length === 0);
  expect('a malformed entry in a record does not hide the entries after it', () => duplicatesOf(twinsIn('d-malformed', [['kit/a/pinned.mjs', same, same], [`kit/${RECORD_FILE_NAME}`, '{"files":[null,{"path":3},{"path":"a/pinned.mjs"}]}', undefined]])).length === 0);
  expect('a symbolic link in the reference fleet is no module (a platform that cannot make one has nothing to prove)', () => {
    const roots = twinsIn('d-link', [['real.mjs', same, same]]);

    try {
      symlinkSync(path.join(roots.sourceRoot, 'real.mjs'), path.join(roots.sourceRoot, 'link.mjs'));
    } catch {
      return true;
    }

    put(roots.installRoot, 'link.mjs', same);

    return JSON.stringify(duplicatesOf(roots)) === '["real.mjs"]';
  });
  expect('an absent reference fleet has no duplicates and never throws', () => JSON.stringify(duplicatesOf({ installRoot: twinsIn('d-absent', [['a/twin.mjs', same, undefined]]).installRoot, sourceRoot: path.join(cliRoot, 'd-absent', 'nowhere') })) === '[]');

  // A module pinned by another provenance record (one that names each file relative to ITS folder, as a kit's
  // `vendor/` record would) already has its provenance: the pin's own data excludes it, never a hand list.
  // @es Un módulo fijado por OTRO registro de procedencia (que nombra cada fichero relativo a SU carpeta) ya
  // tiene su procedencia: lo excluyen los datos del propio registro.
  expect('a module pinned by another provenance record, relative to that record\'s folder, is no finding', () => duplicatesOf(twinsIn('d-pinned', [['kit/vendor/a/pinned.mjs', same, same], [`kit/vendor/${RECORD_FILE_NAME}`, pinningRecord('a/pinned.mjs'), undefined]])).length === 0);
  expect('a module the other record does NOT list is still a duplicate, and so is one only its folder name resembles', () => JSON.stringify(duplicatesOf(twinsIn('d-unlisted', [['kit/vendor/a/pinned.mjs', same, same], ['kit/vendor/a/other.mjs', same, same], ['a/other.mjs', same, same], [`kit/vendor/${RECORD_FILE_NAME}`, pinningRecord('a/pinned.mjs'), undefined]]))) === '["a/other.mjs","kit/vendor/a/other.mjs"]');
  expect('a record pins relative to ITS folder: the same relative path elsewhere in the tree is no pinned module', () => JSON.stringify(duplicatesOf(twinsIn('d-relative', [['a/pinned.mjs', same, same], [`kit/${RECORD_FILE_NAME}`, pinningRecord('a/pinned.mjs'), undefined]]))) === '["a/pinned.mjs"]');
  expect('this check\'s own record, which names its files relative to the install root, hides no duplicate', () => JSON.stringify(duplicatesOf(twinsIn('d-own', [['shell-command/twin.mjs', same, same], [`vendored/${RECORD_FILE_NAME}`, pinningRecord('shell-command/twin.mjs'), undefined]]))) === '["shell-command/twin.mjs"]');
  expect('a record that cannot be read pins nothing and never crashes the check', () => JSON.stringify(duplicatesOf(twinsIn('d-corrupt', [['a/twin.mjs', same, same], [`kit/${RECORD_FILE_NAME}`, '{not json', undefined], [`kit2/${RECORD_FILE_NAME}`, '{"files":"no"}', undefined], [`kit3/${RECORD_FILE_NAME}`, '{"files":[null,{"path":3}]}', undefined]]))) === '["a/twin.mjs"]');
  expect('the finding line names the module, what to do, and both languages', () => {
    const line = duplicateFinding('a/twin.mjs');

    return line.startsWith('DUPLICATED WITHOUT PROVENANCE  a/twin.mjs') && line.includes('declare it vendored or make the copies diverge on purpose') && line.includes(' @es DUPLICADO SIN PROCEDENCIA') && line.includes('declararlo vendorizado o hacer que las copias diverjan a propósito');
  });

  const twins = installIn(path.join(cliRoot, 'four'));

  vendoredCli(twins, 'sync');
  put(twins.sourceRoot, 'extra/twin.mjs', same);
  put(twins.claude, 'extra/twin.mjs', same);

  const twinned = vendoredCli(twins, 'check');
  const twinnedLines = twinned.stdout.split('\n');

  expect('check fails on a duplicate, names it, and counts it among the failures', () => twinned.status === 1 && twinnedLines.some((line) => line.startsWith('DUPLICATED WITHOUT PROVENANCE  extra/twin.mjs')) && twinned.stdout.includes(`provenance: ${VENDORED.length} vendored module(s), 1 failure(s)`));
  expect('the duplicate line is bilingual', () => twinnedLines.some((line) => line.startsWith('DUPLICATED WITHOUT PROVENANCE') && bilingual(line)));

  put(twins.claude, 'extra/twin.mjs', 'export const same = 2;\n');

  expect('once the copies diverge on purpose the check is green', () => vendoredCli(twins, 'check').status === 0);

  put(twins.claude, 'extra/twin.mjs', same);
  put(twins.claude, 'extra/pinned/p.mjs', same);
  put(twins.sourceRoot, 'extra/pinned/p.mjs', same);
  writeFileSync(path.join(twins.claude, 'extra', RECORD_FILE_NAME), pinningRecord('pinned/p.mjs'));

  const pinned = vendoredCli(twins, 'check');

  expect('check excludes what another record pins, through that record\'s own data', () => !pinned.stdout.includes('extra/pinned/p.mjs') && pinned.stdout.includes('extra/twin.mjs'));
} finally {
  rmSync(cliRoot, { recursive: true, force: true });
}

process.stdout.write(`vendored provenance selftest: ${checks - failed}/${checks} passed\n`);
process.exitCode = failed === 0 ? 0 : 1;
