/**
 * Lists the paths at which a checkout holds work that is not committed: modified, staged, deleted, or
 * untracked and not ignored. Every untracked file is listed on its own, never collapsed into its directory.
 *
 * @es Lista las rutas en las que un checkout guarda trabajo sin commitear: modificado, en el índice,
 * borrado, o sin seguir y no ignorado. Cada fichero sin seguir se lista solo, nunca plegado en su directorio.
 */

import { entriesOf, gitOutput } from './git.mjs';

/**
 * @param {string} checkout
 * @returns {string[]} repository-relative paths, posix separators
 * @es Rutas relativas al repositorio, con separadores posix.
 */
export function uncommittedPaths(checkout) {
  const output = gitOutput(checkout, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  return entriesOf(output).map((entry) => entry.slice(3));
}
