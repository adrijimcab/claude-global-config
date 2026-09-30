/**
 * What a requested branch move would actually DO, asked of git: which branch, from which commit, to which
 * commit and tree — or that it moves no integration branch, or adds no content, or that its content is
 * unknowable before it happens.
 *
 * ALLOWED WITHOUT A VERDICT, because none adds content the branch lacks: a move to a commit the branch
 * already carries (an ancestor of its tip, locally or on the remote-tracking ref), a merge that is already
 * up to date, a `pull` of the branch's own upstream (it syncs to what the shared remote already holds), a
 * reset of paths, and every move of a branch that is not an integration branch.
 *
 * @es Lo que HARÍA de verdad un movimiento pedido, preguntado a git: rama, commit de origen, commit y
 * árbol de destino; o que no mueve una rama de integración, o que no añade contenido, o que su contenido
 * no se puede conocer antes de ocurrir. Se permite sin veredicto todo movimiento que no añade contenido.
 */

import { commitOf, isAncestor, treeOf } from '../lib/git.mjs';

const HEADS = 'refs/heads/';

export const NONE = Object.freeze({ kind: 'none' });
const unknowable = (branch, why) => ({ kind: 'unknowable', branch, why });

/** The checked-out branch, or `undefined` when HEAD is detached. @es La rama activa, o `undefined`. */
export function currentBranch(ask) {
  const answer = ask('symbolic-ref', '--quiet', '--short', 'HEAD');

  return answer.status === 0 && answer.stdout.length > 0 ? answer.stdout : undefined;
}

/** The branches a request's ref names, expanded against the repository's integration branches. @es Las ramas que nombra la ref de una petición. */
function branchesOf(ref, ask, integrationBranches) {
  if (ref.kind === 'remote-every') return integrationBranches;
  if (ref.kind === 'unknown') return integrationBranches;
  if (ref.kind === 'current' || ref.branch === 'HEAD') return [currentBranch(ask)].filter((branch) => branch !== undefined);

  return [ref.branch];
}

/** The commit the branch points at now: the local ref, or for a push the remote-tracking ref. @es El commit al que apunta hoy la rama. */
const tipOf = (ask, ref, branch) => commitOf(ask, ref.kind === 'remote' || ref.kind === 'remote-every' ? `refs/remotes/${ref.remote ?? 'origin'}/${branch}` : `${HEADS}${branch}`);

/** The revision a target names for `branch`. @es La revisión que nombra un destino para `branch`. */
const revisionOf = (target, branch) => (target.kind === 'namesake' ? `${HEADS}${branch}` : target.rev);

/**
 * Resolves one request against one branch.
 * @returns `NONE`, `{ kind: 'unknowable', branch, why }` or `{ kind: 'move', branch, from, to, tree }`.
 * @es Resuelve una petición contra una rama.
 */
function resolveForBranch({ ref, target }, branch, ask) {
  if (target.kind === 'produced') return unknowable(branch, target.why);

  const from = tipOf(ask, ref, branch);

  if (target.kind === 'pull') return target.sources.every((source) => source === branch) ? NONE : unknowable(branch, `pulling ${target.sources.join(', ')} into ${branch} merges content git computes only while merging`);

  const to = commitOf(ask, revisionOf(target, branch));

  if (to === undefined) return target.kind === 'reset' || target.kind === 'namesake' ? NONE : unknowable(branch, `"${revisionOf(target, branch)}" does not name a commit in this repository yet`);
  if (from !== undefined && isAncestor(ask, to, from)) return NONE;
  if (target.kind === 'merge' && target.noFf) return unknowable(branch, 'a --no-ff merge creates a merge commit whose tree git computes only while merging');
  if (target.kind === 'merge' && from !== undefined && !isAncestor(ask, from, to)) return unknowable(branch, 'a non-fast-forward merge produces a tree git computes only while merging');

  return { kind: 'move', branch, from, to, tree: treeOf(ask, to) };
}

/**
 * Every outcome of `request` on the repository `ask` reads, restricted to `integrationBranches`.
 * @returns a list of `unknowable` and `move` outcomes (never `NONE`).
 * @es Cada resultado de `request` restringido a las ramas de integración.
 */
export function resolveMove(request, ask, integrationBranches) {
  return branchesOf(request.ref, ask, integrationBranches)
    .filter((branch) => integrationBranches.includes(branch))
    .map((branch) => resolveForBranch(request, branch, ask))
    .filter((outcome) => outcome.kind !== 'none');
}
