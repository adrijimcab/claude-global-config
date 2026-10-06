/**
 * Owns the SHAPE of a toolchain: which toolchains the kit holds and whether each one is reproducible. A
 * toolchain is `gates-kit/toolchains/<stack>/` with a `package.json` and a `package-lock.json`. The manifest
 * is private, named `gates-kit-<stack>-toolchain`, and pins every package in `dependencies` to ONE exact
 * version (no range, tag, alias, path or URL), because a gate that runs on whatever version an install
 * happened to resolve can go green or red for reasons that are not the code it grades. No other dependency
 * section is allowed: one install set, in one place. The lockfile must agree with the manifest: its root
 * lists the same dependencies, and each package entry resolves to the pinned version.
 *
 * Decision: a defect is reported alone, so one wrong part never hides behind another; a manifest or lockfile
 * that cannot be read stops every comparison that needs it (a comparison against nothing decides nothing).
 * The same module owns the link between a gate and its toolchain: the package a gate's command runs through
 * `run-tool.mjs` must be one its stack's toolchain declares, so a gate cannot point at a tool nobody installs.
 *
 * @es Responde por la FORMA de una toolchain: cuáles tiene el kit y si cada una es reproducible. Una toolchain
 * es `gates-kit/toolchains/<stack>/` con `package.json` y `package-lock.json`. El manifiesto es privado, se
 * llama `gates-kit-<stack>-toolchain` y fija cada paquete de `dependencies` a UNA versión exacta (sin rango,
 * etiqueta, alias, ruta ni URL), porque un gate que corre con la versión que una instalación resolvió puede
 * ponerse verde o rojo por motivos ajenos al código que juzga. No se admite otra sección de dependencias. El
 * lockfile debe concordar con el manifiesto: su raíz lista las mismas dependencias y cada paquete resuelve a
 * la versión fijada. Cada defecto se informa solo; un manifiesto o lockfile ilegible detiene las
 * comparaciones que lo necesitan. El módulo también responde por el vínculo gate-toolchain: el paquete que el
 * comando de un gate ejecuta con `run-tool.mjs` debe estar declarado en la toolchain de su stack.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { TOOLCHAINS_FOLDER, stackOfToolchain, toolPackageOf, toolchainOf } from './gate-layout.mjs';

/** One exact version, a prerelease allowed. @es Una versión exacta, prerelease permitido. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Dependency sections other than `dependencies`. @es Secciones de dependencias distintas de `dependencies`. */
const OTHER_SECTIONS = ['devDependencies', 'optionalDependencies', 'peerDependencies'];

const MANIFEST_FILE = 'package.json';
const LOCK_FILE = 'package-lock.json';

function subdirectories(dir) {
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/**
 * The toolchains under `root`, optionally of one stack (its own `toolchains/<stack>/` and every per-major
 * `toolchains/<stack>-<major>/`), each `{ stack, dir }` where `stack` is the toolchain id.
 * @es Las toolchains bajo `root`, opcionalmente de un stack (la suya y cada una por major), cada una con su id.
 */
export function discoverToolchains(root, stack) {
  const base = path.join(root, TOOLCHAINS_FOLDER);

  if (!existsSync(base)) return [];

  return subdirectories(base).filter((name) => stack === undefined || stackOfToolchain(name) === stack).map((name) => ({ stack: name, dir: toolchainOf(root, name) }));
}

/** The parsed JSON file, `undefined` when absent, `null` when it is not an object. @es El JSON leído; `undefined` ausente, `null` si no es un objeto. */
function readJson(file) {
  if (!existsSync(file)) return undefined;

  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));

    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** True when `spec` is one exact version. @es Verdadero si `spec` es una versión exacta. */
function isExactVersion(spec) {
  return typeof spec === 'string' && EXACT_VERSION.test(spec);
}

/** True when both dependency tables hold the same names with the same specs. @es Verdadero si ambas tablas son iguales. */
function sameDependencies(left = {}, right) {
  const names = Object.keys(left);

  return names.length === Object.keys(right).length && names.every((name) => left[name] === right[name]);
}

/** True when the lockfile holds a `packages` table. @es Verdadero si el lockfile tiene una tabla `packages`. */
function hasPackages(lock) {
  return lock !== undefined && lock !== null && typeof lock.packages === 'object' && lock.packages !== null;
}

/** Problems of the manifest alone, `dependencies` being its pinned table. @es Problemas del manifiesto solo. */
function manifestProblems(manifest, dependencies, stack) {
  const problems = [];
  const expectedName = `gates-kit-${stack}-toolchain`;

  if (manifest.name !== expectedName) problems.push({ id: 'bad-name', detail: expectedName });
  if (manifest.private !== true) problems.push({ id: 'not-private' });

  for (const section of OTHER_SECTIONS) if (manifest[section] !== undefined) problems.push({ id: 'unexpected-section', detail: section });

  if (Object.keys(dependencies).length === 0) problems.push({ id: 'no-dependencies' });

  for (const [name, spec] of Object.entries(dependencies)) if (!isExactVersion(spec)) problems.push({ id: 'range-version', detail: `${name}@${String(spec)}` });

  return problems;
}

/** Problems of the lockfile against the manifest's pinned table. @es Problemas del lockfile frente a la tabla fijada. */
function lockProblems(dependencies, lock) {
  const problems = [];
  const root = lock.packages[''];

  if (root === undefined || !sameDependencies(root.dependencies, dependencies)) problems.push({ id: 'lock-out-of-sync' });

  for (const [name, spec] of Object.entries(dependencies)) {
    if (!isExactVersion(spec)) continue; // already reported as a range: there is no pin to compare

    const entry = lock.packages[`node_modules/${name}`];

    if (entry === undefined) problems.push({ id: 'lock-missing-package', detail: name });
    else if (entry.version !== spec) problems.push({ id: 'lock-version-mismatch', detail: name });
  }

  return problems;
}

/**
 * Inspects one toolchain directory and returns `[{ id, detail? }]`; empty when the toolchain is reproducible.
 * @es Inspecciona una toolchain; vacío cuando es reproducible.
 */
export function inspectToolchain(dir) {
  const manifest = readJson(path.join(dir, MANIFEST_FILE));
  const lock = readJson(path.join(dir, LOCK_FILE));
  const problems = [];

  if (manifest === undefined) problems.push({ id: 'missing-manifest' });
  else if (manifest === null) problems.push({ id: 'invalid-manifest' });

  if (lock === undefined) problems.push({ id: 'missing-lockfile' });
  else if (!hasPackages(lock)) problems.push({ id: 'invalid-lockfile' });

  if (manifest === undefined || manifest === null) return problems;

  const dependencies = manifest.dependencies ?? {};

  problems.push(...manifestProblems(manifest, dependencies, path.basename(dir)));

  if (hasPackages(lock)) problems.push(...lockProblems(dependencies, lock));

  return problems;
}

/**
 * Problems of one gate command against the toolchain at `toolchainDir`: `no-toolchain` when the stack has
 * none, `tool-not-declared` (the package as detail) when the toolchain does not declare the package the
 * command runs. A command that runs no package has none.
 * @es Problemas del comando de un gate frente a la toolchain de su stack.
 */
export function gateToolProblems(command, toolchainDir) {
  const tool = toolPackageOf(command);

  if (tool === undefined) return [];
  if (!existsSync(toolchainDir)) return [{ id: 'no-toolchain' }];

  const manifest = readJson(path.join(toolchainDir, MANIFEST_FILE));
  const declared = manifest?.dependencies ?? {};

  return Object.hasOwn(declared, tool) ? [] : [{ id: 'tool-not-declared', detail: tool }];
}
