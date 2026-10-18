/**
 * The exclusive right to write a ledger: one lock file that every ledger writer takes, so two writers never
 * read-modify-write the same ledger at once. Taking is an atomic create (`wx`) that writes the owner's token
 * (`pid:random`); a writer that finds it held waits a bounded number of attempts and then stands aside without
 * writing, and releasing removes only the lock whose token is the one this process took.
 *
 * A lock is STALE only when it is older than the stale limit AND its owner process is gone: the age is the lock
 * file's own modification time (it exists the instant the file does, so a lock still being made is never taken
 * for an old one), and the owner is the pid in the token. A holder that is merely slow is alive and keeps its
 * lock; a lock with no readable pid (an empty file left by a crash between create and write) falls back to age.
 * A stale lock is removed by one breaker at a time, which holds a `.breaker` file, re-reads the lock and removes
 * it only if it is still the very stale lock that was judged: nobody deletes a lock and then creates another
 * (the earlier code did, and a waiter that judged a lock stale could delete the fresh lock its rival had just
 * taken, so two writers held it).
 *
 * @es El derecho exclusivo a escribir un ledger: un fichero de lock que todo escritor toma, para que dos
 * escritores nunca lean-modifiquen-escriban el mismo ledger a la vez. Tomarlo es una creación atómica (`wx`)
 * que escribe el token del dueño (`pid:azar`); quien lo encuentra ocupado espera un número acotado de intentos
 * y se aparta sin escribir, y soltarlo borra solo el lock cuyo token es el que este proceso tomó.
 *
 * Un lock está CADUCADO solo si es más viejo que el límite Y su proceso dueño ya no existe: la edad es la fecha
 * de modificación del propio fichero (existe desde el instante en que existe el fichero, así que un lock aún en
 * creación nunca se confunde con uno viejo) y el dueño es el pid del token. Un dueño solo lento sigue vivo y
 * conserva su lock; un lock sin pid legible (un fichero vacío que dejó una caída entre crear y escribir) cae a
 * la edad. Un lock caducado lo quita un solo «rompedor» a la vez, que toma un fichero `.breaker`, relee el lock
 * y lo borra solo si sigue siendo el mismo lock caducado que juzgó: nadie borra un lock y luego crea otro (el
 * código anterior sí, y quien juzgaba caducado un lock podía borrar el lock nuevo que su rival acababa de
 * tomar, con lo que dos escritores lo tenían a la vez).
 */

import { randomBytes } from 'node:crypto';
import { closeSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'node:fs';

/** A lock older than this, with a dead owner, belonged to a dead process. @es Un lock más viejo que esto y de dueño muerto era de un proceso muerto. */
export const STALE_AFTER_MS = 60_000;

/** Sleeps the thread 50 ms; the callers are synchronous by design. @es Duerme el hilo 50 ms; los llamantes son síncronos por diseño. */
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);

/**
 * The failures that mean "another process is touching this file right now" and clear by waiting: the file exists
 * (`EEXIST`), or, on Windows, it is being deleted or is open in another process (`EPERM`, `EBUSY`). MEASURED
 * 2026-10-18: ten real processes racing over a dead owner's lock on a loaded Windows machine made `openSync(..., 'wx')`
 * throw one of the latter in 4 of 25 runs, and the writer died instead of waiting.
 * @es Los fallos que significan «otro proceso está tocando este fichero ahora» y se pasan esperando: el fichero
 * existe (`EEXIST`) o, en Windows, se está borrando o está abierto en otro proceso (`EPERM`, `EBUSY`). MEDIDO el
 * 2026-10-18: diez procesos reales compitiendo por el lock de un dueño muerto en un Windows cargado hicieron que
 * `openSync(..., 'wx')` lanzara uno de los últimos en 4 de 25 corridas, y el escritor moría en vez de esperar.
 */
const CONTENTION = new Set(['EEXIST', 'EPERM', 'EBUSY']);

/** The token each lock this process took holds, by lock file: what a release must find before it removes anything. @es El token de cada lock que este proceso tomó, por fichero: lo que un release debe encontrar antes de borrar nada. */
const taken = new Map();

/** Whether a process with this pid exists; a process we may not signal still exists. @es Si existe un proceso con este pid; uno al que no podemos enviar señal existe igual. */
function processExists(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** The pid and the whole token a lock file holds, or `undefined` for one that vanished. @es El pid y el token completo de un lock, o `undefined` si desapareció. */
function ownerOf(lockFile) {
  let token;

  try {
    token = readFileSync(lockFile, 'utf8').trim();
  } catch {
    return undefined;
  }

  const pid = Number.parseInt(token.split(':')[0], 10);

  return { token, pid: Number.isInteger(pid) && pid > 0 ? pid : undefined };
}

/**
 * The token of a lock that is stale (old AND ownerless), or `undefined` for one that is held, young, or gone.
 * @es El token de un lock caducado (viejo Y sin dueño), o `undefined` si está ocupado, es joven o desapareció.
 */
function staleToken(lockFile, { staleAfterMs, now, isAlive }) {
  try {
    if (now() - statSync(lockFile).mtimeMs <= staleAfterMs) return undefined;
  } catch {
    return undefined;
  }

  const owner = ownerOf(lockFile);

  if (owner === undefined) return undefined;

  return owner.pid !== undefined && isAlive(owner.pid) ? undefined : owner.token;
}

/**
 * Removes a stale lock without ever removing a live one: only the holder of the `.breaker` file breaks, and it
 * removes the lock only if it still holds the token it judged stale. A breaker file left by a dead breaker is
 * judged by the same rule, so a crashed breaker cannot wedge the lock.
 * @es Quita un lock caducado sin quitar jamás uno vivo: solo quien tiene el fichero `.breaker` rompe, y borra el
 * lock solo si aún lleva el token que juzgó caducado. Un `.breaker` que dejó un rompedor muerto se juzga con la misma regla.
 */
function breakStale(lockFile, options) {
  const breaker = `${lockFile}.breaker`;
  const judged = staleToken(lockFile, options);

  if (judged === undefined) return;

  try {
    const fd = openSync(breaker, 'wx');

    writeSync(fd, `${String(process.pid)}:breaker`);
    closeSync(fd);
  } catch (error) {
    if (error?.code === 'EEXIST' && staleToken(breaker, options) !== undefined) removeQuietly(breaker, options);

    return;
  }

  try {
    if (ownerOf(lockFile)?.token === judged) removeQuietly(lockFile, options);
  } finally {
    removeQuietly(breaker, options);
  }
}

/**
 * Removes a file another process may be touching: a contention failure is left for the next attempt, any other
 * failure is a fault and propagates.
 * @es Quita un fichero que otro proceso puede estar tocando: un fallo de contienda se deja para el siguiente
 * intento, cualquier otro es un fallo real y se propaga.
 */
function removeQuietly(file, { remove }) {
  try {
    remove(file);
  } catch (error) {
    if (!CONTENTION.has(error?.code)) throw error;
  }
}

/**
 * Takes the lock, or returns false once `attempts` are spent. Every option is injectable so a proof never sleeps.
 * @es Toma el lock, o devuelve false al agotar los intentos. Toda opción es inyectable para que una prueba no duerma.
 */
export function takeLock(lockFile, { attempts = 40, staleAfterMs = STALE_AFTER_MS, now = Date.now, wait = pause, isAlive = processExists, create = (file) => openSync(file, 'wx'), remove = (file) => rmSync(file, { force: true }) } = {}) {
  const token = `${String(process.pid)}:${randomBytes(6).toString('hex')}`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const fd = create(lockFile);

      writeSync(fd, token);
      closeSync(fd);
      taken.set(lockFile, token);

      return true;
    } catch (error) {
      // Only "it already exists" is contention worth waiting for; any other failure (a missing or unwritable
      // directory) will not clear by waiting and must not be reported as another writer holding the lock.
      // @es Solo «ya existe» es contienda que vale la pena esperar; cualquier otro fallo (directorio ausente o
      // sin permiso) no se arregla esperando y no debe presentarse como otro escritor con el lock.
      if (!CONTENTION.has(error?.code)) throw new Error(`the ledger lock ${lockFile} could not be created: ${error instanceof Error ? error.message : String(error)}. @es no se pudo crear el lock del ledger ${lockFile}.`, { cause: error });

      breakStale(lockFile, { staleAfterMs, now, isAlive, remove });

      wait();
    }
  }

  return false;
}

/**
 * Removes the lock this process took; a lock it did not take, or that another process now holds, is left alone.
 * @es Quita el lock que este proceso tomó; un lock que no tomó, o que ahora tiene otro proceso, se deja en paz.
 */
export function releaseLock(lockFile) {
  const mine = taken.get(lockFile);

  taken.delete(lockFile);

  if (mine !== undefined && ownerOf(lockFile)?.token === mine) rmSync(lockFile, { force: true });
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
