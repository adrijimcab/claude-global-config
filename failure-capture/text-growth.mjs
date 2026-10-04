/**
 * The mechanism of `promotion-to-contract-read-as-prevention`: a promoted rule prevents only the FACES its
 * text names, so when a lesson recurs after it was closed, the text that failed to prevent it must have
 * GROWN before the lesson is closed again. Growth is measured in faces (`faces.mjs`), never in key
 * occurrences, and in EVERY file the promotion lands in, each against its own baseline (`baselineFor`):
 * a new face in one contract file does not excuse a runtime whose file never received it.
 *
 * Only a recurrence recorded AFTER the last closure demands growth, so a first promotion, and re-closing an
 * old promotion with a mechanism, stay free. Whether the new text is GOOD is not decidable here and is not
 * claimed; what is decidable is that someone wrote a face.
 *
 * @es El mecanismo de `promotion-to-contract-read-as-prevention`: una regla promovida solo previene las
 * CARAS que su texto nombra, así que cuando una lección reincide tras cerrarse, el texto que no la previno
 * debe haber CRECIDO antes de volver a cerrarla. El crecimiento se mide en caras, nunca en apariciones de
 * la clave, y en CADA fichero donde aterriza la promoción, cada uno contra su propia línea base: una cara
 * nueva en un contrato no excusa a un runtime cuyo fichero nunca la recibió. Solo una reincidencia posterior
 * al último cierre exige crecimiento. Que el texto nuevo sea BUENO no es decidible aquí y no se afirma.
 */

import { baselineFor, contractFileId } from './closure.mjs';
import { countFaces } from './faces.mjs';

/**
 * The faces each of `files` names for `key`, keyed by the file's id (`contractFileId`) — what a closure
 * records as its measurement.
 * @param input `{ files, key, read }` — `read(file)` gives a file's text, empty when absent.
 * @es Las caras que cada fichero de `files` nombra para `key`, por id de fichero: lo que un cierre registra como medición.
 */
export const facesByFile = ({ files, key, read }) => Object.fromEntries(files.map((file) => [contractFileId(file), countFaces(read(file), key)]));

/**
 * The files whose text has NOT grown since the last closure although the lesson recurred since.
 * @param input `{ entries, files, key, read }` — `entries` are every incident and closure record of `key`.
 * @returns `[{ file, now, then, date }]`, empty when nothing is stale.
 * @es Los ficheros cuyo texto NO ha crecido desde el último cierre aunque la lección reincidió desde entonces.
 */
export function staleFiles({ entries, files, key, read }) {
  const closures = entries.filter((entry) => entry.kind === 'promotion');
  const stale = [];

  for (const file of files) {
    const last = baselineFor(closures, file);

    if (last === undefined) continue;

    const recurred = entries.some((entry) => entry.kind !== 'promotion' && typeof entry.at === 'string' && entry.at > last.at);
    const then = last.faces[contractFileId(file)];
    const now = countFaces(read(file), key);

    if (recurred && now <= then) stale.push({ file, now, then, date: last.date });
  }

  return stale;
}
