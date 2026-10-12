/**
 * How the shared-resource guard compares a word of a shell line with a path a declaration names: one
 * spelling of "the same file", so the start recogniser and the stop-by-name recogniser cannot disagree.
 *
 * A word is the same file as a declared path when, after turning every `\` into `/`, dropping leading `./`
 * and (on Windows, where the filesystem ignores case) lower-casing, it equals the path or ends with it at a
 * SEGMENT boundary: `C:/app/bin/www` and `./bin/www` match `bin/www`; `mybin/www` does not.
 *
 * @es Cómo compara el guard de recursos compartidos una palabra de una línea de shell con una ruta que
 * nombra una declaración: una sola grafía de «el mismo fichero». Tras pasar `\` a `/`, quitar `./` inicial y
 * (en Windows, que ignora mayúsculas) pasar a minúsculas, coincide si es igual a la ruta o termina en ella en
 * el límite de un SEGMENTO: `C:/app/bin/www` y `./bin/www` coinciden con `bin/www`; `mybin/www` no.
 */

/** Whether a word names a path rather than a bare name. @es Si una palabra nombra una ruta y no un nombre simple. */
export function isPathLike(word) {
  return word.includes('/') || word.includes('\\');
}

/** The comparable spelling of a path word. @es La grafía comparable de una ruta. */
export function normalizedPath(word, platform = process.platform) {
  let spelled = word.split('\\').join('/');

  while (spelled.startsWith('./')) spelled = spelled.slice(2);

  return platform === 'win32' ? spelled.toLowerCase() : spelled;
}

/** Whether `word` is `declared`, or ends with it at a segment boundary. @es Si `word` es `declared` o termina en ella en un límite de segmento. */
export function endsAtSegment(word, declared, platform = process.platform) {
  const spelled = normalizedPath(word, platform);
  const wanted = normalizedPath(declared, platform);

  return spelled === wanted || spelled.endsWith(`/${wanted}`);
}
