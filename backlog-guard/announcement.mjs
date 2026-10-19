/**
 * THE CANDIDATE — may this final message announce a pending item? The cheap, lexical half of the question.
 *
 * Owns one step: keep only the author's own words (`prose.mjs`: quoted, fenced and code text is a mention, never an
 * announcement) and look for a marker of `markers.mjs` in them. It judges NOTHING about intent: whether the
 * message really leaves something for later, and whether a record already covers it («#1259», «ya está en»), is the
 * pending judge's question (`../pending-judge/`). Owner order 2026-10-11: «que no salten si no tienen que saltar».
 *
 * @es EL CANDIDATO — ¿puede este mensaje final anunciar un ítem pendiente? La mitad léxica y barata de la
 * pregunta: se queda con las palabras propias del autor y busca un marcador. NO juzga la intención: si el mensaje
 * deja algo para después, y si un registro ya lo cubre, lo decide el juez de pendientes.
 */

import { findPendingMarker } from './markers.mjs';
import { proseOutsideQuotes } from './prose.mjs';

/** The first marker in the author's own words of `message`, or `undefined`. @es El primer marcador en las palabras propias de `message`, o `undefined`. */
export function findCandidate(message) {
  return typeof message === 'string' ? findPendingMarker(proseOutsideQuotes(message)) : undefined;
}
