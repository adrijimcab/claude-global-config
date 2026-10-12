/**
 * Whether a path may be reaped as a closed worktree. A linked worktree keeps `.git` as a FILE; a main checkout
 * keeps it as a directory, and a main checkout is shared by every live session, so reaping the processes that
 * name it would kill other sessions' work. A directory that no longer exists is reapable: it was a worktree
 * that has been removed, and what still names it is exactly the orphan this reaper is for.
 * @es Si una ruta puede segarse como worktree cerrado. Un worktree enlazado guarda `.git` como FICHERO; un
 * checkout principal lo guarda como directorio, y lo comparten todas las sesiones vivas, así que segar los
 * procesos que lo nombran mataría trabajo ajeno. Un directorio que ya no existe sí se siega: fue un worktree
 * ya retirado, y lo que aún lo nombra es justo el huérfano para el que existe este segador.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/** True for a linked worktree or a path that is gone. @es Verdadero para un worktree enlazado o una ruta que ya no existe. */
export function isReapableWorktree(worktree) {
  if (!existsSync(worktree)) return true;

  try {
    return statSync(path.join(worktree, '.git')).isFile();
  } catch {
    return false;
  }
}
