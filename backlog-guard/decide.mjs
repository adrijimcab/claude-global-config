/**
 * THE DECISION — may this turn end, or does an announced-pending finding owe the master backlog first?
 *
 * Owner directive, verbatim: «Apuntar esto y TODO lo que vaya saliendo más adelante directamente en el
 * backlog … y que esto se haga siempre, dejarlo como regla implementada»
 * (`~/.claude/rules/00-owner-mandates.md`, "Backlog maestro — todo hallazgo entra en el momento").
 *
 * THE PROPERTY THIS CHECKS: did the final message of THIS turn LOOK LIKE it announces something
 * pending (`markers.mjs`), and did a master-backlog `mem_save` (`master-save.mjs`) happen SINCE the
 * transcript position recorded at the end of the PREVIOUS turn (`state.mjs`)? Both halves are
 * heuristics on purpose — a command hook cannot judge whether a finding is real or whether a save's
 * CONTENT actually captures it, only whether the shapes are present. `grep localiza, NO dictamina`.
 *
 * WHY THE WINDOW IS PER-TURN, not per-session like `engram-persistence/guard.mjs`'s "since last
 * satisfaction". A save made in an earlier turn must NOT silently cover a NEW pending announcement in a
 * later one — the owner directive is "every finding, in the turn it appears", not "at least one save
 * somewhere in the session". Reading only the transcript bytes since the last turn's offset is what
 * makes the check see that: an earlier save sits before the offset and cannot satisfy this turn.
 *
 * FAILS OPEN on every unmeasurable case: no transcript, an unreadable file, a malformed payload. A
 * guard able to wedge a turn end is a larger hazard than the finding it might miss — the same bound
 * every sibling Stop guard in this fleet holds (`turn-guard.mjs`, `claim-guard.mjs`,
 * `engram-persistence/guard.mjs`).
 *
 * A `mem_update` carries no `topic_key`, so whether it touched the master record is asked of the engram
 * store (`master-update.mjs`), never inferred from earlier reads. WHEN THE STORE CANNOT ANSWER (no
 * database, no `node:sqlite`, a failed query) while the turn DID contain a `mem_update`, this guard fails
 * OPEN and reports the degradation to its journal. Why open and not closed, unlike the PreToolUse
 * `backlog-owner-guard` (which protects unrecoverable state and so fails closed): this Stop guard
 * protects a REMINDER. Its trigger is already a heuristic phrase match, a false block here is exactly the
 * defect being fixed ("nothing saved" after a real master write), a false allow costs one unflagged
 * announcement that the journal records, and a guard able to wedge a turn end over its own dependency is
 * the larger hazard — the bound every sibling Stop guard holds. When the turn holds NO `mem_update`
 * there is nothing to fail open for, the store is not consulted, and the block stands.
 *
 * @es Un `mem_update` no lleva `topic_key`, así que si tocó el registro maestro se PREGUNTA al almacén de
 * engram (`master-update.mjs`), nunca se infiere de lecturas anteriores. CUANDO EL ALMACÉN NO PUEDE
 * RESPONDER (sin base de datos, sin `node:sqlite`, consulta fallida) y el turno SÍ tuvo un `mem_update`,
 * esta guardia falla ABIERTO y anota la degradación en su journal. Abierto y no cerrado, a diferencia de
 * `backlog-owner-guard` (que protege estado irrecuperable): esta guardia `Stop` protege un RECORDATORIO,
 * su disparador ya es una heurística de frases, un bloqueo falso es justo el defecto que se corrige, un
 * permiso falso cuesta un anuncio sin marcar que el journal registra, y una guardia capaz de trabar el
 * fin de turno por su dependencia es el riesgo mayor. Sin `mem_update` en el turno no hay nada ante lo
 * que fallar abierto: el almacén no se consulta y el bloqueo se mantiene.
 *
 * @es LA DECISIÓN: ¿puede terminar este turno, o un hallazgo pendiente anunciado debe primero el
 * backlog maestro? Comprueba si el mensaje final de ESTE turno anuncia algo pendiente y si hubo un
 * guardado de backlog maestro DESDE la posición de transcript registrada al final del turno ANTERIOR —
 * nunca «en algún punto de la sesión», porque la directiva es «cada hallazgo, en el turno en que
 * aparece». FALLA ABIERTO ante cualquier caso no medible.
 */

import { resolveTopicKeyById } from '../backlog-owner-guard/resolve-topic-key.mjs';
import { findAnnouncement } from './announcement.mjs';
import { judgeMasterUpdates } from './master-update.mjs';
import { hasMasterDocumentCommit } from './backlog-document-save.mjs';
import { hasMasterBacklogSave } from './master-save.mjs';
import { readOffsetState, readTranscriptTail, transcriptSize, writeOffsetState } from './state.mjs';

/**
 * The decision over a parsed Stop payload, as `{ marker, sessionId, transcriptPath }` when the turn
 * must be blocked, `undefined` when it may end. Every dependency is injectable so the whole state space
 * is exercisable without a live session or a real transcript file.
 * @es La decisión sobre un payload `Stop` ya parseado, o `undefined` si el turno puede terminar. Toda
 * dependencia es inyectable.
 */
export function decide(
  payload,
  {
    readState = readOffsetState,
    writeState = writeOffsetState,
    readTail = readTranscriptTail,
    sizeOf = transcriptSize,
    resolveTopicKey = resolveTopicKeyById,
    reportDegraded = () => {}
  } = {}
) {
  // Already raised once this turn: the obligation has been stated. Never raise it twice.
  if (payload?.stop_hook_active === true) return undefined;

  const message = typeof payload?.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  const marker = findAnnouncement(message);

  const sessionId = typeof payload?.session_id === 'string' && payload.session_id.length > 0 ? payload.session_id : 'unknown';
  const transcriptPath = payload?.transcript_path;

  const state = readState(sessionId);
  const offset = typeof state?.offset === 'number' ? state.offset : 0;
  const currentSize = sizeOf(transcriptPath);
  const tail = readTail(transcriptPath, offset);

  // The window for THIS turn is consumed either way: a block does not get re-examined on retry (the
  // retry bypasses above via `stop_hook_active`), and the next genuinely new turn must not re-read
  // content this turn already judged.
  writeState(sessionId, { offset: currentSize ?? offset });

  // No pending phrase at all: nothing owed this turn, regardless of what was just learned.
  if (marker === undefined) return undefined;

  // Cannot read the transcript: a failed measurement, never coerced into a block or a pass by guessing.
  // Failing OPEN here (never wedging a turn on an unreadable file) is the bound every sibling Stop guard
  // in this fleet holds.
  if (tail === undefined) return undefined;

  if (hasMasterBacklogSave(tail) || hasMasterDocumentCommit(tail)) return undefined;

  // A `mem_update` has no topic_key of its own: ask the store what each updated observation IS.
  // @es Un `mem_update` no tiene topic_key propio: se pregunta al almacén qué ES cada observación.
  const { master, unresolved } = judgeMasterUpdates(tail, resolveTopicKey);

  if (master) return undefined;

  // A mem_update was in the turn but the store could not say what it targeted: fail open, on the record.
  // @es Hubo un mem_update pero el almacén no pudo decir su objetivo: falla abierto, dejando constancia.
  if (unresolved.length > 0) {
    reportDegraded({ errors: unresolved });

    return undefined;
  }

  return { marker, sessionId, transcriptPath };
}
