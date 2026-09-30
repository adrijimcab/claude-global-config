/**
 * How the tiering check reads instruction text: its lines, with CRLF and a lone CR read as LF, and its
 * whitespace-folded form, in which a sentence wrapped over several lines reads as one. NO REGEX, as in the
 * rest of this tooling.
 *
 * @es Cómo lee el texto de instrucciones la comprobación de escalonado: sus líneas, con CRLF y un CR suelto
 * leídos como LF, y su forma plegada, en la que una frase partida en varias líneas se lee como una. SIN REGEX,
 * como el resto de este tooling.
 */

/** The lines of `text`. @es Las líneas de `text`. */
export const linesOf = (text) => text.split('\r\n').join('\n').split('\r').join('\n').split('\n');

/** `text` with every run of whitespace as one space, trimmed. @es `text` con cada racha de blancos como un espacio, recortado. */
export function folded(text) {
  let result = '';
  let pendingSpace = false;

  for (const character of text) {
    if (character.trim() === '') {
      pendingSpace = result.length > 0;
      continue;
    }

    result += pendingSpace ? ` ${character}` : character;
    pendingSpace = false;
  }

  return result;
}
