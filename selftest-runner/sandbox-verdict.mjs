/**
 * Decides what one selftest left where it must not: the runner's whole leak verdict. It looks ONLY at places no
 * other process writes, so a live session writing the real home while the selftest runs can never turn it red:
 *   - its sandbox home (`sandbox.mjs`): the child starts with an empty `~/.claude` and nothing else, and every
 *     mechanism's state belongs in `HOOK_STATE_DIR`, which lives outside the home. ANY path left in the home is
 *     a module that bypassed the state seam (it joined `homedir()` itself), named as `~/<path>`; the empty
 *     `~/.claude` removed is a write too;
 *   - its private temp directory: anything still there after the child exited is a leftover, named `$TMP/<path>`;
 *   - the tree under test: a path `git status` lists after the selftest and not before, or lists differently, or
 *     no longer lists (`tree-status.mjs`), named by its absolute path.
 * A directory is named only when it is empty; otherwise its contents are, so each path says what was written.
 *
 * WHAT IT CANNOT TELL: a write that left no trace by the time the child exited (created and removed), a write
 * outside every place above (an ignored path of the tree, a hard-coded absolute path), and, when the tree under
 * test IS a live home, a tracked file a live session edits during the selftest.
 *
 * @es Decide qué dejó un selftest donde no debía: todo el veredicto de fugas del runner. Mira SOLO sitios que
 * ningún otro proceso escribe, así una sesión viva que escriba el home real durante el selftest nunca lo pone
 * rojo: su home de sandbox (empieza con un `~/.claude` vacío y nada más, y el estado de cada mecanismo va en
 * `HOOK_STATE_DIR`, fuera del home: CUALQUIER ruta que quede en el home es un módulo que se saltó la costura de
 * estado, nombrada `~/<ruta>`; borrar el `~/.claude` vacío también es una escritura); su temporal privado (lo
 * que quede tras salir el hijo es un resto, `$TMP/<ruta>`); y el árbol bajo prueba (una ruta que `git status`
 * lista después y no antes, distinta, o que ya no lista, por su ruta absoluta). Un directorio solo se nombra si
 * está vacío; si no, su contenido. NO PUEDE SABER de una escritura que no dejó rastro al salir el hijo, de una
 * fuera de esos sitios (ruta ignorada del árbol, ruta absoluta fija) ni, si el árbol bajo prueba ES un home vivo,
 * de un fichero seguido que una sesión viva edite durante el selftest.
 */

import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { CLAUDE_FOLDER } from './sandbox.mjs';
import { treeChanges } from './tree-status.mjs';

/**
 * The paths under `directory`, relative and `/`-separated, that are a file, a link or an empty directory, sorted.
 * A link is named, never entered.
 * @es Las rutas bajo `directory`, relativas y separadas por `/`, que son un fichero, un enlace o un directorio
 * vacío, ordenadas. Un enlace se nombra, nunca se cruza.
 */
function leavesUnder(directory, prefix = '') {
  const leaves = [];

  for (const name of readdirSync(directory).sort()) {
    const relative = `${prefix}${name}`;
    const full = path.join(directory, name);
    const children = lstatSync(full).isDirectory() ? leavesUnder(full, `${relative}/`) : [];

    leaves.push(...(children.length > 0 ? children : [relative]));
  }

  return leaves;
}

/** What the child left in its sandbox home. @es Lo que el hijo dejó en el home de su sandbox. */
function homeEscapes(sandbox) {
  if (lstatSync(sandbox.claudeHome, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return [{ area: 'home', change: 'removed', path: `~/${CLAUDE_FOLDER}` }];
  }

  return leavesUnder(sandbox.home)
    .filter((relative) => relative !== CLAUDE_FOLDER)
    .map((relative) => ({ area: 'home', change: 'created', path: `~/${relative}` }));
}

/** What the child left in its private temp directory. @es Lo que el hijo dejó en su temporal privado. */
function tempEscapes(sandbox) {
  return leavesUnder(sandbox.temp).map((relative) => ({ area: 'temp', change: 'created', path: `$TMP/${relative}` }));
}

/**
 * Every escape of one selftest: `{ area, change, path }` with `area` one of `home`, `temp`, `tree`, in that
 * order, each area sorted by path.
 * @es Cada fuga de un selftest: `{ area, change, path }`, por áreas `home`, `temp`, `tree` en ese orden, y
 * cada área ordenada por ruta.
 */
export function escapesOf({ sandbox, tree, treeBefore, treeAfter }) {
  const inTree = treeChanges(treeBefore, treeAfter).map(({ path: relative, change }) => ({ area: 'tree', change, path: path.join(tree, relative) }));

  return [...homeEscapes(sandbox), ...tempEscapes(sandbox), ...inTree];
}
