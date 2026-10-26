/**
 * One unit-suite run at a time per repository. Two full runs on one machine double both durations and
 * neither is more authoritative for it. A lock whose holder process is gone is stale and is taken over.
 *
 * @es Una sola corrida de la suite por repositorio a la vez. Un candado cuyo proceso dueño ya no existe
 * está caducado y se toma.
 */

import { mkdirSync, openSync, closeSync, readFileSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';

import { isAlive } from '../../process-control/process-port.mjs';

function holderOf(lockFile) {
  try {
    return JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Takes the lock at `lockFile` for `runId`.
 * @returns `{ taken: true }` or `{ taken: false, holder }` when a live process holds it.
 * @es Toma el candado, o devuelve quién lo tiene si su proceso sigue vivo.
 */
export function takeLock(lockFile, runId, { alive = isAlive } = {}) {
  mkdirSync(path.dirname(lockFile), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockFile, 'wx');

      writeSync(descriptor, JSON.stringify({ pid: process.pid, runId, takenAt: new Date().toISOString() }));
      closeSync(descriptor);

      return { taken: true };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;

      const holder = holderOf(lockFile);

      if (holder !== undefined && alive(holder.pid)) return { taken: false, holder };

      rmSync(lockFile, { force: true });
    }
  }

  return { taken: false, holder: holderOf(lockFile) };
}

/** Releases the lock only if `runId` still holds it. @es Suelta el candado solo si `runId` lo sigue teniendo. */
export function releaseLock(lockFile, runId) {
  if (holderOf(lockFile)?.runId === runId) rmSync(lockFile, { force: true });
}
