/**
 * Whether the pathspec of a `git commit` SWEEPS the worktree instead of naming specific paths, which is what the
 * commit rule refuses. The words reach this module literal: a word holding a shell expansion is refused as
 * unresolvable before it gets here (`forbidden-invocations.mjs`).
 *
 * WHY. `git commit -- <paths>` limits the commit to what the pathspec matches, so a pathspec that matches the
 * whole worktree is the sweep the rule refuses, spelled with a `--` (Judgment Day 2026-10-19 and 2026-10-25).
 *
 * HOW, by class, never by spelling:
 *   - the pattern is normalised textually first, as git does (`src/..`, `*` then `/..`, `./x`), after its native
 *     spelling (`/c/x` is `C:/x` on Windows, as Git Bash hands it to `git.exe`);
 *   - a wildcard (`*`, `?`, `[`) matches anything, `/` included, so a pattern with one covers everything under the
 *     literal directories before its first wildcard (`*.*`, `?*`, `[!.]*` cover their directory);
 *   - what a pattern covers SWEEPS when it is the worktree ROOT or above it, resolved against the directory the
 *     commit runs in (or the root, for `:/` and `:(top)`); `.` or `*` inside a subdirectory names that subdirectory
 *     only, and passes;
 *   - every including pathspec being an exclusion (`:!x`, `:^x`, `:(exclude)x`) is a sweep too: git commits the rest.
 * When the root is unknown (no repository found, or a directory the line cannot follow), a relative pattern that
 * resolves to the commit directory or above it counts as the root, and an absolute one counts when it holds `.git`.
 * `matchesFilesToCome` tells whether a pathspec can match files that do not exist yet (a wildcard, or an existing
 * directory), which the rule on earlier writes of the line needs.
 *
 * @es Si el pathspec de un `git commit` BARRE el worktree en lugar de nombrar rutas concretas. Las palabras llegan
 * literales: una con una expansión de la shell se rechaza antes como no resoluble. Por clase: el patrón se
 * normaliza textualmente como hace git, tras su grafía nativa; un comodín casa con todo, `/` incluida, así que un
 * patrón con uno cubre todo lo que hay bajo los directorios literales anteriores a su primer comodín; lo cubierto
 * BARRE si es la RAÍZ del worktree o algo superior, resuelto contra el directorio del commit (o la raíz con `:/` y
 * `:(top)`); `.` o `*` en un subdirectorio nombran solo ese subdirectorio; y solo exclusiones también barre. Si la
 * raíz es desconocida, una ruta relativa que se resuelve al directorio del commit o más arriba cuenta como la raíz,
 * y una absoluta cuenta si contiene `.git`.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { nativeSpelling } from '../cherry-pick-guard/working-directory.mjs';
import { isWithin } from './repository-layout.mjs';

/** The characters that make a pattern a glob. @es Los caracteres que hacen de un patrón un glob. */
const GLOB_CHARACTERS = '*?[';

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

/** A pattern in its native spelling, normalised textually as git does. @es Un patrón en grafía nativa, normalizado como hace git. */
const normalized = (pattern) => path.posix.normalize(nativeSpelling(pattern).split('\\').join('/'));

/** Whether a segment or pattern holds a wildcard character. @es Si un segmento o patrón lleva un carácter comodín. */
const holdsWildcard = (text) => [...GLOB_CHARACTERS].some((character) => text.includes(character));

/**
 * What a pattern covers: itself when literal, else the literal directories before its first wildcard.
 * @es Lo que cubre un patrón: él mismo si es literal; si no, los directorios literales anteriores a su primer comodín.
 */
function coveredPrefix(pattern, magic) {
  const text = normalized(pattern);

  if (magic.includes('literal') || !holdsWildcard(text)) return text;

  const segments = text.split('/');
  const prefix = segments.slice(0, segments.findIndex(holdsWildcard)).join('/');

  return prefix.length === 0 ? '.' : prefix;
}

/** Whether a relative prefix resolves to its own base or above it. @es Si un prefijo relativo se resuelve a su base o más arriba. */
const reachesBase = (prefix) => {
  const text = path.posix.normalize(prefix);

  return text === '.' || text === './' || text === '..' || text.startsWith('../');
};

/** Whether a covered prefix reaches the worktree root or above it. @es Si un prefijo cubierto llega a la raíz o más arriba. */
function reachesRoot(prefix, top, directory, layout) {
  if (path.isAbsolute(prefix)) return layout === undefined ? existsSync(path.join(prefix, '.git')) : isWithin(prefix, layout.root);

  const base = top ? layout?.root : directory;

  if (layout === undefined || typeof base !== 'string') return reachesBase(prefix);

  return isWithin(path.resolve(base, prefix), layout.root);
}

/**
 * Whether a pathspec can match files that do not exist yet: a glob, or an existing directory. A literal path to a
 * file cannot, because git refuses a pathspec that matches no file it knows.
 * @param {string} spec One pathspec word.
 * @param {string} base The directory a relative pathspec is read from.
 * @param {string | undefined} root The worktree root, for `:/` and `:(top)`.
 * @es Si un pathspec puede casar con ficheros que aún no existen: un glob o un directorio existente.
 */
export function matchesFilesToCome(spec, base, root) {
  const { magic, pattern } = magicOf(spec);

  if (!magic.includes('literal') && holdsWildcard(pattern)) return true;

  try {
    return statSync(path.resolve(magic.includes('top') && root !== undefined ? root : base, normalized(pattern))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string[]} pathspecs The literal pathspec of one commit.
 * @param {{ directory?: string, layout?: { root: string } }} context Where the commit runs and its repository
 *   (`repository-layout.mjs`).
 * @returns {boolean} Whether the pathspec sweeps the worktree instead of naming specific paths.
 * @es Si el pathspec barre el worktree en lugar de nombrar rutas concretas.
 */
export function sweepsWorktree(pathspecs, { directory, layout }) {
  let named = 0;

  for (const spec of pathspecs) {
    const { magic, pattern } = magicOf(spec);

    if (magic.includes('exclude')) continue;
    if (reachesRoot(coveredPrefix(pattern, magic), magic.includes('top'), directory, layout)) return true;

    named += 1;
  }

  return named === 0;
}
