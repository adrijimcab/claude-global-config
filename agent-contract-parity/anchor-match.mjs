/**
 * Whether a contract text CARRIES an anchor, matched on token boundaries.
 *
 * WHY NOT `String.includes`. The first parity engine (b100-am-ui) used `includes`, so the anchor `M1` was
 * "carried" by any text that held `M10`: delete the M1 rule, keep M10, and the gate stayed green. The anchor
 * is a TOKEN, so it is carried only when the character before it and the character after it are not part of
 * a token. A boundary is only demanded on a side where the anchor itself ends in a token character: an anchor
 * that opens with `@` or `-` (`@HostListener`, `--no-verify`) is already delimited on that side by its own
 * first character. A hyphen, a dot, a colon, a bracket and a space are not token characters, so `M1-M8`,
 * `(M1)` and `M1.` all carry `M1`.
 *
 * Three answers, not two, because the third one is the explanation: `token` (carried), `embedded` (the text
 * holds the anchor only inside a longer token, the `M10` near miss) and `absent`.
 *
 * NO REGEX (M5): a pattern that stops matching reads as "absent" and says nothing.
 *
 * @es Si un texto de contrato LLEVA un anchor, casado en fronteras de token. POR QUÉ NO `String.includes`: el
 * primer motor (b100-am-ui) usaba `includes`, y el anchor `M1` quedaba "llevado" por cualquier texto con
 * `M10`: se borraba la regla M1, se dejaba M10 y el gate seguía en verde. El anchor es un TOKEN: solo se lleva
 * cuando el carácter anterior y el posterior no son de token. La frontera se exige solo en el lado donde el
 * propio anchor termina en carácter de token (`@HostListener` y `--no-verify` ya se delimitan solos a la
 * izquierda). Guion, punto, dos puntos, paréntesis y espacio no son de token: `M1-M8`, `(M1)` y `M1.` llevan
 * `M1`. Tres respuestas: `token`, `embedded` (solo dentro de un token más largo: el casi-acierto `M10`) y
 * `absent`. SIN REGEX (M5).
 */

/** The characters a token is made of. @es Los caracteres de que se compone un token. */
const TOKEN_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';

const isTokenCharacter = (character) => character !== undefined && character !== '' && TOKEN_CHARACTERS.includes(character);

/**
 * `token` when `text` carries `anchor` as a whole token somewhere, `embedded` when it holds the anchor only
 * inside longer tokens, `absent` when it does not hold it at all.
 * @es `token`, `embedded` o `absent`, según `text` lleve el anchor entero, solo dentro de otros tokens, o no.
 * @param {string} text
 * @param {string} anchor a non-empty string / una cadena no vacía
 * @returns {'token' | 'embedded' | 'absent'}
 */
export function anchorPresence(text, anchor) {
  const needsLeftBoundary = isTokenCharacter(anchor.charAt(0));
  const needsRightBoundary = isTokenCharacter(anchor.charAt(anchor.length - 1));
  let found = false;

  for (let at = text.indexOf(anchor); at !== -1; at = text.indexOf(anchor, at + 1)) {
    found = true;

    const leftOpen = !needsLeftBoundary || !isTokenCharacter(text.charAt(at - 1));
    const rightOpen = !needsRightBoundary || !isTokenCharacter(text.charAt(at + anchor.length));

    if (leftOpen && rightOpen) return 'token';
  }

  return found ? 'embedded' : 'absent';
}
