/**
 * The linked git worktree a delegated agent stands in, if any. A worker's worktree is its own by tenancy (the
 * fleet gives one worker one worktree), so deleting inside it is ordinary work on its own tree (a refactor
 * removes tracked files, a build output is rebuilt) and is not what this guard protects. What it protects is the
 * folders SHARED between actors: the session scratchpad root, the main checkout, the temp root.
 *
 * HOW A LINKED WORKTREE IS TOLD FROM THE MAIN CHECKOUT. In a linked worktree `.git` is a FILE (`gitdir: ...`); in
 * the main checkout it is a directory. The walk goes up from the working directory and stops at the first
 * `.git`; a directory means the main checkout and there is no own tree. File-system reads only, no git process.
 *
 * @es El worktree enlazado de git en el que está un agente delegado, si lo hay. El worktree de un worker es suyo
 * por tenencia (la flota da un worktree por worker), así que borrar dentro es trabajo ordinario sobre su árbol;
 * lo que este guard protege son las carpetas COMPARTIDAS entre actores: la raíz del scratchpad de la sesión, el
 * checkout principal y la raíz temporal. CÓMO SE DISTINGUE: en un worktree enlazado `.git` es un FICHERO
 * (`gitdir: ...`); en el checkout principal es un directorio. Se sube desde el directorio de trabajo hasta el
 * primer `.git`; un directorio significa checkout principal y no hay árbol propio. Solo lecturas del sistema de
 * ficheros, ningún proceso git.
 */

import { lstatSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {string} cwd The agent's working directory.
 * @returns {string | undefined} The root of its linked worktree, or `undefined` when it stands in the main checkout or outside any repository.
 * @es La raíz de su worktree enlazado, o `undefined` si está en el checkout principal o fuera de todo repositorio.
 */
export function linkedWorktreeRoot(cwd) {
  for (let current = path.resolve(cwd); ; ) {
    try {
      return lstatSync(path.join(current, '.git')).isFile() ? current : undefined;
    } catch {
      const parent = path.dirname(current);

      if (parent === current) return undefined;

      current = parent;
    }
  }
}
