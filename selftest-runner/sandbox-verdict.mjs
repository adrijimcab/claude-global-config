/**
 * Decides what one selftest left where it must not: the runner's whole leak verdict. It looks ONLY at places no
 * other process writes, so a live session writing the real home while the selftest runs can never turn it red:
 *   - its sandbox home (`sandbox.mjs`): the child starts with an empty `~/.claude` and nothing else, and every
 *     mechanism's state belongs in `HOOK_STATE_DIR`, which lives outside the home. ANY path left in the home is
 *     a module that bypassed the state seam (it joined `homedir()` itself), named as `~/<path>`; the empty
 *     `~/.claude` removed is a write too;
 *   - its private temp directory: anything still there after the child exited is a leftover, named `$TMP/<path>`;
 *   - the tree under test: a path `git status` lists after the selftest and not before, or lists differently, or
 *     no longer lists (`tree-status.mjs`), named by its absolute path;
 *   - the MAIN checkout, when the tree under test is a linked worktree of it: the same `git status` comparison, so a
 *     selftest run in a worktree that writes its main checkout is named there (measured 2026-10-27: a fixture that
 *     appended to a tracked file and created a file in the main checkout read GREEN before this area existed).
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
 * de un fichero seguido que una sesión viva edite durante el selftest. Si el árbol es un worktree enlazado, también
 * su checkout PRINCIPAL, con la misma comparación de `git status` (medido el 2026-10-27: un fixture que escribía el
 * checkout principal salía VERDE antes de esta área). Igual que con un home vivo, una sesión que edite un fichero
 * seguido del checkout principal durante el selftest no se distingue de él.
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

/**
 * What the child left in its private temp directory; a temp the child deleted is an escape too, never a crash.
 * @es Lo que el hijo dejó en su temporal privado; un temporal que el hijo borró también es una fuga, nunca un crash.
 */
function tempEscapes(sandbox) {
  if (lstatSync(sandbox.temp, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return [{ area: 'temp', change: 'removed', path: '$TMP' }];
  }

  return leavesUnder(sandbox.temp).map((relative) => ({ area: 'temp', change: 'created', path: `$TMP/${relative}` }));
}

/** The `git status` changes of one checkout as escapes of `area`, named absolute. @es Los cambios de `git status` de un checkout como fugas de `area`. */
const statusEscapes = (area, top, before, after) => treeChanges(before, after).map(({ path: relative, change }) => ({ area, change, path: path.join(top, relative) }));

/**
 * Every escape of one selftest: `{ area, change, path }` with `area` one of `home`, `temp`, `tree`, `checkout`, in
 * that order, each area sorted by path. `checkout` is present only when the tree has a main checkout of its own.
 * @es Cada fuga de un selftest: `{ area, change, path }`, por áreas `home`, `temp`, `tree`, `checkout` en ese orden,
 * y cada área ordenada por ruta. `checkout` solo existe si el árbol tiene un checkout principal propio.
 */
export function escapesOf({ sandbox, tree, treeBefore, treeAfter, checkout }) {
  return [...sandboxEscapes(sandbox), ...treeEscapes({ tree, treeBefore, treeAfter, checkout })];
}

/**
 * What a child left in its own sandbox (home, then temp): attributable to that child alone, even when other selftests
 * run at the same time, because no other process writes there.
 * @es Lo que un hijo dejó en su propio sandbox (home y luego temp): atribuible solo a ese hijo aunque otros selftests
 * corran a la vez, porque ningún otro proceso escribe ahí.
 */
export function sandboxEscapes(sandbox) {
  return [...homeEscapes(sandbox), ...tempEscapes(sandbox)];
}

/**
 * The `git status` changes of the tree and of its main checkout between two readings: shared state, so a parallel run
 * reads them around the whole batch, never per selftest.
 * @es Los cambios de `git status` del árbol y de su checkout principal entre dos lecturas: estado compartido, así que una
 * corrida paralela los lee alrededor de toda la tanda, nunca por selftest.
 */
export function treeEscapes({ tree, treeBefore, treeAfter, checkout }) {
  const inCheckout = checkout === undefined ? [] : statusEscapes('checkout', checkout.top, checkout.before, checkout.after);

  return [...statusEscapes('tree', tree, treeBefore, treeAfter), ...inCheckout];
}
