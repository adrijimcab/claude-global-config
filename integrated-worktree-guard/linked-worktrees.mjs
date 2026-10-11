/**
 * The LINKED worktrees of a repository: every worktree git lists except the main checkout.
 *
 * `git worktree list --porcelain -z` is the source: git's own record, NUL-delimited so a path with a space
 * or a newline arrives intact. The FIRST block is always the main checkout (git documents it so), and it is
 * dropped here so that no caller can ever list or advise removing it. A block carries `locked` when someone
 * locked the worktree on purpose and `prunable` when its directory is gone; both are reported as flags, and
 * the caller decides they are not this guard's to touch. `branch` is `undefined` for a detached HEAD.
 *
 * @es Los worktrees ENLAZADOS de un repo: todo lo que git lista salvo el checkout principal. La fuente es
 * `git worktree list --porcelain -z`, el registro propio de git. El PRIMER bloque es siempre el checkout
 * principal y aquí se descarta, para que nadie pueda listarlo ni aconsejar quitarlo. `locked` y `prunable`
 * salen como banderas; `branch` es `undefined` con HEAD desacoplado.
 */

import { readGit } from './git-read.mjs';

const WORKTREE_FIELD = 'worktree ';
const BRANCH_FIELD = 'branch refs/heads/';
const LOCKED_FIELD = 'locked';
const PRUNABLE_FIELD = 'prunable';

/** The records git separated by an empty field, as arrays of fields. @es Los registros separados por un campo vacío. */
function blocksOf(raw) {
  const blocks = [];
  let current = [];

  for (const field of raw.split('\0')) {
    if (field !== '') {
      current.push(field);
      continue;
    }

    if (current.length > 0) blocks.push(current);
    current = [];
  }

  if (current.length > 0) blocks.push(current);

  return blocks;
}

/**
 * @param {string} mainRoot Any checkout of the repository (the main one by convention).
 * @returns {Array<{ path: string, branch: string | undefined, locked: boolean, prunable: boolean }> | undefined}
 *   The linked worktrees, or `undefined` when git could not list them.
 * @es Los worktrees enlazados, o `undefined` si git no pudo listarlos.
 */
export function linkedWorktrees(mainRoot) {
  const raw = readGit(mainRoot, ['worktree', 'list', '--porcelain', '-z']);

  if (raw === undefined) return undefined;

  return blocksOf(raw)
    .slice(1)
    .map((fields) => ({
      path: fields.find((field) => field.startsWith(WORKTREE_FIELD))?.slice(WORKTREE_FIELD.length),
      branch: fields.find((field) => field.startsWith(BRANCH_FIELD))?.slice(BRANCH_FIELD.length),
      locked: fields.some((field) => field === LOCKED_FIELD || field.startsWith(`${LOCKED_FIELD} `)),
      prunable: fields.some((field) => field === PRUNABLE_FIELD || field.startsWith(`${PRUNABLE_FIELD} `))
    }))
    .filter((worktree) => worktree.path !== undefined);
}
