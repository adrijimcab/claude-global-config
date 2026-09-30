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
 * @es LA DECISIÓN: ¿puede terminar este turno, o un hallazgo pendiente anunciado debe primero el
 * backlog maestro? Comprueba si el mensaje final de ESTE turno anuncia algo pendiente y si hubo un
 * guardado de backlog maestro DESDE la posición de transcript registrada al final del turno ANTERIOR —
 * nunca «en algún punto de la sesión», porque la directiva es «cada hallazgo, en el turno en que
 * aparece». FALLA ABIERTO ante cualquier caso no medible.
 */

import { findPendingMarker } from './markers.mjs';
import { hasMasterBacklogSave, hasMasterBacklogUpdate, observedMasterIdPairings } from './master-save.mjs';
import { readKnownMasterIds, readOffsetState, readTranscriptTail, recordKnownMasterIds, transcriptSize, writeOffsetState } from './state.mjs';

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
    readKnownIds = readKnownMasterIds,
    recordKnownIds = recordKnownMasterIds
  } = {}
) {
  // Already raised once this turn: the obligation has been stated. Never raise it twice.
  if (payload?.stop_hook_active === true) return undefined;

  const message = typeof payload?.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  const marker = findPendingMarker(message);

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

  // LEARN regardless of whether THIS turn even announces anything pending: a `mem_save`/`topic_key`
  // pairing seen in a tail is a durable fact ("this id IS the master backlog"), not something scoped to
  // a pending announcement. A plain housekeeping turn that happens to save the master backlog must
  // still teach this mechanism the pairing, so a LATER turn's `mem_update` (which carries no
  // `topic_key` of its own) can be recognised. `tail` may be `''` (nothing new) or `undefined` (an
  // unreadable transcript) — `observedMasterIdPairings` already returns `[]` for both.
  const pairingsSeenNow = observedMasterIdPairings(tail);

  recordKnownIds(pairingsSeenNow);

  // No pending phrase at all: nothing owed this turn, regardless of what was just learned.
  if (marker === undefined) return undefined;

  // Cannot read the transcript: a failed measurement, never coerced into a block or a pass by guessing.
  // Failing OPEN here (never wedging a turn on an unreadable file) is the bound every sibling Stop guard
  // in this fleet holds.
  if (tail === undefined) return undefined;

  if (hasMasterBacklogSave(tail)) return undefined;

  // The known-id set for THIS check is the union of what was already durably known and what this exact
  // tail just taught — so an `id`/`topic_key` pairing established EARLIER in the SAME turn still
  // satisfies a `mem_update` of that id later in that same turn, without waiting for a second Stop.
  const knownIds = readKnownIds();

  for (const { id } of pairingsSeenNow) knownIds.add(id);

  if (hasMasterBacklogUpdate(tail, knownIds)) return undefined;

  return { marker, sessionId, transcriptPath };
}
