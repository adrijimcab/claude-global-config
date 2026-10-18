/**
 * The ONE canonical spelling of a path inside a piece of text. A worktree is written on a command line in many
 * ways (`~/.claude-wt/x`, `$HOME/...`, `${HOME}/...`, `%USERPROFILE%\...`, Git Bash `/c/Users/...`, back or forward
 * slashes, any case, a Windows 8.3 short name such as `ADRIAN~1.JIM`), and the ownership match is only as good as
 * its agreement across all of them. Both sides of the comparison, the worktree path and the command line, go
 * through `canonicalText`, so a spelling is supported by being understood here and nowhere else.
 * @es La ÚNICA forma canónica de una ruta dentro de un texto. Un worktree se escribe en una línea de comandos de
 * muchas maneras (`~/.claude-wt/x`, `$HOME/...`, `${HOME}/...`, `%USERPROFILE%\...`, la ruta `/c/Users/...` de Git
 * Bash, barras en cualquier sentido, cualquier caja, un nombre corto 8.3 de Windows como `ADRIAN~1.JIM`), y la
 * coincidencia de pertenencia vale lo que valga su acuerdo entre todas. Los dos lados de la comparación, la ruta
 * del worktree y la línea de comandos, pasan por `canonicalText`: una forma se soporta entendiéndola aquí y en
 * ningún otro sitio.
 */

import { realpathSync } from 'node:fs';
import os from 'node:os';

/** One path segment: no whitespace, quote or path-illegal character. @es Un segmento de ruta. */
const SEGMENT = '[^\\s"\'<>|*?/]';
/** A drive path whose last segment (or an earlier one) is an 8.3 short name; it ends at the last such segment. @es Una ruta con unidad que termina en su último segmento 8.3. */
const SHORT_NAMED_PATH = new RegExp(`[a-z]:/(?:${SEGMENT}+/)*${SEGMENT}*~\\d${SEGMENT}*`, 'g');

/** The text with its slashes folded to one direction and its case lowered. @es El texto con una sola barra y en minúsculas. */
export const folded = (text) => text.split('\\').join('/').toLowerCase();

/** A path without its trailing slashes, so `x/` and `x` are one marker. @es Una ruta sin barras finales. */
const withoutTrailingSlashes = (text) => text.replace(/\/+$/, '');

/** `~`, `$HOME`, `${HOME}` and `%USERPROFILE%` replaced by `home`. @es `~`, `$HOME`, `${HOME}` y `%USERPROFILE%` sustituidos por `home`. */
export function withHomeExpanded(text, home) {
  return text
    .replace(/(^|[\s"'=])~(?=[\\/]|$|[\s"'])/g, (_match, lead) => `${lead}${home}`)
    .replace(/\$\{HOME\}/gi, () => home)
    .replace(/\$HOME(?![A-Za-z0-9_])/gi, () => home)
    .replace(/%USERPROFILE%/gi, () => home);
}

/** Git Bash `/c/Users/x` read as `c:/users/x`. @es La ruta `/c/Users/x` de Git Bash leída como `c:/users/x`. */
const withDriveLetter = (text) => text.replace(/(^|[\s"'=])\/([a-z])\//g, (_match, lead, drive) => `${lead}${drive}:/`);

/** Every 8.3 short name in a path replaced by its real name, where the path exists. @es Cada nombre 8.3 sustituido por el real, si la ruta existe. */
function withLongNames(text) {
  return text.replace(SHORT_NAMED_PATH, (match) => {
    try {
      return folded(realpathSync.native(match));
    } catch {
      return match;
    }
  });
}

/**
 * `text` in canonical spelling: home expanded, one slash direction, lower case, Git Bash drives and 8.3 names read.
 * @es `text` en forma canónica: home expandido, una sola barra, minúsculas, unidades de Git Bash y nombres 8.3 leídos.
 */
export function canonicalText(text, home = os.homedir()) {
  return withLongNames(withDriveLetter(folded(withHomeExpanded(text, home))));
}

/**
 * The canonical spellings of one worktree path: as written, and as the file system names it when it exists (which
 * also resolves a short name written in the worktree argument itself).
 * @es Las formas canónicas de la ruta de un worktree: como se escribió, y como la nombra el sistema de ficheros si
 * existe (lo que también resuelve un nombre corto escrito en el propio argumento).
 */
export function canonicalPaths(path, home = os.homedir()) {
  const written = withoutTrailingSlashes(canonicalText(path.trim(), home));
  let real = written;

  try {
    real = withoutTrailingSlashes(folded(realpathSync.native(withHomeExpanded(path.trim(), home))));
  } catch {
    /* a path that is gone keeps its written spelling @es una ruta que ya no existe conserva su forma escrita */
  }

  return [...new Set([written, real])];
}
