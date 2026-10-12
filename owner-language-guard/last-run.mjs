/**
 * The trace of the PreToolUse guard's LAST run: one small JSON file, overwritten on every run. Own concern:
 * making the guard's silent paths observable. The guard fails open on every problem of its own (a subagent
 * caller, a payload without a transcript, a reader that throws, a wait that gave up), so a missed English line
 * could not be told apart from a hook that never ran. After a miss, `pretool-last-run.json` answers it: a record
 * whose `toolUseId` is NOT the missed call means the hook was not invoked for it; one whose id matches says
 * which path it took. Writing it FAILS OPEN too: it never changes a verdict.
 *
 * @es La traza de la ÚLTIMA corrida del guard de PreToolUse: un JSON pequeño, sobrescrito en cada corrida. Hace
 * observables los caminos silenciosos del guard (llamante subagente, payload sin transcript, lector que lanza,
 * espera que se rindió): sin ella, una línea en inglés que pasó no se distinguía de un hook que nunca corrió.
 * Tras un fallo, `pretool-last-run.json` lo responde: si su `toolUseId` NO es el de la llamada, el hook no se
 * invocó para ella; si coincide, dice qué camino tomó. Escribirla también FALLA ABIERTO: nunca cambia un veredicto.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The file name, inside the guard's state directory. @es El nombre del fichero, dentro del directorio de estado del guard. */
export const LAST_RUN_FILE = 'pretool-last-run.json';

/** Overwrites the trace with `run`; any failure is swallowed. @es Sobrescribe la traza con `run`; cualquier fallo se traga. */
export function recordLastRun(run) {
  try {
    const directory = stateDir('owner-language-guard');

    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, LAST_RUN_FILE), JSON.stringify({ at: new Date().toISOString(), ...run }), 'utf8');
  } catch {
    // A trace that cannot be written never changes the verdict. @es Una traza que no se puede escribir no cambia el veredicto.
  }
}
