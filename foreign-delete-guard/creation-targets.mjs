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

import { lstatSync } from 'node:fs';
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

/** The copy and move commands, whose destination may be an existing folder. @es Los comandos de copia y movimiento. */
const COPIERS = new Set(['cp', 'mv', 'copy-item', 'copy', 'cpi', 'move-item', 'move', 'mi']);

/** PowerShell Copy-Item/Move-Item parameters that take a value. @es Parámetros de Copy-Item/Move-Item con valor. */
const COPY_VALUE_PARAMETERS = new Set(['-path', '-literalpath', '-destination', '-filter', '-include', '-exclude', '-credential', '-stream']);

/** The sources and the destination of a `cp`/`mv` line. @es Los orígenes y el destino de una línea `cp`/`mv`. */
function bashCopyOperands(args) {
  const operands = [];
  let targetDirectory;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '-t' || word === '--target-directory') {
      targetDirectory = args[index + 1];
      index += 1;
    } else if (word.startsWith('--target-directory=')) {
      targetDirectory = word.slice('--target-directory='.length);
    } else if (word === '-S' || word === '--suffix') {
      index += 1;
    } else if (!isOption(word)) {
      operands.push(word);
    }
  }

  return targetDirectory === undefined ? { sources: operands.slice(0, -1), destination: operands.at(-1) } : { sources: operands, destination: targetDirectory };
}

/** The sources and the destination of a PowerShell Copy-Item/Move-Item line. @es Los orígenes y el destino de una línea Copy-Item/Move-Item. */
function powershellCopyOperands(args) {
  const named = [];
  const positional = [];
  let destination;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    const parameter = word.toLowerCase();

    if (!word.startsWith('-')) {
      positional.push(word);
    } else if (COPY_VALUE_PARAMETERS.has(parameter)) {
      if (parameter === '-destination') destination = args[index + 1];
      if (parameter === '-path' || parameter === '-literalpath') named.push(args[index + 1]);

      index += 1;
    }
  }

  const sources = named.length > 0 ? named : destination === undefined ? positional.slice(0, -1) : positional;

  return { sources, destination: destination ?? positional.at(-1) };
}

/**
 * The grammar, the sources and the destination of a copy or move line: PowerShell's when the dialect is
 * PowerShell or the command is one of its cmdlets or aliases, bash's otherwise.
 * @es La gramática, los orígenes y el destino de una línea de copia o movimiento: la de PowerShell si el dialecto
 * lo es o el comando es uno de sus cmdlets o alias, la de bash si no.
 */
export function copyOperands(name, args, dialect) {
  const powershell = dialect === DIALECTS.POWERSHELL || name.includes('-') || name === 'cpi' || name === 'mi';

  return { grammar: powershell ? DIALECTS.POWERSHELL : DIALECTS.BASH, ...(powershell ? powershellCopyOperands(args) : bashCopyOperands(args)) };
}

/**
 * The files a copy or move drops INTO an existing folder: `folder/<name of each source>`, never the folder itself.
 * A destination that is not an existing folder is the destination file, which the shared write parser reports.
 * @es Los ficheros que una copia o un movimiento deja DENTRO de una carpeta existente: `carpeta/<nombre de cada
 * origen>`, nunca la carpeta. Un destino que no es una carpeta existente es el fichero destino, que ya informa el parser.
 */
function droppedIntoFolder(name, args, directory, dialect, platform) {
  const { grammar, sources, destination } = copyOperands(name, args, dialect);

  if (destination === undefined) return [];

  const folders = resolveOperand(destination, directory, name, grammar, platform).filter((entry) => entry.path !== undefined && isFolder(entry.path));

  const origins = sources.flatMap((raw) => resolveOperand(raw, directory, name, grammar, platform)).filter((entry) => entry.path !== undefined && exists(entry.path));

  return folders.flatMap((folder) => origins.map((origin) => ({ path: path.join(folder.path, path.basename(origin.path)), via: name })));
}

/** Whether anything exists at `target`, a link included. @es Si existe algo en `target`, enlace incluido. */
function exists(target) {
  try {
    lstatSync(target);

    return true;
  } catch {
    return false;
  }
}

/** Whether `target` is an existing folder (a link is not followed). @es Si `target` es una carpeta existente. */
function isFolder(target) {
  try {
    return lstatSync(target).isDirectory();
  } catch {
    return false;
  }
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

    if (COPIERS.has(name)) created.push(...droppedIntoFolder(name, args, directory, dialect, platform));
  }

  return created;
}
