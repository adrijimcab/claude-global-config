/**
 * THE AUTHOR'S OWN WORDS — a message with everything that is quoted, fenced or code removed.
 *
 * Owns one question: which characters of a final message does the author ASSERT, as against name, quote
 * or show? Fenced blocks, inline code spans, `>` quote lines, «…» and “…” and "…" quotations are
 * mentions, never announcements. An opener with no closer is kept as plain text: failing toward
 * "visible" can only over-flag, and the dismiss path is the bound for that.
 * No regex (owner mandate M5): a character walk.
 *
 * @es LAS PALABRAS PROPIAS DEL AUTOR — el mensaje sin lo citado, vallado o en código. Responde una sola
 * pregunta: ¿qué caracteres AFIRMA el autor, frente a los que nombra, cita o muestra? Un delimitador sin
 * cierre se conserva como texto: fallar hacia «visible» solo puede sobre-marcar. Sin regex (M5).
 */

/** Opening delimiter -> closing delimiter. @es Delimitador de apertura -> cierre. */
const PAIRS = Object.freeze({ '```': '```', '`': '`', '«': '»', '“': '”', '"': '"' });

/** The opener at `index`, longest first, or `undefined`. @es El delimitador de apertura en `index`, o `undefined`. */
function openerAt(text, index) {
  return text.startsWith('```', index) ? '```' : Object.keys(PAIRS).find((opener) => text[index] === opener);
}

/** `message` without quoted lines, fences, code spans and quotations. @es `message` sin líneas citadas, vallas, código ni citas. */
export function proseOutsideQuotes(message) {
  const text = message.split('\n').map((line) => (line.trimStart().startsWith('>') ? '' : line)).join('\n');
  let prose = '';

  for (let index = 0; index < text.length; ) {
    const opener = openerAt(text, index);
    const closeAt = opener === undefined ? -1 : text.indexOf(PAIRS[opener], index + opener.length);

    if (closeAt === -1) {
      prose += text[index];
      index += 1;
    } else {
      prose += ' ';
      index = closeAt + PAIRS[opener].length;
    }
  }

  return prose;
}
