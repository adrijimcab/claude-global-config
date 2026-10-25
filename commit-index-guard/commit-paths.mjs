/**
 * What a `git commit` invocation names and how it reads the index: the paths of its pathspec, whether it
 * sweeps the whole index (`--include`, or no pathspec at all) and whether it first re-stages every tracked
 * path (`--all`). The words are those of `gitInvocations()` after `commit`.
 *
 * WHY THIS READS git's OWN OPTION TABLE. A word after `commit` is a path only when no option consumed it:
 * `-m "msg"`, `-F file`, `-C <commit>`, `--author <a>` and the cluster `-am "msg"` all carry a separate value
 * that would otherwise be mistaken for a pathspec. Every option that takes a value is listed once below, so a
 * value is never a path and a path is never skipped.
 *
 * NOT MODELLED, stated: `--pathspec-from-file` (the paths live in a file the line does not show; it is
 * reported through `fromFile` so the caller can say it did not look) and abbreviated no-value long options
 * (they are flags either way, so reading them as flags is right).
 *
 * @es Qué nombra una invocación de `git commit` y cómo lee el índice: las rutas de su pathspec, si arrastra
 * TODO el índice (`--include`, o ningún pathspec) y si antes vuelve a poner en stage cada ruta rastreada
 * (`--all`). Se lee la tabla de opciones propia de git: una palabra tras `commit` es una ruta solo si ninguna
 * opción la consumió (`-m "msg"`, `-F fichero`, `-C <commit>`, `--author <a>` y el cúmulo `-am "msg"`).
 * NO se modela `--pathspec-from-file` (las rutas viven en un fichero que la línea no muestra; se informa en
 * `fromFile`) ni las opciones largas abreviadas sin valor (son banderas de cualquier modo).
 */

/** Short options whose value is the rest of the cluster or the next word. @es Opciones cortas con valor: el resto del cúmulo o la palabra siguiente. */
const SHORT_WITH_VALUE = new Set(['m', 'F', 'c', 'C', 't']);

/** Short options whose value, when there is one, is ONLY the rest of the cluster. @es Opciones cortas cuyo valor opcional es solo el resto del cúmulo. */
const SHORT_WITH_OPTIONAL_VALUE = new Set(['S', 'u']);

/** Long options that take a value in the next word (`--name=value` carries it already). @es Opciones largas con valor en la palabra siguiente. */
const LONG_WITH_VALUE = Object.freeze(['--message', '--file', '--reedit-message', '--reuse-message', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer', '--unified', '--inter-hunk-context']);

const SEPARATOR = '--';

/**
 * Whether a long option, written in full or abbreviated, takes its value from the next word. `--name=value`
 * is never a prefix of a name, so a fused value is never mistaken for one.
 * @es Si una opción larga, completa o abreviada, toma su valor de la palabra siguiente. `--nombre=valor` nunca es prefijo de un nombre.
 */
function longTakesNextWord(word) {
  return LONG_WITH_VALUE.some((name) => name.startsWith(word));
}

/** How many words beyond itself a short cluster consumes: 1 when its last letter takes the next word, else 0. @es Cuántas palabras más consume un cúmulo corto. */
function clusterConsumesNextWord(cluster) {
  for (let index = 1; index < cluster.length; index += 1) {
    const letter = cluster[index];

    if (SHORT_WITH_VALUE.has(letter)) return index === cluster.length - 1 ? 1 : 0;
    if (SHORT_WITH_OPTIONAL_VALUE.has(letter)) return 0;
  }

  return 0;
}

/** Whether a short cluster (`-am`, `-i`) holds the flag `letter` before any option that takes a value. @es Si un cúmulo corto lleva la bandera `letter` antes de cualquier opción con valor. */
function clusterHas(cluster, letter) {
  for (let index = 1; index < cluster.length; index += 1) {
    if (cluster[index] === letter) return true;
    if (SHORT_WITH_VALUE.has(cluster[index]) || SHORT_WITH_OPTIONAL_VALUE.has(cluster[index])) return false;
  }

  return false;
}

/**
 * Reads the words after `git commit`.
 *
 * @param args The words after `commit`, as `gitInvocations()` gives them.
 * @returns `{ paths, all, include, dryRun, fromFile }`.
 * @es Lee las palabras tras `git commit`: `{ paths, all, include, dryRun, fromFile }`.
 */
export function readCommit(args) {
  const read = { paths: [], all: false, include: false, dryRun: false, fromFile: false };
  let afterSeparator = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (afterSeparator || !word.startsWith('-') || word === '-') {
      read.paths.push(word);
      continue;
    }

    if (word === SEPARATOR) {
      afterSeparator = true;
      continue;
    }

    if (word.startsWith('--')) {
      if (word === '--all') read.all = true;
      if (word === '--include') read.include = true;
      if (word === '--dry-run') read.dryRun = true;
      if (word === '--no-dry-run') read.dryRun = false;
      if (word.startsWith('--pathspec-from-file')) read.fromFile = true;
      if (longTakesNextWord(word)) index += 1;
      continue;
    }

    if (clusterHas(word, 'a')) read.all = true;
    if (clusterHas(word, 'i')) read.include = true;

    index += clusterConsumesNextWord(word);
  }

  return read;
}
