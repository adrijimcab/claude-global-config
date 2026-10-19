/**
 * Whether the pathspec of a `git commit` SWEEPS the worktree instead of naming specific paths, which is what the
 * commit rule refuses.
 *
 * WHY. `git commit -- <paths>` limits the commit to what the pathspec matches, so a pathspec that matches the
 * whole worktree is the sweep the rule refuses, spelled with a `--` (both judges of the 2026-10-19 Judgment Day,
 * two rounds). A pathspec sweeps when:
 *   - it reaches the worktree ROOT or above it, once resolved against the directory the commit runs in (or the
 *     root, for `:/` and `:(top)`): `.` and `*` at the root, `src/..`, `..` from a subdirectory, an absolute path
 *     to the root. `.` or `*` inside a subdirectory names that subdirectory only, and passes;
 *   - it is a glob whose every segment after the literal part matches anything (`*`, `?*`, `[!.]*`, `**`), so it
 *     covers everything under that literal part, which is then judged as above;
 *   - every including pathspec is an exclusion (`:!x`, `:^x`, `:(exclude)x`): git commits everything else;
 *   - every including pathspec is a shell expansion (`$FILES`, `"$@"`, `$(git ls-files)`, a bash backtick, and
 *     in PowerShell `$env:X` and `@files`), whose value the line does not show;
 *   - any pathspec is an expansion followed only by separators, dots or wildcards (`$PWD/`,
 *     `"$(git rev-parse --show-toplevel)/"`): it names a directory the line hides, possibly the root.
 * When the root is unknown (no repository found, or a directory the line cannot follow), a relative pathspec that
 * resolves to the commit directory or above it counts as the root, and an absolute one counts when it holds `.git`.
 * `matchesFilesToCome` also tells whether a pathspec can match files that do not exist yet (a glob, or an existing
 * directory), which the rule on earlier writes of the line needs.
 *
 * @es Si el pathspec de un `git commit` BARRE el worktree en lugar de nombrar rutas concretas. Barre cuando llega a
 * la RAÍZ del worktree o más arriba una vez resuelto contra el directorio del commit (o la raíz con `:/` y
 * `:(top)`): `.` y `*` en la raíz, `src/..`, `..` desde un subdirectorio, una ruta absoluta a la raíz (`.` o `*` en
 * un subdirectorio nombran solo ese subdirectorio y pasan); cuando es un glob cuyos segmentos tras la parte literal
 * lo cubren todo (`*`, `?*`, `[!.]*`, `**`); cuando todo pathspec incluyente es una exclusión o una expansión de la
 * shell; o cuando una expansión va seguida solo de separadores, puntos o comodines (`$PWD/`). Si la raíz es
 * desconocida, una ruta relativa que se resuelve al directorio del commit o más arriba cuenta como la raíz, y una
 * absoluta cuenta si contiene `.git`. `matchesFilesToCome` dice además si un pathspec puede casar con ficheros que
 * aún no existen (un glob o un directorio existente), lo que la regla de escrituras previas de la línea necesita.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { isWithin } from './repository-layout.mjs';

/** The characters that make a path segment a glob. @es Los caracteres que hacen de un segmento un glob. */
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

/** Whether a segment matches any name: only `*`, `?` and bracket expressions. @es Si un segmento casa con cualquier nombre. */
function isWildcardSegment(segment) {
  for (let at = 0; at < segment.length; at += 1) {
    const character = segment.charAt(at);

    if (character === '[') {
      const close = segment.indexOf(']', at + 2);

      if (close === -1) return false;

      at = close;
    } else if (character !== '*' && character !== '?') {
      return false;
    }
  }

  return true;
}

/**
 * The literal part of a pattern and whether what follows it matches everything under it.
 * @es La parte literal de un patrón y si lo que sigue casa con todo lo que hay debajo.
 */
function reachOf(pattern, literal) {
  const segments = pattern.split(/[\\/]/);
  const firstGlob = literal ? -1 : segments.findIndex((segment) => [...GLOB_CHARACTERS].some((character) => segment.includes(character)));
  const cut = firstGlob === -1 ? segments.length : firstGlob;
  const prefix = segments.slice(0, cut).join('/');

  return { prefix: prefix.length === 0 ? '.' : prefix, everything: segments.slice(cut).every((segment) => segment.length === 0 || isWildcardSegment(segment)) };
}

/**
 * The shell expansion a word starts with, and the text after it; `undefined` when it starts with none.
 * @es La expansión de shell con la que empieza una palabra y el texto que la sigue; `undefined` si no empieza con una.
 */
function leadingExpansion(word, dialect) {
  if (dialect === 'bash' && word.startsWith('`')) {
    const close = word.indexOf('`', 1);

    return close === -1 ? { tail: '' } : { tail: word.slice(close + 1) };
  }

  if (dialect === 'powershell' && word.startsWith('@')) return { tail: word.slice(1).replace(/^[\w:]+/, '') };
  if (!word.startsWith('$')) return undefined;

  if (word.startsWith('$(')) {
    let depth = 0;

    for (let at = 1; at < word.length; at += 1) {
      if (word.charAt(at) === '(') depth += 1;
      if (word.charAt(at) === ')') depth -= 1;
      if (depth === 0) return { tail: word.slice(at + 1) };
    }

    return { tail: '' };
  }

  if (word.startsWith('${')) {
    const close = word.indexOf('}');

    return { tail: close === -1 ? '' : word.slice(close + 1) };
  }

  return { tail: word.slice(1).replace(/^(env:)?[\w@*#?]+/i, '') };
}

/** Whether a tail names something specific: a segment other than dots and wildcards. @es Si una cola nombra algo concreto. */
const tailIsSpecific = (tail) => tail.split(/[\\/]/).some((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && !isWildcardSegment(segment));

/** Whether a relative prefix resolves to its own base or above it. @es Si un prefijo relativo se resuelve a su base o más arriba. */
const reachesBase = (prefix) => {
  const normalized = path.posix.normalize(prefix.split('\\').join('/'));

  return normalized === '.' || normalized === './' || normalized === '..' || normalized.startsWith('../');
};

/** Whether a covering prefix reaches the worktree root or above it. @es Si un prefijo que lo cubre todo llega a la raíz o más arriba. */
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

  if (!magic.includes('literal') && [...GLOB_CHARACTERS].some((character) => pattern.includes(character))) return true;

  try {
    return statSync(path.resolve(magic.includes('top') && root !== undefined ? root : base, pattern.length === 0 ? '.' : pattern)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string[]} pathspecs The pathspec of one commit.
 * @param {{ dialect?: string, directory?: string, layout?: { root: string } }} context `dialect` is `bash` or
 *   `powershell` for words a shell expands, `undefined` for the literal lines of a `--pathspec-from-file`;
 *   `directory` is where the commit runs and `layout` its repository (`repository-layout.mjs`).
 * @returns {boolean} Whether the pathspec sweeps the worktree instead of naming specific paths.
 * @es Si el pathspec barre el worktree en lugar de nombrar rutas concretas.
 */
export function sweepsWorktree(pathspecs, { dialect, directory, layout }) {
  let named = 0;
  let listed = 0;

  for (const spec of pathspecs) {
    const expansion = dialect === undefined ? undefined : leadingExpansion(spec, dialect);

    if (expansion !== undefined) {
      if (expansion.tail.length === 0) listed += 1;
      else if (tailIsSpecific(expansion.tail)) named += 1;
      else return true;

      continue;
    }

    const { magic, pattern } = magicOf(spec);

    if (magic.includes('exclude')) continue;

    const { prefix, everything } = reachOf(pattern, magic.includes('literal'));

    if (everything && reachesRoot(prefix, magic.includes('top'), directory, layout)) return true;

    named += 1;
  }

  return named === 0;
}
