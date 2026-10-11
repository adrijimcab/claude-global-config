/**
 * Branch, head, commits ahead of the upstream (else origin's default branch) and dirty count of a
 * worktree. The git runner is injected.
 * @es Rama, head, commits por delante del upstream (o de la rama por defecto de origin) y cantidad de
 * sucios de un worktree. El ejecutor de git es inyectable.
 */

import { spawnSync } from 'node:child_process';

const realGit = (args, cwd) => {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

  return { status: run.status, stdout: (run.stdout ?? '').trim() };
};

/** The git state of `cwd`, or `undefined` when it is not a readable checkout. @es El estado git, o `undefined`. */
export function gitState(cwd, git = realGit) {
  const ask = (...args) => git(args, cwd);
  const branch = ask('rev-parse', '--abbrev-ref', 'HEAD');

  if (branch.status !== 0) return undefined;

  const upstream = ask('rev-parse', '--abbrev-ref', '@{upstream}');
  const base = upstream.status === 0 ? upstream.stdout : ask('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').stdout;
  const count = base === '' ? undefined : ask('rev-list', '--count', `${base}..HEAD`);
  const dirty = ask('status', '--porcelain').stdout;

  return {
    branch: branch.stdout,
    head: ask('log', '-1', '--format=%h %s').stdout,
    base: base === '' ? undefined : base,
    ahead: count?.status === 0 ? Number(count.stdout) : undefined,
    dirty: dirty === '' ? 0 : dirty.split('\n').length
  };
}
