#!/usr/bin/env node
/**
 * Proof that the toolchain inspector DISCRIMINATES, and that every live toolchain passes it. Every case builds
 * its own toolchains in a temporary folder, so the verdict never depends on which packages the live kit pins.
 * State space: a correct toolchain; a missing or unreadable manifest and lockfile; an empty dependency list;
 * every shape of version that is not one exact version (caret, tilde, comparator, wildcard, tag, alias,
 * path, URL, partial); a prerelease pin (exact, accepted); a dependency section other than `dependencies`; a
 * manifest that is not private or is not named for its folder; a lockfile whose root disagrees with the
 * manifest (extra, missing or different entry), whose package entry is absent, or whose resolved version is
 * not the pin; discovery (a plain file beside the toolchains, no `toolchains` folder); the command of a gate
 * that names a package (the launcher call, any other command, a call with no package); the package of a gate
 * that its stack's toolchain does not declare; and the live `toolchains/` folder with every live gate.
 *
 * @es Prueba de que el inspector de toolchains DISCRIMINA y de que toda toolchain real lo pasa. Cada caso
 * construye sus toolchains en una carpeta temporal. Espacio de estados: toolchain correcta; manifiesto y
 * lockfile ausentes o ilegibles; lista de dependencias vacía; cada forma de versión que no es una versión
 * exacta (caret, tilde, comparador, comodín, etiqueta, alias, ruta, URL, parcial); un pin de prerelease
 * (exacto, aceptado); otra sección de dependencias; manifiesto no privado o sin el nombre de su carpeta; un
 * lockfile cuya raíz discrepa del manifiesto, sin la entrada del paquete o con otra versión resuelta; el
 * descubrimiento; el comando de un gate que nombra un paquete; el paquete de un gate que la toolchain de su
 * stack no declara; y la carpeta real `toolchains/` con todos los gates reales.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverGates, inspectGate, launcherCallOf, stackOfToolchain, toolPackageOf } from './gate-layout.mjs';
import { discoverToolchains, gateToolProblems, inspectToolchain } from './toolchain-layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const roots = [];

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** A fresh temporary kit root. @es Una raíz temporal de kit. */
function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'toolchain-selftest-'));

  roots.push(root);

  return root;
}

/** The manifest of a correct toolchain named `name`. @es El manifiesto de una toolchain correcta. */
function manifestOf(name, dependencies) {
  return { name: `gates-kit-${name}-toolchain`, version: '1.0.0', private: true, dependencies };
}

/** The lockfile that matches `manifest`, one resolved entry per dependency. @es El lockfile que concuerda con `manifest`. */
function lockOf(manifest) {
  const packages = { '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies } };

  for (const [pkg, version] of Object.entries(manifest.dependencies ?? {})) packages[`node_modules/${pkg}`] = { version };

  return { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages };
}

/** Writes `<root>/toolchains/<name>/` from a spec; `null` removes a file, a string is written raw. @es Escribe una toolchain; `null` quita un fichero, una cadena se escribe tal cual. */
function build(root, name, { dependencies = { eslint: '9.39.4', typescript: '5.5.4' }, manifest, lock } = {}) {
  const dir = path.join(root, 'toolchains', name);
  const resolvedManifest = manifest === undefined ? manifestOf(name, dependencies) : manifest;
  const files = {
    'package.json': typeof resolvedManifest === 'string' || resolvedManifest === null ? resolvedManifest : JSON.stringify(resolvedManifest),
    'package-lock.json': lock === undefined ? JSON.stringify(lockOf(manifestOf(name, dependencies))) : typeof lock === 'string' || lock === null ? lock : JSON.stringify(lock),
  };

  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) if (content !== null) writeFileSync(path.join(dir, file), content);

  return dir;
}

/** The problem ids of a built toolchain, `id` or `id:detail`; a throw is reported so it fails the assertion. @es Ids de problema; un throw falla la aserción. */
function problemsOf(spec) {
  try {
    return inspectToolchain(build(freshRoot(), 'sample', spec)).map((problem) => (problem.detail === undefined ? problem.id : `${problem.id}:${problem.detail}`));
  } catch (error) {
    return [`threw:${error.message}`];
  }
}

// The correct toolchain and the missing parts.
check('a correct toolchain has no problem', problemsOf({}).length === 0);
check('a prerelease pin is an exact version', problemsOf({ dependencies: { eslint: '9.39.4-rc.1' } }).length === 0);
check('a missing manifest is the only problem', problemsOf({ manifest: null }).join() === 'missing-manifest');
check('an unreadable manifest is refused', problemsOf({ manifest: '{' }).join() === 'invalid-manifest');
check('a manifest that is not an object is refused', problemsOf({ manifest: '[]' }).join() === 'invalid-manifest');
check('a missing lockfile is the only problem', problemsOf({ lock: null }).join() === 'missing-lockfile');
check('an unreadable lockfile is refused', problemsOf({ lock: '{' }).join() === 'invalid-lockfile');
check('a lockfile without its packages table is refused', problemsOf({ lock: '{"lockfileVersion":3}' }).join() === 'invalid-lockfile');
check('an empty dependency list is refused', problemsOf({ dependencies: {} }).join() === 'no-dependencies');
check('a manifest without dependencies is refused', problemsOf({ manifest: { name: 'gates-kit-sample-toolchain', version: '1.0.0', private: true }, lock: { packages: { '': {} } } }).includes('no-dependencies'));

// Every version that is not one exact version, named with its package.
for (const [label, spec] of [['caret', '^9.39.4'], ['tilde', '~9.39.4'], ['comparator', '>=9.39.4'], ['wildcard', '*'], ['x-range', '9.x'], ['tag', 'latest'], ['alias', 'npm:eslint@9.39.4'], ['path', 'file:../eslint'], ['url', 'https://example.invalid/eslint.tgz'], ['partial', '9.39'], ['empty', ''], ['a leading v', 'v9.39.4'], ['union', '9.39.4 || 10.0.0'], ['hyphen range', '9.39.4 - 10.0.0'], ['four parts', '9.39.4.1']]) {
  check(`a ${label} version is refused and named`, problemsOf({ dependencies: { eslint: spec, typescript: '5.5.4' } }).includes(`range-version:eslint@${spec}`));
}

check('an array holding one exact version is not a version', problemsOf({ manifest: { name: 'gates-kit-sample-toolchain', version: '1.0.0', private: true, dependencies: { eslint: ['9.39.4'] } }, lock: { packages: { '': { dependencies: { eslint: ['9.39.4'] } }, 'node_modules/eslint': { version: '9.39.4' } } } }).some((id) => id.startsWith('range-version')));
check('an inexact version is reported alone, even when the lock resolved a version', problemsOf({ dependencies: { eslint: '^9.39.4', typescript: '5.5.4' }, lock: { packages: { '': { dependencies: { eslint: '^9.39.4', typescript: '5.5.4' } }, 'node_modules/eslint': { version: '9.39.4' }, 'node_modules/typescript': { version: '5.5.4' } } } }).join() === 'range-version:eslint@^9.39.4');
check('every inexact dependency is reported', problemsOf({ dependencies: { eslint: '^9.39.4', typescript: '~5.5.4' } }).filter((id) => id.startsWith('range-version')).length === 2);
check('a non-string version is refused', problemsOf({ manifest: { name: 'gates-kit-sample-toolchain', version: '1.0.0', private: true, dependencies: { eslint: 9 } }, lock: { packages: { '': { dependencies: { eslint: 9 } }, 'node_modules/eslint': { version: '9' } } } }).includes('range-version:eslint@9'));

// Sections and identity.
for (const section of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
  check(`a ${section} section is refused`, problemsOf({ manifest: { ...manifestOf('sample', { eslint: '9.39.4' }), [section]: { x: '1.0.0' } } }).includes(`unexpected-section:${section}`));
}

check('a manifest that is not private is refused', problemsOf({ manifest: { name: 'gates-kit-sample-toolchain', version: '1.0.0', dependencies: { eslint: '9.39.4', typescript: '5.5.4' } } }).includes('not-private'));
check('private false is refused', problemsOf({ manifest: { ...manifestOf('sample', { eslint: '9.39.4', typescript: '5.5.4' }), private: false } }).includes('not-private'));
check('a manifest named for another folder is refused', problemsOf({ manifest: { ...manifestOf('other', { eslint: '9.39.4', typescript: '5.5.4' }) } }).includes('bad-name:gates-kit-sample-toolchain'));
check('a manifest without a name is refused', problemsOf({ manifest: { version: '1.0.0', private: true, dependencies: { eslint: '9.39.4', typescript: '5.5.4' } } }).some((id) => id.startsWith('bad-name')));

// The lockfile against the manifest.
const base = { eslint: '9.39.4', typescript: '5.5.4' };

/** A lock built from `override` entries over the correct one. @es Un lock con entradas cambiadas. */
function lockWith(rootDependencies, entries) {
  const lock = lockOf(manifestOf('sample', base));

  lock.packages[''].dependencies = rootDependencies;
  for (const [key, value] of Object.entries(entries)) {
    if (value === null) delete lock.packages[key];
    else lock.packages[key] = value;
  }

  return lock;
}

check('a lock root with another version is out of sync', problemsOf({ lock: lockWith({ eslint: '9.39.3', typescript: '5.5.4' }, {}) }).includes('lock-out-of-sync'));
check('a lock root with an extra dependency is out of sync', problemsOf({ lock: lockWith({ ...base, extra: '1.0.0' }, {}) }).includes('lock-out-of-sync'));
check('a lock root missing a dependency is out of sync', problemsOf({ lock: lockWith({ eslint: '9.39.4' }, {}) }).includes('lock-out-of-sync'));
check('a lock root with the same entries in another order is in sync', problemsOf({ lock: lockWith({ typescript: '5.5.4', eslint: '9.39.4' }, {}) }).length === 0);
check('a lock without the root entry is out of sync', problemsOf({ lock: lockWith(base, { '': null }) }).includes('lock-out-of-sync'));
check('an absent package entry is named', problemsOf({ lock: lockWith(base, { 'node_modules/eslint': null }) }).includes('lock-missing-package:eslint'));
check('a resolved version other than the pin is named', problemsOf({ lock: lockWith(base, { 'node_modules/eslint': { version: '9.39.3' } }) }).includes('lock-version-mismatch:eslint'));
check('a package entry without a version is a mismatch', problemsOf({ lock: lockWith(base, { 'node_modules/eslint': {} }) }).includes('lock-version-mismatch:eslint'));
check('an intact lock reports neither a mismatch nor a missing entry', !problemsOf({}).some((id) => id.startsWith('lock-')));
check('a defect is reported alone', problemsOf({ lock: lockWith(base, { 'node_modules/eslint': { version: '9.39.3' } }) }).join() === 'lock-version-mismatch:eslint');

// Discovery.
const kit = freshRoot();

build(kit, 'beta');
build(kit, 'alpha');
writeFileSync(path.join(kit, 'toolchains', 'README.md'), 'a plain file\n');

/** The toolchains found under `root`; a throw is reported as one entry so it fails the assertion. @es Las toolchains halladas; un throw falla la aserción. */
function discovered(root, stack) {
  try {
    return discoverToolchains(root, stack);
  } catch (error) {
    return [{ stack: `threw: ${error.message}`, dir: '' }];
  }
}

check('discovery lists the toolchain folders in a stable order', discovered(kit).map((toolchain) => toolchain.stack).join() === 'alpha,beta');
check('discovery names each folder', discovered(kit).every((toolchain) => toolchain.dir === path.join(kit, 'toolchains', toolchain.stack)));
check('discovery honours the stack filter', discovered(kit, 'beta').map((toolchain) => toolchain.stack).join() === 'beta');
check('an unknown stack has no toolchain', discovered(kit, 'nope').length === 0);
check('a kit without a toolchains folder has none', discovered(freshRoot()).length === 0);

// A stack with one toolchain per major.
const majors = freshRoot();

for (const name of ['fw', 'fw-19', 'fw-22', 'fw-x', 'fwx-1', 'other-1']) build(majors, name);

check('a stack discovers its own toolchain and every per-major one', discovered(majors, 'fw').map((toolchain) => toolchain.stack).join() === 'fw,fw-19,fw-22');
check('a toolchain whose suffix is not a number is a stack of its own', discovered(majors, 'fw-x').map((toolchain) => toolchain.stack).join() === 'fw-x');
check('a per-major toolchain is found by its stack, not by a longer prefix', discovered(majors, 'fwx').map((toolchain) => toolchain.stack).join() === 'fwx-1');
check('a per-major toolchain names itself in the result', discovered(majors, 'other').every((toolchain) => toolchain.dir === path.join(majors, 'toolchains', 'other-1')));
check('the stack of angular-21 is angular', stackOfToolchain('angular-21') === 'angular');
check('node-vitest is its own stack', stackOfToolchain('node-vitest') === 'node-vitest');
check('only a trailing major is dropped', stackOfToolchain('a-1-b') === 'a-1-b' && stackOfToolchain('a-1-22') === 'a-1');
check('a plain stack is its own toolchain', stackOfToolchain('nest') === 'nest');

// The package a gate command runs.
check('the launcher call names its package', toolPackageOf(['node', '../../run-tool.mjs', 'eslint', 'eslint', '--max-warnings', '0']) === 'eslint');
check('the launcher is found at any depth', toolPackageOf(['node', '../run-tool.mjs', 'typescript', 'tsc']) === 'typescript');
check('another script names no package', toolPackageOf(['node', 'check-budgets.mjs', '{target}']) === undefined);
check('the launcher without a package names none', toolPackageOf(['node', '../../run-tool.mjs']) === undefined);
check('a launcher not run through node names none', toolPackageOf(['npm', '../../run-tool.mjs', 'eslint']) === undefined);
check('a scoped package is named whole', toolPackageOf(['node', '../../run-tool.mjs', '@stryker-mutator/core', 'stryker', 'run']) === '@stryker-mutator/core');
check('a --cwd folder before the package is skipped', toolPackageOf(['node', '../../run-tool.mjs', '--cwd', '{target}', '@stryker-mutator/core', 'stryker', 'run']) === '@stryker-mutator/core');
check('--cwd without a folder names no package', toolPackageOf(['node', '../../run-tool.mjs', '--cwd']) === undefined);
check('--cwd after the package is the tool\'s own argument', toolPackageOf(['node', '../../run-tool.mjs', 'eslint', 'eslint', '--cwd', 'x']) === 'eslint');
check('a launcher path with Windows separators is found', toolPackageOf(['node', '..\\..\\run-tool.mjs', 'eslint', 'eslint']) === 'eslint');
check('a script merely ending in run-tool.mjs.bak is not the launcher', toolPackageOf(['node', 'run-tool.mjs.bak', 'eslint']) === undefined);
check('the launcher call names the arguments after the package', JSON.stringify(launcherCallOf(['node', '../../run-tool.mjs', 'eslint', 'eslint', '--format', 'stylish'])) === '{"tool":"eslint","args":["eslint","--format","stylish"]}');
check('the launcher call after --cwd starts its arguments after the package', JSON.stringify(launcherCallOf(['node', '../../run-tool.mjs', '--cwd', 'x', 'vitest', 'vitest', 'run'])) === '{"tool":"vitest","args":["vitest","run"]}');
check('a command that is not a launcher call has none', launcherCallOf(['node', 'check.mjs', '{target}']) === undefined);

// A gate against its stack's toolchain.
const coupled = freshRoot();

build(coupled, 'angular', { dependencies: { eslint: '9.39.4' } });

const coupledDir = path.join(coupled, 'toolchains', 'angular');

check('a package the toolchain declares is no problem', gateToolProblems(['node', '../../run-tool.mjs', 'eslint', 'eslint'], coupledDir).length === 0);
check('a package the toolchain does not declare is named', gateToolProblems(['node', '../../run-tool.mjs', 'karma', 'karma'], coupledDir).map((problem) => `${problem.id}:${problem.detail}`).join() === 'tool-not-declared:karma');
check('a stack without a toolchain is refused', gateToolProblems(['node', '../../run-tool.mjs', 'eslint', 'eslint'], path.join(coupled, 'toolchains', 'absent')).map((problem) => problem.id).join() === 'no-toolchain');
check('a command that names no package needs no toolchain', gateToolProblems(['node', 'check.mjs', '{target}'], path.join(coupled, 'toolchains', 'absent')).length === 0);
check('an unreadable toolchain declares nothing', gateToolProblems(['node', '../../run-tool.mjs', 'eslint', 'eslint'], build(freshRoot(), 'broken', { manifest: '{' })).map((problem) => problem.id).join() === 'tool-not-declared');

// The live kit.
const live = discoverToolchains(HERE);

for (const id of ['angular-19', 'angular-20', 'angular-21', 'angular-22', 'nest', 'node-vitest']) check(`the live ${id} toolchain exists`, live.some((toolchain) => toolchain.stack === id));
check('no generic angular toolchain is left beside the per-major ones', !live.some((toolchain) => toolchain.stack === 'angular'));

for (const { stack, dir } of live) {
  const problems = inspectToolchain(dir);

  check(`the live ${stack} toolchain has no problem${problems.length === 0 ? '' : ` (${problems.map((problem) => `${problem.id}${problem.detail === undefined ? '' : `:${problem.detail}`}`).join(',')})`}`, problems.length === 0);
}

const liveGates = discoverGates(HERE);

for (const stack of ['angular', 'nest', 'node-vitest']) check(`the live ${stack} stack holds gates`, liveGates.some((gate) => gate.stack === stack));

for (const { stack, name, dir } of liveGates) {
  const { gate } = inspectGate(dir);
  const family = discoverToolchains(HERE, stack);
  const serving = gate === undefined ? [] : family.filter((toolchain) => gateToolProblems(gate.command, toolchain.dir).length === 0);

  check(`the live gate ${stack}/${name} runs a package some toolchain of its stack declares (${family.length} toolchain(s), ${serving.length} serve it)`, gate !== undefined && family.length > 0 && serving.length > 0);
}

// Every live per-major toolchain serves the gates its test runners need, and nothing serves only by accident.
const runnerGates = { karma: 'karma-coverage-caps', vitest: 'vitest-coverage-caps' };
const servedBy = (gateName, id) => {
  const { gate } = inspectGate(path.join(HERE, 'angular', gateName));

  return gate !== undefined && gateToolProblems(gate.command, path.join(HERE, 'toolchains', id)).length === 0;
};

for (const [id, runners] of [['angular-19', ['karma']], ['angular-20', ['karma', 'vitest']], ['angular-21', ['karma', 'vitest']], ['angular-22', ['karma', 'vitest']]]) {
  for (const [runner, gateName] of Object.entries(runnerGates)) check(`${id} ${runners.includes(runner) ? 'serves' : 'does not serve'} the ${runner} gate`, servedBy(gateName, id) === runners.includes(runner));
}

for (const root of roots) rmSync(root, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`gates-kit toolchain-layout selftest FAILED @es el selftest de toolchain-layout de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit toolchain-layout selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
