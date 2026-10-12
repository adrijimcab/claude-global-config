/**
 * Which declared environment variables a simple command SETS, in the shells a worker uses here.
 *
 * SETTING is what reconfigures a resource: `FRT_URL=x node app` (a prefix assignment), `export FRT_URL=x`,
 * `declare`/`typeset`/`readonly`/`set NAME=x`, `setx FRT_URL x`, PowerShell `$env:FRT_URL = 'x'`,
 * `Set-Item`/`New-Item`/`Remove-Item Env:FRT_URL` and `[Environment]::SetEnvironmentVariable('FRT_URL', ...)`.
 * READING is not: `echo $env:FRT_URL`, `printenv FRT_URL` and `Get-ChildItem Env:` pass, and so does the name
 * appearing as DATA (`curl -d FRT_URL=x`, `echo FRT_URL=x`), because only the executable decides which words
 * are assignments.
 *
 * The lexer splits PowerShell's `SetEnvironmentVariable(` at the parenthesis, so its arguments arrive as the
 * NEXT command's first word (`FRT_URL,x,User`); the caller passes that word in.
 *
 * @es Qué variables de entorno declaradas SETEA un comando simple. SETEAR es lo que reconfigura un recurso:
 * prefijo `FRT_URL=x cmd`, `export`, `declare`/`typeset`/`readonly`/`set`, `setx`, `$env:FRT_URL = 'x'`,
 * `Set-Item`/`New-Item`/`Remove-Item Env:...` y `[Environment]::SetEnvironmentVariable(...)`. LEER no lo es
 * (`echo $env:FRT_URL`, `printenv`), ni lo es el nombre como DATO (`curl -d FRT_URL=x`): solo el ejecutable
 * decide qué palabras son asignaciones. El lexer parte `SetEnvironmentVariable(` en el paréntesis y sus
 * argumentos llegan como primera palabra del comando SIGUIENTE, que el llamador pasa.
 */

import { commandWordIndex, executableName } from '../shell-command/shell-command.mjs';

/** Executables whose `NAME=value` arguments assign. @es Ejecutables cuyos argumentos `NAME=valor` asignan. */
const ASSIGNING_EXECUTABLES = new Set(['export', 'declare', 'typeset', 'readonly', 'local', 'set']);

/** PowerShell cmdlets that change an `Env:` drive item. @es Cmdlets de PowerShell que cambian un elemento de `Env:`. */
const ENV_DRIVE_WRITERS = new Set(['set-item', 'si', 'new-item', 'ni', 'remove-item', 'ri', 'clear-item', 'cli', 'set-content']);

const SET_ENVIRONMENT_VARIABLE = '[environment]::setenvironmentvariable';
const POWERSHELL_ENV_PREFIX = '$env:';

const sameName = (left, right) => left.toLowerCase() === right.toLowerCase();

/** The name a `NAME=value` word assigns, or `undefined` for any other word. @es El nombre que asigna una palabra `NAME=valor`. */
function assignedName(word) {
  const equals = word.indexOf('=');

  return equals > 0 ? word.slice(0, equals) : undefined;
}

/** Whether a `$env:NAME` word, with the words after it, is an assignment. @es Si una palabra `$env:NAME`, con las siguientes, es una asignación. */
function isPowerShellAssignment(word, name, following) {
  if (!word.toLowerCase().startsWith(`${POWERSHELL_ENV_PREFIX}${name.toLowerCase()}`)) return false;

  const rest = word.slice(POWERSHELL_ENV_PREFIX.length + name.length);
  const next = rest === '' ? following[0] ?? '' : rest;

  return next.startsWith('=') || next.startsWith('+=');
}

/**
 * @param {string[]} words The command's words, quoting resolved.
 * @param {string[]} nextCommandWords The first word of the command after this one, for `SetEnvironmentVariable(`.
 * @param {{ reconfiguredBy?: string[] }} resource A resource of the declaration.
 * @returns {string[]} The declared names this command sets, in declaration order.
 * @es Los nombres declarados que este comando setea, en el orden de la declaración.
 */
export function reconfiguredNames(words, nextCommandWords, resource) {
  const at = commandWordIndex(words);
  const prefix = at === -1 ? words : words.slice(0, at);
  const executable = at === -1 ? '' : executableName(words[at]);
  const arguments_ = at === -1 ? [] : words.slice(at + 1);

  return (resource.reconfiguredBy ?? []).filter((name) => {
    const assigns = (word) => sameName(assignedName(word) ?? '', name);

    if (prefix.some(assigns)) return true;
    if (ASSIGNING_EXECUTABLES.has(executable) && arguments_.some(assigns)) return true;
    if (executable === 'setx' && sameName(arguments_[0] ?? '', name)) return true;
    if (isPowerShellAssignment(words[0] ?? '', name, words.slice(1))) return true;
    if (ENV_DRIVE_WRITERS.has(executable) && arguments_.some((word) => sameName(word, `env:${name}`))) return true;

    return words[at]?.toLowerCase() === SET_ENVIRONMENT_VARIABLE && sameName((nextCommandWords[0] ?? '').split(',')[0], name);
  });
}
