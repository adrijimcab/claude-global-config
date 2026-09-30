/**
 * Whether a line of a proposed rule file invents nothing: folded, it is either one slice of the folded
 * original, or a join of slices of at least `MIN_SLICE` characters and of the fixed labels a tiering may add.
 * The minimum stops a line being assembled word by word from text the original holds elsewhere.
 *
 * @es Si una línea de un fichero de reglas propuesto no inventa nada: plegada, es un trozo del original
 * plegado, o una unión de trozos de al menos `MIN_SLICE` caracteres y de las etiquetas fijas que un
 * escalonado puede añadir. El mínimo impide armar una línea palabra a palabra con texto que el original tiene
 * en otra parte.
 */

import { folded } from './instruction-text.mjs';

/** The shortest slice that may be joined to another. @es El trozo más corto que puede unirse a otro. */
export const MIN_SLICE = 12;

/** The only text a tiering may add of its own. @es El único texto propio que un escalonado puede añadir. */
export const LABELS = ['Evidence:', 'Mechanism:'];

/**
 * `undefined` when `line` invents nothing against `source` (already folded); otherwise the text from the first
 * point no join can reach. @es `undefined` si `line` no inventa nada frente a `source` (ya plegado); si no, el
 * texto desde el primer punto que ninguna unión alcanza.
 */
export function uncoveredText(line, source) {
  const target = folded(line);

  if (source.includes(target)) return undefined;

  const reached = new Array(target.length + 1).fill(false);

  reached[0] = true;

  for (let from = 0; from < target.length; from += 1) {
    if (!reached[from]) continue;

    for (const label of LABELS) if (target.startsWith(label, from)) reached[from + label.length] = true;

    let end = from;

    while (end < target.length && source.includes(target.slice(from, end + 1))) end += 1;

    for (let to = from + MIN_SLICE; to <= end; to += 1) reached[to] = true;
  }

  return reached[target.length] ? undefined : target.slice(reached.lastIndexOf(true));
}
