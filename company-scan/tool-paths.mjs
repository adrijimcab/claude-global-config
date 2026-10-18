/**
 * Which file PATHS belong to an AI tool: the paths that match a glob of `blocked-paths`, the one list the agent
 * guards and the b100-am-ui in-repo hooks share. Each glob is matched against the whole path with shell `case`
 * semantics (`path-glob.mjs`), ignoring case and reading a Windows `\` as `/`, exactly as the file's header
 * tells every reader to. A malformed list is a loud failure at load, never a silently shorter list.
 *
 * @es Qué RUTAS de fichero pertenecen a una herramienta de IA: las que casan con un glob de `blocked-paths`, la
 * única lista que comparten los guards de agentes y los hooks de b100-am-ui. Cada glob se compara con la ruta
 * entera con la semántica de `case` (`path-glob.mjs`), sin distinguir mayúsculas y leyendo un `\` de Windows como
 * `/`, tal como la cabecera del fichero manda a todo lector. Una lista mal formada falla ruidosamente al
 * cargar, nunca queda como una lista más corta en silencio.
 */

import { readFileSync } from 'node:fs';

import { UNSUPPORTED, globMatches } from './path-glob.mjs';

/** The list file, next to this module. @es El fichero de la lista, junto a este módulo. */
export const BLOCKED_PATHS_FILE = new URL('./blocked-paths', import.meta.url);

/**
 * The globs of a list text: one per line, blank lines and `#` comments skipped.
 * @throws when a glob holds a character `case` would read as syntax this reader does not implement, or the list is empty.
 * @es Los globs de un texto de lista: uno por línea, sin líneas vacías ni comentarios `#`.
 */
export function parseBlockedPaths(text) {
  const globs = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));

  for (const glob of globs) {
    const unsupported = [...UNSUPPORTED].find((character) => glob.includes(character));

    if (unsupported !== undefined) throw new Error(`blocked-paths: "${glob}" holds "${unsupported}", which this reader does not implement. @es blocked-paths: "${glob}" lleva "${unsupported}", que este lector no implementa.`);
  }

  if (globs.length === 0) throw new Error('blocked-paths: the list holds no glob. @es blocked-paths: la lista no tiene ningún glob.');

  return globs;
}

/** The shared list, read once. @es La lista compartida, leída una vez. */
export const BLOCKED_GLOBS = Object.freeze(parseBlockedPaths(readFileSync(BLOCKED_PATHS_FILE, 'utf8')));

const normalized = (text) => text.toLowerCase().replaceAll('\\', '/');

/**
 * @returns The globs `path` matches, as written in the list; `[]` for a path that belongs to no tool.
 * @param globs The list to match against (injectable; the shared list by default).
 * @es Los globs que cumple `path`, tal como están escritos en la lista; `[]` si la ruta no es de ninguna herramienta.
 */
export function toolPathTerms(path, globs = BLOCKED_GLOBS) {
  const subject = normalized(path);

  return globs.filter((glob) => globMatches(normalized(glob), subject));
}
