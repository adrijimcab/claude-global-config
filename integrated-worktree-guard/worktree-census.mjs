/**
 * What becomes of each linked worktree of a repository: removable, stranded, skipped, or none of the
 * guard's business.
 *
 * THE QUESTION a removal decides: "if this worktree were deleted right now, what would be gone for good?".
 * A worktree is REMOVABLE only when ALL of these hold, checked in this order so the cheapest and most
 * protective answers come first:
 *   0. git does not mark it locked or prunable, and it is on a branch (a detached HEAD has no name to
 *      compare), else it is SKIPPED with that reason;
 *   1. it is not held by a live actor (`isLive`), else `live` and left alone;
 *   2. nothing in it would be lost (`working-tree-state.mjs`: no tracked edit, no untracked file, no
 *      ignored file that is not a link), else `stranded` — named, never removed;
 *   3. its branch has an integration base (`integration-base.mjs`), else SKIPPED with the stated reason;
 *   4. `git cherry <base> <branch>` lists no `+` line, i.e. every commit of the branch has a patch-id
 *      twin in the base (the owner's rule: measured with `git cherry`, never ancestry alone), else
 *      `unintegrated` and left alone. A squash-merge leaves `+` lines and so reads as unintegrated: the
 *      safe direction.
 *
 * Every git failure is "could not tell" and lands in SKIPPED with the reason, never in `removable`.
 *
 * @es Qué pasa con cada worktree enlazado de un repo: removible, varado, omitido o ajeno al guard. Un
 * worktree es REMOVIBLE solo si TODO esto se cumple, en este orden: (0) git no lo marca locked ni prunable y
 * está en una rama; (1) ningún actor vivo lo tiene; (2) no se perdería nada (sin ediciones, sin no seguidos,
 * sin ignorados que no sean enlaces), si no, `stranded`; (3) su rama tiene base de integración, si no,
 * omitido con la razón; (4) `git cherry <base> <rama>` no lista ninguna línea `+` (la regla del dueño:
 * medido con `git cherry`, nunca solo ancestría). Un fallo de git es «no se pudo saber» y va a omitidos.
 */

import { linkedWorktrees } from './linked-worktrees.mjs';
import { integrationBase } from './integration-base.mjs';
import { readGit } from './git-read.mjs';
import { workingTreeState } from './working-tree-state.mjs';

const UNINTEGRATED_LINE = '+';

/** The verdict for one linked worktree. @es El veredicto de un worktree enlazado. */
function classify(mainRoot, worktree, isLive, readCherry) {
  const skipped = (reason) => ({ kind: 'skipped', path: worktree.path, branch: worktree.branch, reason });

  if (worktree.locked) return skipped('git marks it locked, which someone did on purpose. @es git lo marca locked, algo que alguien hizo a propósito.');
  if (worktree.prunable) return skipped('git marks it prunable: its directory is already gone. @es git lo marca prunable: su directorio ya no existe.');
  if (worktree.branch === undefined) return skipped('its HEAD is detached, so there is no branch to compare. @es su HEAD está desacoplado, así que no hay rama que comparar.');
  if (isLive(worktree.path)) return { kind: 'live', path: worktree.path, branch: worktree.branch };

  const state = workingTreeState(worktree.path);

  if (!state.measured) return skipped('git could not read its status. @es git no pudo leer su estado.');
  if (state.work.length > 0) return { kind: 'stranded', path: worktree.path, branch: worktree.branch, work: state.work };

  const base = integrationBase(mainRoot, worktree.branch);

  if ('skip' in base) return skipped(base.skip);

  const cherry = readCherry(mainRoot, base.base, worktree.branch);

  if (cherry === undefined) return skipped(`git cherry ${base.base} ${worktree.branch} failed. @es git cherry ${base.base} ${worktree.branch} falló.`);
  if (cherry.split('\n').some((line) => line.startsWith(UNINTEGRATED_LINE))) return { kind: 'unintegrated', path: worktree.path, branch: worktree.branch };

  return { kind: 'removable', path: worktree.path, branch: worktree.branch, base: base.base, links: state.links };
}

/**
 * @param {string} mainRoot The main checkout of the repository.
 * @param {{ isLive: (worktreePath: string) => boolean, owns: (worktreePath: string) => boolean, readCherry?: (mainRoot: string, base: string, branch: string) => string | undefined }} dependencies
 *   The liveness question, the ownership question (does the session this census is for own the worktree?, no default: a
 *   census that owned everything is the defect this parameter removes) and the `git cherry` reader, injected so a selftest can make any fail.
 * @returns {Array<object> | undefined} One verdict per OWNED linked worktree, or `undefined` when git could not list them.
 * @es Un veredicto por worktree enlazado PROPIO, o `undefined` si git no pudo listarlos.
 */
export function censusOf(mainRoot, { isLive, owns, readCherry = (root, base, branch) => readGit(root, ['cherry', base, branch]) }) {
  const worktrees = linkedWorktrees(mainRoot);

  if (worktrees === undefined) return undefined;

  return worktrees.filter((worktree) => owns(worktree.path)).map((worktree) => classify(mainRoot, worktree, isLive, readCherry));
}
