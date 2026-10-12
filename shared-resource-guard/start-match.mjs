/**
 * Whether a simple command STARTS a declared shared resource.
 *
 * A start is an argv pattern from the declaration (`["node", "bin/www"]`): the command's executable is the
 * pattern's first word, and every other pattern word appears among the command's arguments. A launcher in
 * front (`npx`, `cross-env`, PowerShell `Start-Process`) is looked through, so `npx nodemon bin/www` and
 * `Start-Process node -ArgumentList bin/www` are the same start. Reading the entry point (`cat bin/www`,
 * `bat bin/www`) is not a start: the executable decides, never the mere presence of the path.
 *
 * WHERE IT RUNS. A pattern word that is a path is compared with `path-words.mjs`. When the resource declares
 * a `home`, that path must resolve INSIDE it from the command's directory (so `node bin/www` run in another
 * project's checkout is not the shared one), and a pattern with no path word (`npm start`) must run with its
 * directory inside `home`. A directory the line's `cd` cannot reveal counts as a match: a guard that cannot
 * prove a command is elsewhere assumes it is not.
 *
 * @es Si un comando simple ARRANCA un recurso compartido declarado: el patrón argv de la declaración, con el
 * ejecutable como primera palabra y las demás entre los argumentos; se atraviesa un lanzador delante (`npx`,
 * `cross-env`, `Start-Process`). Leer el punto de entrada no es arrancar: decide el ejecutable. DÓNDE corre:
 * con `home` declarada, la ruta debe resolverse DENTRO de ella desde el directorio del comando, y un patrón
 * sin ruta (`npm start`) debe correr con su directorio dentro de `home`. Un directorio que el `cd` no revela
 * cuenta como coincidencia: un guard que no puede probar que está en otro sitio supone que no lo está.
 */

import path from 'node:path';

import { nativeSpelling } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, executableName } from '../shell-command/shell-command.mjs';
import { endsAtSegment, isPathLike, normalizedPath } from './path-words.mjs';

/** Executables that run the next word as the real command. @es Ejecutables que corren la palabra siguiente como el comando real. */
const LAUNCHERS = new Set(['npx', 'pnpx', 'cross-env', 'start-process', 'saps', 'start', 'call']);

const isInside = (directory, parent, platform) => {
  const inner = normalizedPath(path.resolve(directory), platform);
  const outer = normalizedPath(path.resolve(parent), platform);

  return inner === outer || inner.startsWith(`${outer}/`);
};

/** Whether `argument` is the declared path `wanted`, seen from `directory`. @es Si `argument` es la ruta declarada `wanted`, vista desde `directory`. */
function isDeclaredPath(argument, wanted, directory, home, platform) {
  if (home === undefined || directory === undefined) return endsAtSegment(argument, wanted, platform);

  const resolved = path.resolve(directory, nativeSpelling(argument, platform));

  return normalizedPath(resolved, platform) === normalizedPath(path.resolve(home, wanted), platform);
}

function patternStarts(pattern, words, directory, home, platform) {
  const at = commandWordIndex(words);

  if (at === -1) return false;

  const argv = words.slice(at);
  const launched = LAUNCHERS.has(executableName(argv[0]));
  const first = argv.findIndex((word, index) => (index === 0 || launched) && executableName(word) === executableName(pattern[0]));

  if (first === -1) return false;

  const rest = argv.slice(first + 1);
  const wanted = pattern.slice(1);
  const found = wanted.every((expected) => rest.some((argument) => (isPathLike(expected) ? isDeclaredPath(argument, expected, directory, home, platform) : argument.toLowerCase() === expected.toLowerCase())));

  if (!found) return false;
  if (home === undefined || wanted.some(isPathLike)) return true;

  return directory === undefined || isInside(directory, home, platform);
}

/**
 * @param {string[]} words The command's words, quoting resolved.
 * @param {string | undefined} directory The directory the command runs in, `undefined` when unknowable.
 * @param {{ startCommands?: string[][], home?: string }} resource A resource of the declaration.
 * @returns {boolean} Whether the command starts the resource.
 * @es Si el comando arranca el recurso.
 */
export function startsResource(words, directory, resource, platform = process.platform) {
  return (resource.startCommands ?? []).some((pattern) => patternStarts(pattern, words, directory, resource.home, platform));
}
