/**
 * Whether the pathspec of a `git commit` NAMES specific paths, which is what the commit rule asks of a worker.
 *
 * WHY. `git commit -- <paths>` limits the commit to what the pathspec matches, so a pathspec that matches
 * everything is the sweep the rule refuses, spelled with a `--` (both judges of the 2026-10-19 Judgment Day):
 *   - the whole tree: `.`, `./`, `..`, `*`, `**`, `:/`, `:(top)`, `:(glob)**`, any spelling made only of dots,
 *     slashes and stars once the magic prefix is read;
 *   - only exclusions (`:!x`, `:^x`, `:(exclude)x`): git then commits everything except them;
 *   - only shell expansions (`$FILES`, `"$@"`, `$(git ls-files)`, a bash backtick, and in PowerShell `$env:X` and
 *     `@files`): the line does not show what they name, possibly everything, possibly nothing.
 * A pathspec with at least one literal, non-excluding, specific path passes, even beside an expansion.
 *
 * @es Si el pathspec de un `git commit` NOMBRA rutas concretas, que es lo que la regla pide a un worker. Un
 * pathspec que cubre todo es el mismo barrido que la regla rechaza, escrito con `--`: el árbol entero (`.`, `*`,
 * `:/`, `:(glob)**`, cualquier forma hecha solo de puntos, barras y asteriscos tras la magia), solo exclusiones
 * (git commitea todo lo demás) o solo expansiones de la shell (`$FILES`, `$(...)`, `$env:X`, `@files`), cuyo
 * contenido la línea no muestra. Basta una ruta literal, concreta y no excluyente para pasar.
 */

/** The characters a whole-tree pattern is made of. @es Los caracteres de un patrón de árbol entero. */
const WHOLE_TREE_CHARACTERS = './*';

/** The short magic signatures (`:/`, `:!`, `:^`). @es Las firmas de magia corta. */
const SHORT_MAGIC = '/!^';

/** A pathspec split into its magic words and the pattern after them. @es Un pathspec partido en su magia y su patrón. */
function magicOf(spec) {
  if (!spec.startsWith(':')) return { magic: [], pattern: spec };

  if (spec.startsWith(':(')) {
    const close = spec.indexOf(')');

    if (close === -1) return { magic: [], pattern: spec };

    return { magic: spec.slice(2, close).split(',').map((word) => word.trim().split(':')[0]), pattern: spec.slice(close + 1) };
  }

  let at = 1;
  const magic = [];

  while (at < spec.length && SHORT_MAGIC.includes(spec.charAt(at))) {
    magic.push(spec.charAt(at) === '/' ? 'top' : 'exclude');
    at += 1;
  }

  if (spec.charAt(at) === ':') at += 1;

  return { magic, pattern: spec.slice(at) };
}

/** Whether a pathspec excludes instead of naming. @es Si un pathspec excluye en lugar de nombrar. */
const isExclusion = (spec) => magicOf(spec).magic.includes('exclude');

/** Whether a pathspec matches the whole tree. @es Si un pathspec cubre el árbol entero. */
function namesWholeTree(spec) {
  const { pattern } = magicOf(spec);

  return [...pattern.split('\\').join('/')].every((character) => WHOLE_TREE_CHARACTERS.includes(character));
}

/**
 * Whether a word is only a shell expansion, whose value the line does not show.
 * @es Si una palabra es solo una expansión de la shell, cuyo valor la línea no muestra.
 */
function isExpansion(word, dialect) {
  if (word.startsWith('$(') && word.endsWith(')')) return true;
  if (dialect === 'bash' && word.startsWith('`') && word.endsWith('`')) return true;

  const sigil = word.startsWith('$') || (dialect === 'powershell' && word.startsWith('@'));

  return sigil && !word.includes('/') && !word.includes('\\');
}

/**
 * @param {string[]} pathspecs The pathspec words of one commit.
 * @param {string | undefined} dialect `bash` or `powershell` for words a shell expands; `undefined` for the
 *   literal lines of a `--pathspec-from-file`, which no shell expands.
 * @returns {boolean} Whether the pathspec names specific paths.
 * @es Si el pathspec nombra rutas concretas; `dialect` es `undefined` para las líneas literales de un fichero.
 */
export function namesSpecificPaths(pathspecs, dialect) {
  const named = pathspecs.filter((spec) => dialect === undefined || !isExpansion(spec, dialect));
  const including = named.filter((spec) => !isExclusion(spec));

  return including.length > 0 && !including.some(namesWholeTree);
}
