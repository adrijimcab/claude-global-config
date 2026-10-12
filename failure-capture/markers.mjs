/**
 * Correction markers — the LOCATION half of the failure-capture loop.
 *
 * WHAT THIS IS AND IS NOT. These strings LOCATE a candidate correction in a final message. They do
 * NOT decide that a mistake happened — no command hook can. The project's own rule is `grep localiza,
 * NO dictamina` (lessons ledger 2026-08-03), and this file obeys it: a hit opens an OBLIGATION to
 * record or to dismiss-with-reason, never a verdict.
 *
 * NO REGEXES (owner mandate M5). Matching is `toLowerCase()` + `includes()` on plain literals. The
 * mandate's stated reason is the decisive one here: `una regex que no matchea SE SALTA cosas en
 * silencio`. A detector that silently misses is the exact defect class this whole mechanism exists to
 * close, so the detector itself must not be built out of that material.
 *
 * @es Marcadores de corrección — la mitad de LOCALIZACIÓN del lazo de captura de fallos. Localizan un
 * candidato en el mensaje final; NO dictaminan que hubo un error (ningún hook de comando puede). Un
 * acierto abre una OBLIGACIÓN de registrar o de descartar-con-motivo, nunca un veredicto. SIN REGEX
 * (mandato M5): `toLowerCase()` + `includes()` sobre literales, porque una regex que no matchea se
 * salta cosas en silencio — justo el fallo que este mecanismo existe para cerrar.
 */

/**
 * Phrases that mark a self-correction, a refutation, or a measurement that did not measure.
 * Lowercase only — the caller lowercases the message before testing.
 *
 * PODA DEL 2026-09-29, decidida por datos y no por intuición. Se contaron los 87 disparos que el hook
 * dejó en los transcripts, cada uno con su desenlace real: una llamada a `capture.mjs capture` o a
 * `capture.mjs dismiss`. Los descartes por marcador coinciden uno a uno con `state/dismissals.jsonl`.
 * Se quitaron los marcadores que NUNCA fueron el detector de una lección real:
 *   - `no lo verifiqué` / `no lo verifique` / `sin verificar`: 0 capturas y 5 descartes. Es la marca
 *     de honestidad que EXIGE el contrato de verificación. Penalizarla premiaba callar la duda.
 *   - `never ran`: 0 capturas y 3 descartes. Los tres describían un hook que rechazó un comando antes
 *     de ejecutarlo.
 *   - `stale`: 1 captura y 5 descartes. Esa captura también llevaba `no midió`, así que sigue
 *     detectándose. Además la subcadena choca con el español («se instale», «se instalen»): dos de
 *     los descartes eran eso.
 * Se conservan aunque tengan descartes, porque fueron el ÚNICO detector de lecciones reales:
 *   - `rancio`: 2 capturas en las que era el único marcador, contra 5 descartes.
 *   - `nunca corrió`: 1 captura (un gate que nadie corrió), contra 1 descarte.
 *   - `refuta`, `me equivoqué`: la mayoría de sus disparos acabaron en captura.
 * Estrecharlos más habría sido ajustar un literal a siete frases de muestra. Se prefirió eso a
 * perder una lección.
 *
 * NARROWING OF «corrección», 2026-10-12, again by data. `state/dismissals.jsonl` holds 30 dismissals
 * for «corrección» (24) or «correccion» (6) out of 77 in all: the most dismissed marker. The word is
 * also the noun in «corrección y seguridad» (item 1 of the engineering standard's tie-break order,
 * which tripped it three times that day) and in «la corrección que le pedí al worker» (most of the
 * rest). The 59 distinct final messages in the session transcripts on which the guard fired with it
 * were re-read, each with its real outcome. The constructions that correct an earlier statement are
 * kept: «corrección a/al <something I said>», «corrección mía», «de mi parte», «te debo una
 * corrección», «la corrección:» as a heading, «te dije mal». With those phrases 0 of the 26 messages
 * that ended in a dismissal still trip, and 12 of the 26 that ended in a capture still trip (the
 * other 14 used the word as a noun, so another marker or another cause opened their capture); 5 of
 * the 7 with no recorded outcome trip, 4 of them own corrections. The bare `corrección:` was dropped
 * because 3 dismissals tripped it («pendiente de corrección:», «tu corrección:», «anoté una
 * corrección:»). Verb forms («corrijo», «corregí») are not markers: in those messages they mostly
 * name a fix to code or to someone else's work («lo corregí y comprobé con git», «le corrijo un
 * detalle»), and the only retraction found, «Corrijo algo que te dije mal», is caught by «te dije mal».
 * @es ESTRECHAMIENTO de «corrección», 2026-10-12, otra vez por datos: la palabra sola dejó de ser
 * marcador, porque es el sustantivo de «corrección y seguridad» y de «la corrección que le pedí al
 * worker». Siguen siéndolo las construcciones que corrigen una afirmación previa, derivadas de los 59
 * mensajes finales distintos de los transcripts: 0 de 26 descartados disparan y 12 de 26 con captura
 * siguen disparando. El `corrección:` suelto se quitó (3 descartes lo disparaban) y las formas
 * verbales no son marcador (la mayoría arreglan código).
 * @es Frases que marcan autocorrección, refutación o una medición que no midió. Solo minúsculas.
 */
export const CORRECTION_MARKERS = Object.freeze([
  // --- self-correction, English / autocorrección, inglés
  'i was wrong',
  'i was mistaken',
  'my mistake',
  'i got that wrong',
  'i misread',
  'correcting myself',
  'correction:',
  'retract',
  'i stand corrected',
  'that was incorrect',
  'my earlier claim',
  'contrary to what i said',

  // --- self-correction, Spanish / autocorrección, español
  'me equivoqué',
  'me equivoque',
  'estaba equivocado',
  // «corrección» sola NO es marcador (ver la nota del 2026-10-12 arriba); sí lo son las construcciones que
  // corrigen una afirmación previa, cada una con su ortografía sin tilde porque el mensaje puede llegar así.
  // The bare noun is not a marker (see the 2026-10-12 note above); the constructions that correct an earlier statement are.
  'la corrección:',
  'la correccion:',
  'corrección mía',
  'correccion mia',
  'corrección de mi parte',
  'correccion de mi parte',
  'correcciones de mi parte',
  'te debo una corrección',
  'te debo una correccion',
  'corrección a ',
  'correccion a ',
  'correcciones a ',
  'corrección al ',
  'correccion al ',
  'correcciones al ',
  'te dije mal',
  'me retracto',
  'me auto-refuté',
  'me auto-refute',
  'lo dije mal',
  'falso negativo',
  'falso positivo',

  // --- refutation of a prior statement / refutación de una afirmación previa
  'refuted',
  'refuta',
  'refutación',
  'refutacion',
  'turned out to be false',
  'resultó ser falso',
  'resulto ser falso',
  'era falso',
  'was actually',

  // --- measurement failure: the defect class that started this / fallo de medición
  'false positive',
  'false green',
  'falso verde',
  'rancio',
  'measurement failure',
  'fallo de medición',
  'fallo de medicion',
  'medí nada',
  'medi nada',
  'no midió',
  'no midio',
  'nunca corrió',
  'nunca corrio',
  'did not actually',
  'no llegó a correr',
  'no llego a correr',
]);

/**
 * Returns the first marker present in `message`, or `undefined`. Pure, allocation-light, no regex.
 * @es Devuelve el primer marcador presente en `message`, o `undefined`. Pura y sin regex.
 */
export function findMarker(message) {
  if (typeof message !== 'string' || message.length === 0) return undefined;

  const haystack = message.toLowerCase();

  return CORRECTION_MARKERS.find((marker) => haystack.includes(marker));
}
