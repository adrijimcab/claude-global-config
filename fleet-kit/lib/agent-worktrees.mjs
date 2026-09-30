/**
 * Which work trees are AGENT worktrees of a repository, and the linked worktrees git knows about.
 *
 * An agent worktree is a linked worktree whose top level sits under the repository's configured
 * `worktreeRoot` (`.claude/worktrees` by default). The main checkout never is one, whatever its path.
 *
 * @es Qué árboles de trabajo son worktrees de AGENTE de un repositorio, y los worktrees enlazados que git
 * conoce. Un worktree de agente es uno enlazado bajo el `worktreeRoot` configurado; el checkout principal
 * nunca lo es.
 */

import path from 'node:path';

import { mustAsk } from './git.mjs';

/** Whether `candidate` is strictly inside `container` (case-insensitive on Windows through `path.relative`). @es Si `candidate` está estrictamente dentro de `container`. */
export function isStrictlyInside(container, candidate) {
  const relative = path.relative(container, candidate);

  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** The absolute folder agent worktrees live in, for a governed repository. @es La carpeta absoluta de los worktrees de agente. */
export const agentWorktreeRoot = (governed) => path.join(governed.repository.mainCheckout, ...governed.config.worktreeRoot.split('/'));

/** Whether a work tree top is an agent worktree of the governed repository. @es Si un árbol es worktree de agente. */
export const isAgentWorktree = (governed, top) => isStrictlyInside(agentWorktreeRoot(governed), top);

/**
 * The linked worktrees of the repository `ask` reads, from `git worktree list --porcelain`.
 * @returns `[{ path, branch }]` — `branch` is the short name, `undefined` when detached.
 * @es Los worktrees enlazados del repositorio, de `git worktree list --porcelain`.
 */
export function listWorktrees(ask) {
  const worktrees = [];

  for (const block of mustAsk(ask, 'worktree', 'list', '--porcelain').split('\n\n')) {
    const lines = block.split('\n');
    const worktreeLine = lines.find((line) => line.startsWith('worktree '));
    const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'));

    if (worktreeLine !== undefined) worktrees.push({ path: path.resolve(worktreeLine.slice('worktree '.length)), branch: branchLine?.slice('branch refs/heads/'.length) });
  }

  return worktrees;
}
