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
 * Usage: `node gates-kit/verify.mjs [--root <kit dir>] [--stack <name> | --toolchain <id>]`. The gates of a
 * stack need `GATES_KIT_TOOLCHAIN` to name that stack's installed toolchain, so a run is per stack (`--stack`).
 * A stack with one toolchain per major (`toolchains/angular-19/` ... `angular-22/`) is run per toolchain:
 * `--toolchain angular-21` verifies the `angular` gates against that toolchain and only that toolchain, and
 * refuses to start (exit 2) when `GATES_KIT_TOOLCHAIN` holds another installed toolchain (its `package.json`
 * name is not `gates-kit-<id>-toolchain`), because the run would grade the gates with the wrong versions.
 * A gate whose package the chosen toolchain does not declare, while another toolchain of the same stack does
 * (the Vitest gate on the Karma-only Angular 19 toolchain), is NOT APPLICABLE there: printed as such, not run,
 * and not a failure; a package no toolchain of the stack declares stays `tool-not-declared`. Every command
 * that runs a package must also pin its reporter and must not pass `eslint --quiet` (see
 * `gate-command-rules.mjs`).
 * Exit 0 every gate and toolchain correct; 1 any problem; 2 nothing measured (empty kit, unknown stack, bad
 * usage, toolchain mismatch).
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
import { commandProblems } from './gate-command-rules.mjs';
import { DEFAULT_TIMEOUT_MS, discoverGates, inspectGate, stackOfToolchain } from './gate-layout.mjs';
import { discoverToolchains, gateToolProblems, inspectToolchain } from './toolchain-layout.mjs';

/** Every runtime message: `[English, Spanish]`. @es Todos los mensajes: `[inglés, español]`. */
export const MESSAGES = {
  'gate.ok': ['gate {gate}: pass exits 0 and fail exits non-zero', 'gate {gate}: pass sale con 0 y fail sale distinto de 0'],
  'gate.refused': ['gate {gate}: REFUSED ({count} problem(s))', 'gate {gate}: RECHAZADO ({count} problema(s))'],
  'gate.not-applicable': ['gate {gate}: not applicable on toolchain {toolchain}, which does not declare {tool} (another toolchain of the stack does); not run', 'gate {gate}: no aplica en la toolchain {toolchain}, que no declara {tool} (otra toolchain del stack sí); no se ejecuta'],
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
  'problem.no-toolchain': ['  the command runs a package but the stack has no toolchain of its name; a stack with one toolchain per major is run with --toolchain <id>', '  el comando ejecuta un paquete pero el stack no tiene toolchain con su nombre; un stack con una toolchain por major se corre con --toolchain <id>'],
  'problem.reporter-not-pinned': ['  the command does not pin its reporter: {detail}', '  el comando no fija su reporter: {detail}'],
  'problem.reporter-unknown': ['  the command runs {detail}, whose reporter flag the kit has not decided (gate-command-rules.mjs)', '  el comando ejecuta {detail}, cuyo flag de reporter el kit no ha decidido (gate-command-rules.mjs)'],
  'problem.quiet-flag': ['  the command passes {detail}, which drops warnings and changes what is measured', '  el comando pasa {detail}, que quita los warnings y cambia lo que se mide'],
  'problem.left-residue': ['  the command changed the gate folder: {detail}', '  el comando cambió la carpeta del gate: {detail}'],
  'problem.timed-out': ['  the command timed out on {detail}', '  el comando agotó el tiempo sobre {detail}'],
  'run.none': ['no gate found to verify', 'no se encontró ningún gate que verificar'],
  'toolchain.ok': ['toolchain {stack}: pinned to exact versions and locked', 'toolchain {stack}: fijada a versiones exactas y con lockfile'],
  'toolchain.refused': ['toolchain {stack}: REFUSED ({count} problem(s))', 'toolchain {stack}: RECHAZADA ({count} problema(s))'],
  'run.summary': ['{ok} of {total} gate(s) correct', '{ok} de {total} gate(s) correctos'],
  'run.summary-not-applicable': ['{count} gate(s) not applicable on toolchain {toolchain}', '{count} gate(s) no aplican en la toolchain {toolchain}'],
  'cli.toolchain-mismatch': ['GATES_KIT_TOOLCHAIN holds {detail}, not the toolchain {toolchain} this run verifies', 'GATES_KIT_TOOLCHAIN contiene {detail}, no la toolchain {toolchain} que verifica esta corrida'],
  'cli.stack-conflict': ['--stack {detail} does not hold toolchain {toolchain}', '--stack {detail} no contiene la toolchain {toolchain}'],
  'run.summary-toolchains': ['{ok} of {total} toolchain(s) correct', '{ok} de {total} toolchain(s) correctas'],
  'cli.usage': ['unknown or incomplete option {detail}; use --root <dir>, --stack <name> and --toolchain <id>', 'opción desconocida o incompleta {detail}; usar --root <dir>, --stack <name> y --toolchain <id>'],
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
 * Verifies one gate and returns `{ stack, name, problems, notApplicable? }`; `problems` is empty when the gate
 * is correct. `toolchain` is the directory its packages are installed from and `siblings` the toolchain
 * directories of its stack. A gate that lacks a part, or runs a package its toolchain does not declare, is
 * not run: its command is unknown or cannot start. When another sibling declares that package the gate is
 * `notApplicable` (the package) instead of refused; its static problems are still reported.
 * @es Verifica un gate; `problems` vacío significa gate correcto. `toolchain` es el directorio de donde se
 * instalan sus paquetes y `siblings` las toolchains de su stack. Un gate sin una parte, o que corre un
 * paquete que su toolchain no declara, no se ejecuta. Si otra hermana declara ese paquete el gate es
 * `notApplicable` en vez de rechazado; sus problemas estáticos se siguen informando.
 */
export function verifyGate({ stack, name, dir, toolchain, siblings = [] }) {
  const { problems, gate, configs } = inspectGate(dir);
  const wiring = gate === undefined ? [] : gateToolProblems(gate.command, toolchain);
  const commandRules = gate === undefined ? [] : commandProblems(gate.command);
  const notApplicable = wiring.length === 1 && wiring[0].id === 'tool-not-declared' && siblings.some((sibling) => sibling !== toolchain && gateToolProblems(gate.command, sibling).length === 0);

  if (notApplicable) return { stack, name, problems: [...problems, ...configProblems(configs), ...commandRules], notApplicable: wiring[0].detail };

  const all = [...problems, ...wiring, ...configProblems(configs), ...commandRules];

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

const FLAGS = new Set(['--root', '--stack', '--toolchain']);

/** Parses `--root`, `--stack` and `--toolchain`; returns `{ error }` for anything else. @es Lee `--root`, `--stack` y `--toolchain`. */
function parseArgs(argv, defaultRoot) {
  const options = { root: defaultRoot, stack: undefined, toolchain: undefined };

  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!FLAGS.has(flag) || value === undefined) return { error: flag };

    options[flag.slice(2)] = value;
  }

  return options;
}

/**
 * The `name` of the installed toolchain's manifest, `undefined` when it cannot be read.
 * @es El `name` del manifiesto de la toolchain instalada, `undefined` si no se puede leer.
 */
function installedName(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
  } catch {
    return undefined;
  }
}

/** Runs the CLI over `argv` and returns the exit code. @es Corre el CLI y devuelve el código de salida. */
export function main(argv, defaultRoot, print = console.log, env = process.env) {
  const options = parseArgs(argv, defaultRoot);

  if (options.error !== undefined) {
    print(say('cli.usage', { detail: options.error }));

    return 2;
  }

  const root = path.resolve(options.root);
  const chosen = options.toolchain;
  const stack = chosen === undefined ? options.stack : stackOfToolchain(chosen);

  if (chosen !== undefined && options.stack !== undefined && options.stack !== stack) {
    print(say('cli.stack-conflict', { detail: options.stack, toolchain: chosen }));

    return 2;
  }

  if (chosen !== undefined && env.GATES_KIT_TOOLCHAIN !== undefined && env.GATES_KIT_TOOLCHAIN !== '') {
    const installed = installedName(path.resolve(env.GATES_KIT_TOOLCHAIN));

    if (installed !== `gates-kit-${chosen}-toolchain`) {
      print(say('cli.toolchain-mismatch', { detail: installed ?? env.GATES_KIT_TOOLCHAIN, toolchain: chosen }));

      return 2;
    }
  }

  const family = discoverToolchains(root, stack);
  const toolchains = chosen === undefined ? family : family.filter((toolchain) => toolchain.stack === chosen);
  const siblingsOf = (gateStack) => family.filter((toolchain) => stackOfToolchain(toolchain.stack) === gateStack).map((toolchain) => toolchain.dir);
  const gates = (chosen !== undefined && toolchains.length === 0 ? [] : discoverGates(root, stack, chosen)).map((gate) => ({ ...gate, siblings: siblingsOf(gate.stack) }));

  if (gates.length === 0 && toolchains.length === 0) {
    print(say('run.none'));

    return 2;
  }

  const results = gates.map(verifyGate);

  for (const { stack: gateStack, name, problems, notApplicable } of results) {
    const gate = `${gateStack}/${name}`;

    if (problems.length > 0) print(say('gate.refused', { gate, count: problems.length }));
    else if (notApplicable !== undefined) print(say('gate.not-applicable', { gate, toolchain: chosen ?? gateStack, tool: notApplicable }));
    else print(say('gate.ok', { gate }));
    for (const { id, ...values } of problems) print(say(`problem.${id}`, values));
  }

  const ok = results.filter((result) => result.problems.length === 0).length;
  const skippedStacks = results.filter((result) => result.problems.length === 0 && result.notApplicable !== undefined).map((result) => result.stack);
  const skipped = skippedStacks.length;
  const toolchainResults = toolchains.map(verifyToolchain);

  for (const { stack, problems } of toolchainResults) {
    print(problems.length === 0 ? say('toolchain.ok', { stack }) : say('toolchain.refused', { stack, count: problems.length }));
    for (const { id, ...values } of problems) print(say(`problem.${id}`, values));
  }

  const toolchainsOk = toolchainResults.filter((result) => result.problems.length === 0).length;

  if (gates.length > 0) print(say('run.summary', { ok: ok - skipped, total: results.length - skipped }));
  if (skipped > 0) print(say('run.summary-not-applicable', { count: skipped, toolchain: chosen ?? [...new Set(skippedStacks)].join(', ') }));
  if (toolchains.length > 0) print(say('run.summary-toolchains', { ok: toolchainsOk, total: toolchainResults.length }));

  return ok === results.length && toolchainsOk === toolchainResults.length ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), path.dirname(fileURLToPath(import.meta.url))));
}
