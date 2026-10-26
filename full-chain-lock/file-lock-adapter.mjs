/**
 * The `lock` port of `chain-runner.mjs`, implemented over the ONE lock of the fleet, `hook-state/file-lock.mjs`
 * (`takeLock`, `releaseLock`). This module only CONSUMES that port's public API; the lock rules (the exclusive
 * create with the owner token, the stale-age and dead-pid break, the one-breaker-at-a-time rule) are the port's.
 *
 * WHAT IS ADDED, and why it is not in the port. The port answers "may I hold this file?"; a waiting chain also
 * needs "who holds it?", so the holder's record (`holder.json`: session, project, chain, pid, start time,
 * command) is written beside the lock after a take and removed before the release.
 *
 * THE CEILING. The port breaks a lock past an absolute ceiling even when its pid answers, because a pid may have
 * been reused. A full chain runs for an hour or more, so the default ceiling (ten stale ages, ten minutes) would
 * break a live chain's lock; this adapter passes a ceiling of twelve hours, longer than any chain, and keeps the
 * stale-age break of a DEAD holder as it is.
 *
 * RESIDUAL, stated: the lock belongs to the RUNNER process. If the runner is killed hard (`taskkill /F`) while its
 * child lives on, the lock is broken as a dead holder after the stale age although that child may still run.
 *
 * @es El puerto `lock` de `chain-runner.mjs`, sobre el UNICO lock de la flota, `hook-state/file-lock.mjs`. Este
 * módulo solo CONSUME su API pública; las reglas del lock son las del puerto. Se añade el registro del dueño
 * (`holder.json`), que se escribe tras tomar y se borra antes de soltar, porque quien espera necesita saber quién
 * lo tiene. TECHO: el puerto rompe un lock pasado un techo absoluto aunque su pid responda; una cadena completa
 * dura una hora o más, así que aquí el techo es de doce horas y la rotura de un dueño MUERTO queda como está.
 * RESIDUAL: el lock pertenece al proceso RUNNER; si lo matan a la fuerza mientras su hijo sigue vivo, el lock se
 * rompe como dueño muerto pasada la edad de caducidad aunque ese hijo siga corriendo.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { STALE_AFTER_MS, liveOwnerOf, releaseLock, takeLock } from '../hook-state/file-lock.mjs';

/** The lock file inside the state directory. @es El fichero de lock dentro del directorio de estado. */
export const LOCK_NAME = 'chain.lock';

/** The holder record inside the state directory. @es El registro del dueño dentro del directorio de estado. */
export const HOLDER_NAME = 'holder.json';

/** Past this age a lock is stale even when its pid answers: longer than any full chain. @es Pasada esta edad un lock caduca aunque su pid responda: más que cualquier cadena completa. */
export const CEILING_MS = 12 * 60 * 60 * 1000;

/** Takes no pause between attempts: the runner paces its own polling. @es Sin pausa entre intentos: el runner marca su propio ritmo. */
const NO_PAUSE = () => undefined;

/** The ages this adapter judges the lock by, for taking it and for reading who holds it. @es Las edades con las que este adaptador juzga el lock, al tomarlo y al leer quién lo tiene. */
const LOCK_AGES = Object.freeze({ staleAfterMs: STALE_AFTER_MS, ceilingMs: CEILING_MS });

/**
 * @param {string} directory The shared state directory (created on the first take).
 * @param {object} [lockOptions] Overrides handed to the port (`staleAfterMs`, `isAlive`, `now`, `report`...).
 * @returns {{ tryTake: (record: object) => boolean, readHolder: () => (object|undefined), liveHolder: () => (object|undefined), release: () => void }}
 * @es El puerto `lock` sobre un directorio de estado compartido; `lockOptions` se pasan tal cual al puerto.
 */
export function fileLockAdapter(directory, lockOptions = {}) {
  const lockFile = path.join(directory, LOCK_NAME);
  const holderFile = path.join(directory, HOLDER_NAME);
  let mine;

  return {
    tryTake(record) {
      mkdirSync(directory, { recursive: true });

      if (!takeLock(lockFile, { attempts: 1, wait: NO_PAUSE, ...LOCK_AGES, ...lockOptions })) return false;

      // Written whole, then renamed into place: a reader (a waiting chain, the write guard) never reads half a record.
      // @es Se escribe entero y luego se renombra: un lector (una cadena que espera, el guard de escrituras) nunca lee medio registro.
      const partial = `${holderFile}.${String(record.pid)}.partial`;

      try {
        writeFileSync(partial, JSON.stringify(record));
        renameSync(partial, holderFile);
      } catch (error) {
        rmSync(partial, { force: true });
        releaseLock(lockFile);

        throw error;
      }

      mine = record.pid;

      return true;
    },

    readHolder() {
      try {
        const holder = JSON.parse(readFileSync(holderFile, 'utf8'));

        return holder !== null && typeof holder === 'object' ? holder : undefined;
      } catch {
        return undefined;
      }
    },

    release() {
      if (mine === undefined) return;

      const pid = mine;

      mine = undefined;

      try {
        // Only the record this process wrote: a lock broken under us may already belong to the next chain.
        // @es Solo el registro que escribió este proceso: un lock roto bajo nuestros pies puede ser ya de la siguiente cadena.
        if (this.readHolder()?.pid === pid) rmSync(holderFile, { force: true });
      } finally {
        releaseLock(lockFile);
      }
    },

    /**
     * The holder record of a chain that is RUNNING now, or `undefined`: the lock's own reader rule says a live
     * process holds it (`liveOwnerOf`, with this adapter's ceiling), and the record is that process's (its pid is the
     * lock's owner). A dead holder, a lock past the ceiling, or a record left by another process is no running chain,
     * so nothing that waits on a running chain ever waits on it.
     * @es El registro del dueño de una cadena que CORRE ahora, o `undefined`: la regla de lector del propio lock dice
     * que un proceso vivo lo tiene (`liveOwnerOf`, con el techo de este adaptador) y el registro es de ese proceso (su
     * pid es el dueño del lock). Un dueño muerto, un lock pasado el techo o un registro de otro proceso no son una
     * cadena que corre, así que nada que espere a una cadena viva la espera nunca.
     */
    liveHolder() {
      const owner = liveOwnerOf(lockFile, { ...LOCK_AGES, ...lockOptions });
      const holder = owner === undefined ? undefined : this.readHolder();

      return holder?.pid === owner ? holder : undefined;
    }
  };
}
