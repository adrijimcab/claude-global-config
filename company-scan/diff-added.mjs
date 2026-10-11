/**
 * The ADDED lines of a unified diff (`-U0`), each with its file, its line number in the new file and, when
 * the diff comes from `git log -p --format=%x00%H`, the commit it belongs to; and the paths a
 * `git log --name-only --format=%x00%H` listing attributes to each commit.
 *
 * Hunk bodies are consumed by the counts their `@@` header declares, so an added line whose content is
 * `++ x` (rendered `+++ x`) is never mistaken for a file header.
 *
 * @es Las líneas AÑADIDAS de un diff unificado (`-U0`), cada una con su fichero, su número de línea en el
 * fichero nuevo y, si el diff viene de `git log -p --format=%x00%H`, su commit; y las rutas que un listado
 * `git log --name-only` atribuye a cada commit. El cuerpo de un hunk se consume por los contadores de su
 * cabecera `@@`, de modo que una línea añadida `++ x` (`+++ x`) nunca se confunde con una cabecera.
 */

/** Splits a hunk-range token such as `-3,2` or `+7` into `{ start, count }`. @es Separa un rango de hunk en `{ start, count }`. */
function rangeOf(token) {
  const [start, count] = token.slice(1).split(',');

  return { start: Number(start), count: count === undefined ? 1 : Number(count) };
}

/** The path a `+++ ` header names, or `undefined` for `/dev/null`. @es La ruta que nombra una cabecera `+++ `. */
function headerPath(line) {
  const named = line.slice(4).split('\t')[0];

  if (named === '/dev/null') return undefined;

  return named.startsWith('b/') ? named.slice(2) : named;
}

/**
 * @returns `[{ commit, path, line, text }]` for every added line, in diff order.
 * @es `[{ commit, path, line, text }]` por cada línea añadida, en el orden del diff.
 */
export function addedLines(diff) {
  const added = [];
  let commit;
  let path;
  let remainingOld = 0;
  let remainingNew = 0;
  let nextLine = 0;

  for (const line of diff.split('\n')) {
    if (remainingOld > 0 || remainingNew > 0) {
      if (line.startsWith('+')) {
        added.push({ commit, path, line: nextLine, text: line.slice(1) });
        nextLine += 1;
        remainingNew -= 1;
      } else if (line.startsWith('-')) {
        remainingOld -= 1;
      }

      continue;
    }

    if (line.startsWith('\u0000')) {
      commit = line.slice(1).trim();
      path = undefined;
    } else if (line.startsWith('+++ ')) {
      path = headerPath(line);
    } else if (line.startsWith('@@ ')) {
      const [, oldToken, newToken] = line.split(' ');
      const newRange = rangeOf(newToken);

      remainingOld = rangeOf(oldToken).count;
      remainingNew = newRange.count;
      nextLine = newRange.start;
    }
  }

  return added;
}

/**
 * @returns `[{ commit, path }]` from a `git log --name-only --format=%x00%H` listing.
 * @es `[{ commit, path }]` de un listado `git log --name-only --format=%x00%H`.
 */
export function pathsByCommit(listing) {
  const found = [];
  let commit;

  for (const raw of listing.split('\n')) {
    const line = raw.trim();

    if (raw.startsWith('\u0000')) commit = line.slice(1);
    else if (line.length > 0) found.push({ commit, path: line });
  }

  return found;
}
