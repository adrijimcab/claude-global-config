/**
 * Runs one READ-ONLY git command and answers its output, or `undefined` when git could not answer.
 *
 * `undefined` is "could not tell", never "empty": a failed measurement that reads like an empty result is
 * the defect this fleet has built the most guards against, so every caller must branch on it. The
 * environment is stripped of every `GIT_*` variable so a hook that runs inside another git command cannot
 * steer the question at a different repository. Output is NOT trimmed, because callers parse NUL-separated
 * records.
 *
 * @es Corre UN comando de git de SOLO LECTURA y devuelve su salida, o `undefined` cuando git no pudo
 * responder. `undefined` es «no se pudo saber», nunca «vacío». Se quitan las variables `GIT_*` del entorno
 * para que un hook dentro de otro comando de git no apunte la pregunta a otro repo. La salida NO se recorta:
 * quien llama parsea registros separados por NUL.
 */

import { execFileSync } from 'node:child_process';

/** The environment minus every `GIT_*` variable. @es El entorno sin ninguna variable `GIT_*`. */
const CLEAN_ENVIRONMENT = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

/**
 * @param {string} cwd The directory git runs in.
 * @param {string[]} args The git arguments.
 * @returns {string | undefined} The raw standard output, or `undefined` when git failed.
 * @es La salida estándar cruda, o `undefined` si git falló.
 */
export function readGit(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, env: CLEAN_ENVIRONMENT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}
