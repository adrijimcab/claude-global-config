/**
 * Which declared FULL CHAINS a shell line RUNS, unwrapped.
 *
 * WHAT COUNTS. A simple command, as `shell-command/shell-command.mjs` reports it (so a chain that is only
 * MENTIONED in `echo`, a quoted string, a heredoc or a comment is data and never counted, while one inside
 * `$(...)`, `bash -c` or a chain of `&&` is counted because it runs), whose program is
 *   - a package manager (`npm`, `pnpm`, `yarn`) running a script declared as a full chain, spelled `run <script>`,
 *     `run-script <script>`, the lifecycle shorthand `npm test`, or, for pnpm and yarn, the bare `<script>`; global
 *     options that take a value (`--prefix x`, `-w y`) are skipped; or
 *   - `node` running a program whose path ends with a declared command suffix (the selftest runner).
 * The WRAPPED form passes by construction: its program is `node <...>/full-chain-lock/run.mjs`, whose first
 * positional is the runner and not a chain, and the chain after `--` is an ARGUMENT, not a command.
 *
 * NOT MODELLED, stated: a chain started through another script of the project (`npm run all` that calls
 * `build:ci-pr`) or an alias; the guard sees only what the shell line itself runs.
 *
 * @es Qué CADENAS COMPLETAS declaradas EJECUTA sin envolver una línea de shell. Cuenta un comando simple (una
 * MENCIÓN en `echo`, texto entrecomillado, heredoc o comentario es dato; lo de `$(...)`, `bash -c` o una cadena
 * `&&` sí corre) cuyo programa es un gestor de paquetes que ejecuta un script declarado (`run <script>`,
 * `run-script`, `npm test`, o el script a secas en pnpm y yarn; se saltan las opciones globales con valor) o
 * `node` que ejecuta un programa cuya ruta acaba en un sufijo declarado. La forma ENVUELTA pasa por construcción:
 * su programa es `node .../full-chain-lock/run.mjs` y la cadena tras `--` es un argumento. NO se modela: una cadena
 * lanzada por otro script del proyecto, ni los alias.
 */

import { commandWordIndex, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** Package managers whose scripts can be full chains. @es Gestores de paquetes cuyos scripts pueden ser cadenas completas. */
const MANAGERS = new Set(['npm', 'pnpm', 'yarn']);

/** The managers that treat any bare word as a script name. @es Los gestores que toman cualquier palabra suelta como script. */
const BARE_SCRIPT_MANAGERS = new Set(['pnpm', 'yarn']);

/** The verbs that run a script by name. @es Los verbos que ejecutan un script por nombre. */
const RUN_VERBS = new Set(['run', 'run-script', 'rum', 'urn']);

/** The npm lifecycle shorthands, which run the script of the same name. @es Los atajos de ciclo de vida de npm. */
const LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop', 'restart']);

/** Global options that take a SEPARATE value word. @es Opciones globales con valor en palabra separada. */
const OPTIONS_WITH_VALUE = new Set(['--prefix', '-C', '--cwd', '-w', '--workspace', '--cache', '--userconfig', '--loglevel', '--filter', '-F']);

/** The index of the first word at or after `from` that is not an option or an option's value, or -1. @es El índice de la primera palabra que no es opción ni su valor, o -1. */
function firstPositional(words, from) {
  let index = from;

  while (index < words.length) {
    const word = words[index];

    if (!word.startsWith('-')) return index;

    index += OPTIONS_WITH_VALUE.has(word) ? 2 : 1;
  }

  return -1;
}

/** The script a package-manager command runs, or `undefined`. @es El script que ejecuta un comando de gestor de paquetes, o `undefined`. */
function scriptOf(manager, words, from) {
  const verbAt = firstPositional(words, from);

  if (verbAt === -1) return undefined;

  const verb = words[verbAt];

  if (RUN_VERBS.has(verb)) {
    const scriptAt = firstPositional(words, verbAt + 1);

    return scriptAt === -1 ? undefined : words[scriptAt];
  }

  if (LIFECYCLE_SHORTHANDS.has(verb) || BARE_SCRIPT_MANAGERS.has(manager)) return verb;

  return undefined;
}

/** A path spelled with forward slashes. @es Una ruta con barras normales. */
const forwardSlashes = (word) => word.split('\\').join('/');

/** The names of the projects whose `kind` list holds `value`. @es Los nombres de los proyectos cuya lista `kind` contiene `value`. */
const declaring = (chains, kind, value) => chains.projects.filter((entry) => entry[kind].includes(value)).map((entry) => entry.project);

/** The declared command whose path suffix `target` ends with, or `undefined`. @es El comando declarado cuyo sufijo de ruta termina `target`, o `undefined`. */
function declaredSuffix(chains, target) {
  return chains.projects.flatMap((entry) => entry.commands).find((candidate) => target === candidate || target.endsWith(`/${candidate}`));
}

/**
 * Every full chain `script` runs unwrapped, in execution order.
 *
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {{ projects: Array<{ project: string, scripts: string[], commands: string[] }> }} chains The declared set.
 * @returns {Array<{ chain: string, projects: string[], text: string }>} `projects` are ALL the projects that declare the chain: a script name such as `build:ci-pr` can be declared by several, and the line alone does not say which one runs.
 * @es Cada cadena completa que `script` ejecuta sin envolver, en orden de ejecución. `projects` son TODOS los proyectos que la declaran: un nombre como `build:ci-pr` puede estar en varios y la línea sola no dice cuál corre.
 */
export function fullChainInvocations(script, dialect, chains) {
  const found = [];

  for (const command of simpleCommands(script, dialect)) {
    const at = commandWordIndex(command.words);

    if (at === -1) continue;

    const program = executableName(command.words[at]);

    if (MANAGERS.has(program)) {
      const name = scriptOf(program, command.words, at + 1);
      const projects = name === undefined ? [] : declaring(chains, 'scripts', name);

      if (projects.length > 0) found.push({ chain: name, projects, text: command.text });
    } else if (program === 'node') {
      const targetAt = firstPositional(command.words, at + 1);
      const suffix = targetAt === -1 ? undefined : declaredSuffix(chains, forwardSlashes(command.words[targetAt]));

      if (suffix !== undefined) found.push({ chain: suffix, projects: declaring(chains, 'commands', suffix), text: command.text });
    }
  }

  return found;
}
