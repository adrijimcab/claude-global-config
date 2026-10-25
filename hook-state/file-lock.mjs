/**
 * The one lock of every state writer: the exclusive right to read-modify-write one file, taken by the hook-state
 * counters (`journal.mjs`) and, through the thin adapter `failure-capture/ledger-lock.mjs`, by the ledger writers.
 *
 * TAKING is one atomic step: the lock file is created exclusively WITH its owner token (`pid:random`) in it
 * (`writeFileSync` with flag `wx`). A taker that finds it held waits a bounded number of attempts and then
 * stands aside without running its work. RELEASING removes the lock only while it still holds the token this
 * process wrote, so a holder whose lock was broken never removes the lock of the one who took it next.
 *
 * A lock is STALE only when it is older than the stale age (by its own modification time, which exists the
 * instant the file does) AND its owner is gone: the token names no pid (an empty or unreadable lock, left by a
 * crash between the create and the write) or its pid no longer exists. A lock younger than the stale age is live
 * whatever it holds, so a lock still being written is never taken for an old one. Past the absolute ceiling (ten
 * times the stale age by default) a lock is stale even when its pid still answers, because that pid may have been
 * reused by an unrelated process, which would otherwise wedge the lock forever; every break is journaled beside
 * the lock (`<lock>.breaks.jsonl`), with its reason, and a ceiling break says so.
 *
 * BREAKING is done by one breaker at a time, the holder of `<lock>.breaker`, which is a lock of the same kind:
 * created with its token, judged stale by the same rule, and removed only after re-reading it. Under the breaker
 * the stale lock is re-read and removed only if it still holds the token AND has the identity (modification time
 * and inode) that were judged: a fresh lock, even an empty one with the same empty token, is never removed in its
 * place. The residual, stated: the re-read and the removal are two system calls, and a file replaced between
 * them is removed; that needs a stale lock, a crashed breaker and another process completing a break inside the
 * gap of two system calls.
 *
 * FAILURES. `EEXIST` is contention. On Windows `EPERM` and `EBUSY` mean the file is being deleted or is open
 * elsewhere, and are retried; if they persist through EVERY attempt the result is a fault ("could not be
 * created"), never "another writer holds it". The break path escalates the same way: a stale lock or a dead
 * breaker whose removal stays `EPERM`/`EBUSY` (only `EBUSY` on POSIX, where an unlink `EPERM` is a fault at once)
 * through every attempt is a fault ("could not be broken"). Any other failure, and any failure of the breaker
 * path that is not contention, is thrown as a `LockFault`. The breaker's own release after a break is retried in
 * place while it may clear. What must never fail a take or a finished work (the break journal, a breaker that
 * cannot be released once the stale lock is gone, the release after the work) is reported instead, bilingual,
 * through `report` (stderr by default). Every message is bilingual (`message-table.mjs`).
 *
 * @es El único lock de todo escritor de estado: el derecho exclusivo a leer-modificar-escribir un fichero, que
 * toman los contadores de hook-state y, por el adaptador `failure-capture/ledger-lock.mjs`, los escritores de
 * ledgers. TOMARLO es un solo paso atómico: el fichero se crea en exclusiva CON el token del dueño (`pid:azar`)
 * dentro. Quien lo encuentra ocupado espera un número acotado de intentos y se aparta sin ejecutar su trabajo.
 * SOLTARLO borra el lock solo si aún tiene el token que escribió este proceso. Un lock está CADUCADO solo si es
 * más viejo que la edad límite Y su dueño ya no está: el token no nombra pid (vacío o ilegible) o su pid ya no
 * existe; uno más joven que la edad límite está vivo tenga lo que tenga. Pasado el techo absoluto (diez veces la
 * edad límite) un lock caduca aunque su pid responda, porque ese pid pudo reutilizarlo otro proceso; cada rotura
 * se registra junto al lock con su motivo. ROMPERLO lo hace un solo rompedor a la vez, el dueño de
 * `<lock>.breaker`, que es un lock del mismo tipo; bajo él el lock caducado se relee y se borra solo si conserva
 * el token Y la identidad (fecha e inodo) que se juzgaron. Lo residual: releer y borrar son dos llamadas al
 * sistema. FALLOS: `EEXIST` es contienda; `EPERM` y `EBUSY` (Windows) se reintentan, y si persisten en TODOS los
 * intentos es un fallo, nunca «otro escritor lo tiene»; la rotura escala igual (en POSIX un `EPERM` de unlink es
 * un fallo al instante); cualquier otro fallo es un `LockFault`. Soltar el propio breaker tras una rotura se
 * reintenta en el sitio mientras pueda pasar. Lo que nunca debe hacer fallar una toma ni un trabajo terminado (el
 * registro de roturas, un breaker que no se suelta con el lock caducado ya quitado, soltar tras el trabajo) se
 * informa, bilingüe, por `report` (stderr por defecto). Todo mensaje es bilingüe.
 */

import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

import { bilingual } from './message-table.mjs';

/** A lock older than this, with its owner gone, belonged to a dead process. @es Un lock más viejo que esto y sin dueño era de un proceso muerto. */
export const STALE_AFTER_MS = 60_000;

/** The absolute ceiling, in stale ages: past it a lock is stale whatever its pid says. @es El techo absoluto, en edades límite. */
export const CEILING_FACTOR = 10;

/** A wait that sleeps the thread `ms`; the callers are synchronous by design. @es Una espera que duerme el hilo `ms`; los llamantes son síncronos por diseño. */
export const pauseFor = (ms) => () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The failures that mean a file is being deleted or is open elsewhere (Windows). @es Los fallos de un fichero que se está borrando o está abierto en otro sitio (Windows). */
const DELETE_PENDING = new Set(['EPERM', 'EBUSY']);

/**
 * The failures of a removal that may clear by waiting, by platform: on Windows a file being deleted or open elsewhere
 * (`EPERM`, `EBUSY`); on POSIX only `EBUSY`, because there an unlink `EPERM` is a permission fault that never clears.
 * @es Los fallos de un borrado que pueden pasar esperando, por plataforma: en Windows `EPERM` y `EBUSY`; en POSIX
 * solo `EBUSY`, porque allí un `EPERM` de unlink es un fallo de permisos que no pasa.
 */
const removalPending = (platform) => (platform === 'win32' ? DELETE_PENDING : new Set(['EBUSY']));

/**
 * How many times the breaker's own release is tried before a pending failure counts as persistent. The breaker is
 * this process's file, so a delete that is merely pending clears within a tick or two; and past this bound the
 * failure is only reported once the stale lock is gone, so more tries would change no outcome.
 * @es Cuántas veces se intenta soltar el breaker antes de que un fallo pendiente cuente como persistente. El breaker
 * es de este proceso, así que un borrado pendiente pasa en uno o dos ticks; y pasado este límite el fallo solo se
 * informa si el lock caducado ya no está, así que más intentos no cambiarían nada.
 */
const BREAKER_RELEASE_ATTEMPTS = 3;

/** Writes one report line to the standard error. @es Escribe una línea de informe en stderr. */
const toStderr = (line) => process.stderr.write(`${line}\n`);

/**
 * A failure of the lock itself, never "another writer holds it". `file` is the lock or breaker file it is about,
 * so an adapter can tell its own lock's faults from another lock's.
 * @es Un fallo del propio lock, nunca «otro escritor lo tiene». `file` es el fichero de lock o breaker al que se
 * refiere, para que un adaptador distinga los fallos de su lock de los de otro.
 */
export class LockFault extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'LockFault';
    this.file = options?.file;
  }
}

/** The token of each lock this process took, by lock file. @es El token de cada lock que tomó este proceso. */
const taken = new Map();

/** A fresh owner token of this process. @es Un token de dueño nuevo de este proceso. */
const newToken = () => `${String(process.pid)}:${randomBytes(6).toString('hex')}`;

/** A fault of `file`, bilingual, carrying the failure as its cause. @es Un fallo de `file`, bilingüe, con la causa. */
const fault = (id, file, error) => new LockFault(bilingual(id, { file, code: String(error?.code ?? 'unknown'), detail: error instanceof Error ? error.message : String(error) }), { cause: error, file });

/** Whether a process with this pid exists; one we may not signal exists all the same. @es Si existe un proceso con este pid; uno al que no podemos enviar señal existe igual. */
function processExists(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** Creates `file` holding `token`, exclusively, in one step. @es Crea `file` con `token`, en exclusiva, en un paso. */
const createWithToken = (file, token) => writeFileSync(file, token, { flag: 'wx' });

/** Removes a file. @es Quita un fichero. */
const removeFile = (file) => rmSync(file, { force: true });

/**
 * A lock file as it is now: its token (`undefined` when unreadable) and its identity, or `undefined` when gone.
 * @es Un lock tal como está ahora: su token (`undefined` si es ilegible) y su identidad, o `undefined` si no está.
 */
function readLock(file) {
  let stats;

  try {
    stats = statSync(file);
  } catch {
    return undefined;
  }

  let token;

  try {
    token = readFileSync(file, 'utf8');
  } catch {
    token = undefined;
  }

  return { token, mtimeMs: stats.mtimeMs, identity: `${String(stats.mtimeMs)}:${String(stats.ino)}` };
}

/** The pid a token names, or `undefined`. @es El pid que nombra un token, o `undefined`. */
function pidOf(token) {
  const pid = Number.parseInt(String(token).split(':')[0], 10);

  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

/**
 * The lock `file` as judged stale, `{ token, identity, ageMs, pid, reason }`, or `undefined` when it is live or gone.
 * The file is read BEFORE the clock, so what is judged is what was read.
 * @es El lock `file` juzgado caducado, o `undefined` si está vivo o no está. Se lee ANTES que el reloj.
 */
function staleOf(file, { staleAfterMs, ceilingMs, now, isAlive }) {
  const found = readLock(file);

  if (found === undefined) return undefined;

  const ageMs = now() - found.mtimeMs;

  if (ageMs <= staleAfterMs) return undefined;

  const pid = pidOf(found.token);
  const stale = (reason) => ({ ...found, ageMs, pid, reason });

  if (pid === undefined) return stale('no-owner');
  if (!isAlive(pid)) return stale('dead-owner');

  return ageMs > ceilingMs ? stale('ceiling') : undefined;
}

/**
 * Removes `file` only if it still holds the token AND the identity that were judged: `{ removed }`, plus `pending`
 * (the failure) when the removal may clear by waiting. A file already gone is no failure; any other is a fault.
 * @es Quita `file` solo si conserva el token Y la identidad juzgados: `{ removed }`, más `pending` (el fallo) si el
 * borrado puede pasar esperando. Un fichero que ya no está no es un fallo; cualquier otro lo es.
 */
function removeIfStill(file, judged, { remove, platform }) {
  const now = readLock(file);

  if (now === undefined || now.token !== judged.token || now.identity !== judged.identity) return { removed: false };

  try {
    remove(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return { removed: false };
    if (removalPending(platform).has(error?.code)) return { removed: false, pending: error };

    throw fault('lock-break-fault', file, error);
  }

  return { removed: true };
}

/** Removes `file` if it still holds `token`. @es Quita `file` si aún tiene `token`. */
function releaseToken(file, token, remove) {
  if (readLock(file)?.token !== token) return;

  try {
    remove(file);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw fault('lock-release-fault', file, error);
  }
}

/**
 * Journals one break beside the lock. The break has already happened, so a journal that cannot be written never
 * fails the take: the failure is reported, bilingual, and the take goes on.
 * @es Registra una rotura junto al lock. La rotura ya ocurrió, así que un registro que no se puede escribir nunca
 * hace fallar la toma: el fallo se informa, bilingüe, y la toma sigue.
 */
function recordBreak(lockFile, file, judged, { ceilingMs, report }) {
  const ageMs = Math.round(judged.ageMs);
  const message = bilingual(`lock-broken-${judged.reason}`, { file, ageMs, pid: judged.pid, ceilingMs });

  try {
    appendFileSync(`${lockFile}.breaks.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), file, reason: judged.reason, token: judged.token, pid: judged.pid, ageMs, ceilingMs, message })}\n`);
  } catch (error) {
    report(bilingual('lock-break-journal-fault', { file, code: String(error?.code ?? 'unknown'), detail: error instanceof Error ? error.message : String(error) }));
  }
}

/**
 * Breaks the stale lock that was judged, holding the breaker; a breaker left by a dead breaker is judged and
 * removed by the same rule, so a crashed breaker cannot wedge the lock. Returns the failure when the break could
 * not be done for a reason that may clear by waiting (a breaker or a stale file being deleted elsewhere), so the
 * taker can tell a break that never succeeds from contention.
 * @es Rompe el lock caducado juzgado, con el breaker. Devuelve el fallo cuando la rotura no se pudo hacer por algo
 * que puede pasar esperando, para que quien toma distinga una rotura que nunca sale de la contienda.
 */
function breakStale(lockFile, judged, settings) {
  const breaker = `${lockFile}.breaker`;
  const token = newToken();

  try {
    settings.create(breaker, token);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const dead = staleOf(breaker, settings);

      if (dead === undefined) return undefined;

      const outcome = removeIfStill(breaker, dead, settings);

      if (outcome.removed) recordBreak(lockFile, breaker, dead, settings);

      return outcome.pending;
    }

    if (DELETE_PENDING.has(error?.code)) return error;

    throw fault('lock-break-fault', breaker, error);
  }

  let outcome;

  try {
    outcome = removeIfStill(lockFile, judged, settings);
  } catch (error) {
    // The break's own fault is what the caller must see; a breaker that cannot be released then is only told.
    // @es El fallo de la propia rotura es lo que debe ver quien llama; un breaker que no se suelta entonces solo se informa.
    releaseBreaker(breaker, token, false, settings);

    throw error;
  }

  if (outcome.removed) recordBreak(lockFile, lockFile, judged, settings);

  releaseBreaker(breaker, token, !outcome.removed, settings);

  return outcome.pending;
}

/**
 * Releases the breaker this process holds, retrying in place with the take's wait while the failure may clear by
 * waiting (the platform's removal codes), up to `BREAKER_RELEASE_ATTEMPTS`. A failure that persists is thrown only
 * when `escalate` (the stale lock is still there, so the break did nothing); once the stale lock is gone, or the
 * break already failed, it is reported, bilingual, and the take goes on. A breaker left behind holds this
 * process's pid, so a later break clears it by the same rule once this process has exited.
 * @es Suelta el breaker de este proceso, reintentando en el sitio con la espera de la toma mientras el fallo pueda
 * pasar esperando, hasta `BREAKER_RELEASE_ATTEMPTS`. Un fallo que persiste solo se lanza con `escalate` (el lock
 * caducado sigue ahí); con el lock ya quitado, o con la rotura ya fallida, se informa, bilingüe, y la toma sigue.
 */
function releaseBreaker(breaker, token, escalate, { remove, platform, wait, report }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      releaseToken(breaker, token, remove);

      return;
    } catch (error) {
      if (removalPending(platform).has(error?.cause?.code) && attempt < BREAKER_RELEASE_ATTEMPTS) {
        wait();
        continue;
      }
      if (escalate) throw error;

      report(bilingual('lock-breaker-release-fault', { file: breaker, code: String(error?.cause?.code ?? 'unknown'), detail: error?.cause instanceof Error ? error.cause.message : String(error?.cause) }));

      return;
    }
  }
}

/**
 * Takes the lock, or returns false once `attempts` are spent with the lock held. Every option is injectable so a
 * proof never sleeps: `create(file, token)` and `remove(file)` replace the file operations, `isAlive(pid)` the
 * process probe, `now()` the clock, `wait()` the pause between attempts, `platform` the platform whose removal
 * codes apply, `report(line)` where a failure that must not stop the take is told (stderr by default), and
 * `spent()` whether a wait budget shared with other takes is spent. After each pause that finds it spent the take
 * stops and returns false at once: the attempts it did not make never waited, so they prove no fault.
 * @throws {LockFault} when the lock cannot be created (not contention), when a stale lock could not be broken in
 * ANY attempt, or when the breaker path fails for a reason that does not clear by waiting.
 * @es Toma el lock, o devuelve false al agotar los intentos con el lock ocupado. Toda opción es inyectable;
 * `spent()` dice si un presupuesto de espera compartido con otras tomas se agotó: tras cada pausa que lo encuentra
 * agotado la toma para y devuelve false, porque los intentos que no hizo nunca esperaron y no prueban ningún fallo.
 * Lanza `LockFault` si el lock no se puede crear, si un lock caducado no se pudo romper en NINGÚN intento, o si el
 * camino del breaker falla por algo que no pasa esperando.
 */
export function takeLock(lockFile, { attempts = 40, staleAfterMs = STALE_AFTER_MS, ceilingMs = staleAfterMs * CEILING_FACTOR, now = Date.now, wait = pauseFor(50), isAlive = processExists, create = createWithToken, remove = removeFile, platform = process.platform, report = toStderr, spent = () => false } = {}) {
  const settings = { staleAfterMs, ceilingMs, now, isAlive, create, remove, platform, report, wait };
  const token = newToken();
  let held = false;
  let pending;
  let failedBreaks = 0;
  let breakFailure;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      create(lockFile, token);
      taken.set(lockFile, token);

      return true;
    } catch (error) {
      if (error?.code === 'EEXIST') held = true;
      else if (DELETE_PENDING.has(error?.code)) pending = error;
      else throw fault('lock-create-fault', lockFile, error);

      const judged = staleOf(lockFile, settings);
      const failedBreak = judged === undefined ? undefined : breakStale(lockFile, judged, settings);

      if (failedBreak !== undefined) {
        failedBreaks += 1;
        breakFailure = failedBreak;
      }

      wait();
      if (spent()) return false;
    }
  }

  // A stale lock that could not be broken in ANY attempt is a fault, not another writer holding it.
  // @es Un lock caducado que no se pudo romper en NINGÚN intento es un fallo, no otro escritor que lo tiene.
  if (attempts > 0 && failedBreaks === attempts) throw fault('lock-break-fault', lockFile, breakFailure);
  if (!held && pending !== undefined) throw fault('lock-create-fault', lockFile, pending);

  return false;
}

/**
 * Removes the lock this process took, only while it still holds this process's token. `remove` replaces the
 * removal (a test seam).
 * @es Quita el lock que tomó este proceso, solo mientras aún tenga su token.
 */
export function releaseLock(lockFile, { remove = removeFile } = {}) {
  const mine = taken.get(lockFile);

  taken.delete(lockFile);

  if (mine !== undefined) releaseToken(lockFile, mine, remove);
}

/**
 * Whether the release failure can ride on the work's error without changing it: an object that can take a new
 * property and carries no `suppressed` of its own. Otherwise the error is rethrown untouched (a frozen error would
 * make the assignment throw a TypeError that masks it; an own `suppressed` is someone else's chain), and the
 * failure is only reported.
 * @es Si el fallo al soltar puede ir sobre el error del trabajo sin cambiarlo: un objeto que admite una propiedad
 * nueva y no tiene `suppressed` propio. Si no, el error se relanza intacto (uno congelado haría lanzar un TypeError
 * que lo taparía; un `suppressed` propio es la cadena de otro), y el fallo solo se informa.
 */
const canCarry = (error) => error !== null && typeof error === 'object' && Object.isExtensible(error) && !Object.hasOwn(error, 'suppressed');

/**
 * Runs `work` holding the lock and releases it whether `work` returns or throws. A release that fails never
 * changes what the work did: a work that returned still returns its value, a work that threw still throws its own
 * error (with the release failure attached as `suppressed` when the error can carry it, see `canCarry`), and the
 * release failure is reported, bilingual, through `options.report` (stderr by default).
 * @returns `{ held: true, value }`, or `{ held: false }` when the lock could not be taken: `work` did not run and the holder's lock is untouched. `{ held: false, spent: true }` says the take stopped because its shared wait budget (`options.spent`) was spent. @es `{ held: false, spent: true }` dice que la toma paró porque su presupuesto de espera compartido se agotó.
 * @es Ejecuta `work` con el lock y lo suelta tanto si vuelve como si lanza. Un fallo al soltar nunca cambia lo que
 * hizo el trabajo: si volvió, vuelve con su valor; si lanzó, lanza su propio error (con el fallo al soltar adjunto
 * como `suppressed` si el error puede llevarlo, ver `canCarry`), y el fallo al soltar se informa, bilingüe. Con el
 * lock ocupado, `work` no corre.
 */
export function withLock(lockFile, work, options = {}) {
  if (!takeLock(lockFile, options)) return options.spent?.() === true ? { held: false, spent: true } : { held: false };

  const report = options.report ?? toStderr;
  const release = () => {
    try {
      releaseLock(lockFile, options);

      return undefined;
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));

      return error;
    }
  };
  let value;

  try {
    value = work();
  } catch (error) {
    const failure = release();

    if (failure !== undefined && canCarry(error)) Object.defineProperty(error, 'suppressed', { value: failure, writable: true, configurable: true, enumerable: true });

    throw error;
  }

  release();

  return { held: true, value };
}
