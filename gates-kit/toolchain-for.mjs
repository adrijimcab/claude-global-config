/**
 * Picks the pinned toolchain a project's gates run on, from the project's REAL versions, so a gate grades the
 * code with the TypeScript, lint and test runner the project itself is on rather than with whatever the kit
 * happened to pin last. Pure: it reads no file and no environment; the caller passes the host Node version.
 *
 * Input, `toolchainFor(profile, hostNode)`. Of the profile it reads exactly three fields:
 * - `framework`: `'angular'`, `'nest'` or `'node'`;
 * - `major`: the framework's major as an integer (read for `'angular'` only, where each major has its own
 *   toolchain; Nest and Node have one toolchain each);
 * - `testRunner`: `'karma'`, `'jasmine'`, `'jest'` or `'vitest'`, the runner the project USES. The gate runs
 *   that runner, never the major's default.
 * Other fields (`minor`, `typescript`, `eslintMajor`, ...) are not read: the toolchain pins the TypeScript and
 * ESLint its major supports, and the gates run the kit's own lint configs, never the project's.
 * `hostNode` is the Node version that will run the gates (`process.versions.node` at the call site).
 *
 * Output: `{ ok: true, toolchain, testRunner }` (`toolchain` names `gates-kit/toolchains/<toolchain>/`), or
 * `{ ok: false, reason, detail }`, never a fallback to another toolchain. Reasons:
 * `unsupported-framework`, `unsupported-major` (no toolchain for that Angular major, or the major is not an
 * integer), `unsupported-test-runner` (the toolchain does not pin the runner the project uses; `'jasmine'`
 * without Karma has no gate), `unknown-test-runner` (absent), `node-outside-framework` (the host Node is
 * outside the framework major's own `engines.node`), `node-outside-toolchain` (outside the range every
 * package of the locked toolchain accepts), `unreadable-node` (not one exact version).
 *
 * Decision: an unsupported or unreadable value is refused with its reason, not mapped to a near toolchain; a
 * gate run on the wrong major's TypeScript or runner can go green or red for reasons that are not the code.
 *
 * Sources: Angular TypeScript and Node ranges, `npm view @angular/compiler-cli@<latest> peerDependencies` and
 * `@angular/core@<latest> engines`; Angular 21 is pinned to TypeScript 5.9 because `@angular/build@21.2.25`
 * peers `>=5.9 <6.0` and npm refuses TypeScript 6.0 with it (ERESOLVE, measured); runners from
 * `@schematics/angular` (19 and 20 have no Vitest option in `ng new`, 21 and 22 default to Vitest and still
 * accept Karma; 20 has the experimental `@angular/build:unit-test` Vitest builder). Each `toolchain` Node range
 * is the intersection of every `engines.node` in that toolchain's lockfile, proven by
 * `toolchain-for.selftest.mjs` against the live lockfiles.
 *
 * @es Elige la toolchain fijada sobre la que corren los gates de un proyecto, según sus versiones REALES, para
 * que un gate juzgue el código con el TypeScript, el lint y el runner de tests del propio proyecto. Pura: no
 * lee ficheros ni entorno; quien llama pasa la versión de Node anfitriona. Del perfil lee solo `framework`,
 * `major` (solo para Angular) y `testRunner` (el runner que el proyecto USA; el gate corre ese, nunca el de
 * por defecto de la major). Devuelve `{ ok: true, toolchain, testRunner }` o `{ ok: false, reason, detail }`,
 * nunca un repliegue a otra toolchain. Un valor no soportado o ilegible se rechaza con su motivo.
 */

import { satisfies } from './node-range.mjs';

/** Karma with Jasmine, the runner pair Angular 19 and 20 generate. @es Karma con Jasmine. */
const KARMA = 'karma';
const VITEST = 'vitest';
const JEST = 'jest';

/** Angular 20 and 21 core `engines.node`. @es `engines.node` del core de Angular 20 y 21. */
const ANGULAR_20_21_NODE = '^20.19.0 || ^22.12.0 || >=24.0.0';
/** Every package of the Angular 19 to 21 toolchains (ESLint, dependency-cruiser). @es Todo paquete de las toolchains Angular 19 a 21. */
const ANGULAR_19_21_TOOLCHAIN_NODE = '^22.13.0 || ^24.0.0 || >=26.0.0';

/** One entry per toolchain id. @es Una entrada por toolchain. */
export const TOOLCHAINS = {
  'angular-19': { runners: [KARMA], node: { framework: '^18.19.1 || ^20.11.1 || >=22.0.0', toolchain: ANGULAR_19_21_TOOLCHAIN_NODE } },
  'angular-20': { runners: [KARMA, VITEST], node: { framework: ANGULAR_20_21_NODE, toolchain: ANGULAR_19_21_TOOLCHAIN_NODE } },
  'angular-21': { runners: [KARMA, VITEST], node: { framework: ANGULAR_20_21_NODE, toolchain: ANGULAR_19_21_TOOLCHAIN_NODE } },
  'angular-22': { runners: [KARMA, VITEST], node: { framework: '^22.22.3 || ^24.15.0 || >=26.0.0', toolchain: '^22.22.3 || ^24.15.0 || >=26.0.0' } },
  nest: { runners: [JEST], node: { framework: undefined, toolchain: '^20.19.0 || ^22.13.0 || >=24.0.0' } },
  'node-vitest': { runners: [VITEST], node: { framework: undefined, toolchain: '^22.18.0 || >=24.11.0' } },
};

/** The Angular majors that have a toolchain. @es Las majors de Angular con toolchain. */
export const ANGULAR_MAJORS = [19, 20, 21, 22];

/** Every refusal reason: `[English, Spanish]`. @es Cada motivo de rechazo: `[inglés, español]`. */
export const REFUSALS = {
  'unsupported-framework': ['no gates toolchain for framework {detail}', 'no hay toolchain de gates para el framework {detail}'],
  'unsupported-major': ['no gates toolchain for Angular major {detail} (supported: 19, 20, 21, 22)', 'no hay toolchain de gates para la major {detail} de Angular (soportadas: 19, 20, 21, 22)'],
  'unknown-test-runner': ['the profile names no test runner, so no runner gate can be chosen', 'el perfil no nombra runner de tests, así que no se puede elegir gate de runner'],
  'unsupported-test-runner': ['toolchain {toolchain} does not pin the test runner the project uses ({detail})', 'la toolchain {toolchain} no fija el runner de tests que usa el proyecto ({detail})'],
  'unreadable-node': ['the host Node version {detail} is not one exact version', 'la versión de Node anfitriona {detail} no es una versión exacta'],
  'node-outside-framework': ['host Node {detail} is outside the range the framework major supports ({range})', 'el Node anfitrión {detail} está fuera del rango que soporta la major del framework ({range})'],
  'node-outside-toolchain': ['host Node {detail} is outside the range every package of toolchain {toolchain} accepts ({range})', 'el Node anfitrión {detail} está fuera del rango que aceptan todos los paquetes de la toolchain {toolchain} ({range})'],
};

/** A refusal, carrying what its message needs. @es Un rechazo con lo que necesita su mensaje. */
function refuse(reason, detail, extra = {}) {
  return { ok: false, reason, detail: String(detail), ...extra };
}

/** The toolchain id of a framework and major, or a refusal. @es El id de toolchain, o un rechazo. */
function toolchainIdOf(framework, major) {
  if (framework === 'nest') return 'nest';
  if (framework === 'node') return 'node-vitest';
  if (framework !== 'angular') return refuse('unsupported-framework', framework);
  if (!Number.isInteger(major) || !ANGULAR_MAJORS.includes(major)) return refuse('unsupported-major', major);

  return `angular-${major}`;
}

/** True when `version` satisfies `range`; `undefined` when `version` cannot be read. @es Verdadero si cumple; `undefined` si es ilegible. */
function nodeFits(version, range) {
  try {
    return satisfies(version, range);
  } catch {
    return undefined;
  }
}

/**
 * The toolchain a profile's gates run on, or the reason there is none. See the module header.
 * @es La toolchain de los gates de un perfil, o el motivo de que no haya. Ver la cabecera.
 */
export function toolchainFor(profile, hostNode) {
  const id = toolchainIdOf(profile?.framework, profile?.major);

  if (typeof id !== 'string') return id;

  const { runners, node } = TOOLCHAINS[id];
  const runner = profile.testRunner;

  if (runner === undefined || runner === null || runner === '') return refuse('unknown-test-runner', '');
  if (!runners.includes(runner)) return refuse('unsupported-test-runner', runner, { toolchain: id });

  const frameworkFit = node.framework === undefined ? true : nodeFits(hostNode, node.framework);
  const toolchainFit = nodeFits(hostNode, node.toolchain);

  if (frameworkFit === undefined || toolchainFit === undefined) return refuse('unreadable-node', hostNode);
  if (!frameworkFit) return refuse('node-outside-framework', hostNode, { range: node.framework });
  if (!toolchainFit) return refuse('node-outside-toolchain', hostNode, { toolchain: id, range: node.toolchain });

  return { ok: true, toolchain: id, testRunner: runner };
}

/**
 * The bilingual line for a refusal, English first, then `@es` Spanish.
 * @es La línea bilingüe de un rechazo, inglés y luego `@es` español.
 */
export function describeRefusal(refusal) {
  const entry = REFUSALS[refusal.reason];

  if (entry === undefined) throw new Error(`unknown refusal reason ${refusal.reason} @es motivo de rechazo desconocido ${refusal.reason}`);

  const [english, spanish] = entry.map((half) => half.replace(/\{(\w+)\}/g, (_, key) => String(refusal[key] ?? '')));

  return `${english} @es ${spanish}`;
}
