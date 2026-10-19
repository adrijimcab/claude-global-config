/**
 * The exclusive right to write a ledger: the one state lock of `../hook-state/file-lock.mjs`, named for the ledger.
 * Every rule of taking, judging, breaking and releasing lives there (owner token, breaker re-check, identity check,
 * absolute ceiling, Windows contention codes); this adapter keeps the public API the ledger writers import
 * (`takeLock`, `releaseLock`, `withLock`, `STALE_AFTER_MS`) and only says, in both languages, that a fault is the
 * ledger lock's. A fault inside the work is not the lock's and reaches the caller unchanged.
 *
 * @es El derecho exclusivo a escribir un ledger: el único lock de estado de `../hook-state/file-lock.mjs`, con el
 * nombre del ledger. Toda regla de tomar, juzgar, romper y soltar vive allí; este adaptador mantiene la API pública
 * que importan los escritores de ledgers y solo dice, en ambos idiomas, que un fallo es del lock del ledger. Un
 * fallo dentro del trabajo no es del lock y llega al llamante sin cambios.
 */

import * as stateLock from '../hook-state/file-lock.mjs';

/** The stale age of the ledger lock: the one of the state lock. @es La edad límite del lock del ledger: la del lock de estado. */
export const STALE_AFTER_MS = stateLock.STALE_AFTER_MS;

/**
 * A fault of THIS ledger lock (its lock file or its breaker), said as the ledger lock's in both halves; any other
 * error, a fault of another lock thrown by the work included, is returned unchanged.
 * @es Un fallo de ESTE lock del ledger (su fichero o su breaker), dicho como del lock del ledger en ambas mitades;
 * cualquier otro error, también el fallo de otro lock lanzado por el trabajo, vuelve igual.
 */
function asLedgerFault(error, lockFile) {
  if (!(error instanceof stateLock.LockFault) || (error.file !== lockFile && error.file !== `${lockFile}.breaker`)) return error;

  const [english, spanish = english] = error.message.split(' @es ');

  return new stateLock.LockFault(`The ledger lock ${lockFile} failed: ${english} @es Falló el lock del ledger ${lockFile}: ${spanish}`, { cause: error.cause, file: error.file });
}

/**
 * Takes the ledger lock, or returns false once its attempts are spent with the lock held.
 * @es Toma el lock del ledger, o devuelve false al agotar los intentos con el lock ocupado.
 */
export function takeLock(lockFile, options) {
  try {
    return stateLock.takeLock(lockFile, options);
  } catch (error) {
    throw asLedgerFault(error, lockFile);
  }
}

/** Removes the ledger lock this process took, only while it still holds this process's token. @es Quita el lock del ledger que tomó este proceso. */
export const { releaseLock } = stateLock;

/**
 * Runs `work` holding the ledger lock and releases it whether `work` returns or throws.
 * @returns `{ held: true, value }`, or `{ held: false }` when the lock could not be taken: `work` did not run.
 * @es Ejecuta `work` con el lock del ledger y lo suelta tanto si vuelve como si lanza.
 */
export function withLock(lockFile, work, options) {
  try {
    return stateLock.withLock(lockFile, work, options);
  } catch (error) {
    throw asLedgerFault(error, lockFile);
  }
}
