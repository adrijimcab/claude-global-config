/**
 * Owns what this mechanism asks of git about a clone: where its main checkout is, where `origin/HEAD` points,
 * whether a remote-tracking ref exists, and the one write it ever makes (`git remote set-head`, local refs
 * only). It never fetches, never pushes and never creates a ref other than the `origin/HEAD` symbolic ref.
 *
 * @es Es dueño de lo que este mecanismo le pregunta a git sobre un clon: dónde está su checkout principal, a
 * dónde apunta `origin/HEAD`, si existe una referencia de seguimiento y la única escritura que hace
 * (`git remote set-head`, solo referencias locales). Nunca hace fetch, nunca hace push y nunca crea una
 * referencia que no sea la simbólica `origin/HEAD`.
 */

import path from 'node:path';

import { git, gitOutput } from '../worktree-landing/git.mjs';

const REMOTE = 'origin';
const REMOTE_PREFIX = `refs/remotes/${REMOTE}/`;
const ORIGIN_HEAD = `${REMOTE_PREFIX}HEAD`;
const GIT_QUICK_TIMEOUT_MS = 20_000;

/**
 * The main checkout of the repository `dir` belongs to (a linked worktree resolves to its main one, where the
 * project declares its branches), or `undefined` when `dir` is not inside a non-bare repository.
 * @es El checkout principal del repositorio al que pertenece `dir` (un worktree enlazado resuelve al principal, donde el proyecto declara sus ramas), o `undefined` si `dir` no está en un repositorio no bare.
 */
export function mainCheckoutOf(dir) {
  const run = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { timeoutMs: GIT_QUICK_TIMEOUT_MS });
  if (run.status !== 0) return undefined;
  const common = path.resolve(run.stdout.trim());
  return path.basename(common) === '.git' ? path.dirname(common) : undefined;
}

/** The branch `origin/HEAD` points at, or `undefined` when it is not set. @es La rama a la que apunta `origin/HEAD`, o `undefined` si no está fijada. */
export function originHeadBranch(clone) {
  const run = git(clone, ['symbolic-ref', '-q', ORIGIN_HEAD], { timeoutMs: GIT_QUICK_TIMEOUT_MS });
  if (run.status !== 0) return undefined;
  const target = run.stdout.trim();
  return target.startsWith(REMOTE_PREFIX) ? target.slice(REMOTE_PREFIX.length) : undefined;
}

/** Whether this clone has the remote-tracking ref of `branch`. @es Si este clon tiene la referencia de seguimiento de `branch`. */
export function remoteBranchExists(clone, branch) {
  return git(clone, ['show-ref', '--verify', '--quiet', `${REMOTE_PREFIX}${branch}`], { timeoutMs: GIT_QUICK_TIMEOUT_MS }).status === 0;
}

/** Points `origin/HEAD` at `branch`: local refs only, and git itself refuses a branch with no remote-tracking ref. @es Apunta `origin/HEAD` a `branch`: solo referencias locales, y git rechaza una rama sin referencia de seguimiento. */
export function pointOriginHeadAt(clone, branch) {
  gitOutput(clone, ['remote', 'set-head', REMOTE, branch], { timeoutMs: GIT_QUICK_TIMEOUT_MS });
}
