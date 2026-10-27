/**
 * The tree a full chain MEASURES, as the absolute path recorded in the lock's holder record: the top level of the git
 * working tree that holds the directory the chain was given (`--tree`, by default the directory it runs in), or that
 * directory itself, made absolute, when it is not inside a git working tree. The top level is what every chain's
 * detector reads (`git status` of the whole tree for the selftest runner, the whole package for a project chain), so a
 * chain started from a subdirectory still measures, and protects, the whole tree.
 *
 * @es El árbol que MIDE una cadena completa, como la ruta absoluta que guarda el registro del dueño del lock: el nivel
 * superior del árbol de trabajo git que contiene el directorio dado a la cadena (`--tree`, por defecto donde corre), o
 * ese directorio, absoluto, si no está dentro de un árbol git. El nivel superior es lo que lee el detector de cada
 * cadena, así que una cadena lanzada desde un subdirectorio mide, y protege, el árbol entero.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** How long the top-level question may take. @es Cuánto puede tardar la pregunta del nivel superior. */
const GIT_TIMEOUT_MS = 20_000;

/**
 * The top level of the git working tree holding `directory`, or `undefined` when git says it is in none.
 * @es El nivel superior del árbol de trabajo git que contiene `directory`, o `undefined` si git dice que no hay.
 */
function gitTopLevel(directory) {
  const run = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true, timeout: GIT_TIMEOUT_MS });
  const top = run.status === 0 ? run.stdout.trim() : '';

  return top === '' ? undefined : path.resolve(top);
}

/**
 * @param {string} directory The directory the chain was given.
 * @param {{ topLevelOf?: (directory: string) => (string|undefined) }} [seams] Replaces the git question (a test seam).
 * @returns {string} The absolute tree the chain measures.
 * @es El árbol absoluto que mide la cadena.
 */
export function measuredTree(directory, { topLevelOf = gitTopLevel } = {}) {
  const absolute = path.resolve(directory);

  return topLevelOf(absolute) ?? absolute;
}
