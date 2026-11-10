/**
 * The port a heavy chain runner asks "does this token hold the full-chain lock now?" before it starts. `run.mjs`
 * gives its chain child the variable `FULL_CHAIN_LOCK_TOKEN`, whose value is the holder id the lock port wrote into
 * `chain.lock` (`file-lock-adapter.mjs`, `readToken`); this module answers whether a value is that id of a lock that
 * is held by a LIVE chain right now. The answer reads the one lock and its one holder record; it never writes either.
 *
 * It exists so the runners that must run only under the lock (`selftest-runner/run.mjs`) do not re-implement the
 * lock read: they import this and, in their own selftest, replace it through an explicit parameter.
 *
 * @es El puerto al que un runner de cadenas pesadas pregunta «¿este token tiene el lock de cadenas completas
 * ahora?» antes de arrancar. `run.mjs` da a su hijo la variable `FULL_CHAIN_LOCK_TOKEN`, cuyo valor es el id de
 * dueño que el puerto del lock escribió en `chain.lock`; este módulo responde si un valor es ese id de un lock que
 * tiene una cadena VIVA ahora mismo. Lee el único lock y su único registro de dueño; nunca escribe ninguno. Existe
 * para que los runners que deben correr solo bajo el lock no reimplementen la lectura del lock: importan esto y, en
 * su propio selftest, lo reemplazan por un parámetro explícito.
 */

import { stateDir } from '../hook-state/locations.mjs';
import { LOCK_TOKEN_VARIABLE } from './chain-runner.mjs';
import { fileLockAdapter } from './file-lock-adapter.mjs';

export { LOCK_TOKEN_VARIABLE };

/**
 * @param {unknown} token The value of `FULL_CHAIN_LOCK_TOKEN` as the caller found it.
 * @param {{ lock?: { holdsToken: (token: unknown) => boolean } }} [ports] The lock adapter; the real one over the shared state directory by default.
 * @returns {boolean} true only when a live chain holds the lock and `token` is its holder id.
 * @es true solo si una cadena viva tiene el lock y `token` es su id de dueño.
 */
export function tokenHoldsLock(token, { lock = fileLockAdapter(stateDir('full-chain-lock')) } = {}) {
  return lock.holdsToken(token);
}
