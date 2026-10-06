/**
 * Whether a line of a proposed rule file invents nothing: folded, it is either a whole line of the original,
 * or a join of slices of the folded original of at least `MIN_SLICE` characters each, of the fixed labels a
 * tiering may add and of a pointer to a file of the evidence set (`evidence-pointer.mjs`). The minimum stops a line being assembled word by word from text the original holds
 * elsewhere, and it binds a single slice too: a short word lifted out of a sentence ("never") is not a line.
 *
 * @es Si una línea de un fichero de reglas propuesto no inventa nada: plegada, es una línea entera del
 * original, o una unión de trozos del original plegado de al menos `MIN_SLICE` caracteres cada uno, de las
 * etiquetas fijas que un escalonado puede añadir y de un puntero a un fichero del conjunto de evidencia
 * (`evidence-pointer.mjs`). El mínimo impide armar una línea palabra a palabra con texto
 * que el original tiene en otra parte, y vale también para un único trozo: una palabra corta sacada de una
 * frase («never») no es una línea.
 */

import { folded } from './instruction-text.mjs';

/** The shortest slice that may be joined to another. @es El trozo más corto que puede unirse a otro. */
export const MIN_SLICE = 12;

/** The only text a tiering may add of its own. @es El único texto propio que un escalonado puede añadir. */
export const LABELS = ['Evidence:', 'Mechanism:'];

/**
 * `undefined` when `line` invents nothing against `source` (already folded) and `wholeLines` (the folded lines
 * of the original); otherwise the text from the first point no join can reach. `pointerEnd(text, from)` is
 * where a pointer to the evidence that starts at `from` ends, if one does (`evidencePointerEnd`).
 * @es `undefined` si `line` no inventa nada frente a `source` (ya plegado) y `wholeLines` (las líneas plegadas
 * del original); si no, el texto desde el primer punto que ninguna unión alcanza. `pointerEnd(text, from)` es
 * dónde acaba un puntero a la evidencia que empieza en `from`, si lo hay (`evidencePointerEnd`).
 */
export function uncoveredText(line, source, wholeLines, pointerEnd = () => undefined) {
  const target = folded(line);

  if (wholeLines.has(target)) return undefined;

  const reached = new Array(target.length + 1).fill(false);

  reached[0] = true;

  for (let from = 0; from < target.length; from += 1) {
    if (!reached[from]) continue;

    for (const label of LABELS) if (target.startsWith(label, from)) reached[from + label.length] = true;

    const pointer = pointerEnd(target, from);

    if (pointer !== undefined) reached[pointer] = true;

    let end = from;

    while (end < target.length && source.includes(target.slice(from, end + 1))) end += 1;

    for (let to = from + MIN_SLICE; to <= end; to += 1) reached[to] = true;
  }

  return reached[target.length] ? undefined : target.slice(reached.lastIndexOf(true));
}
