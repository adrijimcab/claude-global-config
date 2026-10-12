/**
 * Whether a path may be reaped as a closed worktree. Only a LINKED worktree may: a main checkout is shared by every
 * live session, so reaping the processes that name it would kill other sessions' work. Which of the two a directory
 * is belongs to `git-worktree/linked-worktree.mjs`, the one owner of that question; a directory git cannot classify
 * (no repository) is not reaped. A directory that no longer exists is reapable: it was a worktree that has been
 * removed, and what still names it is exactly the orphan this reaper is for.
 * @es Si una ruta puede segarse como worktree cerrado. Solo un worktree ENLAZADO: un checkout principal lo
 * comparten todas las sesiones vivas, así que segar los procesos que lo nombran mataría trabajo ajeno. Cuál de los
 * dos es un directorio lo decide `git-worktree/linked-worktree.mjs`, único dueño de esa pregunta; un directorio
 * que git no sabe clasificar (sin repositorio) no se siega. Un directorio que ya no existe sí se siega: fue un
 * worktree ya retirado, y lo que aún lo nombra es justo el huérfano para el que existe este segador.
 */

import { existsSync } from 'node:fs';

import { isLinkedWorktree } from '../git-worktree/linked-worktree.mjs';

/** True for a linked worktree or a path that is gone. @es Verdadero para un worktree enlazado o una ruta que ya no existe. */
export function isReapableWorktree(worktree) {
  if (!existsSync(worktree)) return true;

  try {
    return isLinkedWorktree(worktree);
  } catch {
    return false;
  }
}
