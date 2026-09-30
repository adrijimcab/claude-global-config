/**
 * The single definition of "this title is not usable", shared by the census/backfill and the guard.
 *
 * It lives in its own module ON PURPOSE. The defect being closed is that history and intake were
 * repaired by two different pieces of reasoning a day apart; if the backfill and the guard each
 * carried their own idea of blankness they could disagree, and the guard would then admit exactly the
 * rows the backfill is still cleaning up. One predicate, two callers.
 *
 * M5: no regex. Whitespace is an explicit set. A regex character class that fails to match SKIPS
 * silently, and a check that silently skips is the failure mode this whole task is about.
 *
 * @es Definición única de «este título no sirve», compartida por el censo/backfill y por el guard.
 * Vive en su propio módulo a propósito: si cada uno llevara su propia idea de vacuidad podrían
 * discrepar, y el guard admitiría justo las filas que el backfill limpia. Sin regex (M5).
 */

/**
 * Characters that carry no meaning as a title, declared BY CODEPOINT rather than as literals.
 *
 * The reason is practical and was hit while writing this file. Four of these characters are
 * invisible, and every route that puts them into a source file — an editor, a shell, this harness —
 * may render an escape into the raw character or eat a backslash. A maintainer then reads a line
 * containing four blanks and cannot tell a present entry from a lost one, nor NBSP from a space.
 * A codepoint is the one form that survives every such route and still says what it is.
 *
 * NBSP (U+00A0) is the entry that matters in practice: a copy-paste out of a document or a chat
 * inserts it silently, and a title made of one looks completely normal in every UI that shows it.
 *
 * @es Caracteres sin significado como título, declarados POR CODEPOINT y no como literales. Cuatro
 * son invisibles, y cualquier ruta que los meta en un fuente puede convertir un escape en el
 * carácter crudo o comerse una barra invertida; entonces el mantenedor ve cuatro huecos y no
 * distingue una entrada presente de una perdida. El codepoint sobrevive a todas esas rutas. NBSP
 * (U+00A0) es el que importa en la práctica: un copiar-pegar lo inserta en silencio.
 */
export const WHITESPACE_CODEPOINTS = Object.freeze([
  0x0020, // SPACE
  0x0009, // TAB
  0x000a, // LINE FEED
  0x000d, // CARRIAGE RETURN
  0x000b, // LINE TABULATION
  0x000c, // FORM FEED
  0x00a0, // NO-BREAK SPACE — inserted silently by copy-paste, looks identical to a space
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
  0xfeff // ZERO WIDTH NO-BREAK SPACE / BOM
]);

/**
 * Structurally blank: absent, or containing no character that is not whitespace.
 *
 * THE NEAR MISS IS THE POINT. `''` is the obvious case and it is not the interesting one. A title of
 * `'   '` satisfies the column's `NOT NULL`, satisfies a `required: ["title"]` schema, satisfies any
 * presence check — and is exactly as useless to a reader as the empty string. A check that only
 * looked for absence would pass it, which is how a guard ends up unable to go red.
 *
 * Iteration is `for…of`, which walks CODE POINTS rather than UTF-16 units, so an astral character
 * counts once and is correctly treated as non-blank.
 *
 * A non-string is reported separately by the guard rather than here, because "you sent a number"
 * needs a different sentence than "you sent spaces".
 *
 * @es Estructuralmente vacío: ausente, o sin ningún carácter que no sea espacio. EL CASI-ACIERTO ES
 * EL PUNTO: `'   '` cumple `NOT NULL`, cumple `required` y cumple cualquier comprobación de
 * presencia, y es tan inútil como `''`. Se itera con `for…of` (puntos de código, no unidades UTF-16).
 */
export function isBlankTitle(value) {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  for (const character of value) {
    if (!WHITESPACE_CODEPOINTS.includes(character.codePointAt(0))) return false;
  }
  return true;
}
