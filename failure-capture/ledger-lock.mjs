/**
 * The exclusive right to write a ledger: one lock file that every ledger writer takes, so two writers never
 * read-modify-write the same ledger at once. Taking is an atomic create (`wx`); a writer that finds it held
 * waits a bounded number of attempts and then stands aside without writing, and never removes a lock it did
 * not take. A lock older than the stale limit belonged to a process that died holding it and is broken, so a
 * crashed writer cannot wedge every later one. The age is the lock file's own modification time, which exists
 * the instant the file does: a lock still being made is never mistaken for an old one (the earlier code read
 * a timestamp from the file's content, so a lock read before its writer stamped it looked infinitely old).
 *
 * @es El derecho exclusivo a escribir un ledger: un fichero de lock que todo escritor toma, para que dos
 * escritores nunca lean-modifiquen-escriban el mismo ledger a la vez. Tomarlo es una creación atómica (`wx`);
 * quien lo encuentra ocupado espera un número acotado de intentos y se aparta sin escribir, y nunca borra un
 * lock que no tomó. Un lock más viejo que el límite era de un proceso muerto y se rompe, para que un escritor
 * caído no bloquee a los demás. La edad es la fecha de modificación del propio fichero, que existe desde el
 * instante en que existe el fichero: un lock aún en creación nunca se confunde con uno viejo (el código
 * anterior leía una marca de tiempo del contenido, así que un lock leído antes de que su escritor lo sellara
 * parecía infinitamente viejo).
 */

import { closeSync, openSync, rmSync, statSync } from 'node:fs';

/** A lock older than this belonged to a dead process. @es Un lock más viejo que esto era de un proceso muerto. */
export const STALE_AFTER_MS = 60_000;

/** Sleeps the thread 50 ms; the callers are synchronous by design. @es Duerme el hilo 50 ms; los llamantes son síncronos por diseño. */
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);

/** Whether the lock file is older than the limit; one that vanished meanwhile is not. @es Si el lock es más viejo que el límite; uno que desapareció no lo es. */
function isStale(lockFile, staleAfterMs, now) {
  try {
    return now() - statSync(lockFile).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

/**
 * Takes the lock, or returns false once `attempts` are spent. Every option is injectable so a proof never sleeps.
 * @es Toma el lock, o devuelve false al agotar los intentos. Toda opción es inyectable para que una prueba no duerma.
 */
export function takeLock(lockFile, { attempts = 40, staleAfterMs = STALE_AFTER_MS, now = Date.now, wait = pause } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      closeSync(openSync(lockFile, 'wx'));

      return true;
    } catch {
      if (isStale(lockFile, staleAfterMs, now)) releaseLock(lockFile);

      wait();
    }
  }

  return false;
}

/** Removes the lock; one already gone is no error. @es Quita el lock; uno ya ausente no es error. */
export function releaseLock(lockFile) {
  rmSync(lockFile, { force: true });
}

/**
 * Runs `work` holding the lock and releases it whether `work` returns or throws.
 * @returns `{ held: true, value }`, or `{ held: false }` when the lock could not be taken: `work` did not run and the holder's lock is untouched.
 * @es Ejecuta `work` con el lock y lo suelta tanto si vuelve como si lanza. Con el lock ocupado, `work` no corre y el lock del dueño queda intacto.
 */
export function withLock(lockFile, work, options) {
  if (!takeLock(lockFile, options)) return { held: false };

  try {
    return { held: true, value: work() };
  } finally {
    releaseLock(lockFile);
  }
}
