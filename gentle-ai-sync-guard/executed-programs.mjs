/**
 * Qué PROGRAMAS ejecuta un script y con qué argumentos: `{ program, args }` por cada comando simple.
 *
 * `program` es el nombre normalizado del ejecutable (sin ruta, en minúsculas, sin `.exe`/`.cmd`/…),
 * porque `C:\…\go\bin\gentle-ai.exe` y `/c/…/gentle-ai` son el mismo programa. Antes del programa se
 * saltan asignaciones (`FOO=1`) y prefijos que ejecutan lo que sigue (`env`, `sudo`, `command`,
 * `exec`, `nohup`, `time`…; el `&` de PowerShell ya lo separa el analizador léxico). Un shell anidado (`bash -c "…"`, `pwsh -Command …`,
 * `cmd /c …`) no es el final del camino: su script se analiza también, porque es lo que de verdad corre.
 */
import { DIALECTS, simpleCommands } from './shell-words.mjs';

const PREFIXES = new Set(['!', '{', '}', 'if', 'elif', 'then', 'else', 'do', 'while', 'until', 'time', 'command', 'builtin', 'exec', 'nohup', 'sudo', 'env']);
const EXECUTABLE_SUFFIXES = ['.exe', '.cmd', '.bat', '.ps1'];
const POSIX_SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const POWERSHELLS = new Set(['pwsh', 'powershell']);
const CMD_SCRIPT_SWITCHES = new Set(['/c', '//c', '/k', '//k']);
const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const MAX_NESTING = 4;

/** `C:\x\gentle-ai.EXE` -> `gentle-ai`. */
export function executableName(word) {
  const cut = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
  const base = word.slice(cut + 1).toLowerCase();
  const suffix = EXECUTABLE_SUFFIXES.find((candidate) => base.endsWith(candidate));
  return suffix === undefined ? base : base.slice(0, -suffix.length);
}

function isAssignment(word) {
  const equals = word.indexOf('=');
  return equals > 0 && [...word.slice(0, equals)].every((char) => NAME_CHARACTERS.includes(char));
}

/** Índice de la palabra que nombra el programa, o -1 si el comando es solo prefijos/asignaciones. */
function programIndex(words) {
  let afterEnv = false;
  const index = words.findIndex((word) => {
    if (PREFIXES.has(word)) {
      afterEnv = afterEnv || word === 'env';
      return false;
    }
    if (isAssignment(word)) return false;
    // Las opciones de `env` (`-i`, `-u NOMBRE`) van antes del programa; se saltan las que empiezan con -.
    return !(afterEnv && word.startsWith('-'));
  });
  return index;
}

/** El script que un shell anidado va a ejecutar, con su dialecto, o null si no ejecuta ninguno. */
function nestedScript(program, args) {
  if (POSIX_SHELLS.has(program)) {
    const flag = args.findIndex((arg) => arg.startsWith('-') && !arg.startsWith('--') && arg.includes('c'));
    return flag < 0 || args[flag + 1] === undefined ? null : { script: args[flag + 1], dialect: DIALECTS.BASH };
  }
  if (POWERSHELLS.has(program)) {
    // PowerShell acepta cualquier abreviatura de -Command (-c, -com, -Command…) y une el resto.
    const flag = args.findIndex((arg) => arg.length >= 2 && '-command'.startsWith(arg.toLowerCase()));
    return flag < 0 ? null : { script: args.slice(flag + 1).join(' '), dialect: DIALECTS.POWERSHELL };
  }
  if (program === 'cmd') {
    const flag = args.findIndex((arg) => CMD_SCRIPT_SWITCHES.has(arg.toLowerCase()));
    return flag < 0 ? null : { script: args.slice(flag + 1).join(' '), dialect: DIALECTS.BASH };
  }
  return null;
}

function collect(script, dialect, nesting) {
  return simpleCommands(script, dialect).flatMap((words) => {
    const at = programIndex(words);
    if (at < 0) return [];
    const invocation = { program: executableName(words[at]), args: words.slice(at + 1) };
    const nested = nesting < MAX_NESTING ? nestedScript(invocation.program, invocation.args) : null;
    return nested === null ? [invocation] : [invocation, ...collect(nested.script, nested.dialect, nesting + 1)];
  });
}

/**
 * @param {string} script
 * @param {'bash'|'powershell'} dialect
 * @returns {{ program: string, args: string[] }[]}
 */
export const executedPrograms = (script, dialect) => collect(script, dialect, 0);
