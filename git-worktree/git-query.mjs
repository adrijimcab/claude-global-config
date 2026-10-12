/**
 * Asking git a question about a directory: the ONE way the worktree mechanisms run it. A failure THROWS, so a
 * caller decides what a git that cannot answer means for it (a guard fails open and journals; nothing here guesses).
 *
 * The variables that make git pick a repository instead of discovering one (a git hook exports them) are removed
 * from the child, so the answer is about `directory` and never about the repository a hook happens to run in.
 *
 * @es Preguntar a git por un directorio: la ÚNICA forma en que los mecanismos de worktrees lo ejecutan. Un fallo
 * LANZA, para que quien llama decida qué significa un git que no sabe responder (una guardia falla abierta y lo
 * registra; aquí nada se adivina). Las variables que hacen que git elija repositorio (un hook las exporta) se quitan
 * del hijo: la respuesta es sobre `directory`, nunca sobre el repositorio en el que corre un hook.
 */

import { execFileSync } from 'node:child_process';

/** Variables that make git pick a repository instead of discovering one. @es Variables que hacen que git elija repositorio. */
const REPOSITORY_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];

/** How long git may take before the question is given up. @es Cuánto puede tardar git antes de abandonar la pregunta. */
const GIT_TIMEOUT_MS = 15000;

/** The trimmed stdout of `git -C directory ...args`; throws when git fails. @es La salida de git sin espacios; lanza si git falla. */
export function git(directory, args) {
  const env = { ...process.env };

  for (const name of REPOSITORY_SELECTORS) delete env[name];

  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', env, timeout: GIT_TIMEOUT_MS, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
