#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `project-profile/`: every case runs on a project tree CONSTRUCTED in a temp folder
 * (manifests, `node_modules/<pkg>/package.json`, `angular.json`, lockfiles, `.git`), never on a real checkout.
 *
 * THE STATE SPACE: the root search (nearest manifest, the repository top as a wall, the home directory never a
 * root, a workspace in a child folder, a child without a framework, none at all), installed versus declared
 * versions (hoisted install, declared only, unparseable range), each range form, the framework precedence, the
 * test runners from packages and from the Angular builder, zone.js versus zoneless (polyfill, dependency, a
 * polyfills file), standalone per major, the package manager (field, nearest lockfile), the ESLint config
 * flavour, the gates stack, the support status on each side of every limit, the summary line (EOL, near EOL,
 * comfortable, unknown major, official rules file present or missing, majors outside the matrix, toolchain
 * present or absent), the hook (payload cwd, env fallback, malformed payload, silence, a malfunction reported)
 * and the CLI (exit codes, JSON, a run through a symlinked path).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `project-profile/`: cada caso corre sobre un árbol de proyecto CONSTRUIDO en
 * una carpeta temporal, nunca sobre un checkout real. Recorre la búsqueda de la raíz, versión instalada contra
 * declarada, cada forma de rango, la precedencia de frameworks, los runners, zone.js contra zoneless,
 * standalone por major, el gestor de paquetes, el formato de ESLint, el stack de gates, el estado de soporte a
 * ambos lados de cada límite, la línea resumen, el hook y la CLI.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NEAR_EOL_DAYS, supportOf } from './angular-support.mjs';
import { ancestry, findProjectRoot, frameworkChild, installedVersion, readFacts, readJsonObject } from './facts.mjs';
import { eslintConfigOf, gatesStackOf, lowerBoundOf, majorMinorOf, packageManagerOf, PROFILE_PACKAGES, profileOf, readProfile, runProfileCli, standaloneOf, versionOf, zonelessOf } from './profile.mjs';
import { payloadOf, sessionDirectory, sessionStartOutput } from './session-start.mjs';
import { docsText, factsText, OFFICIAL_RULES_FILE, profileLine, supportText } from './summary-line.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

/** `actual`, or what calling it returns; a throw becomes a checked value, never a crash. @es `actual`, o lo que devuelve al llamarlo; un throw se compara, nunca revienta. */
function settle(actual) {
  if (typeof actual !== 'function') return actual;

  try {
    return actual();
  } catch (error) {
    return `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Compares a value (or a thunk's result) with the expected one. @es Compara un valor (o el resultado de una función) con el esperado. */
function check(name, given, expected) {
  const actual = settle(given);

  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'project-profile-selftest-'));
let counter = 0;

/** A fresh empty folder. @es Una carpeta nueva y vacía. */
function fresh(name = 'case') {
  counter += 1;
  const dir = path.join(scratch, `${name}-${counter}`);

  mkdirSync(dir, { recursive: true });

  return dir;
}

/** Writes `content` (JSON for objects) at `dir/relative`. @es Escribe `content` en `dir/relative`. */
function put(dir, relative, content) {
  const file = path.join(dir, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

/** Marks `dir` as a repository top. @es Marca `dir` como cima de repositorio. */
const repo = (dir) => mkdirSync(path.join(dir, '.git'), { recursive: true });

/** Installs `pkg@version` under `dir/node_modules`. @es Instala `pkg@version` bajo `dir/node_modules`. */
const install = (dir, pkg, version) => put(dir, path.join('node_modules', ...pkg.split('/'), 'package.json'), { name: pkg, version });

/** An Angular workspace file with one project. @es Un `angular.json` con un proyecto. */
const angularJson = ({ build, test, polyfills, projectType = 'application', runner }) => ({
  projects: { app: { projectType, architect: { build: { builder: build, options: polyfills === undefined ? {} : { polyfills } }, test: { builder: test, options: runner === undefined ? {} : { runner } } } } },
});

const HOME = fresh('home');
const read = (dir) => readProfile(dir, { home: HOME });

// --- version text ---
check('majorMinorOf: a full version', majorMinorOf('19.2.14'), { major: 19, minor: 2 });
check('majorMinorOf: a bare major reads minor 0', () => majorMinorOf('19'), { major: 19, minor: 0 });
check('majorMinorOf: a prerelease keeps major.minor', majorMinorOf('21.0.0-rc.1'), { major: 21, minor: 0 });
check('majorMinorOf: text is not a version', [majorMinorOf('latest'), majorMinorOf(''), majorMinorOf(undefined), majorMinorOf('1a.2')], [undefined, undefined, undefined, undefined]);
check('majorMinorOf: a non-numeric minor is not a version', majorMinorOf('19.x'), undefined);
check('lowerBoundOf: caret', lowerBoundOf('^19.2.0'), { major: 19, minor: 2 });
check('lowerBoundOf: tilde', lowerBoundOf('~5.8.2'), { major: 5, minor: 8 });
check('lowerBoundOf: a two-sided range takes its lower bound', lowerBoundOf('>=19.2.14 <20.0.0'), { major: 19, minor: 2 });
check('lowerBoundOf: an x-range', lowerBoundOf('19.x'), { major: 19, minor: 0 });
check('lowerBoundOf: a star minor', lowerBoundOf('20.*'), { major: 20, minor: 0 });
check('lowerBoundOf: a union takes its first member', lowerBoundOf('^18.0.0 || ^19.0.0'), { major: 18, minor: 0 });
check('lowerBoundOf: a v prefix', lowerBoundOf('v5.1.0'), { major: 5, minor: 1 });
check('lowerBoundOf: an exact pin', lowerBoundOf('22.2.1'), { major: 22, minor: 2 });
check('lowerBoundOf: unversionable ranges give nothing', [lowerBoundOf('latest'), lowerBoundOf('workspace:*'), lowerBoundOf('*'), lowerBoundOf('github:a/b'), lowerBoundOf(undefined)], [undefined, undefined, undefined, undefined, undefined]);

// --- versionOf: installed first, then declared ---
check('versionOf: the installed version wins over the range', versionOf({ manifest: { dependencies: { typescript: '~5.5.0' } }, installed: { typescript: '5.8.3' } }, 'typescript'), { major: 5, minor: 8, source: 'installed' });
check('versionOf: an uninstalled package falls back to the declared lower bound', versionOf({ manifest: { devDependencies: { typescript: '~5.8.2' } }, installed: {} }, 'typescript'), { major: 5, minor: 8, source: 'declared' });
check('versionOf: a peer-only package is declared', versionOf({ manifest: { peerDependencies: { '@angular/core': '>=19.2.14 <20.0.0' } }, installed: {} }, '@angular/core'), { major: 19, minor: 2, source: 'declared' });
check('versionOf: an undeclared package has no version even when installed', versionOf({ manifest: {}, installed: { typescript: '5.8.3' } }, 'typescript'), undefined);
check('versionOf: an unversionable range gives nothing', versionOf({ manifest: { dependencies: { typescript: 'latest' } }, installed: {} }, 'typescript'), undefined);
check('versionOf: runtime dependencies are read before dev ones', versionOf({ manifest: { dependencies: { eslint: '^9.1.0' }, devDependencies: { eslint: '^8.0.0' } }, installed: {} }, 'eslint'), { major: 9, minor: 1, source: 'declared' });

// --- pure decisions ---
check('zonelessOf: a zone.js polyfill is zone-based', zonelessOf({ manifest: {} }, { options: { polyfills: ['zone.js'] } }), false);
check('zonelessOf: a zone.js/testing polyfill is zone-based', zonelessOf({ manifest: {} }, { options: { polyfills: ['zone.js/testing'] } }), false);
check('zonelessOf: a string polyfill is read', zonelessOf({ manifest: {} }, { options: { polyfills: 'zone.js' } }), false);
check('zonelessOf: no zone.js anywhere is zoneless', zonelessOf({ manifest: { dependencies: {} } }, { options: { polyfills: [] } }), true);
check('zonelessOf: zone.js declared but loaded some other way is unknown', zonelessOf({ manifest: { dependencies: { 'zone.js': '~0.15.0' } } }, { options: { polyfills: ['src/polyfills.ts'] } }), undefined);
check('zonelessOf: a polyfill merely named like zone.js is not zone.js', zonelessOf({ manifest: {} }, { options: { polyfills: ['zone.jsx'] } }), true);
check('standaloneOf: 19+ default, 14-18 opt-in, older unavailable', [standaloneOf(22), standaloneOf(19), standaloneOf(18), standaloneOf(14), standaloneOf(13)], ['default', 'default', 'opt-in', 'opt-in', 'unavailable']);
check('packageManagerOf: the packageManager field wins', packageManagerOf({ manifest: { packageManager: 'pnpm@9.1.0' }, lockfiles: ['package-lock.json'] }, { 'package-lock.json': 'npm' }), 'pnpm');
check('packageManagerOf: else the nearest lockfile', packageManagerOf({ manifest: {}, lockfiles: ['yarn.lock', 'package-lock.json'] }, { 'yarn.lock': 'yarn', 'package-lock.json': 'npm' }), 'yarn');
check('packageManagerOf: a field without a version is not read', packageManagerOf({ manifest: { packageManager: 'pnpm' }, lockfiles: [] }, {}), undefined);
check('packageManagerOf: nothing known', packageManagerOf({ manifest: {}, lockfiles: [] }, {}), undefined);
check('eslintConfigOf: flat, eslintrc, none', [eslintConfigOf(['eslint.config.mjs']), eslintConfigOf(['.eslintrc.json']), eslintConfigOf(['package.json']), eslintConfigOf(undefined)], ['flat', 'eslintrc', undefined, undefined]);
check('eslintConfigOf: flat wins when both exist', eslintConfigOf(['.eslintrc.json', 'eslint.config.js']), 'flat');
check('gatesStackOf: angular, nest, node+vitest, none', [gatesStackOf('angular', []), gatesStackOf('nest', ['jest']), gatesStackOf('node', ['vitest']), gatesStackOf('node', ['jest']), gatesStackOf('react', ['vitest'])], ['angular', 'nest', 'node-vitest', undefined, undefined]);
check('profileOf: no facts, no profile', profileOf(undefined), undefined);
check('PROFILE_PACKAGES: reads the Angular core, CLI and zone.js', ['@angular/core', '@angular/cli', 'zone.js', 'typescript', 'eslint', 'karma', 'vitest'].every((pkg) => PROFILE_PACKAGES.includes(pkg)), true);

// --- framework precedence and runners, from facts ---
const factsWith = (manifest, extra = {}) => ({ root: '/p', start: '/p', manifest, installed: {}, rootFiles: [], lockfiles: [], ...extra });

check('framework: Angular wins over everything', profileOf(factsWith({ dependencies: { '@angular/core': '^20.0.0', next: '^15.0.0', react: '^19.0.0', '@nestjs/core': '^11.0.0' } })).framework, 'angular');
check('framework: Next.js wins over React', profileOf(factsWith({ dependencies: { next: '^15.0.0', react: '^19.0.0' } })).framework, 'next');
check('framework: React', profileOf(factsWith({ dependencies: { react: '^19.1.0' } })).frameworkLabel, 'React');
check('framework: Vue', profileOf(factsWith({ dependencies: { vue: '^3.5.0' } })).framework, 'vue');
check('framework: NestJS', profileOf(factsWith({ dependencies: { '@nestjs/core': '^11.0.0' } })).framework, 'nest');
check('framework: plain Node', [profileOf(factsWith({ dependencies: { express: '^5.0.0' } })).framework, profileOf(factsWith({})).frameworkLabel], ['node', 'Node']);
check('runners: every declared runner, in a fixed order', profileOf(factsWith({ devDependencies: { vitest: '^3.0.0', 'jasmine-core': '^5.0.0', karma: '^6.0.0', jest: '^30.0.0' } })).testRunners, ['karma', 'jasmine', 'jest', 'vitest']);
check('runners: the Angular unit-test builder means Vitest by default', profileOf(factsWith({ dependencies: { '@angular/core': '^21.0.0' } }, { angularJson: angularJson({ build: '@angular/build:application', test: '@angular/build:unit-test' }) })).testRunners, ['vitest']);
check('runners: the unit-test builder honours its runner option', profileOf(factsWith({ dependencies: { '@angular/core': '^21.0.0' } }, { angularJson: angularJson({ build: '@angular/build:application', test: '@angular/build:unit-test', runner: 'karma' }) })).testRunners, ['karma']);
check('runners: a karma builder counts once with the karma package', profileOf(factsWith({ dependencies: { '@angular/core': '^19.0.0' }, devDependencies: { karma: '~6.4.0', 'jasmine-core': '~5.1.0' } }, { angularJson: angularJson({ build: 'x', test: '@angular-devkit/build-angular:karma' }) })).testRunners, ['karma', 'jasmine']);
check('runners: a karma builder alone names Karma', profileOf(factsWith({ dependencies: { '@angular/core': '^19.0.0' } }, { angularJson: angularJson({ build: 'x', test: '@angular/build:karma' }) })).testRunners, ['karma']);
check('runners: a jest builder', profileOf(factsWith({ dependencies: { '@angular/core': '^18.0.0' } }, { angularJson: angularJson({ build: 'x', test: '@angular-builders/jest:jest' }) })).testRunners, ['jest']);
check('runners: a non-Angular project ignores an angular.json', profileOf(factsWith({ dependencies: { react: '^19.0.0' } }, { angularJson: angularJson({ build: 'x', test: 'y:karma' }) })).testRunners, []);
check('angular: the application project is described, not the library', profileOf(factsWith({ dependencies: { '@angular/core': '^19.0.0' } }, { angularJson: { projects: { lib: { projectType: 'library', architect: { build: { builder: 'ng-packagr' } } }, app: { projectType: 'application', architect: { build: { builder: 'app-builder' } } } } } })).angular.build, 'app-builder');
check('angular: a library-only workspace is described by its library', profileOf(factsWith({ dependencies: { '@angular/core': '^19.0.0' } }, { angularJson: { projects: { lib: { projectType: 'library', targets: { build: { builder: 'ng-packagr' } } } } } })).angular, { build: 'ng-packagr', test: undefined, projectType: 'library', cli: undefined, zoneless: true, standalone: 'default' });
check('angular: no framework version leaves standalone unknown', profileOf(factsWith({ dependencies: { '@angular/core': 'latest' } })).angular.standalone, undefined);
check('non-Angular: no Angular block', profileOf(factsWith({ dependencies: { react: '^19.0.0' } })).angular, undefined);
check('agent files: those present at the root are listed', profileOf(factsWith({}, { rootFiles: ['CLAUDE.md', '.mcp.json', 'src', 'AGENTS.md'] })).agentFiles, ['CLAUDE.md', 'AGENTS.md', '.mcp.json']);
check('relativeRoot: a root below the start is named', profileOf(factsWith({}, { root: path.join(scratch, 'w', 'fe'), start: path.join(scratch, 'w') })).relativeRoot, 'fe');
check('relativeRoot: a root above the start is not', profileOf(factsWith({}, { root: path.join(scratch, 'w'), start: path.join(scratch, 'w', 'src') })).relativeRoot, undefined);
check('relativeRoot: the start itself is not', profileOf(factsWith({}, { root: path.join(scratch, 'w'), start: path.join(scratch, 'w') })).relativeRoot, undefined);

// --- the root search on disk ---
{
  const app = fresh('ng19');

  repo(app);
  put(app, 'package.json', { dependencies: { '@angular/core': '^19.2.0', 'zone.js': '~0.15.0' }, devDependencies: { typescript: '~5.8.2', karma: '~6.4.0', 'jasmine-core': '~5.6.0', eslint: '^9.20.0', '@angular/cli': '^19.2.0' } });
  install(app, '@angular/core', '19.2.14');
  install(app, 'typescript', '5.8.3');
  install(app, '@angular/cli', '19.2.15');
  put(app, 'angular.json', angularJson({ build: '@angular-devkit/build-angular:application', test: '@angular-devkit/build-angular:karma', polyfills: ['zone.js'] }));
  put(app, 'package-lock.json', '{}');
  put(app, 'eslint.config.js', '');
  put(app, 'src/app/app.component.ts', '');

  const profile = read(path.join(app, 'src', 'app'));

  check('ng19: found from a nested folder', profile.root, app);
  check('ng19: installed Angular', profile.frameworkVersion, { major: 19, minor: 2, source: 'installed' });
  check('ng19: installed TypeScript', profile.typescript, { major: 5, minor: 8, source: 'installed' });
  check('ng19: declared-only ESLint', profile.eslint, { major: 9, minor: 20, source: 'declared' });
  check('ng19: the rest of the profile', [profile.testRunners, profile.eslintConfig, profile.packageManager, profile.gatesStack, profile.angular], [['karma', 'jasmine'], 'flat', 'npm', 'angular', { build: '@angular-devkit/build-angular:application', test: '@angular-devkit/build-angular:karma', projectType: 'application', cli: { major: 19, minor: 2, source: 'installed' }, zoneless: false, standalone: 'default' }]);
  check('ng19: started below the root, so no relative root', profile.relativeRoot, undefined);

  const line = profileLine(profile, { home: HOME, today: '2026-10-06', exists: () => false });

  check('ng19 line: facts first', line.startsWith('Profile: Angular 19.2 · TS 5.8 · Karma+Jasmine · ESLint 9 flat · @angular-devkit/build-angular:application · zone.js · npm. '), true);
  check('ng19 line: EOL with its date and the next major', line.includes('Angular 19 is END OF LIFE since 2026-05-19 (no security patches): plan the update to v20.'), true);
  check('ng19 line: the v19 column and the full-source file', line.includes('Apply column v19 of ~/.claude/rules/fe-angular.md; docs: ~/.claude/skills/angular-best-practices/versions/v19.md (full source'), true);
  check('ng19 line: no toolchain sentence when the toolchain is absent', line.includes('Gates toolchain'), false);
  check('ng19 line: the Spanish mirror, accents intact', line.includes(' @es Angular 19 está FUERA DE SOPORTE desde el 2026-05-19 (sin parches de seguridad): planificar la actualización a v20.'), true);
  check('ng19 line: a toolchain that exists is named', profileLine(profile, { home: HOME, today: '2026-10-06', exists: (file) => file === path.join(HOME, '.claude', 'gates-kit', 'toolchains', 'angular', 'package.json') }).includes('Gates toolchain: ~/.claude/gates-kit/toolchains/angular.'), true);
  check('ng19 line: one line', line.includes('\n'), false);

  const parent = path.dirname(app);

  put(parent, 'stray/package.json', { dependencies: { react: '^19.0.0' } });
  check('the repository top is a wall: a parent manifest is never the project', findProjectRoot(path.join(app, 'src'), { home: HOME })?.root, app);
}

{
  const top = fresh('workspace');

  repo(top);
  put(top, 'docs/package.json', { dependencies: { vitepress: '^1.0.0' } });
  put(top, 'Discovery-FE/package.json', { dependencies: { '@angular/core': '^19.2.0' } });
  install(top, '@angular/core', '19.2.20');

  const profile = read(top);

  check('workspace: the child with a framework is the project', profile?.root, path.join(top, 'Discovery-FE'));
  check('workspace: the relative root is named', profile?.relativeRoot, 'Discovery-FE');
  check('workspace: a hoisted install at the repository top is found', profile?.frameworkVersion, { major: 19, minor: 2, source: 'installed' });
  check('workspace: the line names the subfolder', () => profileLine(profile, { home: HOME, today: '2026-10-06', exists: () => false }).startsWith('Profile (Discovery-FE/): Angular 19.2'), true);
  check('workspace: children are only tried from a repository top', findProjectRoot(path.join(top, 'docs', 'x'), { home: HOME, preferred: ['@angular/core'] })?.root, path.join(top, 'docs'));
}

{
  const top = fresh('nofw');

  repo(top);
  put(top, 'tools/package.json', { dependencies: { chalk: '^5.0.0' } });
  check('a repository whose children name no framework is no project', read(top), undefined);

  const skipped = fresh('skipped');

  repo(skipped);
  put(skipped, 'node_modules/package.json', { dependencies: { '@angular/core': '^19.0.0' } });
  put(skipped, '.hidden/package.json', { dependencies: { '@angular/core': '^19.0.0' } });
  check('node_modules and dot folders are never a project child', read(skipped), undefined);

  const empty = fresh('empty');

  repo(empty);
  check('an empty repository is no project', read(empty), undefined);
}

{
  const home = fresh('home-root');

  put(home, 'package.json', { dependencies: { react: '^19.0.0' } });
  mkdirSync(path.join(home, 'work', 'notes'), { recursive: true });
  check('the home directory is never the project', readProfile(path.join(home, 'work', 'notes'), { home }), undefined);
  check('ancestry stops below the home', ancestry(path.join(home, 'work', 'notes'), home), [path.join(home, 'work', 'notes'), path.join(home, 'work')]);
  check('ancestry from the home itself is empty', ancestry(home, home), []);
  check('ancestry stops at a repository top', (() => {
    const top = fresh('anc');

    repo(top);
    mkdirSync(path.join(top, 'a'), { recursive: true });

    return ancestry(path.join(top, 'a'), HOME).length;
  })(), 2);
}

{
  const app = fresh('ng21');

  repo(app);
  put(app, 'package.json', { packageManager: 'pnpm@9.12.0', dependencies: { '@angular/core': '^21.2.0' }, devDependencies: { typescript: '~5.9.0', vitest: '^4.0.0' } });
  install(app, '@angular/core', '21.2.3');
  put(app, 'angular.json', angularJson({ build: '@angular/build:application', test: '@angular/build:unit-test', polyfills: [] }));
  put(app, 'package-lock.json', '{}');

  const profile = read(app);
  const official = path.join(app, OFFICIAL_RULES_FILE);

  check('ng21: zoneless, Vitest, pnpm from the field', [profile.angular.zoneless, profile.testRunners, profile.packageManager], [true, ['vitest'], 'pnpm']);
  check('ng21 line: no support sentence while in LTS', profileLine(profile, { home: HOME, today: '2026-10-06', exists: () => false }).includes('support ends'), false);
  check('ng21 line: the official rules file first when installed', profileLine(profile, { home: HOME, today: '2026-10-06', exists: (file) => file === official }).includes(`read ${official} first (official rules for this exact version), then the delta ~/.claude/skills/angular-best-practices/versions/v21.md`), true);
  check('ng21 line: a missing official file is said, with the fallback', profileLine(profile, { home: HOME, today: '2026-10-06', exists: () => false }).includes(`official rules file missing (${OFFICIAL_RULES_FILE}: dependencies not installed)`), true);
  check('ng21 facts: zoneless named', factsText(profile).includes('· zoneless ·'), true);
}

{
  const lib = fresh('lib');

  put(lib, 'package.json', { peerDependencies: { '@angular/core': '>=19.2.14 <20.0.0' } });
  check('outside a repository the nearest manifest is still the project', read(lib)?.frameworkVersion, { major: 19, minor: 2, source: 'declared' });
  check('declared-only facts text', factsText(read(lib)), 'Angular 19.2 (declared, not installed) · zoneless');
}

{
  const nodeLib = fresh('nodelib');

  repo(nodeLib);
  put(nodeLib, 'package.json', { devDependencies: { vitest: '^3.2.0', typescript: '^5.9.0' } });
  put(nodeLib, 'yarn.lock', '');

  const profile = read(nodeLib);

  check('node lib: the vitest toolchain and yarn', [profile.framework, profile.gatesStack, profile.packageManager], ['node', 'node-vitest', 'yarn']);
  check('node lib line: the generic rules sentence', profileLine(profile, { home: HOME, today: '2026-10-06', exists: () => false }), 'Profile: Node · TS 5.9 (declared, not installed) · Vitest · yarn. Apply the matching ~/.claude/rules/fe-*.md for the files you touch. @es Aplicar las ~/.claude/rules/fe-*.md que correspondan a los ficheros que se toquen.');
}

{
  const hoisted = fresh('hoist');

  repo(hoisted);
  install(hoisted, 'typescript', '5.7.2');
  put(hoisted, 'packages/app/package.json', { devDependencies: { typescript: '^5.0.0' } });
  check('installedVersion: walks up to the repository top', installedVersion('typescript', ancestry(path.join(hoisted, 'packages', 'app'), HOME)), '5.7.2');
  check('installedVersion: nothing installed', installedVersion('eslint', ancestry(path.join(hoisted, 'packages', 'app'), HOME)), undefined);
  put(hoisted, 'packages/app/node_modules/typescript/package.json', '{ not json');
  check('installedVersion: a malformed nearer manifest is skipped, the farther one read', installedVersion('typescript', ancestry(path.join(hoisted, 'packages', 'app'), HOME)), '5.7.2');
  check('readFacts: only declared packages are read', Object.keys(readFacts(path.join(hoisted, 'packages', 'app'), { home: HOME, packages: ['typescript', 'eslint'] }).installed), ['typescript']);
  check('readFacts: lockfiles nearest first across the chain', (() => {
    put(hoisted, 'pnpm-lock.yaml', '');
    put(hoisted, 'packages/app/package-lock.json', '{}');

    return readFacts(path.join(hoisted, 'packages', 'app'), { home: HOME }).lockfiles;
  })(), ['package-lock.json', 'pnpm-lock.yaml']);

  const broken = fresh('broken');

  put(broken, 'package.json', '{ nope');
  check('a malformed manifest still marks a JS project, with nothing declared', read(broken)?.framework, 'node');
}

{
  const mono = fresh('mono');

  repo(mono);
  put(mono, 'package.json', { devDependencies: { typescript: '^5.0.0' } });
  put(mono, 'packages/app/package.json', { dependencies: { react: '^19.1.0' } });
  check('the NEAREST manifest is the project, not the repository root one', read(path.join(mono, 'packages', 'app', 'src'))?.root, path.join(mono, 'packages', 'app'));

  const loose = fresh('loose');

  put(loose, 'fe/package.json', { dependencies: { '@angular/core': '^19.0.0' } });
  check('children are tried only from a repository top', read(loose), undefined);

  for (const order of [['zeta', 'mid', 'alpha', 'omega', 'beta'], ['alpha', 'beta', 'mid', 'omega', 'zeta'], ['omega', 'alpha', 'zeta', 'beta', 'mid']]) {
    const several = fresh('several');

    repo(several);

    for (const name of order) put(several, `${name}/package.json`, { dependencies: { react: '^19.0.0' } });
    check(`several framed children, created ${order.join(',')}: the first by name wins`, read(several)?.relativeRoot, 'alpha');
  }

  const peer = fresh('peer');

  repo(peer);
  put(peer, 'lib/package.json', { peerDependencies: { '@angular/core': '^20.0.0' } });
  install(peer, '@angular/core', '20.3.1');
  check('a peer-only child is framed, and its peer is read as installed', read(peer)?.frameworkVersion, { major: 20, minor: 3, source: 'installed' });

  const undeclared = fresh('undeclared');

  repo(undeclared);
  put(undeclared, 'package.json', { devDependencies: { typescript: '^5.0.0' } });
  install(undeclared, 'typescript', '5.9.2');
  install(undeclared, 'eslint', '9.30.0');
  check('readFacts: an installed but undeclared package is not read', Object.keys(readFacts(undeclared, { home: HOME, packages: ['typescript', 'eslint'] }).installed), ['typescript']);

  const bom = fresh('bom');

  put(bom, 'package.json', `﻿${JSON.stringify({ dependencies: { vue: '^3.5.0' } })}`);
  check('a manifest with a UTF-8 BOM is read', read(bom)?.framework, 'vue');

  const list = fresh('list');

  put(list, 'package.json', '[1, 2]');
  check('readJsonObject: an array is not a manifest', readJsonObject(path.join(list, 'package.json')), undefined);
  check('readJsonObject: a missing file is undefined', readJsonObject(path.join(list, 'absent.json')), undefined);

  const react = fresh('react');

  repo(react);
  put(react, 'package.json', { dependencies: { react: '^19.1.0' } });
  check('a React project gets the generic sentence, no Angular support or docs', profileLine(read(react), { home: HOME, today: '2026-10-06', exists: () => false }), 'Profile: React 19.1 (declared, not installed). Apply the matching ~/.claude/rules/fe-*.md for the files you touch. @es Aplicar las ~/.claude/rules/fe-*.md que correspondan a los ficheros que se toquen.');
}

check('frameworkChild: the first BY NAME, whatever the listing order', frameworkChild(['zeta', 'alpha', 'mid'], () => ({ dependencies: { react: '^19.0.0' } }), ['react']), 'alpha');
check('frameworkChild: a child without a manifest or a framework is skipped', frameworkChild(['a', 'b', 'c'], (name) => ({ a: undefined, b: { dependencies: { chalk: '^5.0.0' } }, c: { devDependencies: { react: '^19.0.0' } } })[name], ['react']), 'c');
check('frameworkChild: dot and build folders are skipped', frameworkChild(['.cache', 'node_modules', 'dist', 'coverage'], () => ({ dependencies: { react: '^19.0.0' } }), ['react']), undefined);

// --- support status ---
check('support: 19 on its last day is near its end', supportOf(19, '2026-05-19'), { status: 'near-eol', until: '2026-05-19' });
check('support: 19 the day after is EOL', supportOf(19, '2026-05-20'), { status: 'eol', until: '2026-05-19' });
check('support: 20 exactly NEAR_EOL_DAYS before its end is near', supportOf(20, new Date(Date.parse('2026-11-28') - NEAR_EOL_DAYS * 86_400_000).toISOString().slice(0, 10)).status, 'near-eol');
check('support: 20 one day earlier is plain LTS', supportOf(20, new Date(Date.parse('2026-11-28') - (NEAR_EOL_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)), { status: 'lts', until: '2026-11-28' });
check('support: 20 on 2026-10-06 is near its end', supportOf(20, '2026-10-06'), { status: 'near-eol', until: '2026-11-28' });
check('support: 21 on 2026-10-06 is LTS', supportOf(21, '2026-10-06'), { status: 'lts', until: '2027-06-30' });
check('support: 22 on 2026-10-06 is active', supportOf(22, '2026-10-06'), { status: 'active', until: '2027-06-30' });
check('support: 22 on its last active day is still active', supportOf(22, '2027-06-30').status, 'active');
check('support: an unknown newer major is never assumed supported', supportOf(23, '2026-10-06'), { status: 'unknown', until: undefined });
check('support: an older major is EOL', supportOf(18, '2026-10-06'), { status: 'eol', until: undefined });
check('NEAR_EOL_DAYS is 90', NEAR_EOL_DAYS, 90);

check('supportText: near EOL names the date and the next major', supportText(20, '2026-10-06'), ['Angular 20 support ends 2026-11-28: plan the update to v21.', 'El soporte de Angular 20 termina el 2026-11-28: planificar la actualización a v21.']);
check('supportText: comfortable support says nothing', [supportText(21, '2026-10-06'), supportText(22, '2026-10-06')], [undefined, undefined]);
check('supportText: an older major has no date', () => supportText(18, '2026-10-06')[0], 'Angular 18 is END OF LIFE (no security patches): plan the update to v19.');
check('supportText: an unknown major points at the releases page', () => supportText(23, '2026-10-06')[0].includes('angular.dev/reference/releases'), true);
check('OFFICIAL_RULES_FILE: the path @angular/core ships', OFFICIAL_RULES_FILE, 'node_modules/@angular/core/resources/best-practices.md');

check('docsText: v20 is a full source', docsText(20, { root: '/p', exists: () => true })[0], 'Apply column v20 of ~/.claude/rules/fe-angular.md; docs: ~/.claude/skills/angular-best-practices/versions/v20.md (full source, no official rules file before v21).');
check('docsText: below the matrix uses v19, says so', docsText(18, { root: '/p', exists: () => false })[0].includes('column v19 (nearest; the project is v18, verify each API)'), true);
check('docsText: above the matrix uses v22 and the official file', docsText(23, { root: '/p', exists: () => true })[0], `Apply column v22 (nearest; the project is v23, verify each API) of ~/.claude/rules/fe-angular.md; read ${path.join('/p', OFFICIAL_RULES_FILE)} first (official rules for this exact version), then the delta ~/.claude/skills/angular-best-practices/versions/v22.md.`);
check('docsText: v22 is in the matrix', docsText(22, { root: '/p', exists: () => false })[0].startsWith('Apply column v22 of'), true);
check('docsText: Spanish half', docsText(19, { root: '/p', exists: () => false })[1].startsWith('Aplicar la columna v19 de'), true);

// --- the hook ---
check('sessionDirectory: the payload cwd wins', sessionDirectory({ cwd: '/a' }, { CLAUDE_PROJECT_DIR: '/b' }, '/c'), '/a');
check('sessionDirectory: then CLAUDE_PROJECT_DIR', sessionDirectory({}, { CLAUDE_PROJECT_DIR: '/b' }, '/c'), '/b');
check('sessionDirectory: an empty cwd falls through', sessionDirectory({ cwd: '' }, { CLAUDE_PROJECT_DIR: '/b' }, '/c'), '/b');
check('sessionDirectory: then the process directory', sessionDirectory(undefined, {}, '/c'), '/c');
check('payloadOf: a BOM is tolerated, junk is undefined', [payloadOf('﻿{"cwd":"/x"}'), payloadOf('nope')], [{ cwd: '/x' }, undefined]);

{
  const app = fresh('hook');

  repo(app);
  put(app, 'package.json', { dependencies: { '@angular/core': '^22.2.0' } });

  const outside = fresh('outside');

  repo(outside);

  const output = await sessionStartOutput(JSON.stringify({ cwd: app, hook_event_name: 'SessionStart', source: 'startup' }), { env: {}, cwd: outside, home: HOME, today: '2026-10-06' });

  check('hook: SessionStart additionalContext with the profile line', () => [output.hookSpecificOutput.hookEventName, output.hookSpecificOutput.additionalContext.startsWith('Profile: Angular 22.2 (declared, not installed) · zoneless.')], ['SessionStart', true]);
  check('hook: silent outside a JS/TS project', await sessionStartOutput(JSON.stringify({ cwd: outside }), { env: {}, cwd: outside, home: HOME }), undefined);
  check('hook: a malformed payload falls back to CLAUDE_PROJECT_DIR', (await sessionStartOutput('garbage', { env: { CLAUDE_PROJECT_DIR: app }, cwd: outside, home: HOME, today: '2026-10-06' }))?.hookSpecificOutput?.additionalContext.includes('Angular 22.2'), true);
  check('hook: the payload cwd wins over CLAUDE_PROJECT_DIR', (await sessionStartOutput(JSON.stringify({ cwd: outside }), { env: { CLAUDE_PROJECT_DIR: app }, cwd: app, home: HOME })), undefined);

  const throwing = { get CLAUDE_PROJECT_DIR() { throw new Error('boom'); } };
  const failure = await sessionStartOutput('{}', { env: throwing, cwd: outside, home: HOME });

  check('hook: a malfunction is reported, bilingual, never silent', () => [failure.hookSpecificOutput.additionalContext.startsWith('Project profile could not be measured (boom); versions are UNVERIFIED'), failure.hookSpecificOutput.additionalContext.includes(' @es No se pudo medir')], [true, true]);

  const run = (script, input) => spawnSync(process.execPath, [script], { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' }, cwd: outside });
  const direct = run(path.join(HERE, 'session-start.mjs'), JSON.stringify({ cwd: app }));

  check('hook process: exit 0 and one JSON line', () => [direct.status, JSON.parse(direct.stdout).hookSpecificOutput.hookEventName, direct.stdout.trim().split('\n').length], [0, 'SessionStart', 1]);
  check('hook process: silent and exit 0 outside a project', [run(path.join(HERE, 'session-start.mjs'), JSON.stringify({ cwd: outside })).status, run(path.join(HERE, 'session-start.mjs'), JSON.stringify({ cwd: outside })).stdout], [0, '']);

  const linked = path.join(fresh('link'), 'project-profile');

  symlinkSync(HERE, linked, 'dir');
  check('hook process: runs through a symlinked path too', JSON.parse(run(path.join(linked, 'session-start.mjs'), JSON.stringify({ cwd: app })).stdout || '{}').hookSpecificOutput?.hookEventName, 'SessionStart');
  check('hook process: importing the module runs nothing', spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(path.join(HERE, 'session-start.mjs'))});`], { input: JSON.stringify({ cwd: app }), encoding: 'utf8', cwd: outside }).stdout, '');

  // --- the CLI ---
  const lines = [];
  const write = (line) => lines.push(line);

  check('cli: a project prints its line, exit 0', [await runProfileCli([app], { write, home: HOME }), lines.at(-1).startsWith('Profile: Angular 22.2')], [0, true]);
  const jsonExit = await runProfileCli([app, '--json'], { write, home: HOME });

  check('cli: --json prints the profile', () => [jsonExit, JSON.parse(lines.at(-1)).framework], [0, 'angular']);
  check('cli: no project, exit 1, bilingual', [await runProfileCli([outside], { write, home: HOME }), lines.at(-1).includes(' @es ')], [1, true]);
  check('cli: an unknown flag, exit 2', await runProfileCli(['--yaml'], { write, home: HOME }), 2);
  check('cli: two directories, exit 2', await runProfileCli([app, outside], { write, home: HOME }), 2);

  const cli = spawnSync(process.execPath, [path.join(HERE, 'profile.mjs'), app, '--json'], { encoding: 'utf8' });

  check('cli process: runs as a program', () => [cli.status, JSON.parse(cli.stdout || '{}').frameworkVersion?.major], [0, 22]);
  check('cli process: importing it runs nothing', spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(path.join(HERE, 'profile.mjs'))});`], { encoding: 'utf8', cwd: outside }).stdout, '');
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
