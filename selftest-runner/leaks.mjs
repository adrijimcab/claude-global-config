/**
 * The live state no selftest may write, and how the runner tells that one did. Every selftest runs with a fresh
 * `HOOK_STATE_DIR` of its own (see `run.mjs`), so a module that resolves its state through
 * `hook-state/locations.mjs` never reaches the live directories; this is the proof for the ones that do not. The
 * runner takes a snapshot before and after each selftest, and any difference turns that selftest RED with the
 * offending paths.
 *
 * WHAT IS WATCHED, as the RUNNER's own process resolves it (never the child's): every `<home>/<mechanism>/state`
 * of the Claude home (`claudeHome()`), and of the tree under test, because a module that still joins its own
 * directory with `state` writes there (on the owner's machine the tree IS the Claude home, so the two coincide);
 * and the whole `HOOK_STATE_DIR` when the runner itself runs under one. The directories are listed again for
 * the second snapshot, so a state directory the selftest CREATED is a leak too.
 *
 * WHAT A SNAPSHOT HOLDS: every entry under those directories, never through a link, as `size:mtime` for a file,
 * `dir` for a directory and `link` for a link. A read changes none of them; a write, a new file, a removal or a
 * new directory changes one.
 *
 * WHAT IT CANNOT TELL: whose write it was. Another process writing the same state while the selftest runs (a
 * live session's own hooks) reads as that selftest's leak; the report names the paths, so it can be checked.
 *
 * @es El estado vivo que ningún selftest puede escribir, y cómo el runner detecta que uno lo hizo. Cada selftest
 * corre con su propio `HOOK_STATE_DIR` nuevo (ver `run.mjs`), así que un módulo que resuelve por
 * `locations.mjs` nunca llega a los directorios vivos; esto es la prueba para los que no. Se toma una instantánea
 * antes y después de cada selftest y cualquier diferencia lo pone ROJO con las rutas culpables. SE VIGILA, tal
 * como lo resuelve el proceso del RUNNER: cada `<home>/<mecanismo>/state` del home de Claude y del árbol bajo
 * prueba (un módulo que aún une su propio directorio con `state` escribe ahí), y el `HOOK_STATE_DIR` entero si el
 * runner corre bajo uno; se vuelven a listar para la segunda instantánea, así un directorio de estado CREADO
 * también es una fuga. Una instantánea guarda cada entrada, sin cruzar enlaces: `tamaño:mtime` de un fichero,
 * `dir` o `link`. NO PUEDE SABER de quién fue la escritura: otro proceso que escriba el mismo estado durante el
 * selftest (los hooks de una sesión viva) cuenta como fuga suya; el informe nombra las rutas para comprobarlo.
 */

import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { STATE_ROOT_VARIABLE, claudeHome, stateDirsUnder, stateRoot } from '../hook-state/locations.mjs';

/**
 * The directories a selftest must not touch, absolute, unique and sorted, for the tree at `treeRoot`.
 * @es Los directorios que un selftest no puede tocar, absolutos, únicos y ordenados.
 */
export function watchedStateDirs(treeRoot) {
  const homes = [claudeHome(), path.resolve(treeRoot)];
  const directories = homes.flatMap((home) => stateDirsUnder(home).map(({ directory }) => directory));

  if (process.env[STATE_ROOT_VARIABLE]) directories.push(stateRoot());

  return [...new Set(directories)].sort();
}

/** What a snapshot keeps of one entry. @es Lo que guarda una instantánea de una entrada. */
function signatureOf(stats) {
  if (stats.isSymbolicLink()) return 'link';
  if (stats.isDirectory()) return 'dir';

  return `${stats.size}:${stats.mtimeMs}`;
}

/** Records `directory` and everything under it into `into`, never through a link. @es Registra `directory` y todo lo de debajo, sin cruzar enlaces. */
function record(directory, into) {
  const stats = lstatSync(directory, { throwIfNoEntry: false });

  if (stats === undefined) return;

  into.set(directory, signatureOf(stats));

  if (!stats.isDirectory()) return;

  for (const name of readdirSync(directory)) record(path.join(directory, name), into);
}

/**
 * Every entry of the live state now, `path -> signature`.
 * @es Cada entrada del estado vivo ahora, `ruta -> firma`.
 */
export function snapshotLiveState(treeRoot) {
  const entries = new Map();

  for (const directory of watchedStateDirs(treeRoot)) record(directory, entries);

  return entries;
}

/**
 * What changed between two snapshots: `{ path, change }` with `change` one of `created`, `changed`, `removed`,
 * sorted by path.
 * @es Lo que cambió entre dos instantáneas, ordenado por ruta.
 */
export function leaksBetween(before, after) {
  const leaks = [];

  for (const [entry, signature] of after) {
    if (!before.has(entry)) leaks.push({ path: entry, change: 'created' });
    else if (before.get(entry) !== signature) leaks.push({ path: entry, change: 'changed' });
  }

  for (const entry of before.keys()) {
    if (!after.has(entry)) leaks.push({ path: entry, change: 'removed' });
  }

  return leaks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
