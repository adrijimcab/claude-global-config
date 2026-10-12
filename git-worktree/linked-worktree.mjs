/**
 * Whether a directory is inside a LINKED worktree, as opposed to a repository's main checkout: the ONE owner of
 * that question. A linked worktree has its own git directory apart from the repository's common one; a main
 * checkout's git directory IS the common one. This is git's own answer (`--git-dir` against `--git-common-dir`),
 * so it holds for any directory inside the tree, not only its root, and a submodule (whose git directory is also
 * its common one) is not mistaken for a linked worktree.
 *
 * Every git failure THROWS (a directory that is no repository included), so each caller decides what it means:
 * a review hook fails open and runs, the reaper refuses to reap.
 *
 * @es Si un directorio está dentro de un worktree ENLAZADO, frente al checkout principal de un repositorio: el
 * ÚNICO dueño de esa pregunta. Un worktree enlazado tiene su directorio git aparte del común del repositorio; el
 * de un checkout principal ES el común. Es la respuesta de git (`--git-dir` contra `--git-common-dir`), así que
 * vale para cualquier directorio dentro del árbol, no solo su raíz, y un submódulo no se confunde con un worktree
 * enlazado. Todo fallo de git LANZA (también un directorio que no es repositorio): cada quien decide qué significa.
 */

import path from 'node:path';

import { git } from './git-query.mjs';

/** True inside a linked worktree, false inside a main checkout; throws when git cannot tell. @es Verdadero dentro de un worktree enlazado, falso en un checkout principal; lanza si git no sabe. */
export function isLinkedWorktree(directory) {
  const [gitDir, commonDir] = git(directory, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']).split('\n');

  return path.resolve(gitDir.trim()) !== path.resolve(commonDir.trim());
}
