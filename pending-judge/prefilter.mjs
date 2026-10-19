/**
 * The pending judge's prefilter: is the model worth asking about this stop? Yes only when the message carries a
 * marker (`../backlog-guard/markers.mjs`), the turn saved nothing to the master backlog (`../backlog-guard/decide.mjs`)
 * and the turn has not been dismissed. Everything else passes with no model call.
 *
 * A DISMISSAL ends the question for its turn: after a block of this turn, a dismissal the session recorded
 * (`../backlog-guard/dismiss.mjs`) later than that block means the owner's session answered the judge in writing,
 * so the continued stop passes. It is looked up only on a continued stop and only against a block of THIS turn,
 * so a dismissal from an earlier turn silences nothing.
 *
 * @es El prefiltro del juez de pendientes: ¿vale la pena preguntar al modelo por esta parada? Solo si el mensaje
 * lleva un marcador, el turno no guardó nada en el backlog maestro y no fue descartado. Un DESCARTE cierra la
 * pregunta de su turno: tras un bloqueo de este turno, un descarte posterior de la sesión significa que respondió
 * por escrito al juez. Se consulta solo en una parada continuada y contra un bloqueo de ESTE turno.
 */

import { decide } from '../backlog-guard/decide.mjs';
import { dismissedSince } from '../backlog-guard/dismissals.mjs';
import { lastBlockTimeThisTurn } from '../judge-gate/outcome-log.mjs';

/** The name the gate logs this judge under. @es El nombre bajo el que la compuerta registra a este juez. */
const JUDGE_NAME = 'pending';

/**
 * Whether to ask the model about the hook input `payload`. Every dependency is injectable.
 * @es Si preguntar al modelo por la entrada `payload`. Toda dependencia es inyectable.
 */
export function prefilter(payload, { owes = decide, lastBlockTime = lastBlockTimeThisTurn, dismissed = dismissedSince } = {}) {
  if (owes(payload) === undefined) return false;

  if (payload?.stop_hook_active !== true) return true;

  const session = typeof payload.session_id === 'string' ? payload.session_id : '';
  const blockedAt = lastBlockTime(JUDGE_NAME, session);

  return blockedAt === undefined || !dismissed(session, blockedAt);
}
