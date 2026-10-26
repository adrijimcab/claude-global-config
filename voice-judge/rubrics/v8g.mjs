/**
 * Rubric v8g of the voice judge: a CANDIDATE derived from v8f and the owner's labels of 2026-10-25 (backlog-1-6 Log
 * L16), whose reason for most fails was «no suena argentino». It is v8f with two changes, applied below to v8f's text
 * so the two cannot drift apart: trait (a) asks for a register a porteño reader hears as Argentine, carried by
 * natural Rioplatense turns and not by the vos conjugation alone, and a colloquial Rioplatense turn or vocative aimed
 * at him counts as address beside a clitic. Measured 2026-10-25 on the 12 owner labels, 6 runs: it agrees with him on
 * 55 of 72 judgments (v8f 52, v7 22), and it does not meet the ship bar. Those 12 labels are the ones it was derived
 * from, so that agreement is in-sample. It goes live only when `../measure.mjs` records the ship bar MET for this
 * exact text; see `../prompt.mjs`.
 * @es Rúbrica v8g del juez de voz: CANDIDATA derivada de la v8f y de las etiquetas del dueño del 2026-10-25, cuyo
 * motivo más repetido fue «no suena argentino». Es la v8f con dos cambios aplicados abajo sobre su texto: el rasgo (a)
 * pide un registro que un lector porteño oye como argentino, llevado por giros rioplatenses naturales y no solo por la
 * conjugación de vos, y un giro o vocativo rioplatense dirigido a él cuenta como trato junto a un clítico. Coincide
 * con el dueño en 55 de 72 juicios sobre las mismas 12 etiquetas de las que se derivó, y no alcanza la barra.
 */

import { PROMPT as V8F_PROMPT, PROMPT_SIGNATURE as V8F_SIGNATURE } from './v8f.mjs';

export { MARKER } from '../marker.mjs';

/** The first line of the rubric: how this hook is told apart among the Stop hooks of a transcript. @es La primera línea de la rúbrica. */
export const PROMPT_SIGNATURE = 'voice-judge rubric v8g.';

/** The changes v8g makes to the v8f text, each found exactly once. @es Los cambios de la v8g sobre el texto de la v8f. */
const CHANGES = [
  [
    ' in a Rioplatense register: the warm, colloquial cadence of a porteño mentor talking to him; no particular expression is required, and correct voseo that reads as a cold report is not that register.',
    ' in a Rioplatense register that a porteño reader hears as Argentine: a warm, colloquial cadence carried by natural Rioplatense turns of phrase aimed at him, not by the vos conjugation alone; voseo or shared forms inside an otherwise neutral Spanish lexicon do not sound Argentine and fail (a), however good the content.',
  ],
  [
    ' A clitic te or a possessive tu aimed at him counts as address only when the reply also has at least one verb conjugated for vos or the pronoun vos.',
    ' A clitic te or a possessive tu aimed at him counts as address only when the reply also has at least one verb conjugated for vos, the pronoun vos, or a colloquial Rioplatense turn or vocative aimed at him, which is address in itself.',
  ],
  [`${V8F_SIGNATURE}\n`, `${PROMPT_SIGNATURE}\n`],
];

/** The rubric: v8f's text with `CHANGES` applied. `$ARGUMENTS` is its only `$`. @es La rúbrica: el texto de la v8f con `CHANGES`. */
export const PROMPT = CHANGES.reduce((text, [from, to]) => {
  if (text.split(from).length !== 2) {
    throw new Error(`rubric v8g: a change to v8f no longer matches exactly once: ${from.slice(0, 80)} @es rúbrica v8g: un cambio sobre la v8f ya no coincide exactamente una vez`);
  }

  return text.replace(from, () => to);
}, V8F_PROMPT);
