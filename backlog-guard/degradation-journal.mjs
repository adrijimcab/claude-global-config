/**
 * THE DEGRADATION JOURNAL — the evidence a fail-open of the backlog prefilter leaves behind.
 *
 * `decide.mjs` lets a turn pass unjudged when it holds a `mem_update` the engram store cannot resolve (its
 * header says why that fails open). A fail-open with no trace would be a silent pass, so each one is one JSON line
 * in the backlog-guard refusal journal (`refusals.jsonl`, the file the deleted lexical guard wrote it to and the
 * one `../hook-state/rotate.mjs` archives): when, which session, which store errors, which transcript. A line that
 * cannot be written costs that evidence, never the decision.
 *
 * @es EL JOURNAL DE DEGRADACIONES — la evidencia que deja un fallo abierto del prefiltro de backlog. `decide.mjs`
 * deja pasar sin juicio un turno con un `mem_update` que el almacén de engram no puede resolver; un fallo abierto
 * sin rastro sería un paso silencioso, así que cada uno es una línea JSON en el journal de rechazos de
 * backlog-guard (`refusals.jsonl`, el que escribía la guardia léxica eliminada y el que archiva la rotación):
 * cuándo, qué sesión, qué errores del almacén, qué transcript. Si la línea no se puede escribir se pierde esa
 * evidencia, nunca la decisión.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { stateDirectory } from './state.mjs';

/** The refusal journal of backlog-guard. @es El journal de rechazos de backlog-guard. */
export const refusalsFile = () => path.join(stateDirectory(), 'refusals.jsonl');

/** The kind of a fail-open line. @es El tipo de una línea de fallo abierto. */
export const DEGRADED_KIND = 'store-unreadable-fail-open';

/**
 * Journals the fail-open `{ errors }` of the Stop `payload`. Never throws.
 * @es Registra el fallo abierto `{ errors }` de la parada `payload`. Nunca lanza.
 */
export function journalDegraded(payload, { errors }, { now = () => new Date() } = {}) {
  try {
    const line = JSON.stringify({ at: now().toISOString(), session: payload?.session_id, kind: DEGRADED_KIND, errors, transcript: payload?.transcript_path });

    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(refusalsFile(), `${line}\n`, 'utf8');
  } catch {
    // A journal is evidence, never a precondition. @es Un journal es evidencia, nunca una precondición.
  }
}
