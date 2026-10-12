/**
 * JSON text in the exact form gentle-ai writes `settings.json`: two-space indent and the characters Go's JSON encoder
 * escapes in strings (`<`, `>`, `&`, U+2028, U+2029) written as `\uXXXX`. Measured 2026-10-12: the live `settings.json`
 * round-trips byte for byte through this form, and not through a plain `JSON.stringify`, which leaves `&` as it is.
 * A rewrite of the file in this form changes only what the caller changed, not the escapes of the rest of the file.
 *
 * @es Texto JSON en la forma exacta en que gentle-ai escribe `settings.json`: sangría de dos espacios y los
 * caracteres que el codificador JSON de Go escapa en cadenas (`<`, `>`, `&`, U+2028, U+2029) escritos como `\uXXXX`.
 * Medido el 2026-10-12: el `settings.json` vivo se reproduce byte a byte con esta forma, y no con un
 * `JSON.stringify` simple, que deja `&` tal cual. Reescribir el fichero así cambia solo lo que cambió quien llama.
 */

/** Characters Go's JSON encoder escapes inside strings; none of them occurs outside a string in valid JSON. @es Caracteres que el codificador de Go escapa en cadenas. */
const GO_ESCAPED = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/** The `\uXXXX` escape of one character. @es El escape `\uXXXX` de un carácter. */
const escapeOf = (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;

/** `value` as Go-form JSON text with `eol` line endings and, when `trailingNewline`, one final line ending. @es `value` como texto JSON en la forma de Go. */
export function goJsonText(value, { eol = '\n', trailingNewline = true } = {}) {
  const text = JSON.stringify(value, null, 2).replace(GO_ESCAPED, escapeOf).split('\n').join(eol);

  return trailingNewline ? `${text}${eol}` : text;
}
