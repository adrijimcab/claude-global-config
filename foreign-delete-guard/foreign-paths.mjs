/**
 * Which of the files a deletion would remove are NOT the agent's. A path that exists and is not owned is foreign;
 * a folder is judged by what it holds: it passes when every file under it is owned, and the folder (or any
 * subfolder) that is empty and not owned is itself foreign, because removing it removes somebody else's folder.
 *
 * A symbolic link or junction is a leaf and is never followed: deleting the link does not delete its target, and
 * walking into it could read a whole other tree (a Windows junction is a reparse point; the lesson
 * `recursive-delete-followed-a-junction` is why).
 *
 * A path that does not exist is nothing to delete. A folder that cannot be listed counts as foreign, and a walk
 * past `MAX_ENTRIES` is reported as `exceeded` so the caller refuses what it could not finish checking.
 *
 * @es Cuáles de los ficheros que borraría un borrado NO son del agente. Una ruta que existe y no es propia es
 * ajena; una carpeta se juzga por lo que contiene: pasa si todo lo de dentro es propio, y la carpeta (o
 * subcarpeta) vacía y no propia es ajena en sí. Un enlace simbólico o una junction es una hoja y no se sigue.
 * Una ruta que no existe no es nada que borrar. Una carpeta ilegible cuenta como ajena y un recorrido que pasa de
 * `MAX_ENTRIES` se informa como `exceeded` para que el llamador rechace lo que no pudo terminar de comprobar.
 */

import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { canonical } from '../shared-temp-guard/shared-temp-targets.mjs';

/** The most directory entries one deletion is walked through. @es El máximo de entradas por las que se recorre un borrado. */
export const MAX_ENTRIES = 20000;

/** The spelling `canonical` gives a name: lower case where the file system folds case. @es La grafía canónica de un nombre. */
const folded = (name) => (process.platform === 'win32' ? name.toLowerCase() : name);

/**
 * @param {string} candidate An absolute path a deletion would reach.
 * @param {{ ownsCanonical: (canonicalPath: string) => boolean }} ownership The agent's ownership.
 * @param {number} [limit] The walk budget.
 * @param {Function} [list] The directory listing, injectable so a selftest can make a folder unreadable.
 * @returns {{ foreign: string[], exceeded: boolean }} The paths in it the agent does not own.
 * @es Las rutas de `candidate` que el agente no posee.
 */
export function foreignLeaves(candidate, ownership, limit = MAX_ENTRIES, list = readdirSync) {
  let status;

  try {
    status = lstatSync(candidate);
  } catch {
    return { foreign: [], exceeded: false };
  }

  const root = canonical(candidate);

  if (ownership.ownsCanonical(root)) return { foreign: [], exceeded: false };
  if (!status.isDirectory()) return { foreign: [candidate], exceeded: false };

  const foreign = [];
  let seen = 0;

  const walk = (directory, canonicalDirectory) => {
    let entries;

    try {
      entries = list(directory, { withFileTypes: true });
    } catch {
      foreign.push(directory);
      return;
    }

    if (entries.length === 0) {
      foreign.push(directory);
      return;
    }

    for (const entry of entries) {
      seen += 1;

      if (seen > limit) return;

      const child = path.join(directory, entry.name);
      const canonicalChild = `${canonicalDirectory}/${folded(entry.name)}`;

      if (ownership.ownsCanonical(canonicalChild)) continue;

      if (entry.isDirectory()) walk(child, canonicalChild);
      else foreign.push(child);
    }
  };

  walk(candidate, root);

  return { foreign, exceeded: seen > limit };
}
