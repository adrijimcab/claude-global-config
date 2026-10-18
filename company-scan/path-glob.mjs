/**
 * Whether a path matches a glob with shell `case` semantics: `*` matches any run of characters, `/` included,
 * and `?` matches exactly one character; every other character matches itself. The whole path must match, as
 * `case` requires. A plain two-cursor scan with backtracking to the last `*`, no regular expression, so a glob
 * can never be silently misread as a pattern of another dialect.
 *
 * @es Si una ruta casa con un glob con la semántica de `case` de la shell: `*` casa cualquier tramo de
 * caracteres, `/` incluida, y `?` exactamente un carácter; cualquier otro carácter se casa a sí mismo. La ruta
 * entera debe casar, como exige `case`. Un recorrido de dos cursores que retrocede al último `*`, sin expresión
 * regular, para que un glob nunca se lea como patrón de otro dialecto.
 */

/** The metacharacters a glob may hold. @es Los metacaracteres que puede llevar un glob. */
export const WILDCARDS = '*?';

/** Characters `case` would read as syntax this matcher does not implement. @es Caracteres que `case` leería como sintaxis que este matcher no implementa. */
export const UNSUPPORTED = '[]\\';

/**
 * @param {string} glob @param {string} path
 * @returns {boolean} whether the whole `path` matches `glob`.
 * @es Si la `path` entera casa con `glob`.
 */
export function globMatches(glob, path) {
  let g = 0;
  let p = 0;
  let starAt = -1;
  let resumeAt = 0;

  while (p < path.length) {
    if (g < glob.length && (glob[g] === '?' || glob[g] === path[p])) {
      g += 1;
      p += 1;
    } else if (g < glob.length && glob[g] === '*') {
      starAt = g;
      resumeAt = p;
      g += 1;
    } else if (starAt !== -1) {
      g = starAt + 1;
      resumeAt += 1;
      p = resumeAt;
    } else {
      return false;
    }
  }

  while (g < glob.length && glob[g] === '*') g += 1;

  return g === glob.length;
}
