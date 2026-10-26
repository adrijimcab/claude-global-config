/**
 * One git measurement of a worktree: its dirty and untracked paths, the modification time of each, and the
 * committer time of its last commit, folded into the held paths of `holding-age.mjs`. Git is reached only through
 * `git-port`; the file system only to read a modification time. `ask` and `modifiedAt` are the seams.
 *
 * Returns `{ ok: true, held }` or `{ ok: false, reason }`: a git error or a timeout is a value for the caller to
 * journal, never a throw, and never a verdict about the agent.
 *
 * @es Una medición de git de un worktree: sus rutas sucias y sin seguimiento, el mtime de cada una y la hora del
 * último commit, plegadas en las rutas sostenidas de `holding-age.mjs`. Git solo se alcanza por `git-port`; el
 * sistema de ficheros solo para leer un mtime. Devuelve `{ ok: true, held }` o `{ ok: false, reason }`: un error
 * de git o un tiempo agotado es un valor para que quien llama lo registre, nunca un veredicto sobre el agente.
 */

import { lstatSync } from 'node:fs';
import path from 'node:path';

import { runGit } from '../git-port/git.mjs';
import { heldPaths, porcelainPaths } from './holding-age.mjs';

/** The bound of one git command here, in milliseconds. @es El límite de una orden de git aquí, en milisegundos. */
const GIT_BOUND_MS = 10_000;

const MS_PER_SECOND = 1000;

/** The modification time of a path in milliseconds, or `undefined` when it cannot be read. @es El mtime de una ruta, o `undefined`. */
export function modifiedAt(file) {
  try {
    return lstatSync(file).mtimeMs;
  } catch {
    return undefined;
  }
}

const failure = (what, answer) => ({ ok: false, reason: answer.timedOut ? `${what} timed out` : `${what} exit ${answer.status}: ${answer.stderr.trim().split('\n')[0]}` });

/**
 * @param root the worktree root
 * @param arrivalMs when the agent first appeared (paths older than this were left by someone else)
 * @es La medición de un worktree; `arrivalMs` es cuándo apareció el agente por primera vez.
 */
export function measureHeld(root, arrivalMs, { ask = runGit, modified = modifiedAt } = {}) {
  const status = ask(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { timeoutMs: GIT_BOUND_MS });

  if (status.status !== 0) return failure('git status', status);

  const log = ask(root, ['log', '-1', '--format=%ct'], { timeoutMs: GIT_BOUND_MS });
  const committed = Number(log.stdout.trim());
  // An unborn branch has no commit: nothing resets, the arrival floor alone applies. @es Una rama sin commits no tiene piso de commit.
  const lastCommitMs = log.status === 0 && Number.isFinite(committed) ? committed * MS_PER_SECOND : 0;
  const dated = porcelainPaths(status.stdout).map((entry) => ({ path: entry, modifiedMs: modified(path.join(root, entry)) }));

  return { ok: true, held: heldPaths(dated, { arrivalMs, lastCommitMs }) };
}
