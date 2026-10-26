/**
 * Whether a shell line changes a git SELECTOR variable in a way worker-git-guard does not model, which makes every
 * git command of the line unresolvable (third Judgment Day round, 2026-10-25: each round found new spellings).
 *
 * THE SELECTORS. `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, every `GIT_CONFIG*` variable, and the variables a
 * `--config-env` of the line reads: they decide which repository, index and configuration git uses.
 *
 * WHAT IS MODELLED, and nothing else: a literal prefix assignment on one command (`GIT_DIR=x git ...`, `env X=1
 * git ...`), which only that command sees; and, at the top level of the line (not in a subshell, a substitution,
 * a script block or a pipeline, and not after `&&` or `||`), bash `export NAME=value` and `unset NAME`, and
 * PowerShell `$env:NAME = value` and `Remove-Item Env:NAME`.
 *
 * WHAT IS A TOUCH (the class, failing closed): any other command that names a selector (`(export GIT_DIR=x)`,
 * `true && export ...`, `env -u GIT_DIR`, `${env:GIT_DIR} = ...`, `Set-Item Env:GIT_DIR`, a bare `GIT_DIR=x`), a
 * selector wildcard (`GIT_*`, `${!GIT_@}`, `Env:*`), and a command that can set any variable unseen (`source`, `.`,
 * `eval`, `Invoke-Expression`, `[Environment]::...`). A git command's own arguments and the arguments of a printer
 * (`echo`, `Write-Output`) only READ, so they are not scanned. A wrapper's options (`env -u X`, `env -i`) change only
 * the command they wrap, and a git command behind them is refused on its own (`gitBehindWrapperOptions`).
 *
 * @es Si una línea cambia una variable SELECTORA de git de una forma que el guard no modela, lo que hace no
 * resoluble cada comando git de la línea. Selectoras: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, toda
 * `GIT_CONFIG*` y las que lee un `--config-env` de la línea. Se modela solo una asignación literal como prefijo de
 * un comando y, en el nivel superior de la línea (sin subshell, sustitución, bloque ni tubería, y no tras `&&` o
 * `||`), `export NOMBRE=valor`, `unset NOMBRE`, `$env:NOMBRE = valor` y `Remove-Item Env:NOMBRE`. Todo otro comando
 * que nombre una selectora, un comodín de selectoras o un comando que puede fijar cualquier variable sin que se vea
 * es un TOQUE, y falla cerrado. Las opciones de un envoltorio (`env -u X`) cambian solo el comando que envuelven, y un
 * git tras ellas se rechaza por sí mismo.
 */

import { commandWordIndex, executableName, isUnresolvableWord, resolveCommand } from '../shell-command/shell-command.mjs';

/** The selector variables read by exact name. @es Las selectoras leídas por nombre exacto. */
const SELECTOR_NAMES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];

/** The prefix of every git configuration variable. @es El prefijo de toda variable de configuración de git. */
const CONFIG_PREFIX = 'GIT_CONFIG';

/** Separators after which the next command runs whatever came before. @es Separadores tras los que el siguiente comando corre siempre. */
const UNCONDITIONAL_BEFORE = new Set([';', '\n']);

/** Separators that end a top-level command that ran unconditionally. @es Separadores que cierran un comando incondicional del nivel superior. */
const UNCONDITIONAL_AFTER = new Set([';', '\n', 'end', '&&']);

/** Commands that only print their arguments. @es Comandos que solo imprimen sus argumentos. */
const PRINTERS = new Set(['echo', 'write-output', 'write-host']);

/** Commands that run text as commands, so they can set any variable. @es Comandos que ejecutan texto como comandos. */
const RUNS_TEXT = new Set(['source', '.', 'eval', 'invoke-expression', 'iex']);

/** PowerShell commands that remove an item, an environment variable among them. @es Comandos de PowerShell que borran un elemento. */
export const POWERSHELL_REMOVERS = new Set(['remove-item', 'ri', 'rm', 'del', 'erase', 'rd', 'rmdir', 'clear-item', 'cli']);

/** The PowerShell parameters that introduce the path of a remover. @es Los parámetros que introducen la ruta de un borrado. */
const PATH_PARAMETERS = new Set(['-path', '-literalpath']);

/** The PowerShell spelling of an environment variable, and its drive spelling. @es Las formas de PowerShell de una variable de entorno. */
export const POWERSHELL_ENVIRONMENT = '$env:';
export const POWERSHELL_DRIVE = 'env:';

/** A plain variable name. @es Un nombre de variable simple. */
const isPlainName = (word) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(word);

/** A bash word that is a `NAME=value` assignment. @es Una palabra bash que es una asignación `NOMBRE=valor`. */
export const isAssignment = (word) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);

/** The variable name of a PowerShell drive path (`Env:NAME`, `Env:\NAME`), or `undefined`. @es El nombre de una ruta de unidad `Env:`. */
export function driveName(word) {
  if (!word.toLowerCase().startsWith(POWERSHELL_DRIVE)) return undefined;

  const name = word.slice(POWERSHELL_DRIVE.length).replace(/^[\\/]/, '');

  return isPlainName(name) ? name : undefined;
}

/**
 * The modelled assignment a command is, or `undefined`: `{ set: [name, value] }` pairs and `{ unset: name }`
 * entries, in order.
 * @es La asignación modelada que es un comando, o `undefined`.
 */
export function modeledAssignment(words, dialect) {
  if (dialect === 'bash') {
    const operands = words.slice(1);

    if (words[0] === 'export' && operands.length > 0 && operands.every(isAssignment)) {
      return operands.map((word) => ({ set: [word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1)] }));
    }

    if (words[0] === 'unset' && operands.length > 0 && operands.every(isPlainName)) return operands.map((name) => ({ unset: name }));

    return undefined;
  }

  const [first = ''] = words;

  if (first.toLowerCase().startsWith(POWERSHELL_ENVIRONMENT)) {
    const fused = first.indexOf('=');
    const name = (fused === -1 ? first : first.slice(0, fused)).slice(POWERSHELL_ENVIRONMENT.length);
    const value = fused === -1 ? (words.length === 3 && words[1] === '=' ? words[2] : undefined) : words.length === 1 ? first.slice(fused + 1) : undefined;

    if (value === undefined) return undefined;

    return [value.length === 0 || value.toLowerCase() === '$null' ? { unset: name.toUpperCase() } : { set: [name.toUpperCase(), value] }];
  }

  if (!POWERSHELL_REMOVERS.has(first.toLowerCase())) return undefined;

  const operands = words.slice(1).filter((word) => !PATH_PARAMETERS.has(word.toLowerCase()));
  const names = operands.map(driveName);

  return names.length > 0 && names.every((name) => name !== undefined) ? names.map((name) => ({ unset: name.toUpperCase() })) : undefined;
}

/** Whether `upper` names `name` as a whole word (or, for a prefix, as the start of one). @es Si `upper` nombra `name` como palabra entera. */
function names(upper, name, prefix) {
  for (let at = upper.indexOf(name); at !== -1; at = upper.indexOf(name, at + 1)) {
    const before = at === 0 ? '' : upper.charAt(at - 1);
    const after = upper.charAt(at + name.length);

    if (/[A-Z0-9_]/.test(before)) continue;
    if (prefix || !/[A-Z0-9_]/.test(after)) return true;
  }

  return false;
}

/** Whether a word names a selector, or a wildcard that can match one. @es Si una palabra nombra una selectora o un comodín que puede casar con una. */
function namesSelector(word, extraNames) {
  const upper = word.toUpperCase();

  if (/GIT[A-Z0-9_]*[*?[]/.test(upper) || upper.includes('${!')) return true;
  if (upper.startsWith('ENV:') && /^ENV:[\\/]?([*?[]|$)/.test(upper)) return true;
  if (upper.includes('[ENVIRONMENT]::') || upper.includes('[SYSTEM.ENVIRONMENT]::')) return true;

  return SELECTOR_NAMES.some((name) => names(upper, name, false)) || names(upper, CONFIG_PREFIX, true) || extraNames.some((name) => names(upper, name.toUpperCase(), false));
}

/**
 * Whether a command runs at the top level of the line, unconditionally: outside any subshell, script block or
 * pipeline, and not after `&&` or `||`. A command inside a substitution or `bash -c` needs no flag of its own: its
 * text is a word of the command that contains it, which the scan reads.
 * @es Si un comando corre en el nivel superior de la línea, sin condición. Un comando dentro de una sustitución no
 * necesita marca propia: su texto es una palabra del comando que lo contiene, y el examen la lee.
 */
export const isTopLevel = (command) => command.depth === 0 && (command.previous === undefined || UNCONDITIONAL_BEFORE.has(command.previous)) && UNCONDITIONAL_AFTER.has(command.separator);

/**
 * Whether a command runs text as commands, so it can set any variable without naming it: a program that runs text
 * (`source`, `eval`, `iex`), or a launcher that carries a script the lexer cannot read (`Invoke-Expression $setup`,
 * which the shared parser reports with no program of its own and the carried text as its script). A carried script
 * the lexer can read is listed as nested commands and scanned there.
 * @es Si un comando ejecuta texto como comandos: un programa que ejecuta texto, o un lanzador que lleva un script que
 * el lexer no puede leer (sin programa propio y con el texto como script). Un script legible se lista como comandos
 * anidados y se examina ahí.
 */
function runsText(words, at) {
  if (at !== -1) return RUNS_TEXT.has(executableName(words[at]));

  const { script } = resolveCommand(words);

  return script !== undefined && isUnresolvableWord(script);
}

/**
 * The text of the first git command an `env` with OPTIONS launches (`env -u GIT_DIR git ...`, `env -i git ...`):
 * those options change the environment git sees in ways no rule models, so it is unresolvable. An `env NAME=value`
 * assignment is a modelled form the selector rules read, so it is not counted here. The shared parser unwraps
 * `env` to the git word, so the `env` and its words sit before it.
 * @es El texto del primer comando git que lanza un `env` con OPCIONES: cambian el entorno que ve git de formas que
 * ninguna regla modela, así que es no resoluble. Una asignación `env NOMBRE=valor` es una forma modelada.
 */
export function gitBehindWrapperOptions(commands) {
  return commands.find(({ words }) => {
    const at = commandWordIndex(words);

    if (at === -1 || executableName(words[at]) !== 'git') return false;

    const env = words.findIndex((word, index) => index < at && executableName(word) === 'env');

    return env !== -1 && words.slice(env + 1, at).some((word) => word.startsWith('-'));
  })?.text;
}

/**
 * The text of the first command of the line that touches a selector outside the modelled forms, or `undefined`.
 * @param {Array<{ words: string[], text: string, separator: string, depth: number, previous?: string }>} commands
 *   Every command of the line in execution order; `previous` is the separator before it in the line's own shell.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string[]} extraNames The variables a `--config-env` of the line reads.
 * @es El texto del primer comando de la línea que toca una selectora fuera de las formas modeladas, o `undefined`.
 */
export function selectorTouch(commands, dialect, extraNames) {
  for (const command of commands) {
    const { words } = command;
    const at = commandWordIndex(words);

    if (runsText(words, at)) return command.text;

    if (isTopLevel(command) && modeledAssignment(words, dialect) !== undefined) continue;

    const executable = at === -1 ? undefined : executableName(words[at]);
    const scanned = at === -1 ? words : executable === 'git' || PRINTERS.has(executable) ? words.slice(0, at).filter((word) => !isAssignment(word)) : words.filter((word, index) => index >= at || !isAssignment(word));

    if (scanned.some((word) => namesSelector(word, extraNames))) return command.text;
  }

  return undefined;
}
