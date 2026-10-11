/**
 * THE ANNOUNCEMENT — does this final message announce a NEW pending item that nothing records yet?
 *
 * Owns the intent test the Stop guard applies to a message, in three steps: keep only the author's own
 * words (`prose.mjs`), judge sentence by sentence, and let a sentence that already points at a record
 * ("ya está en", "#1259", "already saved") pass — it names an item, it does not announce one. What is left
 * is matched against the lexicon of `markers.mjs`. Owner order 2026-10-11: «que no salten si no tienen
 * que saltar».
 *
 * @es EL ANUNCIO — ¿anuncia este mensaje final un ítem pendiente NUEVO que nada registra todavía? Dueña de
 * la prueba de intención: solo las palabras propias del autor, frase por frase, y una frase que ya apunta
 * a un registro («ya está en», «#1259») nombra un ítem, no lo anuncia. Lo que queda se compara con el léxico
 * de `markers.mjs`.
 */

import { findPendingMarker } from './markers.mjs';
import { proseOutsideQuotes } from './prose.mjs';

/** Phrases showing a sentence points at an item that is already recorded. @es Frases que muestran que la frase apunta a un ítem ya registrado. */
const RECORDED_CUES = Object.freeze(['ya está', 'ya esta', 'ya quedó', 'ya quedo', 'ya figura', 'ya fue', 'ya anot', 'ya guard', 'ya regist', 'ya lo ', 'quedó en engram', 'quedó guardad', 'guardado en', 'guardados en', 'lo guardé', 'guardé ', 'already', 'is recorded', 'was saved', 'saved in', 'saved to']);

/** Whether `sentence` holds `#` followed by a digit, an engram observation reference. @es Si `sentence` tiene `#` y un dígito: una referencia a observación de engram. */
function citesObservation(sentence) {
  return [...sentence].some((character, index) => character === '#' && sentence[index + 1] >= '0' && sentence[index + 1] <= '9');
}

/** The sentences of `text`, split at line ends and at `.`/`!`/`?` followed by a space. @es Las frases de `text`, cortadas en fin de línea y en `.`/`!`/`?` seguidos de espacio. */
function sentencesOf(text) {
  const sentences = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const closes = text[index] === '\n' || ('.!?'.includes(text[index]) && (index + 1 === text.length || text[index + 1] === ' ' || text[index + 1] === '\n'));

    if (closes) {
      sentences.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }

  return [...sentences, text.slice(start)];
}

/** Whether the sentence at `index` or either neighbour points at a record. @es Si la frase en `index` o una vecina apunta a un registro. */
function pointsAtRecord(sentences, index) {
  return sentences.slice(Math.max(0, index - 1), index + 2).some((sentence) => citesObservation(sentence) || RECORDED_CUES.some((cue) => sentence.toLowerCase().includes(cue)));
}

/** The marker of the first sentence that announces something unrecorded, or `undefined`. @es El marcador de la primera frase que anuncia algo sin registrar, o `undefined`. */
export function findAnnouncement(message) {
  if (typeof message !== 'string') return undefined;

  const sentences = sentencesOf(proseOutsideQuotes(message)).filter((sentence) => sentence.trim().length > 0);

  for (const [index, sentence] of sentences.entries()) {
    const marker = findPendingMarker(sentence);

    if (marker !== undefined && !pointsAtRecord(sentences, index)) return marker;
  }

  return undefined;
}
