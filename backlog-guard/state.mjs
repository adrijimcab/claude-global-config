/**
 * Per-session state and transcript access for backlog-guard — the I/O this project's own
 * `engram-persistence/guard.mjs` already proved works, reused here for a per-TURN window instead of a
 * per-commit one.
 *
 * WHAT THE STATE HOLDS: one `offset` per session — the transcript BYTE SIZE at the end of the last turn
 * this guard evaluated. The NEXT turn's "did a save happen in THIS turn" question reads only the bytes
 * written SINCE that offset, which is what makes the check ORDER-aware: a master-backlog save that
 * happened in an EARLIER turn sits before the offset and does not satisfy a LATER turn's pending
 * announcement — the exact property the owner directive asks for ("a save in an earlier turn only ->
 * block" is one of this mechanism's required states).
 *
 * @es Estado por sesión y acceso a transcript de backlog-guard, reutilizando la E/S ya probada de
 * `engram-persistence/guard.mjs` para una ventana por TURNO en vez de por commit. El estado guarda un
 * `offset` por sesión: el TAMAÑO EN BYTES del transcript al final del último turno evaluado. Un guardado
 * de backlog maestro de un turno ANTERIOR queda antes del offset y no satisface un turno POSTERIOR —
 * justo la propiedad que pide la directiva del dueño.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = path.join(HERE, 'state');

const statePathFor = (sessionId) => path.join(STATE_DIR, `${sessionId || 'unknown'}.json`);

/** The stored `{ offset }` for `sessionId`, or `undefined` on first sighting / any read failure. @es El `{ offset }` guardado de `sessionId`, o `undefined`. */
export function readOffsetState(sessionId) {
  try {
    return JSON.parse(readFileSync(statePathFor(sessionId), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Persists `{ offset }` for `sessionId`. Never throws: state is an optimisation, never a precondition. @es Persiste `{ offset }`. Nunca lanza. */
export function writeOffsetState(sessionId, state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(statePathFor(sessionId), JSON.stringify(state), 'utf8');
  } catch {
    /* state is an optimisation, never a precondition */
  }
}

/** The current byte size of `transcriptPath`, or `undefined` if it cannot be measured. @es El tamaño en bytes actual de `transcriptPath`, o `undefined` si no se puede medir. */
export function transcriptSize(transcriptPath) {
  try {
    return statSync(transcriptPath).size;
  } catch {
    return undefined;
  }
}

/**
 * Transcript bytes written strictly AFTER `offset`, decoded as UTF-8. `''` when nothing new exists,
 * `undefined` when the file cannot be read at all (a genuinely failed measurement, never coerced to
 * `''` — `measurement-failure-is-not-a-zero`). Cuts on the BYTE offset before decoding, exactly like
 * `engram-persistence/guard.mjs`'s own `transcriptSince`, and for the same measured reason: cutting a
 * DECODED string at a byte offset can land past its end on multi-byte text and silently return an
 * empty tail.
 * @es Bytes del transcript escritos estrictamente DESPUÉS de `offset`, decodificados UTF-8. `''` si no
 * hay nada nuevo, `undefined` si el fichero no se puede leer en absoluto.
 */
export function readTranscriptTail(transcriptPath, offset) {
  try {
    const size = statSync(transcriptPath).size;

    if (size <= offset) return '';

    return readFileSync(transcriptPath).subarray(offset).toString('utf8');
  } catch {
    return undefined;
  }
}
