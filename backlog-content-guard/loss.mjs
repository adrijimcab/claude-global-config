/**
 * Which items of a record's CURRENT revision disappear from its NEW content, and which of those are
 * legitimately retired.
 *
 * PRESERVED means: the item's normalised text occurs inside the normalised text of the new content.
 * That single rule makes reordering, reflowing, re-bulleting and pure additions free, while an item that
 * was deleted, rewritten into a shorter summary, or edited in the middle is reported as DROPPED.
 *
 * RETIRED means: a dropped item is excused only when the new content carries a CLOSURE LINE for it, i.e.
 * a line that contains BOTH a closure word (`closed`, `cerrado`, `superseded`, `supersedido`, and their
 * feminine forms) AND the item's ANCHOR, its first {@link ANCHOR_TOKENS} meaningful words verbatim.
 * The anchor is what ties a marker to a specific item: a stray "CLOSED" elsewhere in the text, or one
 * blanket line, excuses nothing (the near miss this rule exists to refuse).
 *
 * @es Qué items de la revisión ACTUAL desaparecen del contenido NUEVO y cuáles se retiran legítimamente.
 * PRESERVADO: el texto normalizado del item aparece dentro del texto normalizado del nuevo contenido
 * (reordenar, reflujar y añadir son libres; borrar, resumir o editar a medias se reporta como PERDIDO).
 * RETIRADO: un item perdido solo se excusa si el nuevo contenido trae una LÍNEA DE CIERRE con una palabra
 * de cierre Y el ANCLA del item (sus primeras palabras literales): un "CERRADO" suelto no excusa nada.
 */

import { extractItems, meaningfulTokens, MIN_MEANINGFUL_TOKENS } from './items.mjs';

/** Words that mark an item as retired, compared after stripping surrounding punctuation. @es Palabras que marcan un item como retirado. */
export const CLOSURE_WORDS = new Set(['closed', 'cerrado', 'cerrada', 'superseded', 'supersedido', 'supersedida']);

/** How many leading meaningful words identify an item in a closure line. @es Cuántas palabras iniciales identifican un item en una línea de cierre. */
export const ANCHOR_TOKENS = 6;

const EDGE_PUNCTUATION = ':;,.()[]{}*_`"\'!?—–-=>';

function stripEdgePunctuation(token) {
  const characters = [...token];
  let start = 0;
  let end = characters.length;

  while (start < end && EDGE_PUNCTUATION.includes(characters[start])) start += 1;
  while (end > start && EDGE_PUNCTUATION.includes(characters[end - 1])) end -= 1;

  return characters.slice(start, end).join('');
}

/** True when a normalised item contains a closure word as a whole token. @es Verdadero si el item contiene una palabra de cierre como token completo. */
export function hasClosureWord(normalizedItem) {
  return normalizedItem.split(' ').some((token) => CLOSURE_WORDS.has(stripEdgePunctuation(token)));
}

/** The verbatim leading words of a normalised item, used to name it inside a closure line. @es Las palabras iniciales literales del item. */
export function anchorOf(normalizedItem) {
  return normalizedItem.split(' ').slice(0, ANCHOR_TOKENS).join(' ');
}

/**
 * The dropped items of `currentText` that `nextText` neither preserves nor explicitly retires. Each entry
 * is the normalised item text. An empty array means nothing meaningful was lost.
 * @es Los items de `currentText` que `nextText` ni preserva ni retira explícitamente.
 */
export function droppedItems(currentText, nextText) {
  const nextItems = extractItems(nextText);
  const nextHaystack = nextItems.join(' ');
  const closureLines = nextItems.filter(hasClosureWord);

  return extractItems(currentText)
    .filter((item) => meaningfulTokens(item).length >= MIN_MEANINGFUL_TOKENS)
    .filter((item) => !nextHaystack.includes(item))
    .filter((item) => !closureLines.some((line) => line.includes(anchorOf(item))));
}
