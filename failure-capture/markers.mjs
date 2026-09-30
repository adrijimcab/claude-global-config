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
 *   - `refuta`, `corrección`, `me equivoqué`: la mayoría de sus disparos acabaron en captura.
 * Estrecharlos más habría sido ajustar un literal a siete frases de muestra. Se prefirió eso a
 * perder una lección.
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
  'corrección',
  'correccion',
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
