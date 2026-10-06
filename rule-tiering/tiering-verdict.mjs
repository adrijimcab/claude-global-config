/**
 * Whether a proposed "after" of a loaded rule file conserves its "before", as a list of deficits (empty when
 * conserved). Four decisions: every non-blank line removed is a whole line of some evidence file; every added
 * line invents nothing (`slice-join.mjs`, which admits a pointer to a file of the evidence set:
 * `evidence-pointer.mjs`); every RULE sentence of "before" is in "after" literally
 * (`rule-sentences.mjs`); every anchor at a line start in "before" is still at a line start in "after". Pure:
 * texts in, deficits out; the caller reads git and the disk, so the proof cannot be satisfied by the write it
 * checks.
 *
 * @es Si un "después" propuesto de un fichero de reglas cargado conserva su "antes", como lista de déficits
 * (vacía si se conserva). Cuatro decisiones: cada línea no vacía quitada es una línea entera de algún fichero
 * de evidencia; cada línea añadida no inventa nada (`slice-join.mjs`, que admite un puntero a un fichero del
 * conjunto de evidencia: `evidence-pointer.mjs`); cada frase RULE del "antes" está
 * literalmente en el "después"; cada ancla al inicio de línea en el "antes" sigue al inicio de línea en el
 * "después". Pura: el llamante lee git y el disco, así la prueba no puede satisfacerse con la escritura que
 * comprueba.
 */

import { holdsWholeLine } from '../failure-capture/conservation.mjs';

import { evidencePointerEnd } from './evidence-pointer.mjs';
import { folded, linesOf } from './instruction-text.mjs';
import { ruleSentences } from './rule-sentences.mjs';
import { uncoveredText } from './slice-join.mjs';

const deficit = (kind, line, english, spanish) => ({ kind, line, message: `${english}: ${line} @es ${spanish}: ${line}` });

/**
 * @param input `{ before, after, evidence, anchors }` — `evidence` is `[{ name, text, path }]` re-read from disk, `path` being the file's path from the repository when it is inside it.
 * @returns `[{ kind, line, message }]`, kind one of `unarchived`, `invented`, `rule-lost`, `anchor-lost`.
 * @es `evidence` es `[{ name, text }]` releído de disco. Devuelve los déficits con su tipo, línea y mensaje bilingüe.
 */
export function tieringVerdict({ before, after, evidence, anchors }) {
  const beforeLines = linesOf(before);
  const afterLines = linesOf(after);
  const archives = evidence.map(({ text }) => linesOf(text).join('\n'));
  const source = folded(before);
  const wholeLines = new Set(beforeLines.map(folded));
  const flatAfter = folded(after);
  const pointerEnd = evidencePointerEnd(evidence);
  const found = [];

  for (const line of beforeLines) {
    if (line.trim() === '' || afterLines.includes(line) || archives.some((archive) => holdsWholeLine(archive, line))) continue;

    found.push(deficit('unarchived', line, 'removed but not a whole line of any evidence file', 'quitada pero no es una línea entera de ningún fichero de evidencia'));
  }

  for (const line of afterLines) {
    if (line.trim() === '' || beforeLines.includes(line)) continue;

    const gap = uncoveredText(line, source, wholeLines, pointerEnd);

    if (gap !== undefined) found.push(deficit('invented', line, `holds text the original does not ("${gap}")`, `tiene texto que el original no tiene («${gap}»)`));
  }

  for (const sentence of ruleSentences(before)) {
    if (!flatAfter.includes(sentence)) found.push(deficit('rule-lost', sentence, 'RULE sentence no longer present literally', 'frase RULE que ya no está literalmente'));
  }

  for (const anchor of anchors) {
    if (beforeLines.some((line) => line.startsWith(anchor)) && !afterLines.some((line) => line.startsWith(anchor))) {
      found.push(deficit('anchor-lost', anchor, 'anchor no longer at the start of a line', 'ancla que ya no está al inicio de una línea'));
    }
  }

  return found;
}
