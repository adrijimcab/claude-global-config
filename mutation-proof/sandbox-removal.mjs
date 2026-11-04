/**
 * Owns how a campaign's folders leave the disk: removal that survives a Windows handle still held by the tree of a
 * killed selftest, and a sweep of the folders a campaign that died before its `finally` left behind.
 *
 * ROOT OF THE LEFTOVERS (read from the 29 folders found in `scratch/mutation-proof/`, all dated before the pool
 * existed, none with a `.tmp`): (1) a bare `rmSync` in a `finally` throws EBUSY/EPERM while the children of a
 * selftest killed by its timeout still hold the folder, and that throw skipped the rest of the cleanup and aborted
 * the campaign; (2) a campaign killed outright never reaches any `finally`. So removal retries and WARNS instead of
 * throwing, and every folder carries the pid of the process that CREATED it, so the next campaign removes the
 * folders whose creator is dead. The creator is the process that keeps the folder alive: the pool names its own
 * sandboxes and temps with its own pid, so a pool that outlives a dead campaign (it is a child, and on Windows it is
 * not stopped with its parent) keeps its folders until it exits. A folder whose creator is alive, or whose name
 * carries no pid, is never touched.
 *
 * Two forms of removal: `removeTree` is synchronous, for the sequential path, which has no other work to serve;
 * `removeTreeAsync` is for the pool, whose event loop serves the pipes and timeout timers of every running selftest.
 *
 * @es Quién se encarga de que las carpetas de una campaña salgan del disco: un borrado que resiste un handle de
 * Windows que aún tiene el árbol de un selftest matado, y un barrido de lo que dejó una campaña muerta antes de su
 * `finally`. Causa raíz de los sobrantes: (1) un `rmSync` pelado en un `finally` lanza EBUSY/EPERM mientras los
 * hijos de un selftest matado por el timeout aún tienen la carpeta, y ese lanzamiento saltaba el resto de la limpieza;
 * (2) una campaña matada de golpe nunca llega a ningún `finally`. Por eso el borrado reintenta y AVISA en vez de
 * lanzar, y cada carpeta lleva el pid del proceso que la CREÓ, para que la siguiente campaña borre las de creadores
 * muertos. El pool nombra sus sandboxes y temporales con su propio pid, así un pool que sobrevive a una campaña
 * muerta conserva sus carpetas hasta que sale. Una carpeta de creador vivo, o sin pid en el nombre, nunca se toca.
 * `removeTree` es síncrono (camino secuencial); `removeTreeAsync`, para el pool, cuyo bucle atiende a todos los selftests.
 */
import { readdirSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

/** `<kind>-<pid>-<random>`: the folders a campaign makes. @es Las carpetas que una campaña crea. */
const OWNED_NAME = /^(?:mutant-temp|mutant|snapshot|pool)-(\d+)-/;

/** The retry policy of every removal. @es La política de reintentos de todo borrado. */
const RETRIES = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };

/** The `mkdtemp` prefix of a folder created by the process `owner`. @es El prefijo `mkdtemp` de una carpeta creada por `owner`. */
export function ownedPrefix(kind, owner = process.pid) {
  return `${kind}-${owner}-`;
}

/**
 * Removes a folder, retrying while a handle is held; a folder that still resists is REPORTED with its path (the next
 * campaign's sweep removes it) and never throws, because a verdict already measured must not be lost to a cleanup.
 * @es Borra una carpeta reintentando mientras haya un handle; si resiste se INFORMA con su ruta (el barrido de la
 * próxima campaña la borra) y nunca lanza, porque un veredicto ya medido no se pierde por una limpieza.
 */
export function removeTree(directory) {
  try {
    rmSync(directory, RETRIES);
  } catch (error) {
    warnUnremoved(directory, error);
  }
}

/** The same removal without blocking the event loop. @es El mismo borrado sin bloquear el bucle de eventos. */
export async function removeTreeAsync(directory) {
  try {
    await rm(directory, RETRIES);
  } catch (error) {
    warnUnremoved(directory, error);
  }
}

function warnUnremoved(directory, error) {
  console.error(
    `WARNING  could not remove ${directory} (${error.code ?? error.message}); the next campaign removes it once its creator is gone. @es no se pudo borrar ${directory}; la próxima campaña la borra cuando su creador ya no exista.`
  );
}

/**
 * Removes every folder of `root` named for a creator that is no longer running, and returns their names.
 * @es Borra cada carpeta de `root` cuyo nombre indica un creador que ya no corre, y devuelve sus nombres.
 */
export function sweepOrphans(root, isAlive = isRunning) {
  const swept = [];

  for (const name of readdirSync(root)) {
    const owner = OWNED_NAME.exec(name)?.[1];

    if (owner === undefined || isAlive(Number(owner))) continue;

    removeTree(path.join(root, name));
    swept.push(name);
  }

  return swept;
}

/** Signal 0 only asks whether the process exists; EPERM means it exists under another user. @es La señal 0 solo pregunta si existe. */
function isRunning(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}
