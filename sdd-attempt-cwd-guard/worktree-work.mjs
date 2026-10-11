/**
 * The git facts this guard decides on: is a directory a repository's MAIN checkout, and which LINKED
 * worktrees of it carry work (commits the main checkout's HEAD lacks, or uncommitted changes)?
 *
 * Every git failure THROWS, so the caller can fail open and journal it; nothing here guesses.
 *
 * @es Los hechos de git sobre los que decide la guardia: si un directorio es el checkout PRINCIPAL de un
 * repositorio y qué worktrees ENLAZADOS suyos llevan trabajo (commits que el HEAD principal no tiene, o
 * cambios sin commitear). Todo fallo de git LANZA, para que quien llama falle abierto y lo registre.
 */

import { execFileSync } from 'node:child_process';

/** Variables that make git pick a repository instead of discovering one (a git hook exports them). @es Variables que eligen repositorio. */
const REPOSITORY_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];

function git(directory, args) {
  const env = { ...process.env };

  for (const name of REPOSITORY_SELECTORS) delete env[name];

  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', env, timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** The `worktree <path>` entries of `git worktree list --porcelain`, main checkout first. @es Las rutas de worktrees, el principal primero. */
function worktreePaths(directory) {
  return git(directory, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim());
}

/**
 * The linked worktrees of the repository whose main checkout is `directory` that carry work, or `[]` when
 * `directory` is itself a linked worktree or no linked worktree carries work.
 * @returns `[{ path, ahead, dirty }]`, `ahead` being the commits its HEAD has that the main HEAD lacks.
 * @es Los worktrees enlazados con trabajo, o `[]` si `directory` es un worktree enlazado o ninguno lleva trabajo.
 */
export function linkedWorktreesCarryingWork(directory) {
  const [gitDir, commonDir] = git(directory, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']).split('\n');

  if (gitDir.trim() !== commonDir.trim()) return [];

  const mainHead = git(directory, ['rev-parse', 'HEAD']);
  const [, ...linked] = worktreePaths(directory);

  return linked
    .map((linkedPath) => ({
      path: linkedPath,
      ahead: Number(git(directory, ['rev-list', '--count', `${mainHead}..${git(linkedPath, ['rev-parse', 'HEAD'])}`])),
      dirty: git(linkedPath, ['status', '--porcelain']).length > 0
    }))
    .filter((worktree) => worktree.ahead > 0 || worktree.dirty);
}
