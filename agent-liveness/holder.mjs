/**
 * Who holds a linked worktree, and whether that holder can continue: the ONE answer two guards used to give
 * separately, and gave differently.
 *
 * WHAT HAPPENED (2026-10-26, the Discovery session). A worktree held 37 unlanded commits, and the agent that
 * wrote them, `ac19aff`, had a 21.87 MB transcript. `resume-before-fresh` classified it UNRESUMABLE (past the
 * ledger size) and advised a fresh replacement carrying `TENANCY: <worktree> — taking over…`; `orphan-work`
 * saw the same worktree as parked and REFUSED that replacement, and every other writer of the repository with
 * it. Root cause: each guard decided "who holds this worktree and can it continue" on its own, from its own
 * reading of the records, so the advice of one was the refusal of the other.
 *
 * THE DECISION, per worktree, from the agent records the harness wrote (`liveness.mjs` `agentRecords`):
 *   - `live`        an agent is working there now (`active-owner.mjs`: its recorded lifecycle, else the
 *                   transcript mtime window);
 *   - `unresumable` the MOST RECENT holder cannot be resumed FROM THE DISPATCHING SESSION: it stopped on a
 *                   context-length failure, its transcript is past `EXHAUSTED_TRANSCRIPT_BYTES` (a resume
 *                   replays that oversized history), it was last written outside `RESUMABLE_WINDOW_MS`, or it
 *                   belongs to another session (a subagent resumes only from the session that spawned it);
 *   - `resumable`   the most recent holder can be resumed by its id from the dispatching session;
 *   - `none`        no record holds it (or none has a readable transcript: there is nothing to resume).
 * "Holds" means what `liveness.mjs` means: the harness `worktreePath`, or, for an agent launched without
 * isolation, a `TENANCY:` line of its brief naming that linked worktree. Several records on one worktree are
 * judged by the newest transcript, because the newest is the one a resume or a takeover would continue from.
 *
 * WHY HERE AND NOT IN `liveness.mjs`. `liveness.mjs` is vendored byte-identical from the b100-am-ui fleet;
 * this decision needs the lifecycle-aware owner of `active-owner.mjs`, which exists only here, and both
 * consumers (`resume-before-fresh`, `fleet-kit/orphan-work`) live only here. So it is authored here, beside
 * the owner it builds on, and imports the vendored module without editing it.
 *
 * @es Quién tiene un worktree enlazado y si puede continuar: la ÚNICA respuesta que dos guards daban por
 * separado, y distinta. QUÉ PASÓ (2026-10-26): un worktree con 37 commits sin aterrizar y un agente con un
 * transcript de 21,87 MB; `resume-before-fresh` lo declaró IRREANUDABLE y aconsejó un relevo con `TENANCY:`,
 * y `orphan-work` rechazó ese mismo relevo. Causa raíz: cada guard decidía por su cuenta. LA DECISIÓN:
 * `live` (alguien trabaja ahí ahora), `unresumable` (el titular MÁS RECIENTE paró por longitud de contexto o
 * su transcript pasa el umbral), `resumable` (se puede reanudar por su id) y `none` (ningún registro lo tiene).
 * Con varios registros en un worktree decide el transcript más reciente. Vive aquí y no en `liveness.mjs`
 * porque aquel está vendorizado desde b100 y esta decisión necesita `active-owner.mjs`, que solo existe aquí.
 */

import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { declarationOf } from '../brief-tenancy/tenancy-declaration.mjs';
import { activeOwner } from './active-owner.mjs';
import { readLifecycle } from './lifecycle-log.mjs';
import { agentRecords, briefOf, worktreeName } from './liveness.mjs';

/**
 * Size past which a stopped agent's transcript is no longer resumed. SOURCE: the global lessons ledger,
 * key `resumed-giant-transcripts-exhausted-quota` («once a worker's transcript passes ~2 MB, do not resume
 * it: launch a fresh agent with a narrow scope that reads the state from the files»); the ledger writes
 * "~2 MB", read here as 2,000,000 bytes. PROVENANCE, stated: the ledger rule came from one incident whose
 * resumed transcripts were 5-7 MB; no distribution of transcript sizes against resume outcomes was measured,
 * so this is a ledger rule, not a measured cut-off (an open owner item). The one place this number lives:
 * the decision and the printed rule both read it.
 * @es Tamaño a partir del cual el transcript de un agente parado ya no se reanuda. FUENTE: el ledger global
 * de lecciones, clave `resumed-giant-transcripts-exhausted-quota` («pasados ~2 MB no se reanuda»); "~2 MB" se
 * lee como 2.000.000 bytes. PROCEDENCIA: la regla salió de un incidente con transcripts de 5-7 MB; no se midió
 * ninguna distribución, así que es una regla del ledger y no un umbral medido (punto abierto para el dueño).
 */
export const EXHAUSTED_TRANSCRIPT_BYTES = 2_000_000;

/** The ledger key the size rule comes from. @es La clave del ledger de la que sale la regla de tamaño. */
export const SIZE_RULE_LEDGER_KEY = 'resumed-giant-transcripts-exhausted-quota';

/** How much of a transcript's tail is read to find its last record. @es Cuánto se lee del final del transcript. */
const TAIL_BYTES = 64 * 1024;

/** The API error text a context-length stop leaves as the transcript's last record (measured). @es El texto que deja una parada por longitud de contexto. */
export const CONTEXT_EXHAUSTED_TEXT = 'Prompt is too long';

/** The structured `error` class of that record (measured; a rate limit is `rate_limit`). @es La clase `error` estructurada de ese registro. */
export const CONTEXT_EXHAUSTED_ERROR_CLASS = 'invalid_request';

/**
 * Whether the agent STOPPED because its context ran out — the one terminal state a resume cannot leave.
 *
 * MEASURED 2026-09-30 on `aa3437bf9bf7832a9` (the coordinator, live, then this transcript read): its task
 * notification said `failed`, «Agent terminated early due to an API error: Prompt is too long», and the
 * transcript's LAST record is a synthetic assistant message with `isApiErrorMessage: true` and exactly
 * that text. A resume replays that same oversized transcript, so "resume it by its id" cannot work there.
 * Other API errors are NOT this state: agents stopped by a rate limit were resumed by id successfully, so
 * only the context-length text disqualifies.
 * @es Si el agente PARÓ porque se le acabó el contexto: el único estado del que no saca un resume. Medido
 * el 2026-09-30: el último registro del transcript es un mensaje sintético con `isApiErrorMessage` y
 * «Prompt is too long». Otros errores de API NO: los agentes parados por límite de tasa sí se reanudaron.
 */
export function stoppedOnContextLength(transcript) {
  let descriptor;

  try {
    descriptor = openSync(transcript, 'r');

    const size = fstatSync(descriptor).size;
    const length = Math.min(size, TAIL_BYTES);
    const tail = Buffer.alloc(length);

    readSync(descriptor, tail, 0, length, size - length);

    const lines = tail.toString('utf8').split('\n').filter((line) => line.trim().length > 0);
    const last = JSON.parse(lines.at(-1) ?? '{}');
    const text = Array.isArray(last?.message?.content) ? last.message.content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('') : '';

    // The structured fields decide the class: a harness-synthesised API error record whose `error` is
    // `invalid_request`. That class is broader than context length, and the record carries nothing finer
    // (measured on aa3437bf9bf7832a9 and aad6e241f1cc53532: `diagnostics` and `stop_details` are null), so
    // the API's own message is compared by EQUALITY — never searched for — to pick context length out of it.
    // @es Los campos estructurados deciden la clase: un error de API sintetizado con `error`
    // `invalid_request`. Esa clase es más amplia que la longitud de contexto y el registro no trae nada más
    // fino, así que el mensaje de la API se compara por IGUALDAD, nunca se busca dentro.
    return last?.isApiErrorMessage === true && last.error === CONTEXT_EXHAUSTED_ERROR_CLASS && text === CONTEXT_EXHAUSTED_TEXT;
  } catch {
    return false; // an unreadable tail is not evidence of this state
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * How recent a stopped agent must be for resuming it to beat starting over. Beyond this the trunk has
 * moved, the measurements inside its transcript have expired, and a fresh agent is the honest choice.
 * Moved here from `resume-before-fresh` (2026-10-26) so its refusal and this decision read one window.
 * @es Cuán reciente debe ser un agente parado para que reanudarlo gane a empezar de cero. Movido aquí desde
 * `resume-before-fresh` para que su rechazo y esta decisión lean una sola ventana.
 */
export const RESUMABLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The session that spawned an agent, read from where the harness put its transcript:
 * `<store>/<project>/<session>/subagents/<id>.jsonl`. Derived from the record's own `transcript` rather than
 * added to the shared liveness record, which is byte-pinned from the reference fleet.
 * @es La sesión que lanzó a un agente, leída de dónde el harness puso su transcript.
 */
export function sessionOf(record) {
  return basename(dirname(dirname(record.transcript)));
}

/**
 * Whether ONE agent record can be resumed from the dispatching `session`, and every reason it cannot, in
 * the order they are checked: `context-length` (its last record is the context-length stop), `oversized`
 * (past the ledger size), `stale` (last written outside the window) and `other-session` (spawned by another
 * session, or the dispatching session is unknown: then no record is its own). The one per-record answer
 * `holderOf` gives for a worktree's latest holder and `resume-before-fresh` gives for each errand holder.
 * @param options `now`, `session`, and the transcript's `bytes` and `lastWrite`, already stat-ed by the caller.
 * @returns `{ resumable, exhausted, oversized, causes, en, es }`; `exhausted` is the context or size half alone.
 * @es Si UN registro de agente se puede reanudar desde la `session` que despacha, y cada motivo por el que no:
 * `context-length`, `oversized`, `stale` (escrito fuera de la ventana) y `other-session` (lo lanzó otra sesión,
 * o la sesión que despacha es desconocida). La única respuesta por registro que dan ambos guards.
 */
export function resumabilityOf(record, { now, session, bytes, lastWrite }) {
  const contextStopped = stoppedOnContextLength(record.transcript);
  const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES;
  const stale = now - lastWrite > RESUMABLE_WINDOW_MS;
  const otherSession = sessionOf(record) !== session;
  const reasons = [
    contextStopped && ['context-length', 'it stopped on a context-length failure', 'paró por un fallo de longitud de contexto'],
    oversized && ['oversized', `its transcript is ${bytes} bytes, past ${EXHAUSTED_TRANSCRIPT_BYTES} (${SIZE_RULE_LEDGER_KEY})`, `su transcript tiene ${bytes} bytes, más de ${EXHAUSTED_TRANSCRIPT_BYTES}`],
    stale && ['stale', `it was last written ${Math.round((now - lastWrite) / 3_600_000)} h ago, outside the ${RESUMABLE_WINDOW_MS / 3_600_000} h resume window`, `se escribió por última vez hace ${Math.round((now - lastWrite) / 3_600_000)} h, fuera de la ventana de ${RESUMABLE_WINDOW_MS / 3_600_000} h`],
    otherSession && ['other-session', `it belongs to session ${sessionOf(record)}, not the dispatching one (${session ?? 'unknown'}), and a subagent resumes only from the session that spawned it`, `pertenece a la sesión ${sessionOf(record)}, no a la que despacha (${session ?? 'desconocida'}), y un subagente solo se reanuda desde la sesión que lo lanzó`]
  ].filter((reason) => reason !== false);

  return {
    resumable: reasons.length === 0,
    exhausted: contextStopped || oversized,
    oversized,
    causes: reasons.map(([cause]) => cause),
    en: reasons.map(([, en]) => en).join('; '),
    es: reasons.map(([, , es]) => es).join('; ')
  };
}

/** Whether `path` is a LINKED worktree: its `.git` is a FILE. @es Si `path` es un worktree ENLAZADO: su `.git` es un FICHERO. */
function isLinkedWorktree(path) {
  try {
    return statSync(join(String(path), '.git')).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether `record` claims the worktree called `wanted` (lowercase directory name), the two declared ways
 * `liveness.mjs` reads: the harness `worktreePath` (which wins), or a `TENANCY:` line of the brief of an agent
 * launched without isolation, read with the parser `brief-tenancy` enforces. The brief is opened only for a
 * record with no harness worktree and only for a linked worktree, as `activeOwner` limits it.
 * @es Si `record` reclama el worktree `wanted`, de las dos formas declaradas que lee `liveness.mjs`: el
 * `worktreePath` del harness (que gana) o una línea `TENANCY:` del brief de un agente sin aislamiento.
 */
function claims(record, wanted, linked) {
  if (record.worktree !== '') return record.worktree.toLowerCase() === wanted;

  return linked && declarationOf(briefOf(record.transcript), wanted) === 'present';
}

/**
 * Who holds `worktreePath` and whether it can continue.
 * @param options `records` (default: the harness store), `now`, `lifecycle` (`lifecycle-log.mjs`), and the
 *   dispatching `session` (a payload's `session_id`; unknown means no record is the dispatcher's own).
 * @returns `{ state: 'live'|'resumable'|'unresumable'|'none', agentId?, reason }`, `reason` bilingual.
 * @es Quién tiene `worktreePath` y si puede continuar. Devuelve el estado, el agente y una razón bilingüe.
 */
export function holderOf(worktreePath, { records = agentRecords(), now = Date.now(), lifecycle = readLifecycle(), session = undefined } = {}) {
  const live = activeOwner(worktreePath, records, now, lifecycle);

  if (live !== undefined) return { state: 'live', agentId: live.id, reason: `agent ${live.id} is working there now @es el agente ${live.id} trabaja ahí ahora` };

  const wanted = worktreeName(worktreePath).toLowerCase();
  const linked = isLinkedWorktree(worktreePath);
  let newest;

  if (wanted !== '') {
    for (const record of records) {
      if (!claims(record, wanted, linked)) continue;

      let stats;

      try {
        stats = statSync(record.transcript);
      } catch {
        continue; // no transcript: nothing to resume and nothing exhausted
      }

      if (newest === undefined || stats.mtimeMs > newest.mtimeMs) newest = { record, mtimeMs: stats.mtimeMs, bytes: stats.size };
    }
  }

  if (newest === undefined) return { state: 'none', reason: 'no agent record with a readable transcript holds it @es ningún registro de agente con transcript legible lo tiene' };

  const { record, bytes, mtimeMs } = newest;
  const resumability = resumabilityOf(record, { now, session, bytes, lastWrite: mtimeMs });

  if (resumability.resumable) return { state: 'resumable', agentId: record.id, reason: `its latest holder ${record.id} can be resumed by its id from this session (${bytes} bytes) @es su último titular ${record.id} se puede reanudar por su id desde esta sesión` };

  return { state: 'unresumable', agentId: record.id, reason: `its latest holder ${record.id} is unresumable: ${resumability.en} @es su último titular ${record.id} es irreanudable: ${resumability.es}` };
}

/**
 * The `TENANCY:` line a replacement of an unresumable holder carries, in English and in Spanish. One format,
 * printed by `resume-before-fresh` and accepted by `orphan-work`, which reads it with the shared marker reader
 * (`tenancyLines`) and the path it names, never by this sentence.
 * @es La línea `TENANCY:` que lleva el relevo de un titular irreanudable, en inglés y en español. Un solo
 * formato: lo imprime `resume-before-fresh` y lo acepta `orphan-work`, que lo lee por la ruta, nunca por la frase.
 */
export function takeoverDeclaration(worktree) {
  return {
    en: `TENANCY: ${worktree} — taking over from an unresumable agent (context failure or oversized transcript); read its diff first.`,
    es: `TENANCY: ${worktree} — relevo de un agente irreanudable (fallo de contexto o transcript demasiado grande); leé primero su diff.`
  };
}
