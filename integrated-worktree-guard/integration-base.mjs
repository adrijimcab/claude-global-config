/**
 * What a branch must be integrated INTO for its worktree to be removable: its integration base, or the
 * stated reason there is none this guard can trust.
 *
 * THE RULE, in order:
 *   1. The branch's UPSTREAM, when it has one that is not its own remote copy.
 *   2. Else origin's default branch, when that branch is a working line.
 *   3. Else NO base: the answer is `{ skip: <reason> }`, never a guess.
 *
 * TWO TRAPS THAT RULE NAMES, each measured rather than assumed:
 *   - AN UPSTREAM THAT IS THE BRANCH'S OWN BACKUP. The orchestrator pushes work branches to origin as a
 *     backup, so `origin/<same name>` is often the upstream. Comparing a branch with its own remote copy
 *     reports "integrated" for work that reached no integration branch at all, and the advice would be to
 *     delete the only local copy. A tracked ref whose branch part equals the local name is a copy, not a
 *     target, and is skipped to rule 2.
 *   - A DEFAULT BRANCH THAT IS NOT THE WORKING LINE. In `di_1700002_discovery_fe` origin's default is
 *     `main`, a single 'Initial commit' (README only) while the work lives on `feature/*`. A default tip
 *     with no parent is a placeholder root, not a line anything is integrated into, so it is skipped with
 *     that reason instead of being compared against.
 *
 * @es Dentro de qué debe estar integrada una rama para que su worktree se pueda quitar: su base de
 * integración, o la razón declarada de que no hay una de fiar. La regla, en orden: (1) el UPSTREAM de la
 * rama si no es su propia copia remota; (2) si no, la rama por defecto de origin si es una línea de
 * trabajo; (3) si no, SIN base. Dos trampas medidas: un upstream que es el respaldo de la propia rama (el
 * orquestador sube ramas de trabajo a origin; compararla con su copia diría «integrada» para trabajo que no
 * llegó a ninguna rama de integración) y una rama por defecto que no es la línea de trabajo (en
 * `di_1700002_discovery_fe` es `main`, un único 'Initial commit' con solo README: un tip sin padres es una
 * raíz de relleno).
 */

import { readGit } from './git-read.mjs';

const HEADS_PREFIX = 'refs/heads/';

/** The first line of git's answer, or `undefined`. @es La primera línea de la respuesta de git, o `undefined`. */
function firstLine(raw) {
  const line = raw?.split('\n')[0].trim();

  return line === undefined || line === '' ? undefined : line;
}

/** Whether `ref` names a commit. @es Si `ref` nombra un commit. */
const resolves = (repo, ref) => readGit(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== undefined;

/**
 * The upstream of `branch` as a ref, and whether it is the branch's own remote copy.
 * @es El upstream de `branch` como ref, y si es la copia remota de la propia rama.
 */
function upstreamOf(repo, branch) {
  const merge = firstLine(readGit(repo, ['config', '--get', `branch.${branch}.merge`]));
  const ref = firstLine(readGit(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`]));

  if (merge === undefined || ref === undefined) return undefined;

  return { ref, isOwnCopy: merge === `${HEADS_PREFIX}${branch}` };
}

/**
 * @param {string} repo Any checkout of the repository.
 * @param {string} branch The short branch name.
 * @returns {{ base: string } | { skip: string }} The ref to compare against, or why there is none.
 * @es La ref contra la que comparar, o por qué no hay.
 */
export function integrationBase(repo, branch) {
  const upstream = upstreamOf(repo, branch);

  if (upstream !== undefined && !upstream.isOwnCopy) {
    // `rev-parse <branch>@{upstream}` answers only when that ref exists, so it needs no second resolution.
    return { base: upstream.ref };
  }

  const defaultBranch = firstLine(readGit(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']));

  if (defaultBranch === undefined || !resolves(repo, defaultBranch)) {
    return { skip: 'it has no upstream to integrate into and origin records no default branch. @es no tiene upstream donde integrarse y origin no registra rama por defecto.' };
  }

  const parents = firstLine(readGit(repo, ['rev-list', '--parents', '-n', '1', defaultBranch]))?.split(' ').length;

  if (parents === 1) {
    return { skip: `it has no upstream to integrate into and origin's default ${defaultBranch} is a root commit, not a working line. @es no tiene upstream donde integrarse y ${defaultBranch}, la rama por defecto de origin, es un commit raíz y no una línea de trabajo.` };
  }

  return { base: defaultBranch };
}
