/**
 * Which of the files a deletion would remove are NOT the agent's. A path that exists and is not owned is foreign;
 * a folder is judged by what it holds: it passes when every file under it is owned, and the folder (or any
 * subfolder) that is empty and not owned is itself foreign, because removing it removes somebody else's folder.
 *
 * LINKS ARE LEAVES AND THEY ARE CHECKED EVEN INSIDE AN OWNED FOLDER. A symbolic link or junction is never
 * followed: deleting the link does not delete its target in the shell's `rm`, but a recursive PowerShell
 * `Remove-Item` through a junction has deleted the target's contents, and the lesson
 * `recursive-delete-followed-a-junction` is why this walk never descends into one. So the whole tree of an owned
 * folder is walked too, and a link whose target lies outside what the agent owns is reported foreign: owning the
 * folder does not make a junction in it a safe thing to delete recursively.
 *
 * A path that does not exist is nothing to delete. A folder that cannot be listed counts as foreign, and a walk
 * past `MAX_ENTRIES` is reported as `exceeded` so the caller refuses what it could not finish checking.
 *
 * @es Cuáles de los ficheros que borraría un borrado NO son del agente. Una ruta que existe y no es propia es
 * ajena; una carpeta se juzga por lo que contiene: pasa si todo lo de dentro es propio, y la carpeta (o
 * subcarpeta) vacía y no propia es ajena en sí. LOS ENLACES SON HOJAS Y SE COMPRUEBAN INCLUSO DENTRO DE UNA
 * CARPETA PROPIA: nunca se siguen, pero un `Remove-Item` recursivo de PowerShell a través de una junction ha
 * borrado el contenido del destino, así que también se recorre el árbol de una carpeta propia y un enlace cuyo
 * destino queda fuera de lo propio se informa como ajeno. Una ruta que no existe no es nada que borrar. Una
 * carpeta ilegible cuenta como ajena y un recorrido que pasa de `MAX_ENTRIES` se informa como `exceeded`.
 */

import { lstatSync, readdirSync, realpathSync } from 'node:fs';
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
 * @param {Function} [resolve] The link resolution, injectable so a selftest can make a link dangle.
 * @returns {{ foreign: string[], exceeded: boolean }} The paths in it the agent does not own.
 * @es Las rutas de `candidate` que el agente no posee.
 */
export function foreignLeaves(candidate, ownership, limit = MAX_ENTRIES, list = readdirSync, resolve = realpathSync) {
  let status;

  try {
    status = lstatSync(candidate);
  } catch {
    return { foreign: [], exceeded: false };
  }

  /** Whether a link is foreign: it is not owned, or its target is outside what is owned (or cannot be resolved). @es Si un enlace es ajeno. */
  const linkIsForeign = (link, linkOwned) => {
    if (!linkOwned) return true;

    try {
      return !ownership.ownsCanonical(canonical(resolve(link)));
    } catch {
      return true;
    }
  };

  if (status.isSymbolicLink()) {
    const lexical = `${canonical(path.dirname(candidate))}/${folded(path.basename(candidate))}`;

    return { foreign: linkIsForeign(candidate, ownership.ownsCanonical(lexical)) ? [candidate] : [], exceeded: false };
  }

  const root = canonical(candidate);
  const rootOwned = ownership.ownsCanonical(root);

  if (!status.isDirectory()) return { foreign: rootOwned ? [] : [candidate], exceeded: false };

  const foreign = [];
  let seen = 0;

  const walk = (directory, canonicalDirectory, owned) => {
    let entries;

    try {
      entries = list(directory, { withFileTypes: true });
    } catch {
      foreign.push(directory);
      return;
    }

    if (entries.length === 0) {
      if (!owned) foreign.push(directory);
      return;
    }

    for (const entry of entries) {
      seen += 1;

      if (seen > limit) return;

      const child = path.join(directory, entry.name);
      const canonicalChild = `${canonicalDirectory}/${folded(entry.name)}`;
      const childOwned = ownership.ownsCanonical(canonicalChild);

      if (entry.isSymbolicLink()) {
        if (linkIsForeign(child, childOwned)) foreign.push(child);
      } else if (entry.isDirectory()) {
        walk(child, canonicalChild, childOwned);
      } else if (!childOwned) {
        foreign.push(child);
      }
    }
  };

  walk(candidate, root, rootOwned);

  return { foreign, exceeded: seen > limit };
}
