/**
 * Whether a simple command STOPS a declared shared resource, and by which route.
 *
 * A stop is a command of the kill family (`kill`, `pkill`, `killall`, `taskkill`, `Stop-Process`,
 * `kill-port`), also behind `xargs` or `npx`. What it TARGETS is read from its own words, by three routes:
 *   - PORT: a word that holds the declared port as a whole digit run (`:3100`, `3100/tcp`, `--port=3100`),
 *     or a bare number after a port flag (`-LocalPort 3100`), or any bare number for `kill-port`;
 *   - PID: a bare number that the LIVE listener table (`listeners.mjs`) says listens on a declared port;
 *   - NAME: a single word equal to a declared `processNames` entry (`node.exe` is `node`) or ending at a
 *     segment with a declared start path (`pkill -f bin/www`); a multi-word pattern (`pkill -f "node x.js"`)
 *     matches only by the start path, because the bare name inside it narrows nothing down.
 *
 * AN UNRESOLVABLE TARGET (`$pid`, `$(...)`, `$_.OwningProcess`, or no target at all because the PID comes
 * down a pipe or from `( ... )`) cannot be read from the command, so the evidence widens to EVERY word of
 * the script: if the script names a declared port or name anywhere, the stop is attributed to that resource.
 * That can refuse an innocent line (a `curl localhost:3100` beside a `kill $!`); the worker splits it. The
 * other way, a guard that cannot read the target and says nothing, is how the incident happened.
 *
 * @es Si un comando simple DETIENE un recurso compartido declarado, y por qué ruta. Detener es un comando
 * de la familia kill, también tras `xargs`. Su objetivo se lee de sus palabras por tres rutas: PUERTO (el
 * puerto declarado como racha de dígitos entera, o un número pelado tras un flag de puerto), PID (un número
 * pelado que la tabla VIVA de escuchas dice que escucha en un puerto declarado) y NOMBRE (una palabra igual a
 * un `processNames`, o que termina en una ruta de arranque; un patrón de varias palabras solo casa por la
 * ruta). Un objetivo NO RESOLUBLE (`$pid`, `$(...)`, o ninguno porque el PID llega por tubería) no se puede
 * leer: la evidencia se ensancha a TODAS las palabras del script. Puede rechazar una línea inocente; el worker
 * la parte. Callar ante un objetivo ilegible es cómo ocurrió el incidente.
 */

import { commandWordIndex, executableName } from '../shell-command/shell-command.mjs';
import { endsAtSegment, isPathLike } from './path-words.mjs';

/** The executables that end processes. @es Los ejecutables que terminan procesos. */
const STOP_EXECUTABLES = new Set(['kill', 'pkill', 'killall', 'taskkill', 'stop-process', 'spps', 'kill-port']);

/** Executables that run a later word as the real command. @es Ejecutables que corren una palabra posterior como el comando real. */
const WRAPPERS = new Set(['xargs', 'npx', 'pnpx']);

/** The executable whose bare numbers are ports, not PIDs. @es El ejecutable cuyos números pelados son puertos, no PIDs. */
const PORT_ARGUMENT_EXECUTABLE = 'kill-port';

/** Flags whose next word is a port. @es Flags cuya palabra siguiente es un puerto. */
const PORT_FLAGS = new Set(['-port', '-localport', '--port', '/port']);

const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const isDigits = (word) => word !== '' && [...word].every((character) => DIGITS.includes(character));

/** `-f`, `/PID`, `//F`: an option, never a target. @es Una opción, nunca un objetivo. */
function isOption(word) {
  if (word.startsWith('-')) return true;

  const bare = [...word].slice([...word].findIndex((character) => character !== '/'));

  return word.startsWith('/') && bare.length > 0 && bare.length <= 6 && bare.every((character) => LETTERS.includes(character));
}

/** The digit runs of a word, so `localhost:3100/x` yields `3100`. @es Las rachas de dígitos de una palabra. */
function digitRuns(word) {
  const runs = [];
  let current = '';

  for (const character of word) {
    if (DIGITS.includes(character)) current += character;
    else if (current !== '') {
      runs.push(current);
      current = '';
    }
  }

  return current === '' ? runs : [...runs, current];
}

/** Whether `word` (after `previous`) refers to `port` as a PORT. @es Si `word` (tras `previous`) se refiere a `port` como PUERTO. */
function namesPort(word, previous, port, bareIsPort) {
  const text = String(port);

  if (isDigits(word)) return word === text && (bareIsPort || PORT_FLAGS.has(String(previous).toLowerCase()));

  return digitRuns(word).includes(text);
}

/** Whether the single `word` is a declared process name or ends at a declared start path. @es Si `word` es un nombre de proceso declarado o termina en una ruta de arranque. */
function namesProcess(word, resource, platform) {
  const bare = executableName(word);
  const multiWord = word.trim().includes(' ');

  const byName = !multiWord && (resource.processNames ?? []).some((name) => executableName(name) === bare);
  const startPaths = (resource.startCommands ?? []).flatMap((pattern) => pattern.slice(1)).filter(isPathLike);
  const tokens = multiWord ? word.trim().split(' ').filter((token) => token !== '') : [word];

  return byName || startPaths.some((startPath) => tokens.some((token) => endsAtSegment(token, startPath, platform)));
}

/** The index of the stop executable in `words`, or -1. @es El índice del ejecutable de parada en `words`, o -1. */
function stopIndex(words) {
  const at = commandWordIndex(words);

  if (at === -1) return -1;
  if (STOP_EXECUTABLES.has(executableName(words[at]))) return at;
  if (!WRAPPERS.has(executableName(words[at]))) return -1;

  const behind = words.slice(at + 1).findIndex((word) => STOP_EXECUTABLES.has(executableName(word)));

  return behind === -1 ? -1 : at + 1 + behind;
}

/** The first route by which `evidence` targets `resource`, or `undefined`. @es La primera ruta por la que `evidence` apunta a `resource`. */
function routeOf(evidence, resource, bareIsPort, listeners, platform) {
  for (const [index, word] of evidence.entries()) {
    const previous = evidence[index - 1];
    const port = (resource.ports ?? []).find((candidate) => namesPort(word, previous, candidate, bareIsPort));

    if (port !== undefined) return `port ${port}`;
    if (namesProcess(word, resource, platform)) return `process "${word}"`;
  }

  const pids = evidence.filter(isDigits);
  const listening = pids.length === 0 ? undefined : (resource.ports ?? []).find((port) => pids.some((pid) => listeners(port).has(pid)));

  return listening === undefined ? undefined : `a process listening on port ${listening}`;
}

/**
 * @param {string[]} words The command's words, quoting resolved.
 * @param {string[]} scriptWords Every word of every command of the script, for an unresolvable target.
 * @param {object} resource A resource of the declaration.
 * @param {(port: number) => Set<string>} listeners PIDs listening on a port right now.
 * @returns {string | undefined} The route by which the command stops the resource, `undefined` when it does not.
 * @es La ruta por la que el comando detiene el recurso, `undefined` si no lo hace.
 */
export function stopRoute(words, scriptWords, resource, listeners, platform = process.platform) {
  const at = stopIndex(words);

  if (at === -1) return undefined;

  const bareIsPort = executableName(words[at]) === PORT_ARGUMENT_EXECUTABLE;
  const arguments_ = words.slice(at + 1);
  const targets = arguments_.filter((word) => !isOption(word));
  const unresolvable = targets.length === 0 || targets.some((word) => word.includes('$') || word.includes('`'));

  return routeOf(unresolvable ? [...arguments_, ...scriptWords] : arguments_, resource, bareIsPort, listeners, platform);
}
