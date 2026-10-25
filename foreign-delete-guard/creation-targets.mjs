/**
 * Every path a shell line CREATES with a command whose only job is creating: `mkdir`/`md`, `touch` and
 * PowerShell's `New-Item`/`ni`. `write-targets/shell-writes.mjs` reports what a command WRITES (a redirect,
 * `tee`, `cp`, `mv`, the content cmdlets) and says in its header that creations are not lexed, so the
 * authorship record needs this half to know that a folder or an empty file is the agent's own.
 *
 * STATED LIMIT. Whatever a child process creates (a build, an extraction, a clone, a script's own output) is
 * not seen. Such a file counts as the agent's only when it lies inside a folder the agent made or inside its
 * own scratchpad subfolder (`authorship.mjs`).
 *
 * @es Cada ruta que CREA una línea de shell con un comando cuyo único oficio es crear: `mkdir`/`md`, `touch` y
 * `New-Item`/`ni` de PowerShell. `shell-writes.mjs` informa lo que un comando ESCRIBE y dice que las creaciones
 * no se lexean, así que el registro de autoría necesita esta mitad para saber que una carpeta o un fichero vacío
 * es del agente. LÍMITE: lo que crea un proceso hijo (una compilación, una extracción, un clon, la salida de
 * un script) no se ve; cuenta como del agente solo dentro de una carpeta que él hizo o de su subcarpeta del
 * scratchpad.
 */

import path from 'node:path';

import { withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, DIALECTS, executableName, simpleCommands } from '../shell-command/shell-command.mjs';
import { resolveOperand } from './operand-paths.mjs';

/** Per creating command, the options that take the NEXT word as their value. @es Por comando, las opciones que toman la palabra siguiente como valor. */
const VALUE_OPTIONS = new Map([
  ['mkdir', new Set(['-m', '--mode', '-Z', '--context'])],
  ['md', new Set()],
  ['touch', new Set(['-d', '--date', '-t', '-r', '--reference'])]
]);

/** PowerShell `New-Item` parameters that take a value. @es Parámetros de `New-Item` que toman un valor. */
const NEW_ITEM_VALUE_PARAMETERS = new Set(['-path', '-name', '-itemtype', '-type', '-value', '-credential']);

const isOption = (word) => word.startsWith('-') && word !== '-';

/** The operands of `mkdir`/`md`/`touch`: the words that are neither options nor option values. @es Los operandos de `mkdir`/`md`/`touch`. */
function plainOperands(name, args) {
  const valueOptions = VALUE_OPTIONS.get(name);
  const operands = [];
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (!optionsEnded && word === '--') {
      optionsEnded = true;
      continue;
    }

    if (!optionsEnded && isOption(word)) {
      if (valueOptions.has(word)) index += 1;
      continue;
    }

    operands.push(word);
  }

  return operands;
}

/** The paths `New-Item` creates: `-Path` (or the first positional) joined with `-Name` when both are given. @es Las rutas que crea `New-Item`. */
function newItemOperands(args) {
  const paths = [];
  const names = [];
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    const parameter = word.toLowerCase();

    if (!word.startsWith('-')) {
      positional.push(word);
      continue;
    }

    if (!NEW_ITEM_VALUE_PARAMETERS.has(parameter)) continue;

    if (parameter === '-path') paths.push(args[index + 1]);
    if (parameter === '-name') names.push(args[index + 1]);

    index += 1;
  }

  const bases = paths.length > 0 ? paths : positional.slice(0, 1);

  if (names.length === 0) return bases;

  return (bases.length > 0 ? bases : ['.']).flatMap((base) => names.map((name) => path.join(base, name)));
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {string} platform Injectable for the Git Bash path translation.
 * @returns {Array<{ path: string, via: string }>} Every path the line creates and the shell can name beforehand.
 * @es Cada ruta que crea la línea y que la shell puede nombrar de antemano.
 */
export function creationTargets(script, dialect, cwd, platform = process.platform) {
  const created = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1) continue;

    const name = executableName(command.words[at]);
    const args = command.words.slice(at + 1);
    const isNewItem = name === 'new-item' || name === 'ni';
    const operands = isNewItem ? newItemOperands(args) : VALUE_OPTIONS.has(name) ? plainOperands(name, args) : [];
    const grammar = isNewItem ? DIALECTS.POWERSHELL : dialect;

    for (const raw of operands) created.push(...resolveOperand(raw, directory, name, grammar, platform).filter((entry) => entry.path !== undefined));
  }

  return created;
}
