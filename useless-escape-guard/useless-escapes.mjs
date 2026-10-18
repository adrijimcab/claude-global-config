/**
 * Finds the useless escapes of a JavaScript source: a backslash inside a string or template literal followed
 * by a character that is not a JavaScript escape. The language drops such a backslash silently, so a text
 * the script was meant to write (a regex source such as the escaped slash or `s` class) loses it. ESLint
 * names this `no-useless-escape`.
 *
 * The valid escapes are n r t b f v, the digits, x, u, both quotes, the backslash, the backtick, `$`, `{`
 * and a line break. A tagged template (`String.raw` and the like) keeps the raw text, so it is not judged.
 * Only literals are judged: text built from single characters or read from another file is out of reach.
 *
 * @es Encuentra los escapes inútiles de un fuente JavaScript: una barra invertida dentro de una cadena o
 * plantilla seguida de un carácter que no es un escape de JavaScript. El lenguaje la descarta en silencio,
 * así que el texto que el script debía escribir pierde la barra. Las plantillas con etiqueta conservan el
 * texto crudo y no se juzgan. Solo se juzgan literales.
 */

import { literalSegments } from './lexer.mjs';

const BS = String.fromCharCode(92);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** Characters that make `backslash + character` a real escape. @es Caracteres que hacen válido el escape. */
const VALID_ESCAPE_CHARACTERS = new Set(['n', 'r', 't', 'b', 'f', 'v', 'x', 'u', "'", '"', BS, '`', '$', '{', '\n', '\r', LINE_SEPARATOR, PARAGRAPH_SEPARATOR, ...'0123456789']);

/**
 * @param {string} source
 * @returns {{ line: number, escape: string }[]} In source order; `escape` is the backslash plus its character.
 */
export function findUselessEscapes(source) {
  const findings = [];

  for (const segment of literalSegments(source)) {
    if (segment.tagged) continue;

    for (let at = segment.text.indexOf(BS); at !== -1; at = segment.text.indexOf(BS, at + 2)) {
      const character = String.fromCodePoint(segment.text.codePointAt(at + 1) ?? 10);

      if (VALID_ESCAPE_CHARACTERS.has(character)) continue;

      findings.push({ line: segment.line + segment.text.slice(0, at).split('\n').length - 1, escape: BS + character });
    }
  }

  return findings;
}
