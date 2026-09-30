/**
 * Finds the landed paths that the main checkout already occupies: with another actor's uncommitted work
 * (a fast-forward would collide with it), or with an ignored file whose content differs from what lands
 * (git overwrites ignored files silently, so that content would be lost with no message).
 *
 * @es Encuentra las rutas aterrizadas que el checkout principal ya ocupa: con trabajo sin commitear de
 * otro actor (un fast-forward chocaría con él), o con un fichero ignorado cuyo contenido difiere de lo que
 * aterriza (git sobrescribe los ignorados en silencio, así que ese contenido se perdería sin aviso).
 */

import { lstatSync } from 'node:fs';
import path from 'node:path';

import { entriesOf, gitOutput } from './git.mjs';
import { uncommittedPaths } from './working-tree.mjs';

/** Paths changed between two commits, renames split into delete plus add. @es Rutas que cambian entre dos commits. */
function changedPaths(checkout, from, to, filter = []) {
  return entriesOf(gitOutput(checkout, ['diff', '--name-only', '-z', '--no-renames', ...filter, from, to, '--']));
}

/**
 * True when something already sits at `relative` in the main checkout and it is not byte-for-byte what
 * the landed commit would check out there (compared after git's own clean filters, so a line-ending
 * conversion is not a difference). A file standing where a landed directory must go counts as occupied.
 * @es Verdadero cuando algo ocupa ya `relative` en el checkout principal y no es exactamente lo que el
 * commit aterrizado escribiría allí (comparado tras los filtros de git, así que un cambio de fin de línea no
 * cuenta). Un fichero donde debe ir un directorio aterrizado cuenta como ocupado.
 */
function occupiedWithOtherContent(main, head, relative) {
  const file = path.join(main, relative);
  let stats;
  try {
    stats = lstatSync(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    if (error?.code === 'ENOTDIR') return true;
    throw error;
  }
  if (!stats.isFile()) return true;
  const onDisk = gitOutput(main, ['hash-object', `--path=${relative}`, '--', file]).trim();
  const landing = gitOutput(main, ['rev-parse', `${head}:${relative}`]).trim();
  return onDisk !== landing;
}

/**
 * @param {{ main: string, tip: string, head: string }} range the shared tip and the commit that lands on it
 * @returns {{ landed: string[], dirty: string[], ignored: string[] }}
 * @es Devuelve las rutas aterrizadas, las que están sucias en el principal y las ignoradas con otro contenido.
 */
export function collisionsOf({ main, tip, head }) {
  const landed = changedPaths(main, tip, head);
  const uncommitted = new Set(uncommittedPaths(main));
  const dirty = landed.filter((relative) => uncommitted.has(relative));
  const ignored = changedPaths(main, tip, head, ['--diff-filter=A'])
    .filter((relative) => !uncommitted.has(relative))
    .filter((relative) => occupiedWithOtherContent(main, head, relative));
  return { landed, dirty, ignored };
}
