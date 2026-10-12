/**
 * The text of one side of a contract: the files its declared paths name, read and concatenated.
 *
 * A path naming a file contributes that file; a path naming a directory contributes every `.md` file under it,
 * recursively (a rules directory whose files each apply to one area of the code). A path that
 * does not exist contributes nothing and is reported in `missing`: contract files are often gitignored, so they
 * exist only on a maintainer's machine, never in a linked worktree, CI or a fresh clone. A side with NO file
 * present is not a side that carries no anchors; it is a side that cannot be read, and the caller must not
 * treat the two alike.
 *
 * @es El texto de un lado de un contrato: los ficheros que nombran sus rutas declaradas, leídos y
 * concatenados. Una ruta a fichero aporta ese fichero; una ruta a directorio aporta cada `.md` bajo él,
 * recursivo. Una ruta inexistente no aporta nada y se informa en `missing`: los ficheros de
 * contrato suelen estar en gitignore y solo existen en la máquina de quien mantiene. Un lado SIN ningún
 * fichero no es un lado que no lleva anchors: es un lado que no se puede leer, y el llamante no debe tratarlos igual.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MARKDOWN_SUFFIX = '.md';

/** The `.md` files under `directory`, recursively, as paths relative to it. @es Los `.md` bajo `directory`, recursivos. */
function markdownUnder(directory) {
  return readdirSync(directory, { recursive: true })
    .filter((name) => name.endsWith(MARKDOWN_SUFFIX) && statSync(path.join(directory, name)).isFile());
}

/**
 * `{ present, text, missing }`: `present` is how many files were read, `text` their concatenation, `missing`
 * the declared paths that do not exist.
 * @es `present` es cuántos ficheros se leyeron, `text` su concatenación y `missing` las rutas declaradas que no existen.
 * @param {string} root the project root / la raíz del proyecto
 * @param {string[]} declaredPaths
 */
export function contractText(root, declaredPaths) {
  const texts = [];
  const missing = [];

  for (const declared of declaredPaths) {
    const target = path.join(root, declared);
    let stats;

    try {
      stats = statSync(target);
    } catch {
      missing.push(declared);
      continue;
    }

    if (stats.isDirectory()) texts.push(...markdownUnder(target).map((name) => readFileSync(path.join(target, name), 'utf8')));
    else texts.push(readFileSync(target, 'utf8'));
  }

  return { present: texts.length, text: texts.join('\n'), missing };
}
