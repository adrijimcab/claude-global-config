/**
 * Owns the SHAPE of a gate directory: which gates exist under the kit and whether each holds every part.
 * A gate is `gates-kit/<stack>/<gate>/` with `config.*` (one or more), a non-empty `pass/` and `fail/`, a
 * non-empty `SOURCE.md`, and `gate.json`, the structured declaration of its command:
 * `{ "command": ["node", "check.mjs", "{target}"], "timeoutMs": 300000 }`. `command` is an argv array run
 * without a shell from the gate directory; `{target}` becomes the absolute path of `pass/` or `fail/`;
 * `timeoutMs` is optional (default 300000). Any other key is refused. The `templates` folder holds
 * contract templates and the `toolchains` folder the pinned packages the gates run on (one subfolder per
 * stack); neither holds gates, so neither is ever a stack.
 *
 * @es Responde por la FORMA de un directorio de gate: qué gates hay y si cada uno tiene todas sus partes.
 * Un gate es `gates-kit/<stack>/<gate>/` con `config.*`, `pass/` y `fail/` no vacíos, `SOURCE.md` no vacío
 * y `gate.json`, la declaración estructurada de su comando (argv sin shell, desde el directorio del gate;
 * `{target}` se sustituye por la ruta de `pass/` o `fail/`). `templates` (plantillas) y `toolchains` (paquetes fijados sobre los que corren los gates) no son stacks.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Default per-run timeout. @es Tiempo máximo por defecto de cada corrida. */
export const DEFAULT_TIMEOUT_MS = 300_000;

/** The folder holding one pinned toolchain per stack. @es La carpeta con una toolchain fijada por stack. */
export const TOOLCHAINS_FOLDER = 'toolchains';

/** Folders under the kit that are not stacks. @es Carpetas del kit que no son stacks. */
const NOT_STACKS = new Set(['templates', TOOLCHAINS_FOLDER]);

/** The toolchain directory of `stack` under the kit `root`. @es El directorio de la toolchain de `stack` bajo `root`. */
export function toolchainOf(root, stack) {
  return path.join(root, TOOLCHAINS_FOLDER, stack);
}

const DECLARATION_KEYS = new Set(['command', 'timeoutMs']);

function subdirectories(dir) {
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

/**
 * The gates under `root`, optionally of one stack, each `{ stack, name, dir, toolchain }` where `toolchain` is
 * the directory its packages are installed from: `toolchains/<toolchainId>/` when a toolchain id is given (a
 * stack with one toolchain per major, such as `angular-21`), else `toolchains/<stack>/`.
 * @es Los gates bajo `root`, opcionalmente de un stack, cada uno con `toolchain`, el directorio de donde se
 * instalan sus paquetes: `toolchains/<toolchainId>/` si se da un id (un stack con una toolchain por major),
 * si no `toolchains/<stack>/`.
 */
export function discoverGates(root, stack, toolchainId) {
  const stacks = subdirectories(root).filter((name) => !NOT_STACKS.has(name) && (stack === undefined || name === stack));

  return stacks.flatMap((name) => subdirectories(path.join(root, name)).map((gate) => ({ stack: name, name: gate, dir: path.join(root, name, gate), toolchain: toolchainOf(root, toolchainId ?? name) })));
}

/** The launcher script every gate runs its package through. @es El script lanzador por el que cada gate corre su paquete. */
const LAUNCHER = 'run-tool.mjs';

/**
 * The npm package a gate command runs through the launcher (`node <path>/run-tool.mjs [--cwd <dir>] <package>
 * ...`), or `undefined` when the command is anything else. @es El paquete npm que el comando de un gate
 * ejecuta con el lanzador (`--cwd <dir>` antes del paquete se salta), o `undefined` si el comando es otra cosa.
 */
export function toolPackageOf(command) {
  return launcherCallOf(command)?.tool;
}

/**
 * The launcher call of a gate command, `{ tool, args }` where `args` are the arguments after the package (its
 * binary first), or `undefined` when the command is not a launcher call naming a package.
 * @es La llamada al lanzador de un comando de gate: el paquete y los argumentos tras él (primero su binario), o
 * `undefined` si el comando no llama al lanzador con un paquete.
 */
export function launcherCallOf(command) {
  const [program, script, ...rest] = command;

  if (program !== 'node' || script?.split(/[\\/]/).at(-1) !== LAUNCHER) return undefined;

  const at = rest[0] === '--cwd' ? 2 : 0;
  const tool = rest[at];

  return tool === undefined ? undefined : { tool, args: rest.slice(at + 1) };
}

/**
 * The stack a toolchain id belongs to: the id without a trailing `-<major>` (`angular-21` is of `angular`;
 * `node-vitest` keeps its name, its suffix not being a number). @es El stack de una toolchain: el id sin un
 * `-<major>` final.
 */
export function stackOfToolchain(id) {
  return id.replace(/-\d+$/, '');
}

function hasContent(dir) {
  return existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length > 0;
}

function declarationProblem(declaration) {
  if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) return 'the declaration is not an object';
  if (!Object.keys(declaration).every((key) => DECLARATION_KEYS.has(key))) return 'the declaration holds a key other than command and timeoutMs';
  if (!Array.isArray(declaration.command) || declaration.command.length === 0 || !declaration.command.every((arg) => typeof arg === 'string' && arg !== '')) return 'command is not a non-empty array of non-empty strings';
  if (declaration.timeoutMs !== undefined && !(Number.isInteger(declaration.timeoutMs) && declaration.timeoutMs > 0)) return 'timeoutMs is not a positive integer';

  return undefined;
}

/**
 * Inspects one gate directory: `{ problems: [{ id, detail? }], gate?, configs }`, where `gate` is the parsed
 * declaration when it is valid and `configs` the config file paths.
 * @es Inspecciona un gate: problemas, la declaración válida y las rutas de sus configs.
 */
export function inspectGate(dir) {
  const problems = [];
  const configs = readdirSync(dir).filter((name) => name.startsWith('config.') && statSync(path.join(dir, name)).isFile()).map((name) => path.join(dir, name));
  const sourcePath = path.join(dir, 'SOURCE.md');
  const declarationPath = path.join(dir, 'gate.json');
  let gate;

  if (configs.length === 0) problems.push({ id: 'missing-config' });
  if (!hasContent(path.join(dir, 'pass'))) problems.push({ id: 'missing-pass' });
  if (!hasContent(path.join(dir, 'fail'))) problems.push({ id: 'missing-fail' });
  if (!existsSync(sourcePath) || readFileSync(sourcePath, 'utf8').trim() === '') problems.push({ id: 'missing-source' });

  if (!existsSync(declarationPath)) {
    problems.push({ id: 'missing-gate-json' });
  } else {
    try {
      const declaration = JSON.parse(readFileSync(declarationPath, 'utf8'));
      const detail = declarationProblem(declaration);

      if (detail === undefined) gate = declaration;
      else problems.push({ id: 'invalid-gate-json', detail });
    } catch (error) {
      problems.push({ id: 'invalid-gate-json', detail: error.message });
    }
  }

  return { problems, gate, configs };
}
