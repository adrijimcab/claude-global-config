#!/usr/bin/env node
/**
 * One contender of `file-lock.mjs`, run as a REAL child process by `file-lock.selftest.mjs`. It takes the lock,
 * holds it for a while doing a critical section, and records three defects the lock exists to prevent, each in
 * its own file under `<dir>` (and its pid in `entered.txt`, in the order the contenders entered):
 *   - `violations.txt`: it entered while another contender was inside (two holders at once);
 *   - `lost.txt`: at the end of its critical section its lock file was gone (another process removed it);
 *   - `breakers.txt`: it held the `.breaker` file while another contender held it too (two breakers at once).
 * Four seams widen the windows a race needs, without changing the code under test: `judgeDelayMs` slows the
 * clock read of every staleness judgement (the gap between reading a lock and acting on it), `createDelayMs`
 * leaves a just-created lock empty for a while (the gap between creating it and writing its token),
 * `breakHoldMs` makes a breaker hold its `.breaker` file before it removes a stale lock, and
 * `breakerJudgeDelayMs` slows the liveness probe of `breakerPid`, the dead breaker's pid (the gap between reading
 * a dead breaker's file and removing it).
 *
 * Usage: node file-lock-contender.mjs <lockFile> <dir> <holdMs> <staleAfterMs> <attempts> <judgeDelayMs> <createDelayMs> <breakHoldMs> <breakerPid> <breakerJudgeDelayMs>
 *
 * @es Un contendiente de `file-lock.mjs`, lanzado como proceso hijo REAL por `file-lock.selftest.mjs`. Toma el
 * lock, lo mantiene un rato en una sección crítica y registra tres defectos que el lock existe para evitar, cada
 * uno en su fichero bajo `<dir>`: `violations.txt` (entró con otro dentro), `lost.txt` (al terminar su sección su
 * lock ya no estaba: otro proceso lo borró) y `breakers.txt` (tuvo el `.breaker` a la vez que otro). Cuatro puntos
 * de prueba ensanchan las ventanas que una carrera necesita sin cambiar el código bajo prueba: `judgeDelayMs`
 * frena la lectura del reloj de cada juicio de caducidad, `createDelayMs` deja vacío un rato el lock recién
 * creado, `breakHoldMs` hace que el rompedor retenga su `.breaker` antes de quitar un lock caducado, y
 * `breakerJudgeDelayMs` frena la sonda de vida de `breakerPid`, el pid del breaker muerto.
 */

import { appendFileSync, closeSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';

import * as lock from './file-lock.mjs';

const [lockFile, dir, holdMs, staleAfterMs, attempts, judgeDelayMs, createDelayMs, breakHoldMs, breakerPid, breakerJudgeDelayMs] = process.argv.slice(2);

/** Sleeps the thread; the critical section is synchronous like the real writers. @es Duerme el hilo, como los escritores reales. */
const sleep = (ms) => {
  if (Number(ms) > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms));
};

const marker = path.join(dir, 'breaker-inside.txt');
const isBreaker = (file) => file.endsWith('.breaker');
let myBreaker;
let myLock;

/** The token the lock file holds now, `undefined` when it is gone. @es El token que tiene ahora el lock, `undefined` si no está. */
const lockToken = () => {
  try {
    return readFileSync(lockFile, 'utf8');
  } catch {
    return undefined;
  }
};

/** Creates a lock or breaker file holding `token`, the way the module does, with the seams of this contender. @es Crea un lock o breaker con `token`, como el módulo, con los puntos de prueba de este contendiente. */
function create(file, token) {
  const fd = openSync(file, 'wx');

  try {
    if (!isBreaker(file)) sleep(createDelayMs);
    writeSync(fd, token);
  } finally {
    closeSync(fd);
  }

  if (!isBreaker(file)) myLock = token;

  if (isBreaker(file)) {
    myBreaker = token;

    try {
      writeFileSync(marker, String(process.pid), { flag: 'wx' });
    } catch {
      appendFileSync(path.join(dir, 'breakers.txt'), `${String(process.pid)}\n`);
    }
  }
}

/** Removes a file; a breaker about to give up its own breaker file clears the marker first. @es Quita un fichero; quien suelta su propio breaker borra antes la marca. */
function remove(file) {
  if (isBreaker(file)) {
    let token;

    try {
      token = readFileSync(file, 'utf8');
    } catch {
      token = undefined;
    }

    if (token !== undefined && token === myBreaker) {
      rmSync(marker, { force: true });
      myBreaker = undefined;
    }
  } else {
    sleep(breakHoldMs);
  }

  rmSync(file, { force: true });
}

/**
 * Whether a process exists, as the module probes it; the probe of the dead breaker's pid is slowed by
 * `breakerJudgeDelayMs`, after the breaker file was read and before it is acted on.
 * @es Si existe un proceso, como lo sondea el módulo; la sonda del pid del breaker muerto se frena, entre leer el
 * breaker y actuar sobre él.
 */
function isAlive(pid) {
  if (pid === Number(breakerPid)) sleep(breakerJudgeDelayMs);

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

const outcome = lock.withLock(
  lockFile,
  () => {
    const inside = path.join(dir, 'inside.txt');

    appendFileSync(path.join(dir, 'entered.txt'), `${String(process.pid)}\n`);

    try {
      // `wx` fails when another contender is already inside: that is the violation being counted.
      // @es `wx` falla si otro contendiente ya está dentro: esa es la violación que se cuenta.
      writeFileSync(inside, String(process.pid), { flag: 'wx' });
    } catch {
      appendFileSync(path.join(dir, 'violations.txt'), `${String(process.pid)}\n`);
    }

    sleep(holdMs);
    // A lock that is gone, or that now holds another token, was removed under this holder by another process.
    // Under a module with no create seam the token is unknown, and only a lock that is gone counts.
    // @es Un lock que ya no está, o que ahora tiene otro token, lo quitó otro proceso bajo este dueño.
    const now = lockToken();

    if (now === undefined || (myLock !== undefined && now !== myLock)) appendFileSync(path.join(dir, 'lost.txt'), `${String(process.pid)}\n`);
    rmSync(inside, { force: true });
  },
  { staleAfterMs: Number(staleAfterMs), attempts: Number(attempts), now: () => { sleep(judgeDelayMs); return Date.now(); }, isAlive, create, remove },
);

process.exit(outcome.held ? 0 : 3);
