/**
 * WHERE a project's contract tooling is looked for: the directories a hook payload and its environment name,
 * and the nearest ancestor of each that holds a marker file. Owned here so the parity guard and the worker
 * contract pointer resolve a project the same way.
 *
 * The starts, in order: `CLAUDE_PROJECT_DIR` (the harness sets it to the project the session was opened in),
 * the payload's `cwd`, and that `cwd` with any `/.claude/worktrees/...` tail removed (a worker inside a linked
 * worktree, where the gitignored `.claude/` of the project does not exist, still belongs to the main checkout).
 *
 * @es DÓNDE se busca el tooling de contrato de un proyecto: los directorios que nombran el payload de un hook y
 * su entorno, y el ancestro más cercano de cada uno que tiene un fichero marcador. Vive aquí para que el guard
 * de paridad y el puntero de contrato del worker resuelvan un proyecto igual. Los orígenes, en orden:
 * `CLAUDE_PROJECT_DIR`, el `cwd` del payload y ese `cwd` sin la cola `/.claude/worktrees/...`.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { mainCheckoutOf } from '../brief-feasibility/worker-location.mjs';

/** The directories to search from, nearest intent first, without repeats. @es Los directorios desde los que buscar, sin repetidos. */
export function searchStarts(payload, env = process.env) {
  const cwd = typeof payload?.cwd === 'string' && payload.cwd !== '' ? payload.cwd : undefined;
  const fromEnv = typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR !== '' ? env.CLAUDE_PROJECT_DIR : undefined;
  const starts = [fromEnv, cwd, cwd === undefined ? undefined : mainCheckoutOf(cwd)].filter((start) => start !== undefined);

  return [...new Set(starts.map((start) => path.resolve(start)))];
}

/**
 * The nearest directory, from `start` upward, that holds `marker` (a path relative to it), or `undefined`.
 * @es El directorio más cercano, desde `start` hacia arriba, que contiene `marker`, o `undefined`.
 */
export function findUpward(start, marker) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, marker))) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** The first project root any start resolves for `marker`. @es La primera raíz de proyecto que algún origen resuelve para `marker`. */
export function projectRootFor(payload, marker, env = process.env) {
  for (const start of searchStarts(payload, env)) {
    const found = findUpward(start, marker);

    if (found !== undefined) return found;
  }

  return undefined;
}
