/**
 * Owns the per-session record of the stale-session warning: the hook groups the session's process loaded (its
 * baseline), the start marker of that process and the lack already warned. One small JSON file per session in
 * the mechanism's state directory. A record that cannot be read is no record (the session starts over).
 *
 * @es Dueño del registro por sesión del aviso: los grupos de hooks que cargó el proceso de la sesión (su línea
 * base), la marca de arranque de ese proceso y la falta ya avisada. Un JSON pequeño por sesión en el
 * directorio de estado del mecanismo. Un registro ilegible es ningún registro (la sesión empieza de cero).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isMechanismName, stateDir } from '../hook-state/locations.mjs';

/** Whether `sessionId` is safe to use as a file name. @es Si `sessionId` sirve como nombre de fichero. */
export const isRecordableSession = isMechanismName;

// The mechanism is named literally so the state census can see which files this module owns.
// @es El mecanismo se nombra literalmente para que el censo de estado vea qué ficheros posee este módulo.
const recordFile = (sessionId) => path.join(stateDir('stale-session-guard'), `${sessionId}.json`);

/**
 * The record of `sessionId`, or `undefined` when there is none or it cannot be read.
 * @es El registro de `sessionId`, o `undefined` si no hay o no se lee.
 */
export function readRecord(sessionId) {
  try {
    const parsed = JSON.parse(readFileSync(recordFile(sessionId), 'utf8'));

    return Array.isArray(parsed?.baseline) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the record of `sessionId` through a temporary file, so a crash never leaves half a record.
 * @es Escribe el registro de `sessionId` vía un temporal, para que una caída no deje medio registro.
 */
export function writeRecord(sessionId, record) {
  const file = recordFile(sessionId);
  const temporary = `${file}.${process.pid}.tmp`;

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(temporary, JSON.stringify(record), 'utf8');
  renameSync(temporary, file);
}
