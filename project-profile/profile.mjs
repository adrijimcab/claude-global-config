#!/usr/bin/env node
/**
 * The single source of truth on WHAT a JS/TS project is: framework and its major.minor, TypeScript, the test
 * runners, the ESLint major and config flavour, the Angular builders, zone-based or zoneless change detection,
 * whether standalone is the default, and the package manager. Every rule, skill and gate that depends on the
 * project's version asks this module instead of guessing (a rule saying "OnPush is the default" is wrong in an
 * Angular 19 project; the answer depends on the version actually installed).
 *
 * `profileOf(facts)` is a PURE function of the facts `facts.mjs` reads; `readProfile(dir)` composes the two.
 * Versions come from the INSTALLED package first (`source: 'installed'`) and fall back to the lower bound of
 * the declared range (`source: 'declared'`), because an uninstalled checkout still has a version to honour;
 * an unparseable range (`latest`, `workspace:*`, a URL) gives no version rather than a guess.
 *
 * CLI: `node profile.mjs [dir] [--json]` prints the one-line summary, or the whole profile as JSON. Exit 0 with
 * a profile, 1 when `dir` holds no JS/TS project, 2 on a bad call.
 *
 * @es La fuente única de verdad sobre QUÉ es un proyecto JS/TS: framework y su major.minor, TypeScript, los
 * runners de tests, el major y el formato de config de ESLint, los builders de Angular, detección de cambios
 * con zone.js o zoneless, si standalone es el valor por defecto y el gestor de paquetes. Toda regla, skill y
 * gate que dependa de la versión del proyecto pregunta aquí en lugar de suponer. `profileOf(facts)` es una
 * función PURA de los hechos que lee `facts.mjs`; `readProfile(dir)` compone ambos. Las versiones salen
 * primero del paquete INSTALADO y, si no, de la cota inferior del rango declarado; un rango no interpretable
 * no da versión en vez de una suposición. CLI: `node profile.mjs [dir] [--json]`; sale con 0 si hay perfil,
 * 1 si `dir` no contiene un proyecto JS/TS, 2 ante una llamada inválida.
 */

import { homedir } from 'node:os';
import path from 'node:path';

import { runWhenMain } from '../fleet-kit/lib/hook-io.mjs';
import { LOCKFILES, readFacts } from './facts.mjs';

/** Frameworks in precedence order: the first one a manifest declares names the project. @es Frameworks en orden de precedencia. */
export const FRAMEWORKS = Object.freeze([
  ['angular', '@angular/core', 'Angular'],
  ['next', 'next', 'Next.js'],
  ['react', 'react', 'React'],
  ['vue', 'vue', 'Vue'],
  ['nest', '@nestjs/core', 'NestJS'],
]);

/** Test runners: the package that names each one. @es Runners de tests y el paquete que nombra cada uno. */
export const TEST_RUNNERS = Object.freeze([
  ['karma', 'karma', 'Karma'],
  ['jasmine', 'jasmine-core', 'Jasmine'],
  ['jest', 'jest', 'Jest'],
  ['vitest', 'vitest', 'Vitest'],
]);

/** Every package whose version the profile reads. @es Todo paquete cuya versión lee el perfil. */
export const PROFILE_PACKAGES = Object.freeze([...new Set([...FRAMEWORKS.map(([, pkg]) => pkg), ...TEST_RUNNERS.map(([, pkg]) => pkg), 'typescript', 'eslint', 'zone.js', '@angular/cli', '@angular/build', '@angular-devkit/build-angular'])]);

/** `x.y` (numbers) of a version text that starts with digits, or `undefined`. @es `x.y` de una versión, o `undefined`. */
export function majorMinorOf(text) {
  if (typeof text !== 'string') return undefined;

  const [major, minor = '0'] = text.split('.');
  const isNumber = (part) => part !== '' && [...part].every((character) => character >= '0' && character <= '9');

  return isNumber(major) && isNumber(minor) ? { major: Number(major), minor: Number(minor) } : undefined;
}

/** The lower bound of a declared range (`^19.2.0`, `~5.8.2`, `>=19.2.14 <20`, `19.x`), or `undefined`. @es La cota inferior de un rango declarado, o `undefined`. */
export function lowerBoundOf(range) {
  if (typeof range !== 'string') return undefined;

  const first = range.trim().split('||')[0].trim().split(' ')[0];
  let start = 0;

  while (start < first.length && '^~>=v'.includes(first[start])) start += 1;

  const bare = first.slice(start).split('.').map((part, index) => (index > 0 && (part === 'x' || part === '*') ? '0' : part)).join('.');

  return majorMinorOf(bare);
}

/** The declared range of `pkg` in any dependency section (runtime first), or `undefined`. @es El rango declarado de `pkg`, o `undefined`. */
const declaredRange = (manifest, pkg) => manifest?.dependencies?.[pkg] ?? manifest?.devDependencies?.[pkg] ?? manifest?.peerDependencies?.[pkg];

/** `{ major, minor, source }` of a declared package, or `undefined` when undeclared or unversionable. @es Versión de un paquete declarado, o `undefined`. */
export function versionOf(facts, pkg) {
  const range = declaredRange(facts.manifest, pkg);

  if (range === undefined) return undefined;

  const installed = majorMinorOf(facts.installed?.[pkg]);

  if (installed !== undefined) return { ...installed, source: 'installed' };

  const declared = lowerBoundOf(range);

  return declared === undefined ? undefined : { ...declared, source: 'declared' };
}

/** The Angular workspace project the profile describes: the first application, else the first project. @es El proyecto del workspace de Angular que describe el perfil. */
function angularProjectOf(angularJson) {
  const projects = Object.values(angularJson?.projects ?? {}).filter((project) => project !== null && typeof project === 'object');

  return projects.find((project) => project.projectType === 'application') ?? projects[0];
}

/** The target map of an Angular project (`architect`, or the newer `targets`). @es El mapa de targets de un proyecto de Angular. */
const targetsOf = (project) => project?.architect ?? project?.targets ?? {};

/** The polyfills of a build target as a list. @es Los polyfills de un target de build como lista. */
function polyfillsOf(build) {
  const value = build?.options?.polyfills;

  if (typeof value === 'string') return [value];

  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

/**
 * Zone-based or zoneless: `false` when the build polyfills load `zone.js`; `true` when `zone.js` is neither
 * a polyfill nor a dependency (nothing could load it); `undefined` otherwise (declared but loaded some other
 * way, e.g. a `polyfills.ts` file, which only reading source would tell).
 * @es Con zone.js o zoneless: `false` si los polyfills cargan `zone.js`; `true` si no es ni polyfill ni
 * dependencia; `undefined` en otro caso.
 */
export function zonelessOf(facts, build) {
  const polyfills = polyfillsOf(build);

  if (polyfills.some((entry) => entry === 'zone.js' || entry.startsWith('zone.js/'))) return false;

  return declaredRange(facts.manifest, 'zone.js') === undefined ? true : undefined;
}

/** Standalone-component status for an Angular major. @es Estado de los componentes standalone para un major de Angular. */
export function standaloneOf(major) {
  if (major >= 19) return 'default';

  return major >= 14 ? 'opt-in' : 'unavailable';
}

/** The test runner an Angular `test` target runs through its builder, or `undefined`. @es El runner que corre el target `test` de Angular, o `undefined`. */
function builderRunnerOf(test) {
  const builder = typeof test?.builder === 'string' ? test.builder : '';

  if (builder.endsWith(':karma')) return 'karma';
  if (builder.endsWith(':jest')) return 'jest';
  if (builder.endsWith(':unit-test')) return typeof test.options?.runner === 'string' ? test.options.runner : 'vitest';

  return undefined;
}

/** The package manager: the `packageManager` field, else the nearest lockfile, else `undefined`. @es El gestor de paquetes. */
export function packageManagerOf(facts, lockfileManagers) {
  const field = facts.manifest?.packageManager;

  if (typeof field === 'string' && field.includes('@')) return field.split('@')[0];

  return facts.lockfiles?.map((name) => lockfileManagers[name]).find((manager) => manager !== undefined);
}

/** The ESLint config flavour from the root file names. @es El formato de config de ESLint según los ficheros de la raíz. */
export function eslintConfigOf(rootFiles = []) {
  if (rootFiles.some((name) => name.startsWith('eslint.config.'))) return 'flat';

  return rootFiles.some((name) => name.startsWith('.eslintrc')) ? 'eslintrc' : undefined;
}

/** The Claude Code / agent files a project root may already hold (`ng new --ai-config` writes some). @es Los ficheros de agente que la raíz puede tener ya. */
export const AGENT_FILES = Object.freeze(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json', '.claude']);

/**
 * The profile of a project from its facts, or `undefined` when there are none.
 * @es El perfil de un proyecto a partir de sus hechos, o `undefined` si no los hay.
 */
export function profileOf(facts) {
  if (facts === undefined) return undefined;

  const match = FRAMEWORKS.find(([, pkg]) => declaredRange(facts.manifest, pkg) !== undefined);
  const framework = match === undefined ? 'node' : match[0];
  const project = angularProjectOf(facts.angularJson);
  const targets = targetsOf(project);
  const builderRunner = framework === 'angular' ? builderRunnerOf(targets.test) : undefined;
  const declaredRunners = TEST_RUNNERS.filter(([, pkg]) => declaredRange(facts.manifest, pkg) !== undefined).map(([id]) => id);
  const testRunners = [...new Set([...(builderRunner === undefined ? [] : [builderRunner]), ...declaredRunners])];
  const frameworkVersion = match === undefined ? undefined : versionOf(facts, match[1]);
  const angular = framework === 'angular'
    ? {
        build: typeof targets.build?.builder === 'string' ? targets.build.builder : undefined,
        test: typeof targets.test?.builder === 'string' ? targets.test.builder : undefined,
        projectType: typeof project?.projectType === 'string' ? project.projectType : undefined,
        cli: versionOf(facts, '@angular/cli'),
        zoneless: zonelessOf(facts, targets.build),
        standalone: frameworkVersion === undefined ? undefined : standaloneOf(frameworkVersion.major),
      }
    : undefined;

  const below = facts.start === undefined ? '' : path.relative(facts.start, facts.root);

  return {
    root: facts.root,
    relativeRoot: below !== '' && !below.startsWith('..') ? below.split(path.sep).join('/') : undefined,
    framework,
    frameworkLabel: match === undefined ? 'Node' : match[2],
    frameworkVersion,
    typescript: versionOf(facts, 'typescript'),
    testRunners,
    eslint: versionOf(facts, 'eslint'),
    eslintConfig: eslintConfigOf(facts.rootFiles),
    angular,
    packageManager: packageManagerOf(facts, LOCKFILES),
    agentFiles: AGENT_FILES.filter((name) => facts.rootFiles?.includes(name)),
  };
}

/** The profile of the project holding `dir`, read from disk. @es El perfil del proyecto que contiene `dir`, leído del disco. */
export function readProfile(dir, { home = homedir() } = {}) {
  return profileOf(readFacts(dir, { home, packages: PROFILE_PACKAGES, preferred: FRAMEWORKS.map(([, pkg]) => pkg) }));
}

/** The CLI: prints the summary line or the JSON profile; returns the exit code. @es La CLI: imprime la línea resumen o el perfil JSON; devuelve el código de salida. */
export async function runProfileCli(argv, { write = (line) => process.stdout.write(`${line}\n`), home = homedir() } = {}) {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const positional = argv.filter((arg) => !arg.startsWith('--'));

  if (flags.some((flag) => flag !== '--json') || positional.length > 1) {
    write('Usage: node profile.mjs [dir] [--json] @es Uso: node profile.mjs [dir] [--json]');

    return 2;
  }

  const profile = readProfile(positional[0] ?? process.cwd(), { home });

  if (profile === undefined) {
    write('No JS/TS project here (no package.json up to the repository top). @es No hay proyecto JS/TS aquí (ningún package.json hasta la cima del repositorio).');

    return 1;
  }

  const { profileLine } = await import('./summary-line.mjs');

  write(flags.includes('--json') ? JSON.stringify(profile, null, 2) : profileLine(profile, { home }));

  return 0;
}

runWhenMain(import.meta.url, async () => {
  process.exitCode = await runProfileCli(process.argv.slice(2));
});
