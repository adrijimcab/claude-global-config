/**
 * Where text that points to the evidence is told from text that invents: the two pointers a tiering may
 * write, each admitted only when the file it names is in the evidence set the check was given.
 *   - the pointer failure-capture writes on a ledger line, `Evidence: lessons/evidence/<key>.md`, read by
 *     `pointerAt` (`failure-capture/ledger-line.mjs`, the one reader of that shape, so this check cannot
 *     drift from the tool that writes it) and naming the evidence file `<key>.md`;
 *   - `Evidence: <path>`, the path from the repository of a file of the evidence set, which is how a section
 *     moved out to a rules file says where it went.
 * Pure: a function from the evidence set to a reader of text; nothing here touches a file.
 *
 * @es Dónde se distingue el texto que apunta a la evidencia del que inventa: los dos punteros que un
 * escalonado puede escribir, cada uno admitido solo si el fichero que nombra está en el conjunto de evidencia
 * que se dio a la comprobación. El que escribe failure-capture en una línea de ledger, leído por `pointerAt`
 * (el único lector de esa forma, así esta comprobación no puede divergir de la herramienta que la escribe), y
 * `Evidence: <ruta>`, la ruta desde el repositorio de un fichero de la evidencia, que es como una sección
 * movida a un fichero de reglas dice adónde fue. Pura: nada aquí toca un fichero.
 */

import { evidenceNameOf, pointerAt } from '../failure-capture/ledger-line.mjs';

const LABEL = 'Evidence: ';

/**
 * @param evidence `[{ name, path }]` — `name` the file's name, `path` its path from the repository when it is inside it.
 * @returns `(text, from) => end | undefined`: the index just past an evidence pointer that starts at `from` in
 *   `text` (folded), or `undefined` when none does.
 * @es `path` es la ruta del fichero desde el repositorio cuando está dentro. Devuelve el índice justo tras un puntero a la evidencia que empieza en `from`, o `undefined`.
 */
export function evidencePointerEnd(evidence) {
  const names = new Set(evidence.map(({ name }) => name));
  const paths = evidence.flatMap(({ path }) => (path === undefined ? [] : [path]));

  return (text, from) => {
    const pointer = pointerAt(text, from);

    if (pointer !== undefined && names.has(evidenceNameOf(pointer.key))) return pointer.end;

    const named = paths.find((path) => text.startsWith(`${LABEL}${path}`, from));

    return named === undefined ? undefined : from + LABEL.length + named.length;
  };
}
