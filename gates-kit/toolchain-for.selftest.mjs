#!/usr/bin/env node
/**
 * Proof that `toolchainFor` DISCRIMINATES, and that its table tells the truth about the live toolchains.
 * State space: every Angular major with a toolchain and the majors beside them (18, 23), a major that is not an
 * integer (string, fraction, absent); each runner the profile can name against each toolchain (the project's
 * runner wins over the major's default; `jasmine` without Karma and an unknown runner are refused; an absent
 * runner is refused); Nest and Node, and a framework with no toolchain; the host Node at, under and over each
 * range (framework and toolchain refused apart), and an unreadable host Node; a kit range broken in any
 * alternative (its third included) refused as a kit defect on every host, and every kit range read in full
 * with no host version; that a refusal never carries a
 * toolchain to run; every refusal's bilingual line. Against the live kit: every table id is a toolchain folder
 * and every toolchain folder is in the table; each toolchain declares the packages of exactly the runners the
 * table says it pins; the pinned TypeScript lies in the range of its Angular major and angular-eslint has the
 * major of its toolchain; and each toolchain Node range accepts exactly the sample Node versions every
 * `engines.node` of its lockfile accepts.
 *
 * @es Prueba de que `toolchainFor` DISCRIMINA y de que su tabla dice la verdad sobre las toolchains reales:
 * cada major y las vecinas, majors no enteras, cada runner contra cada toolchain (gana el del proyecto), Nest,
 * Node y un framework sin toolchain, el Node anfitrión en, bajo y sobre cada rango, y uno ilegible; un rango
 * del kit roto en cualquier alternativa (la tercera incluida) rechazado como defecto del kit en todo
 * anfitrión, y cada rango del kit leído entero sin versión anfitriona; un rechazo
 * nunca lleva toolchain; cada línea bilingüe. Contra el kit real: ids de la tabla y carpetas coinciden, cada
 * toolchain declara los paquetes de los runners que la tabla dice, el TypeScript fijado está en el rango de su
 * major, angular-eslint tiene la major de su toolchain, y el rango de Node de cada toolchain acepta
 * exactamente las versiones de muestra que acepta todo `engines.node` de su lockfile.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRange, satisfies } from './node-range.mjs';
import { ANGULAR_MAJORS, REFUSALS, TOOLCHAINS, describeRefusal, refusalPair, toolchainFor, toolchainForProfile } from './toolchain-for.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE = '24.15.0';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** `toolchain/runner` or `reason:detail`; a throw is reported so it fails the assertion. @es El resultado en una línea. */
function pick(profile, node = NODE) {
  try {
    const result = toolchainFor(profile, node);

    return result.ok === true ? `${result.toolchain}/${result.testRunner}` : `${result.reason}:${result.detail}${result.toolchain === undefined ? '' : `@${result.toolchain}`}`;
  } catch (error) {
    return `threw:${error.message}`;
  }
}

const angular = (major, testRunner) => ({ framework: 'angular', major, minor: 0, typescript: '5.9.3', testRunner, eslintMajor: 9 });

// Each Angular major, its runners, and the runner of the project winning over the default.
check('Angular 19 with Karma runs on angular-19', pick(angular(19, 'karma')) === 'angular-19/karma');
check('Angular 19 with Vitest is refused: 19 has no Vitest support', pick(angular(19, 'vitest')) === 'unsupported-test-runner:vitest@angular-19');
check('Angular 20 with Karma runs on angular-20', pick(angular(20, 'karma')) === 'angular-20/karma');
check('Angular 20 with Vitest runs Vitest, not the Karma default', pick(angular(20, 'vitest')) === 'angular-20/vitest');
check('Angular 21 with Vitest runs on angular-21', pick(angular(21, 'vitest')) === 'angular-21/vitest');
check('Angular 21 with Karma runs Karma, not the Vitest default', pick(angular(21, 'karma')) === 'angular-21/karma');
check('Angular 22 with Vitest runs on angular-22', pick(angular(22, 'vitest')) === 'angular-22/vitest');
check('Angular 22 with Karma runs Karma', pick(angular(22, 'karma')) === 'angular-22/karma');
check('Angular with Jest is refused, never mapped to Vitest', pick(angular(21, 'jest')) === 'unsupported-test-runner:jest@angular-21');
check('Jasmine without Karma is refused', pick(angular(20, 'jasmine')) === 'unsupported-test-runner:jasmine@angular-20');
check('an unknown runner is refused', pick(angular(21, 'mocha')) === 'unsupported-test-runner:mocha@angular-21');
check('a runner name inherited from Object is refused', pick(angular(21, 'constructor')) === 'unsupported-test-runner:constructor@angular-21');
check('an absent runner is refused', pick(angular(21, undefined)).startsWith('unknown-test-runner'));
check('a null runner is refused', pick(angular(21, null)).startsWith('unknown-test-runner'));
check('an empty runner is refused', pick(angular(21, '')).startsWith('unknown-test-runner'));

// Majors outside the table, never a near one.
check('Angular 18 is refused, not run on angular-19', pick(angular(18, 'karma')) === 'unsupported-major:18');
check('Angular 23 is refused, not run on angular-22', pick(angular(23, 'vitest')) === 'unsupported-major:23');
check('a major given as a string is refused', pick(angular('21', 'vitest')) === 'unsupported-major:21');
check('a fractional major is refused', pick(angular(21.5, 'vitest')) === 'unsupported-major:21.5');
check('an absent major is refused', pick({ framework: 'angular', testRunner: 'vitest' }) === 'unsupported-major:undefined');
check('every supported major has a toolchain entry', ANGULAR_MAJORS.every((major) => TOOLCHAINS[`angular-${major}`] !== undefined));

// Nest, Node and the rest.
check('Nest with Jest runs on nest', pick({ framework: 'nest', major: 12, testRunner: 'jest' }) === 'nest/jest');
check('Nest with Vitest is refused', pick({ framework: 'nest', major: 12, testRunner: 'vitest' }) === 'unsupported-test-runner:vitest@nest');
check('Nest is chosen whatever its major', pick({ framework: 'nest', major: 99, testRunner: 'jest' }) === 'nest/jest');
check('Node with Vitest runs on node-vitest', pick({ framework: 'node', major: 22, testRunner: 'vitest' }) === 'node-vitest/vitest');
check('Node with Jest is refused', pick({ framework: 'node', testRunner: 'jest' }) === 'unsupported-test-runner:jest@node-vitest');
check('React has no toolchain', pick({ framework: 'react', major: 19, testRunner: 'vitest' }) === 'unsupported-framework:react');
check('an absent profile is refused', pick(undefined) === 'unsupported-framework:undefined');
check('a framework name is matched exactly', pick({ framework: 'Angular', major: 21, testRunner: 'vitest' }) === 'unsupported-framework:Angular');

// The host Node, framework and toolchain ranges refused apart.
check('Angular 22 refuses Node 22.22.0, under its framework range', pick(angular(22, 'vitest'), '22.22.0') === 'node-outside-framework:22.22.0');
check('Angular 22 accepts Node 22.22.3', pick(angular(22, 'vitest'), '22.22.3') === 'angular-22/vitest');
check('Angular 22 refuses Node 23', pick(angular(22, 'vitest'), '23.0.0') === 'node-outside-framework:23.0.0');
check('Angular 22 accepts Node 26', pick(angular(22, 'vitest'), '26.0.0') === 'angular-22/vitest');
check('Angular 19 accepts Node 22.13.0', pick(angular(19, 'karma'), '22.13.0') === 'angular-19/karma');
check('Angular 19 on Node 20.11.1 is refused by its toolchain, not its framework', pick(angular(19, 'karma'), '20.11.1') === 'node-outside-toolchain:20.11.1@angular-19');
check('Angular 19 on Node 18.19.1 passes its framework range and is refused by its toolchain', pick(angular(19, 'karma'), '18.19.1') === 'node-outside-toolchain:18.19.1@angular-19');
check('Angular 19 on Node 18.18.0 is refused by its framework first', pick(angular(19, 'karma'), '18.18.0') === 'node-outside-framework:18.18.0');
check('Angular 21 on Node 22.12.0 is refused by its toolchain (ESLint 10 needs 22.13)', pick(angular(21, 'vitest'), '22.12.0') === 'node-outside-toolchain:22.12.0@angular-21');
check('Angular 21 on Node 25 is refused by its toolchain (dependency-cruiser)', pick(angular(21, 'vitest'), '25.0.0') === 'node-outside-toolchain:25.0.0@angular-21');
check('Angular 20 on Node 20.19.0 is refused by its toolchain', pick(angular(20, 'karma'), '20.19.0') === 'node-outside-toolchain:20.19.0@angular-20');
check('Nest on Node 20.19.0 is accepted', pick({ framework: 'nest', testRunner: 'jest' }, '20.19.0') === 'nest/jest');
check('Nest on Node 22.12.0 is refused by its toolchain', pick({ framework: 'nest', testRunner: 'jest' }, '22.12.0') === 'node-outside-toolchain:22.12.0@nest');
check('Node-vitest on Node 22.13.0 is refused by its toolchain', pick({ framework: 'node', testRunner: 'vitest' }, '22.13.0') === 'node-outside-toolchain:22.13.0@node-vitest');
check('Node-vitest on Node 22.18.0 is accepted', pick({ framework: 'node', testRunner: 'vitest' }, '22.18.0') === 'node-vitest/vitest');
check('an unreadable host Node is refused', pick(angular(21, 'vitest'), '22') === 'unreadable-node:22');
check('an absent host Node is refused', toolchainFor(angular(21, 'vitest'), undefined).reason === 'unreadable-node');
// A range the kit's OWN table holds that cannot be read is a defect of the kit, never blamed on the host Node.
// @es Un rango ilegible de la tabla PROPIA del kit es un defecto del kit, nunca se achaca al Node anfitrión.
/** The refusal of `toolchainFor` while `TOOLCHAINS[id].node[field]` holds `range`; the table is restored. @es El rechazo con un rango dañado; la tabla se restaura. */
function withBrokenRange(id, field, range, host = NODE) {
  const node = TOOLCHAINS[id].node;
  const original = node[field];

  node[field] = range;

  try {
    return toolchainFor(angular(Number(id.slice(-2)), 'vitest'), host);
  } finally {
    node[field] = original;
  }
}

{
  const broken = withBrokenRange('angular-21', 'toolchain', 'banana');
  const brokenFramework = withBrokenRange('angular-21', 'framework', '>=banana');

  check('a bad toolchain range in the kit table is a kit defect, not an unreadable host Node', broken.ok === false && broken.reason === 'invalid-kit-range');
  check('a kit defect names the toolchain, the field and the bad range', broken.toolchain === 'angular-21' && broken.range === 'banana' && broken.field === 'toolchain' && broken.detail === 'banana');
  check('a bad framework range in the kit table is a kit defect too', brokenFramework.reason === 'invalid-kit-range' && brokenFramework.field === 'framework' && brokenFramework.range === '>=banana');
  check('an unreadable host Node is still unreadable beside a bad kit range', withBrokenRange('angular-21', 'toolchain', 'banana', '22').reason === 'unreadable-node');
  check('a kit defect from the framework range names its toolchain', brokenFramework.toolchain === 'angular-21');
  check('a kit defect line is bilingual and names the range', (() => { try { const line = describeRefusal(broken); return line.includes(' @es ') && line.includes('banana') && line.includes('angular-21'); } catch { return false; } })());
  // A broken THIRD alternative is a kit defect on every host, also on one the first or second alternative accepts.
  // @es Una TERCERA alternativa rota es un defecto del kit en todo anfitrión, también en uno que acepta la primera o la segunda.
  for (const host of ['22.13.0', '24.15.0', '30.0.0', '18.0.0']) {
    const thirdBroken = withBrokenRange('angular-21', 'toolchain', '^22.13.0 || ^24.0.0 || >=banana', host);

    check(`a broken third alternative of a kit range is a kit defect on Node ${host}`, thirdBroken.reason === 'invalid-kit-range' && thirdBroken.field === 'toolchain');
  }
  check('the table is restored after the broken-range probes', pick(angular(21, 'vitest')) === 'angular-21/vitest');
}

/** True when the range reads in full, with no host version involved. @es Verdadero si el rango se lee entero, sin versión anfitriona. */
function readable(range) {
  try {
    parseRange(range);

    return true;
  } catch {
    return false;
  }
}

const KIT_RANGES = Object.entries(TOOLCHAINS).flatMap(([id, { node }]) => Object.entries(node).filter(([, range]) => range !== undefined).map(([field, range]) => ({ id, field, range })));

check('the kit table holds a Node range to read for every toolchain', new Set(KIT_RANGES.map(({ id }) => id)).size === Object.keys(TOOLCHAINS).length);
for (const { id, field, range } of KIT_RANGES) check(`the ${field} range of ${id} reads in full without a host (${range})`, readable(range));
check('the host-free reader refuses a broken third alternative', !readable('^22.13.0 || ^24.0.0 || >=banana'));

check('a framework refusal names its range',toolchainFor(angular(22, 'vitest'), '22.22.0').range === TOOLCHAINS['angular-22'].node.framework);
check('a toolchain refusal names its range', toolchainFor(angular(21, 'vitest'), '25.0.0').range === TOOLCHAINS['angular-21'].node.toolchain);
check('a refusal carries no toolchain to run', toolchainFor(angular(23, 'vitest'), NODE).ok === false && !('testRunner' in toolchainFor(angular(23, 'vitest'), NODE)));

// Bilingual refusals.
const lines = [toolchainFor(angular(23, 'vitest'), NODE), toolchainFor(angular(19, 'vitest'), NODE), toolchainFor(angular(22, 'vitest'), '22.22.0'), toolchainFor(angular(21, 'vitest'), '25.0.0'), toolchainFor({ framework: 'react' }, NODE), toolchainFor(angular(21), NODE), toolchainFor(angular(21, 'vitest'), 'x')].map((refusal) => {
  try {
    return describeRefusal(refusal);
  } catch (error) {
    return `threw: ${error.message}`;
  }
});

check('every refusal line carries its @es half', lines.length === 7 && lines.every((line) => line.includes(' @es ') && !line.startsWith('threw')));
check('a refusal line names the major', lines[0].includes('23') && lines[0].includes('19, 20, 21, 22'));
check('a refusal line names the toolchain and runner', lines[1].includes('angular-19') && lines[1].includes('vitest'));
check('a Node refusal line names the version and the range', lines[3].includes('25.0.0') && lines[3].includes(TOOLCHAINS['angular-21'].node.toolchain));
check('every refusal reason has both halves', Object.values(REFUSALS).every(([english, spanish]) => english.trim() !== '' && spanish.trim() !== ''));
check('an unknown refusal reason throws', (() => { try { describeRefusal({ reason: 'nope' }); return false; } catch { return true; } })());

// The adapter from the project profile: the runner list and `frameworkVersion.major` become toolchainFor's input.
/** `toolchain/runner` or `reason:detail` for a profile as `project-profile` reports it. @es El resultado en una línea. */
function pickProfile(framework, major, testRunners, node = NODE) {
  const result = toolchainForProfile({ framework, frameworkVersion: major === undefined ? undefined : { major, minor: 0, source: 'installed' }, testRunners }, node);

  return result.ok === true ? `${result.toolchain}/${result.testRunner}` : `${result.reason}:${result.detail}`;
}

check('profile: Angular 19 with Karma and Jasmine is Karma', pickProfile('angular', 19, ['karma', 'jasmine']) === 'angular-19/karma');
check('profile: Jasmine before Karma is still Karma', pickProfile('angular', 19, ['jasmine', 'karma']) === 'angular-19/karma');
check('profile: Angular 21 with Vitest alone is Vitest', pickProfile('angular', 21, ['vitest']) === 'angular-21/vitest');
check('profile: Nest with Jest is Jest', pickProfile('nest', 11, ['jest']) === 'nest/jest');
check('profile: Node with Vitest is Vitest', pickProfile('node', undefined, ['vitest']) === 'node-vitest/vitest');
check('profile: Jasmine without Karma is refused, not read as Karma', pickProfile('angular', 19, ['jasmine']) === 'unsupported-test-runner:jasmine');
check('profile: Karma and Vitest are refused as ambiguous, naming both', pickProfile('angular', 21, ['vitest', 'karma']) === 'ambiguous-test-runner:vitest+karma');
check('profile: Jest and Vitest are refused as ambiguous', pickProfile('node', undefined, ['jest', 'vitest']) === 'ambiguous-test-runner:jest+vitest');
check('profile: Karma, Jasmine and Jest are ambiguous after Jasmine is folded into Karma', pickProfile('angular', 19, ['karma', 'jasmine', 'jest']) === 'ambiguous-test-runner:karma+jest');
check('profile: no runners is refused as unknown', pickProfile('angular', 21, []) === 'unknown-test-runner:');
check('profile: a missing runner list is refused as unknown', toolchainForProfile({ framework: 'nest' }, NODE).reason === 'unknown-test-runner');
check('profile: the framework major picks the Angular toolchain', pickProfile('angular', 20, ['karma']) === 'angular-20/karma' && pickProfile('angular', 22, ['karma']) === 'angular-22/karma');
check('profile: an Angular without a readable major is refused', pickProfile('angular', undefined, ['karma']) === 'unsupported-major:undefined');
check('profile: React has no toolchain', pickProfile('react', 19, ['vitest']) === 'unsupported-framework:react');
check('profile: the host Node is still checked', pickProfile('angular', 21, ['vitest'], '25.0.0') === 'node-outside-toolchain:25.0.0');
check('profile: no profile at all is refused, not thrown', toolchainForProfile(undefined, NODE).ok === false);
check('an ambiguous refusal line names its runners in both halves', refusalPair(toolchainForProfile({ framework: 'node', testRunners: ['jest', 'vitest'] }, NODE)).every((half) => half.includes('jest+vitest')));
check('a refusal pair is [English, Spanish]', refusalPair({ reason: 'unknown-test-runner' }).length === 2 && refusalPair({ reason: 'unknown-test-runner' })[1].startsWith('el perfil'));

// The table against the live toolchains.
const folders = readdirSync(path.join(HERE, 'toolchains'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
/** The pinned dependencies of a live toolchain, `{}` when it has no readable manifest. @es Las dependencias fijadas, `{}` si no hay manifiesto. */
const manifestOf = (id) => {
  try {
    return JSON.parse(readFileSync(path.join(HERE, 'toolchains', id, 'package.json'), 'utf8')).dependencies;
  } catch {
    return {};
  }
};
const RUNNER_PACKAGES = { karma: ['karma', 'karma-jasmine', 'karma-chrome-launcher', 'karma-coverage', 'jasmine-core'], vitest: ['vitest', '@vitest/coverage-v8'], jest: ['jest'] };
/** The TypeScript range of each Angular major's `@angular/compiler-cli` and `@angular/build` peers (npm view, 2026-10-06). @es El rango de TypeScript de cada major. */
const ANGULAR_TYPESCRIPT = { 19: '>=5.5.0 <5.9.0', 20: '>=5.8.0 <6.0.0', 21: '>=5.9.0 <6.0.0', 22: '>=6.0.0 <6.1.0' };
/** The ESLint majors each angular-eslint major peers (npm view, 2026-10-06). @es Las majors de ESLint que admite cada angular-eslint. */
const ANGULAR_ESLINT_PEER = { 19: '^8.57.0 || ^9.0.0', 20: '^8.57.0 || ^9.0.0', 21: '^8.57.0 || ^9.0.0 || ^10.0.0', 22: '^9.0.0 || ^10.0.0' };

check(`the table and the toolchain folders hold the same ids (${folders.join(',')})`, Object.keys(TOOLCHAINS).sort().join() === folders.join());

for (const [id, { runners }] of Object.entries(TOOLCHAINS)) {
  const declared = manifestOf(id);

  for (const [runner, packages] of Object.entries(RUNNER_PACKAGES)) {
    const has = packages.every((name) => declared[name] !== undefined);
    const none = packages.every((name) => declared[name] === undefined);

    check(`${id} ${runners.includes(runner) ? 'declares every' : 'declares no'} ${runner} package`, runners.includes(runner) ? has : none);
  }
}

for (const major of ANGULAR_MAJORS) {
  const declared = manifestOf(`angular-${major}`);

  check(`angular-${major} pins TypeScript ${declared.typescript} inside ${ANGULAR_TYPESCRIPT[major]}`, declared.typescript !== undefined && ANGULAR_TYPESCRIPT[major] !== undefined && satisfies(declared.typescript, ANGULAR_TYPESCRIPT[major]));
  check(`angular-${major} pins angular-eslint of major ${major}`, declared['angular-eslint']?.split('.')[0] === String(major));
  check(`angular-${major} pins an ESLint its angular-eslint accepts (${declared.eslint})`, declared.eslint !== undefined && ANGULAR_ESLINT_PEER[major] !== undefined && satisfies(declared.eslint, ANGULAR_ESLINT_PEER[major]));
}

// Each toolchain Node range is the intersection of its lockfile's engines, over sample versions.
const SAMPLES = ['18.19.1', '20.0.0', '20.11.1', '20.19.0', '21.0.0', '22.0.0', '22.12.0', '22.13.0', '22.18.0', '22.22.0', '22.22.3', '23.0.0', '23.5.0', '24.0.0', '24.11.0', '24.15.0', '25.0.0', '26.0.0', '28.0.0'];

for (const [id, { node }] of Object.entries(TOOLCHAINS)) {
  const packages = JSON.parse(readFileSync(path.join(HERE, 'toolchains', id, 'package-lock.json'), 'utf8')).packages;
  const engines = Object.entries(packages).filter(([key, entry]) => key !== '' && entry.optional !== true && typeof entry.engines?.node === 'string').map(([, entry]) => entry.engines.node);
  const lockAccepts = SAMPLES.filter((version) => engines.every((range) => satisfies(version, range)));

  // An unreadable table range is already a failed check above; it is not weighed against the lockfile.
  // @es Un rango ilegible de la tabla ya es un check fallido arriba; no se compara con el lockfile.
  if (!readable(node.toolchain)) continue;

  const tableAccepts = SAMPLES.filter((version) => satisfies(version, node.toolchain));

  check(`${id} Node range ${node.toolchain} accepts what its lockfile accepts (lock: ${lockAccepts.join(' ')}; table: ${tableAccepts.join(' ')})`, lockAccepts.join() === tableAccepts.join());
}

if (failures.length > 0) {
  console.error(`gates-kit toolchain-for selftest FAILED @es el selftest de toolchain-for de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit toolchain-for selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
