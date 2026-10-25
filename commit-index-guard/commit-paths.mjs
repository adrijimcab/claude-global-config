/**
 * What a `git commit` invocation names and how it reads the index: the paths of its pathspec, whether it
 * sweeps the whole index (`--include`, or no pathspec at all), whether it commits only what it names (`-o`,
 * `--only`, `--pathspec-from-file`), and whether it first re-stages every tracked path (`--all`). The words are
 * those of `gitInvocations()` after `commit`.
 *
 * WHY THIS READS git's OWN OPTION TABLE. A word after `commit` is a path only when no option consumed it:
 * `-m "msg"`, `-F file`, `-C <commit>`, `-U 3`, `--author <a>` and the cluster `-am "msg"` all carry a separate
 * value that would otherwise be mistaken for a pathspec. The long options below are the ones `git commit -h`
 * prints (git 2.54, measured 2026-10-25), each with whether it takes a value, and the `--no-` form of the
 * switches. `--unified` and `--inter-hunk-context` are real `git commit` options (they require `-p`) that take
 * a value, so they stay in the table.
 *
 * ABBREVIATIONS follow git's rule: an exact name wins, otherwise a prefix that names exactly one option is that
 * option (`--incl` is `--include`, `--mess` is `--message`), and a prefix that names several (`--al`) is
 * ambiguous: git refuses it, so it is read as a plain flag that consumes nothing.
 *
 * NOT MODELLED, stated: a `--pathspec-from-file` of standard input (`-`) is reported by the reader of the file,
 * not here; `-S`/`-u` take only an attached value; git aliases are configuration the line does not show.
 *
 * @es Qué nombra una invocación de `git commit` y cómo lee el índice: las rutas de su pathspec, si arrastra
 * TODO el índice (`--include`, o ningún pathspec), si commitea solo lo que nombra (`-o`, `--only`,
 * `--pathspec-from-file`) y si antes vuelve a poner en stage cada ruta rastreada (`--all`). Se lee la tabla de
 * opciones propia de git: una palabra tras `commit` es una ruta solo si ninguna opción la consumió. Las opciones
 * largas son las que imprime `git commit -h` (git 2.54, medido el 2026-10-25), cada una con si toma valor, y la
 * forma `--no-` de los interruptores. `--unified` e `--inter-hunk-context` son opciones reales de `git commit`
 * (exigen `-p`) con valor, así que se quedan. Las ABREVIATURAS siguen la regla de git: gana el nombre exacto, si
 * no, un prefijo que nombra una sola opción es esa opción, y uno que nombra varias (`--al`) es ambiguo: git lo
 * rechaza, así que se lee como bandera simple que no consume nada.
 */

/** Short options whose value is the rest of the cluster or the next word. @es Opciones cortas con valor: el resto del cúmulo o la palabra siguiente. */
const SHORT_WITH_VALUE = new Set(['m', 'F', 'c', 'C', 't', 'U']);

/** Short options whose value, when there is one, is ONLY the rest of the cluster. @es Opciones cortas cuyo valor opcional es solo el resto del cúmulo. */
const SHORT_WITH_OPTIONAL_VALUE = new Set(['S', 'u']);

/** Long options that take a value (`--name value` or `--name=value`). @es Opciones largas con valor. */
const LONG_WITH_VALUE = Object.freeze(['file', 'author', 'date', 'message', 'reedit-message', 'reuse-message', 'fixup', 'squash', 'trailer', 'template', 'cleanup', 'unified', 'inter-hunk-context', 'pathspec-from-file']);

/** Long options that take no value, optional `=value` aside. @es Opciones largas sin valor. */
const LONG_FLAGS = Object.freeze(['quiet', 'verbose', 'reset-author', 'signoff', 'edit', 'status', 'gpg-sign', 'all', 'include', 'interactive', 'patch', 'only', 'verify', 'dry-run', 'short', 'branch', 'ahead-behind', 'porcelain', 'long', 'null', 'amend', 'allow-empty', 'allow-empty-message', 'post-rewrite', 'untracked-files', 'pathspec-file-nul']);

/** Every long option name git accepts: the options, and the `no-` form of each. @es Cada nombre de opción larga que acepta git. */
const LONG_NAMES = Object.freeze([...LONG_WITH_VALUE, ...LONG_FLAGS, ...LONG_WITH_VALUE.map((name) => `no-${name}`), ...LONG_FLAGS.map((name) => `no-${name}`)]);

const SEPARATOR = '--';

/**
 * The option a long word names, by git's rule: the exact name, else the only name that starts with it.
 * @returns the name, or `undefined` when the word is unknown or ambiguous.
 * @es La opción que nombra una palabra larga según la regla de git: el nombre exacto, o el único que empieza así.
 */
export function resolveLong(name) {
  if (LONG_NAMES.includes(name)) return name;

  const candidates = LONG_NAMES.filter((candidate) => candidate.startsWith(name));

  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Applies a resolved switch to the reading; the last one on the line wins, as in git. @es Aplica un interruptor resuelto; gana el último de la línea. */
function applySwitch(read, name) {
  const on = !name.startsWith('no-');
  const positive = on ? name : name.slice('no-'.length);

  if (positive === 'all') read.all = on;
  if (positive === 'include') read.include = on;
  if (positive === 'only') read.only = on;
  if (positive === 'dry-run') read.dryRun = on;
  if (positive === 'pathspec-file-nul') read.pathspecNul = on;
}

/** Reads one long word and returns how many words after it it consumed. @es Lee una palabra larga y devuelve cuántas palabras más consumió. */
function readLong(read, words, index) {
  const word = words[index];
  const equals = word.indexOf('=');
  const name = resolveLong(equals === -1 ? word.slice(2) : word.slice(2, equals));

  if (name === undefined) return 0;

  if (name === 'no-pathspec-from-file') read.pathspecFile = undefined;

  if (!LONG_WITH_VALUE.includes(name)) {
    applySwitch(read, name);
    return 0;
  }

  const fused = equals !== -1;

  if (name === 'pathspec-from-file') read.pathspecFile = fused ? word.slice(equals + 1) : words[index + 1];

  return fused ? 0 : 1;
}

/** Reads one short cluster (`-am`, `-i`, `-U3`) and returns how many words after it it consumed. @es Lee un cúmulo corto y devuelve cuántas palabras más consumió. */
function readCluster(read, cluster) {
  for (let index = 1; index < cluster.length; index += 1) {
    const letter = cluster[index];

    if (letter === 'a') read.all = true;
    if (letter === 'i') read.include = true;
    if (letter === 'o') read.only = true;
    if (SHORT_WITH_OPTIONAL_VALUE.has(letter)) return 0;
    if (SHORT_WITH_VALUE.has(letter)) return index === cluster.length - 1 ? 1 : 0;
  }

  return 0;
}

/**
 * Reads the words after `git commit`.
 *
 * @param args The words after `commit`, as `gitInvocations()` gives them.
 * @returns `{ paths, all, include, only, dryRun, pathspecFile, pathspecNul }`; `pathspecFile` is the file named
 *   by `--pathspec-from-file`, whose entries (NUL-separated when `pathspecNul`) are further paths.
 * @es Lee las palabras tras `git commit`: `{ paths, all, include, only, dryRun, pathspecFile, pathspecNul }`.
 */
export function readCommit(args) {
  const read = { paths: [], all: false, include: false, only: false, dryRun: false, pathspecFile: undefined, pathspecNul: false };
  let afterSeparator = false;

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (afterSeparator || !word.startsWith('-') || word === '-') {
      read.paths.push(word);
    } else if (word === SEPARATOR) {
      afterSeparator = true;
    } else if (word.startsWith('--')) {
      index += readLong(read, args, index);
    } else {
      index += readCluster(read, word);
    }
  }

  return read;
}
