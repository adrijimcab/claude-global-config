/**
 * The block the gate gives when the pending judge is unavailable: its model call failed, or its answer was no
 * rubric verdict. The gate asks the model only after the lexical prefilter found a marker in a turn that saved
 * nothing to the master backlog, so that finding stands on its own: the turn is blocked deterministically, the text
 * says the judge was unavailable and why, and the same instructions to record or dismiss follow (`appendix.mjs`).
 * Passing instead would let every model outage silently waive the backlog rule. The reason starts with `MARKER`,
 * so `../premise-judge/journal-guard.mjs` journals it like a judged block.
 *
 * @es El bloqueo que da la compuerta cuando el juez de pendientes no está disponible: su llamada al modelo falló o
 * su respuesta no fue un veredicto. La compuerta solo pregunta tras hallar el prefiltro léxico un marcador en un
 * turno que no guardó nada en el backlog maestro, así que ese hallazgo se sostiene solo: el turno se bloquea de
 * forma determinista, el texto dice que el juez no estuvo disponible y por qué, y siguen las mismas instrucciones.
 * Dejar pasar haría que cada caída del modelo anulara en silencio la regla del backlog.
 */

import { findCandidate } from '../backlog-guard/announcement.mjs';
import { appendix } from './appendix.mjs';
import { MARKER } from './prompt.mjs';

/**
 * The block reason for the hook input `payload` when the judge is unavailable for `why`.
 * @es El motivo del bloqueo para la entrada `payload` cuando el juez no está disponible por `why`.
 */
export function unavailableBlock(payload, why) {
  const marker = findCandidate(payload?.last_assistant_message) ?? 'pending-judge';

  return [
    `${MARKER} the pending judge was unavailable (${why}), so this is the deterministic lexical block: your final message carries the marker "${marker}" and this turn saved nothing to the master backlog.`,
    `@es ${MARKER} el juez de pendientes no estuvo disponible (${why}), así que este es el bloqueo léxico determinista: tu mensaje final lleva el marcador «${marker}» y este turno no guardó nada en el backlog maestro.`,
    '',
    appendix(payload),
  ].join('\n');
}
