/**
 * Reads the command line into the landing inputs. Four named values are required, each exactly once, and
 * `--check` is the only flag; anything else is refused, so no filter or skip option can exist.
 *
 * `--check` is not a skip: it runs every precondition and the full verification, and withholds only the
 * write (fast-forward and push). It answers "would this land?" without landing.
 *
 * @es Lee la línea de órdenes y la convierte en las entradas del aterrizaje. Se exigen cuatro valores con
 * nombre, cada uno una sola vez, y `--check` es la única bandera; todo lo demás se rechaza, así no puede
 * existir opción de filtro ni de salto. `--check` no salta nada: ejecuta todas las precondiciones y la
 * verificación completa, y solo retiene la escritura (fast-forward y push).
 */

import path from 'node:path';

const VALUES = { '--worktree': 'worktree', '--main': 'main', '--branch': 'branch', '--remote': 'remote' };
const PATHS = new Set(['worktree', 'main']);

export const USAGE =
  'Usage: node land.mjs --worktree <dir> --main <dir> --branch <shared branch> --remote <remote> [--check]. No filter or skip option exists. @es Uso: node land.mjs --worktree <dir> --main <dir> --branch <rama compartida> --remote <remoto> [--check]. No existe ninguna opción de filtro ni de salto.';

/**
 * @param {string[]} argv
 * @returns {{ worktree: string, main: string, branch: string, remote: string, check: boolean } | { error: string }}
 * @es Devuelve las entradas, o un error bilingüe con el uso.
 */
export function parseArguments(argv) {
  const inputs = { check: false };
  for (let at = 0; at < argv.length; at += 1) {
    const option = argv[at];
    if (option === '--check' && !inputs.check) {
      inputs.check = true;
      continue;
    }
    const key = VALUES[option];
    const value = argv[at + 1];
    if (key === undefined || key in inputs || value === undefined || value.startsWith('--')) return { error: USAGE };
    inputs[key] = PATHS.has(key) ? path.resolve(value) : value;
    at += 1;
  }
  const missing = Object.values(VALUES).filter((key) => !(key in inputs));
  return missing.length === 0 ? inputs : { error: USAGE };
}
