/**
 * Renders a `decide.mjs` refusal as the bilingual text the model sees: English first, then the `@es`
 * mirror. It names the dropped items, defines the closure marker precisely, and states the way out.
 *
 * @es Convierte un rechazo de `decide.mjs` en el texto bilingüe que ve el modelo: inglés primero y el
 * espejo `@es`. Nombra los items perdidos, define el marcador de cierre con precisión y dice la salida.
 */

import { ANCHOR_TOKENS, CLOSURE_WORDS } from './loss.mjs';

/** At most this many dropped items are quoted; the rest are counted. @es Máximo de items citados; el resto se cuenta. */
export const MAX_QUOTED_ITEMS = 12;
const MAX_QUOTED_CHARACTERS = 160;

function quote(item) {
  return item.length > MAX_QUOTED_CHARACTERS ? `${item.slice(0, MAX_QUOTED_CHARACTERS)}...` : item;
}

function droppedBlock(dropped) {
  const shown = dropped.slice(0, MAX_QUOTED_ITEMS).map((item) => `  - ${quote(item)}`);
  const hidden = dropped.length - shown.length;

  return [...shown, ...(hidden > 0 ? [`  ... and ${hidden} more / y ${hidden} más`] : [])].join('\n');
}

const MARKER_EN = `To retire an item on purpose, add a line to the new content that contains a closure word (${[...CLOSURE_WORDS].join(', ')}, case-insensitive) AND the first ${ANCHOR_TOKENS} words of that item copied verbatim, for example "CLOSED: <first ${ANCHOR_TOKENS} words of the item> — evidence". A closure word anywhere else excuses nothing.`;
const MARKER_ES = `Para retirar un item a propósito, añade al nuevo contenido una línea con una palabra de cierre (${[...CLOSURE_WORDS].join(', ')}, sin distinguir mayúsculas) Y las ${ANCHOR_TOKENS} primeras palabras de ese item copiadas literalmente, por ejemplo "CERRADO: <primeras ${ANCHOR_TOKENS} palabras del item> — evidencia". Una palabra de cierre en otro sitio no excusa nada.`;

function lossText(refusal) {
  const target = refusal.id === undefined ? refusal.topicKey : `observation #${refusal.id} (${refusal.topicKey ?? 'no topic_key'})`;

  return [
    `backlog-content-guard: this ${refusal.toolName} would REPLACE ${target} and DROP ${refusal.dropped.length} item(s) the current revision holds (engram saves on an existing topic_key are a full upsert, not an append):`,
    droppedBlock(refusal.dropped),
    'Read the current revision (mem_get_observation), then resend the WHOLE content: the old items plus your additions. Reordering, reflowing and pure additions are always allowed.',
    MARKER_EN,
    `@es Este ${refusal.toolName} REEMPLAZARÍA ${target} y PERDERÍA ${refusal.dropped.length} item(s) de la revisión actual (guardar sobre un topic_key existente es un upsert completo, no un añadido). Items perdidos arriba.`,
    'Lee la revisión actual (mem_get_observation) y reenvía el contenido COMPLETO: los items antiguos más tus añadidos. Reordenar, reflujar y añadir siempre está permitido.',
    MARKER_ES
  ].join('\n');
}

function unverifiableText(refusal) {
  return [
    `backlog-content-guard: cannot verify a write to the master backlog ${refusal.topicKey} (${refusal.kind}: ${refusal.detail}). This guard fails CLOSED for the master backlog, because a silently replaced revision cannot be reconstructed.`,
    'Check that engram\'s store (ENGRAM_DATA_DIR, default ~/.engram/engram.db) is readable and that the topic_key matches exactly one row for this project, then retry.',
    `@es No se puede verificar una escritura al backlog maestro ${refusal.topicKey} (${refusal.kind}: ${refusal.detail}). Esta guardia FALLA CERRADO para el backlog maestro, porque una revisión reemplazada en silencio no se puede reconstruir.`,
    'Comprueba que el almacén de engram (ENGRAM_DATA_DIR, por defecto ~/.engram/engram.db) sea legible y que el topic_key coincida con una sola fila de este proyecto, y reintenta.'
  ].join('\n');
}

/** The deny reason for one refusal descriptor. @es El motivo de denegación para un descriptor de rechazo. */
export function reason(refusal) {
  return refusal.kind === 'content-loss' ? lossText(refusal) : unverifiableText(refusal);
}
