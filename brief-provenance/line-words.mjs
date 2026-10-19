/**
 * How a brief line splits into words for the dependency-claim face: a literal character scan over a
 * declared separator list (no regex, M5), and the sentence period a word may carry.
 *
 * @es Cómo se parte una línea de brief en palabras para la cara de dependencias: un recorrido literal
 * sobre una lista declarada de separadores (sin regex, M5), y el punto de frase que puede llevar una palabra.
 */

/** The words of `line`, split on any character of `separators`. @es Las palabras de `line`. */
export function words(line, separators) {
  const found = [];
  let current = '';

  for (const character of line) {
    if (separators.includes(character)) {
      if (current.length > 0) found.push(current);

      current = '';
    } else {
      current += character;
    }
  }

  if (current.length > 0) found.push(current);

  return found;
}

/** The word without the periods that end it. @es La palabra sin los puntos finales. */
export function trimPeriods(word) {
  let trimmed = word;

  while (trimmed.endsWith('.')) trimmed = trimmed.slice(0, -1);

  return trimmed;
}
