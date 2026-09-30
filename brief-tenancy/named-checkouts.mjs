/**
 * The CHECKOUT ROOTS a piece of prose names, by absolute path.
 *
 * WHY ABSOLUTE PATHS AND NOTHING ELSE. A brief names a place three ways: by absolute path, by repository
 * name (`plugin-eslint`), and by description (`the two PLUGIN repositories`). Only the first is a fact
 * about the filesystem; the other two are names whose referent lives in the reader's head, and resolving
 * them would mean guessing which of this machine's directories an author meant. Measured over 334 real
 * briefs and resumes: 18 distinct absolute paths, and the one incident this guard exists for named its
 * two repositories by absolute path in the same brief that carried the false claim about them. So the
 * narrow reading costs little and keeps every answer checkable.
 *
 * THE COST IS STATED RATHER THAN HIDDEN: a brief that names a repository only in words is invisible
 * here, and the guard allows it. That is this module's half of the residual gap recorded in
 * `decision.mjs`, and it is the fail-open direction chosen everywhere in this fleet.
 *
 * A TREE PATH IS FOLDED BACK ONTO ITS CHECKOUT. `…/b100-am-ui/node_modules` is by a wide margin the
 * most-named path in the corpus — 21 mentions, more than the other 17 distinct paths together, because
 * it is the junction instruction every standard brief carries — and tenancy is a question about a
 * CHECKOUT, never about the tree inside it. Asking `tenancyOf` about a
 * `node_modules` directory would ask whether it contains a `node_modules`, which is a different and
 * useless question — the same conflation of a tree with its owner that `tree-tenancy.mjs` records
 * having printed into a refusal once.
 *
 * NO REGEX (M5): a literal character scan. A pattern that fails to match SKIPS silently, and a path this
 * module fails to see is a hazard the guard cannot weigh.
 *
 * @es Las RAÍCES DE CHECKOUT que nombra una prosa, por ruta absoluta. Solo rutas absolutas: un brief
 * nombra un sitio por ruta, por nombre de repositorio o por descripción, y solo la primera es un hecho
 * del sistema de ficheros; resolver las otras sería adivinar qué carpeta quiso decir el autor. Medido
 * sobre 334 briefs y resumes reales: 18 rutas absolutas distintas, y el incidente que origina este guard
 * nombraba sus dos repositorios por ruta absoluta en el mismo brief que llevaba la afirmación falsa. EL
 * COSTE SE DICE: un brief que solo nombre el repositorio con palabras es invisible aquí y se permite.
 * Una ruta de árbol se pliega sobre su checkout, porque la tenencia es una pregunta sobre el CHECKOUT.
 * SIN REGEX (M5): un escaneo literal de caracteres.
 */

/** The drive letters an absolute Windows path can start with. @es Las letras de unidad posibles. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const BACKSLASH = String.fromCharCode(92);

/**
 * The characters that END a path in prose. Quotes, brackets and punctuation are here because a brief
 * writes a path inside a sentence — `` `C:/x/y`, `` — and carrying the comma into the path would make
 * every quoted path unresolvable and the guard silently blind.
 *
 * THE COLON IS ONE OF THEM, and that is safe rather than clever: the scan already starts two characters
 * past the drive letter, so a path's own `C:` is never offered to this test. It was measured missing —
 * `about C:/…/plugin-eslint:` kept the trailing colon, the directory resolved to nothing, and a brief
 * that named a junctioned checkout was allowed because of one punctuation mark.
 * @es Los caracteres que TERMINAN una ruta en prosa. EL DOS PUNTOS ES UNO, y es seguro: el escaneo
 * empieza dos caracteres después de la letra de unidad, así que el `C:` propio nunca llega a esta
 * prueba. Se midió su falta: un brief que nombraba un checkout con junction se permitía por un signo.
 */
const TERMINATORS = ` \t\r\n\`"'()[]{}<>|*,;:`;

/** The tree directory whose presence means the path names a tree rather than its owner. @es El árbol. */
const TREE = '/node_modules';

/** One spelling: forward slashes, no trailing punctuation. @es Una sola grafía. */
function tidy(raw) {
  let path = raw.split(BACKSLASH).join('/');

  while (path.endsWith('.') || path.endsWith('/')) path = path.slice(0, -1);

  const tree = path.toLowerCase().indexOf(TREE);

  return tree > 0 ? path.slice(0, tree) : path;
}

/**
 * Whether the drive letter at `index` starts a path rather than ending a word.
 *
 * The preceding character is what tells a drive letter from the last letter of a word: without that
 * test `abC:/x` yields the path `C:/x`, which nobody wrote.
 * @es Si la letra en `index` empieza una ruta o termina una palabra. El carácter anterior es lo que
 * distingue una letra de unidad de la última letra de una palabra.
 */
const startsPath = (text, index) =>
  LETTERS.includes(text.charAt(index)) &&
  text.charAt(index + 1) === ':' &&
  (text.charAt(index + 2) === '/' || text.charAt(index + 2) === BACKSLASH) &&
  !(index > 0 && LETTERS.includes(text.charAt(index - 1)));

/**
 * Every checkout root `text` names, distinct and in first-appearance order.
 *
 * @param text The brief, resume or message body, exactly as the tool received it.
 * @returns `['C:/Users/…/plugin-eslint']` — empty when the prose names no absolute path.
 * @es Cada raíz de checkout que nombra `text`, distinta y en orden de aparición.
 */
export function namedCheckouts(text) {
  const found = new Map();

  for (let index = 0; index + 2 < text.length; index += 1) {
    if (!startsPath(text, index)) continue;

    let end = index + 2;

    while (end < text.length && !TERMINATORS.includes(text.charAt(end))) end += 1;

    const path = tidy(text.slice(index, end));

    // `C:/` alone is a drive, not a checkout, and every checkout has at least one segment under it.
    if (path.length > 3 && !found.has(path.toLowerCase())) found.set(path.toLowerCase(), path);
  }

  return [...found.values()];
}
