#!/usr/bin/env node
/**
 * Verifies the gates-kit: every gate directory `gates-kit/<stack>/<gate>/` must hold its parts (see
 * `gate-layout.mjs`), a config free of suppressions (see `config-rules.mjs`), a command that exits 0 on
 * `pass/`, and the same command exiting NON-ZERO on `fail/`. A gate whose fail fixture passes could never
 * go red, which is the `guard-that-cannot-go-red` defect this kit exists to prevent. A command that leaves
 * anything changed in the gate folder (a cache, a report, a rewritten fixture) is a problem too: a gate runs
 * on a tree it must not touch. Every toolchain
 * `gates-kit/toolchains/<stack>/` must be pinned and locked (see `toolchain-layout.mjs`), and the package a
 * gate runs must be one its stack's toolchain declares.
 *
 * Usage: `node gates-kit/verify.mjs [--root <kit dir>] [--stack <name>]`. The gates of a stack need
 * `GATES_KIT_TOOLCHAIN` to name that stack's installed toolchain, so a run is per stack (`--stack`).
 * Exit 0 every gate and toolchain correct; 1 any problem; 2 nothing measured (empty kit, unknown stack, bad usage).
 *
 * Decision: a command that timed out, could not start, or died by signal decided nothing, so on `fail/` it
 * is a problem (`timed-out`, `could-not-run`), never read as the required non-zero exit. A gate with a
 * missing or invalid part is not run: its command is unknown or unproven.
 *
 * Every printed line comes from the `MESSAGES` table, English first, then `@es` Spanish.
 *
 * @es Verifica el gates-kit: cada gate debe tener sus partes, una config sin supresiones, un comando que
 * sale con 0 sobre `pass/` y con código NO cero sobre `fail/`. Un gate cuyo fixture fail pasa nunca podría
 * ponerse en rojo. Un comando que deja algo cambiado en la carpeta del gate (una caché, un informe, un
 * fixture reescrito) también es un problema. Cada toolchain debe estar fijada y con lockfile, y el paquete que corre un gate debe estar
 * declarado en la toolchain de su stack; como `GATES_KIT_TOOLCHAIN` nombra la toolchain instalada de UN stack,
 * una corrida es por stack (`--stack`). Salida 0 todo correcto; 1 algún problema; 2 nada medido. Un comando
 * que agotó el tiempo o no arrancó no decidió nada: es un problema, no un fallo válido. Cada línea sale de la
 * tabla `MESSAGES`.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { configViolations } from './config-rules.mjs';
import { DEFAULT_TIMEOUT_MS, discoverGates, inspectGate } from './gate-layout.mjs';
import { discoverToolchains, gateToolProblems, inspectToolchain } from './toolchain-layout.mjs';

/** Every runtime message: `[English, Spanish]`. @es Todos los mensajes: `[inglés, español]`. */
export const MESSAGES = {
  'gate.ok': ['gate {gate}: pass exits 0 and fail exits non-zero', 'gate {gate}: pass sale con 0 y fail sale distinto de 0'],
  'gate.refused': ['gate {gate}: REFUSED ({count} problem(s))', 'gate {gate}: RECHAZADO ({count} problema(s))'],
  'problem.missing-config': ['  no config.* file', '  falta el fichero config.*'],
  'problem.missing-pass': ['  pass/ is missing or empty', '  pass/ no existe o está vacío'],
  'problem.missing-fail': ['  fail/ is missing or empty', '  fail/ no existe o está vacío'],
  'problem.missing-source': ['  SOURCE.md is missing or empty', '  SOURCE.md no existe o está vacío'],
  'problem.missing-gate-json': ['  gate.json (the command declaration) is missing', '  falta gate.json (la declaración del comando)'],
  'problem.invalid-gate-json': ['  gate.json is invalid: {detail}', '  gate.json no es válido: {detail}'],
  'problem.config-ignore': ['  {file}:{line} holds an ignore, exclude or allowlist entry', '  {file}:{line} contiene una entrada ignore, exclude o de permitidos'],
  'problem.config-off': ['  {file}:{line} turns a rule off or downgrades it to warn', '  {file}:{line} desactiva una regla o la degrada a warn'],
  'problem.config-directive': ['  {file}:{line} holds a disable directive', '  {file}:{line} contiene una directiva de desactivación'],
  'problem.config-threshold': ['  {file}:{line} sets a threshold under the kit floor', '  {file}:{line} fija un umbral por debajo del mínimo del kit'],
  'problem.pass-failed': ['  the command failed on pass/ (exit {detail})', '  el comando falló sobre pass/ (salida {detail})'],
  'problem.fail-passed': ['  the command passed on fail/, so the gate cannot go red', '  el comando pasó sobre fail/, así que el gate no puede ponerse en rojo'],
  'problem.could-not-run': ['  the command could not run on {detail}', '  el comando no pudo ejecutarse sobre {detail}'],
  'problem.missing-manifest': ['  package.json is missing', '  falta package.json'],
  'problem.invalid-manifest': ['  package.json is not a readable JSON object', '  package.json no es un objeto JSON legible'],
  'problem.missing-lockfile': ['  package-lock.json is missing', '  falta package-lock.json'],
  'problem.invalid-lockfile': ['  package-lock.json is not a readable lockfile', '  package-lock.json no es un lockfile legible'],
  'problem.no-dependencies': ['  the manifest pins no dependency', '  el manifiesto no fija ninguna dependencia'],
  'problem.range-version': ['  {detail} is not one exact version', '  {detail} no es una versión exacta'],
  'problem.unexpected-section': ['  the manifest holds a {detail} section; only dependencies is allowed', '  el manifiesto tiene una sección {detail}; solo se admite dependencies'],
  'problem.not-private': ['  the manifest is not private', '  el manifiesto no es privado'],
  'problem.bad-name': ['  the manifest is not named {detail}', '  el manifiesto no se llama {detail}'],
  'problem.lock-out-of-sync': ['  the lockfile root does not match the manifest dependencies', '  la raíz del lockfile no concuerda con las dependencias del manifiesto'],
  'problem.lock-missing-package': ['  the lockfile has no entry for {detail}', '  el lockfile no tiene entrada para {detail}'],
  'problem.lock-version-mismatch': ['  the lockfile resolves {detail} to another version than the pin', '  el lockfile resuelve {detail} a otra versión que la fijada'],
  'problem.tool-not-declared': ['  the command runs {detail}, which the stack toolchain does not declare', '  el comando ejecuta {detail}, que la toolchain del stack no declara'],
  'problem.no-toolchain': ['  the command runs a package but the stack has no toolchain', '  el comando ejecuta un paquete pero el stack no tiene toolchain'],
  'problem.left-residue': ['  the command changed the gate folder: {detail}', '  el comando cambió la carpeta del gate: {detail}'],
  'problem.timed-out': ['  the command timed out on {detail}', '  el comando agotó el tiempo sobre {detail}'],
  'run.none': ['no gate found to verify', 'no se encontró ningún gate que verificar'],
  'toolchain.ok': ['toolchain {stack}: pinned to exact versions and locked', 'toolchain {stack}: fijada a versiones exactas y con lockfile'],
  'toolchain.refused': ['toolchain {stack}: REFUSED ({count} problem(s))', 'toolchain {stack}: RECHAZADA ({count} problema(s))'],
  'run.summary': ['{ok} of {total} gate(s) correct', '{ok} de {total} gate(s) correctos'],
  'run.summary-toolchains': ['{ok} of {total} toolchain(s) correct', '{ok} de {total} toolchain(s) correctas'],
  'cli.usage': ['unknown or incomplete option {detail}; use --root <dir> and --stack <name>', 'opción desconocida o incompleta {detail}; usar --root <dir> y --stack <name>'],
};

/** Renders a message, English first and `@es` Spanish after. @es Compone un mensaje, inglés y luego `@es`. */
export function say(id, values = {}) {
  const entry = MESSAGES[id];

  if (entry === undefined) throw new Error(`unknown message id ${id}`);
  if (entry.length !== 2 || entry.some((half) => typeof half !== 'string' || half.trim() === '')) throw new Error(`message ${id} lacks its English or @es half`);

  const [english, spanish] = entry.map((half) => half.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '')));

  return `${english} @es ${spanish}`;
}

/** Windows package-manager shims are `.cmd` files and need a shell. @es En Windows los gestores son `.cmd`. */
const WINDOWS_SHIMS = new Set(['npx', 'npm', 'pnpm', 'yarn']);

function launch([program, ...args], options) {
  if (process.platform === 'win32' && WINDOWS_SHIMS.has(program)) {
    const quoted = [program, ...args].map((arg) => (/^[\w.:=/\\-]+$/.test(arg) ? arg : `"${arg}"`));

    return spawnSync(quoted.join(' '), { ...options, shell: true });
  }

  return spawnSync(program, args, options);
}

/** Runs the declared command on one fixture side. @es Corre el comando declarado sobre un lado. */
function runSide(gate, dir, side) {
  const target = path.join(dir, side);
  const command = gate.command.map((arg) => arg.replaceAll('{target}', target));
  const run = launch(command, { cwd: dir, encoding: 'utf8', timeout: gate.timeoutMs ?? DEFAULT_TIMEOUT_MS });

  if (run.error?.code === 'ETIMEDOUT') return { id: 'timed-out', detail: `${side}/` };
  if (run.error !== undefined || typeof run.status !== 'number') return { id: 'could-not-run', detail: `${side}/` };
  if (side === 'pass' && run.status !== 0) return { id: 'pass-failed', detail: run.status };
  if (side === 'fail' && run.status === 0) return { id: 'fail-passed' };

  return undefined;
}

/**
 * What is under `dir`, as a map from each relative path to its signature: `dir` for a folder, size and
 * modification time for a file. @es Lo que hay bajo `dir`, como mapa de cada ruta relativa a su firma.
 */
function snapshot(dir) {
  const entries = new Map();

  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const file = path.join(entry.parentPath, entry.name);
    const { size, mtimeMs } = statSync(file);

    entries.set(path.relative(dir, file).split(path.sep).join('/'), entry.isDirectory() ? 'dir' : `${size}:${mtimeMs}`);
  }

  return entries;
}

/** The sorted relative paths that were added, removed or changed between two snapshots. @es Las rutas añadidas, quitadas o cambiadas entre dos instantáneas. */
function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key)).sort();
}

/** `{ id, file, line }` problems for every suppression in the gate's configs. @es Supresiones de las configs. */
function configProblems(configs) {
  return configs.flatMap((file) => configViolations(readFileSync(file, 'utf8')).map(({ rule, line }) => ({ id: `config-${rule}`, file: path.basename(file), line })));
}

/**
 * Verifies one gate and returns `{ stack, name, problems }`; `problems` is empty when the gate is correct.
 * `toolchain` is the directory its stack's packages are installed from. A gate that lacks a part, or runs a
 * package its toolchain does not declare, is not run: its command is unknown or cannot start.
 * @es Verifica un gate; `problems` vacío significa gate correcto. `toolchain` es el directorio de donde se
 * instalan los paquetes de su stack. Un gate sin una parte, o que corre un paquete que su toolchain no
 * declara, no se ejecuta: su comando es desconocido o no puede arrancar.
 */
export function verifyGate({ stack, name, dir, toolchain }) {
  const { problems, gate, configs } = inspectGate(dir);
  const wiring = gate === undefined ? [] : gateToolProblems(gate.command, toolchain);
  const all = [...problems, ...wiring, ...configProblems(configs)];

  if (problems.length === 0 && wiring.length === 0) {
    const before = snapshot(dir);

    for (const side of ['pass', 'fail']) all.push(runSide(gate, dir, side));

    const changed = changedPaths(before, snapshot(dir));

    if (changed.length > 0) all.push({ id: 'left-residue', detail: changed.join(' ') });
  }

  return { stack, name, problems: all.filter((problem) => problem !== undefined) };
}

/** Verifies one toolchain: `{ stack, problems }`. @es Verifica una toolchain. */
export function verifyToolchain({ stack, dir }) {
  return { stack, problems: inspectToolchain(dir) };
}

/** Parses `--root` and `--stack`; returns `{ error }` for anything else. @es Lee `--root` y `--stack`. */
function parseArgs(argv, defaultRoot) {
  const options = { root: defaultRoot, stack: undefined };

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if ((flag !== '--root' && flag !== '--stack') || value === undefined) return { error: flag };

    options[flag.slice(2)] = value;
  }

  return options;
}

/** Runs the CLI over `argv` and returns the exit code. @es Corre el CLI y devuelve el código de salida. */
export function main(argv, defaultRoot, print = console.log) {
  const options = parseArgs(argv, defaultRoot);

  if (options.error !== undefined) {
    print(say('cli.usage', { detail: options.error }));

    return 2;
  }

  const root = path.resolve(options.root);
  const gates = discoverGates(root, options.stack);
  const toolchains = discoverToolchains(root, options.stack);

  if (gates.length === 0 && toolchains.length === 0) {
    print(say('run.none'));

    return 2;
  }

  const results = gates.map(verifyGate);

  for (const { stack, name, problems } of results) {
    const gate = `${stack}/${name}`;

    print(problems.length === 0 ? say('gate.ok', { gate }) : say('gate.refused', { gate, count: problems.length }));
    for (const { id, ...values } of problems) print(say(`problem.${id}`, values));
  }

  const ok = results.filter((result) => result.problems.length === 0).length;
  const toolchainResults = toolchains.map(verifyToolchain);

  for (const { stack, problems } of toolchainResults) {
    print(problems.length === 0 ? say('toolchain.ok', { stack }) : say('toolchain.refused', { stack, count: problems.length }));
    for (const { id, ...values } of problems) print(say(`problem.${id}`, values));
  }

  const toolchainsOk = toolchainResults.filter((result) => result.problems.length === 0).length;

  if (gates.length > 0) print(say('run.summary', { ok, total: results.length }));
  if (toolchains.length > 0) print(say('run.summary-toolchains', { ok: toolchainsOk, total: toolchainResults.length }));

  return ok === results.length && toolchainsOk === toolchainResults.length ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), path.dirname(fileURLToPath(import.meta.url))));
}
