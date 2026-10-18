/**
 * The exclusive right to read-modify-write one state file: a lock file created atomically (`wx`). A caller that
 * finds it held waits a bounded number of attempts and then gives up without running its work, and never
 * removes a lock it did not take. A lock older than the stale limit (by the lock file's own modification time,
 * which exists the instant the file does) belonged to a process that died holding it and is broken, so a crashed
 * writer cannot wedge every later one. The work held under it is a few milliseconds, so the stale limit is
 * orders of magnitude above it; two processes that both find the same dead lock at the same instant are the
 * one residual race, and it needs a crash first.
 *
 * Lives in `hook-state/` because the counters that need it live here and every mechanism already depends on
 * this folder; `failure-capture/ledger-lock.mjs` solves the same problem for the ledgers one layer up.
 *
 * @es El derecho exclusivo a leer-modificar-escribir un fichero de estado: un fichero de lock creado de forma
 * atómica (`wx`). Quien lo encuentra ocupado espera un número acotado de intentos y se rinde sin ejecutar su
 * trabajo, y nunca borra un lock que no tomó. Un lock más viejo que el límite (por la fecha de modificación del
 * propio fichero, que existe desde que existe el fichero) era de un proceso muerto y se rompe, para que un
 * escritor caído no bloquee a los demás. El trabajo bajo el lock dura milisegundos, así que el límite está muy
 * por encima; dos procesos que encuentran el mismo lock muerto en el mismo instante son la única carrera
 * residual, y exige una caída previa. Vive en `hook-state/` porque aquí viven los contadores que lo necesitan
 * y todo mecanismo ya depende de esta carpeta; `failure-capture/ledger-lock.mjs` resuelve lo mismo para los ledgers.
 */

import { closeSync, openSync, rmSync, statSync } from 'node:fs';

/** A lock older than this belonged to a dead process. @es Un lock más viejo que esto era de un proceso muerto. */
export const STALE_AFTER_MS = 30_000;

/** Sleeps the thread 5 ms; callers are synchronous by design. @es Duerme el hilo 5 ms; los llamantes son síncronos por diseño. */
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);

/** Whether the lock is older than the limit; one that vanished meanwhile is not. @es Si el lock es más viejo que el límite; uno que desapareció no lo es. */
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
export function takeLock(lockFile, { attempts = 400, staleAfterMs = STALE_AFTER_MS, now = Date.now, wait = pause } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      closeSync(openSync(lockFile, 'wx'));

      return true;
    } catch (error) {
      // Only "it already exists" is contention worth waiting for; a missing or unwritable directory will not clear.
      // @es Solo «ya existe» es contienda que vale la pena esperar; un directorio ausente o sin permiso no se arregla.
      if (error?.code !== 'EEXIST') throw error;

      if (isStale(lockFile, staleAfterMs, now)) rmSync(lockFile, { force: true });
      else wait();
    }
  }

  return false;
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
    rmSync(lockFile, { force: true });
  }
}
