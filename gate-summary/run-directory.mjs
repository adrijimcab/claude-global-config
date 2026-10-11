/**
 * Opens the directory of one run. Its name carries a run id no other run can share, and the directory is
 * created exclusively, so two runs can never write one log (`stale-artifact-read-as-this-runs-result`).
 * @es Abre el directorio de una corrida. Su nombre lleva un id que ninguna otra corrida puede compartir y se
 * crea en exclusiva, así que dos corridas nunca escriben un mismo log.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where runs live unless `--state` says otherwise. @es Dónde viven las corridas salvo que `--state` diga otra cosa. */
export const DEFAULT_STATE = path.join(os.homedir(), '.claude', 'gate-summary', 'state');

/** A run id that sorts by time and cannot collide between processes or within one. @es Un id ordenable por tiempo y sin colisiones. */
export const newRunId = (now = new Date()) => `${now.toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '-')}-${process.pid}-${randomBytes(3).toString('hex')}`;

/** @returns `{ runId, directory, logFile }`; throws when the directory already exists. @es Devuelve la corrida abierta; lanza si el directorio ya existe. */
export function openRun(stateDirectory, idOf = newRunId) {
  const runId = idOf();
  const directory = path.join(stateDirectory, 'runs', runId);

  mkdirSync(path.dirname(directory), { recursive: true });
  mkdirSync(directory);

  return { runId, directory, logFile: path.join(directory, 'output.log') };
}
