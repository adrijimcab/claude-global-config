/**
 * The RULE sentences of a rule file, the text the promoted-rules header promises to keep LITERALLY. A RULE
 * sentence starts at the upper-case word `RULE` that no letter or digit precedes and that a `:` or `,`
 * follows (`RULE:`, `**RULE: …**`, `RULE, operational:`), in the whitespace-folded text; it ends after the
 * first `.`, `!` or `?` outside a backtick span that is followed by a space, a `*` or the end of the text.
 * Not a RULE sentence: `RULES:`, `rule:`, `PRERULE:`, the template `RULE to not repeat`.
 *
 * @es Las frases RULE de un fichero de reglas, el texto que la cabecera de las reglas promovidas promete
 * conservar LITERALMENTE. Una frase RULE empieza en la palabra `RULE` en mayúsculas sin letra ni dígito
 * delante y seguida de `:` o `,`, en el texto plegado; termina tras el primer `.`, `!` o `?` fuera de un tramo
 * entre comillas invertidas seguido de un espacio, un `*` o el fin del texto. No lo son: `RULES:`, `rule:`,
 * `PRERULE:`, la plantilla `RULE to not repeat`.
 */

import { folded } from './instruction-text.mjs';

const MARK = 'RULE';
const OPENERS = [':', ','];
const TERMINATORS = ['.', '!', '?'];
const AFTER_TERMINATOR = [' ', '*'];

/** Whether `character` is a letter or a digit. @es Si `character` es una letra o un dígito. */
const isWordCharacter = (character) => character !== undefined && (character.toLowerCase() !== character.toUpperCase() || (character >= '0' && character <= '9'));

/** Where the sentence that continues at `from` ends in `text`. @es Dónde termina la frase que sigue en `from`. */
function sentenceEnd(text, from) {
  let inCode = false;

  for (let at = from; at < text.length; at += 1) {
    if (text[at] === '`') inCode = !inCode;
    else if (!inCode && TERMINATORS.includes(text[at]) && (at + 1 === text.length || AFTER_TERMINATOR.includes(text[at + 1]))) return at + 1;
  }

  return text.length;
}

/** Every RULE sentence of `text`, folded, in order. @es Cada frase RULE de `text`, plegada y en orden. */
export function ruleSentences(text) {
  const flat = folded(text);
  const sentences = [];

  for (let at = flat.indexOf(MARK); at !== -1; at = flat.indexOf(MARK, at + 1)) {
    if (isWordCharacter(flat[at - 1]) || !OPENERS.includes(flat[at + MARK.length])) continue;

    sentences.push(flat.slice(at, sentenceEnd(flat, at + MARK.length)));
  }

  return sentences;
}
