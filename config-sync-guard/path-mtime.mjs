/**
 * When a dirty path last changed on disk: the modification time that shell-call windows are tested against.
 *
 * A file's own mtime; for a directory (git reports a wholly-untracked directory as ONE entry) the newest
 * mtime among the directory and everything under it. Links and junctions are never followed (`lstat`):
 * a recursive walk that follows a Windows junction would measure, or worse touch, a tree that is not this
 * path's own. A path that cannot be measured (deleted, unreadable) has NO time, never a time of zero.
 *
 * @es Cuándo cambió por última vez una ruta sucia: el mtime contra el que se prueban las ventanas de
 * shell. El del propio fichero; para un directorio (git informa un directorio sin seguir como UNA entrada)
 * el mtime más reciente entre él y todo lo que contiene. Los enlaces y junctions nunca se siguen (`lstat`).
 * Una ruta que no se puede medir (borrada, ilegible) NO tiene hora, nunca una hora cero.
 */

import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The most entries one walk visits, so a huge untracked tree cannot stall a turn ending. @es El máximo de entradas por recorrido. */
const WALK_LIMIT = 2000;

/** The newest mtime (ms) at or under `absolutePath`, or `undefined` when it cannot be measured. @es El mtime más reciente en o bajo `absolutePath`, o `undefined`. */
export function latestChangeMs(absolutePath, limit = WALK_LIMIT) {
  let newest;
  let visited = 0;
  const pending = [absolutePath];

  while (pending.length > 0 && visited < limit) {
    const current = pending.pop();

    visited += 1;

    try {
      const stat = lstatSync(current);

      newest = Math.max(newest ?? 0, stat.mtimeMs);

      if (stat.isDirectory()) for (const name of readdirSync(current)) pending.push(path.join(current, name));
    } catch {
      continue;
    }
  }

  return newest;
}
