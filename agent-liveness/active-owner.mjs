/**
 * Which agent is working in a worktree: the answer the guards ask for, decided from the agent's recorded
 * lifecycle first and from the transcript's mtime only when nothing was recorded.
 *
 * ## The decision order, per agent record (first line that applies wins)
 *
 *   1. a recorded STOP            -> stopped, immediately, however fresh its transcript is.
 *   2. a recorded START, no stop  -> working, even before its transcript or any write exists.
 *   3. no lifecycle record        -> the old rule, untouched: working only while its transcript was written
 *                                    within `ACTIVE_WINDOW_MS` (agents launched before the recorder existed).
 *
 * "Recorded" is the LAST line kept for that agent (`lifecycle-log.mjs`): start, stop, start is working.
 * Across records, a working agent found by 1-2 wins; the rest are asked the old rule together.
 *
 * ## One honest bound on rule 2
 *
 * A START with no STOP is a crashed session as often as it is a long one, and the harness cannot fire a stop for
 * a process that died. A start older than `STARTED_CEILING_MS` is therefore read as if nothing were recorded and
 * falls to rule 3: if it is also quiet, it is stopped. Short of that ceiling, a start is trusted over silence.
 *
 * ## What it cannot see, stated
 *
 * A worker launched WITHOUT isolation to take over a worktree is joined to it by the `TENANCY:` line of its brief,
 * read from its transcript. Before that transcript exists the join cannot be made, so such a worker is found only
 * once it has written its first record. An isolated worker is joined by the harness's own `worktreePath`, which
 * needs no transcript.
 *
 * ## Why this wraps `liveness.mjs` instead of editing it
 *
 * `liveness.mjs` is vendored byte-identical from the b100-am-ui fleet and hash-pinned (`vendored/vendored.mjs`);
 * an edit here would fail the provenance check and be overwritten by the next sync. The mtime rule, the record
 * store and the worktree/brief join live there and are reused, not copied: rule 3 IS its `activeOwner`, and a
 * non-isolated started worker is joined by asking it with the clock set to the transcript's own mtime.
 *
 * @es Qué agente trabaja en un worktree: la respuesta que piden las guardias, decidida primero por el ciclo de
 * vida registrado y por el mtime del transcript solo cuando no hay nada registrado. ORDEN, por registro de
 * agente (gana la primera línea que aplica): (1) un STOP registrado -> parado, de inmediato, por fresco que
 * esté su transcript; (2) un START registrado sin stop -> trabajando, aun antes de que exista su transcript o
 * cualquier escritura; (3) sin registro -> la regla antigua intacta: trabaja mientras su transcript se escribió
 * dentro de `ACTIVE_WINDOW_MS`. «Registrado» es la ÚLTIMA línea de ese agente: start, stop, start es trabajando.
 * UNA COTA HONESTA a la regla 2: un START sin STOP es tanto una sesión caída como una larga, y el harness no
 * puede disparar un stop de un proceso muerto; un start más viejo que `STARTED_CEILING_MS` se lee como si no
 * hubiera registro y pasa a la regla 3. LO QUE NO VE: un worker lanzado SIN aislamiento para tomar un worktree
 * se une por la línea `TENANCY:` de su brief, leída de su transcript; antes de que exista no se le puede unir.
 * POR QUÉ ENVUELVE `liveness.mjs` EN VEZ DE EDITARLO: está vendorizado idéntico desde la flota de b100-am-ui y
 * fijado por hash; editarlo aquí rompería la comprobación de procedencia y el siguiente sync lo pisaría.
 */

import { statSync } from 'node:fs';

import { ACTIVE_WINDOW_MS, activeOwner as quietOwner, agentRecords, worktreeName } from './liveness.mjs';
import { STOP, agentKey, readLifecycle } from './lifecycle-log.mjs';

export { ACTIVE_WINDOW_MS, agentRecords };

/**
 * How long a START with no STOP is trusted over silence. A day is far beyond any real run (`build:ci-pr` takes
 * the better part of an hour), so only a session that died can reach it.
 * @es Cuánto se confía en un START sin STOP por encima del silencio. Un día supera con creces cualquier ejecución
 * real, así que solo una sesión caída lo alcanza.
 */
export const STARTED_CEILING_MS = 24 * 60 * 60 * 1000;

/** The mtime of a transcript, or `undefined` when it does not exist yet. @es El mtime de un transcript, o `undefined` si aún no existe. */
function writtenAt(transcript) {
  try {
    return statSync(transcript).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * The owner of `path` among the started agent `record`, or `undefined` when it does not work there.
 * `quietForMs` is the time since the latest sign of life: its last write, or its start when it has not written.
 * @es El dueño de `path` entre el agente arrancado `record`, o `undefined` si no trabaja ahí. `quietForMs` es el
 * tiempo desde la última señal de vida: su última escritura o, si no escribió, su arranque.
 */
function startedOwner(path, record, startedAt, now) {
  const wanted = worktreeName(path).toLowerCase();

  if (wanted === '') return undefined;

  const mtime = writtenAt(record.transcript);
  const lastSign = Math.max(startedAt, mtime ?? 0);

  if (record.worktree !== '') return record.worktree.toLowerCase() === wanted ? { id: record.id, quietForMs: now - lastSign } : undefined;
  if (mtime === undefined) return undefined;

  return quietOwner(path, [record], mtime) === undefined ? undefined : { id: record.id, quietForMs: now - lastSign };
}

/**
 * The agent working in `path`, or `undefined`. `undefined` means "nobody is working here", which is not "no agent
 * owns it": the callers rely on that distinction, exactly as with the mtime rule this wraps.
 * @param lifecycle What is recorded about each agent (`lifecycle-log.mjs`); injectable.
 * @es El agente que trabaja en `path`, o `undefined`. `undefined` es «nadie trabaja aquí», no «ningún agente lo posee».
 */
export function activeOwner(path, records = agentRecords(), now = Date.now(), lifecycle = readLifecycle()) {
  const unrecorded = [];

  for (const record of records) {
    const recorded = lifecycle.get(agentKey(record.id));

    if (recorded?.event === STOP) continue;
    if (recorded === undefined || now - recorded.at >= STARTED_CEILING_MS) {
      unrecorded.push(record);
      continue;
    }

    const owner = startedOwner(path, record, recorded.at, now);

    if (owner !== undefined) return owner;
  }

  return quietOwner(path, unrecorded, now);
}
