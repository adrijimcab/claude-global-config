/**
 * Shell wildcards, read without a shell: which names a glob matches, which words a brace list stands for, and
 * which real paths a wildcard path reaches on the file system. No regular expression: every test is a character
 * walk, so the three pieces can be read and mutated one decision at a time.
 *
 * WHAT IS SUPPORTED. `*` (any run, the empty one included), `?` (exactly one character), `[abc]` / `[a-c]` /
 * `[!a]` / `[^a]` (a class); an unclosed `[` is a literal. Brace lists `{a,b}`, nested and multiplied. A leading
 * dot is matched like any other character: a deletion guard that skipped dot files would let `rm dir/*` reach a
 * hidden file unseen, and an extra match can only make the guard stricter, never weaker.
 *
 * WHAT IS NOT. A brace RANGE (`{1..3}`) is reported `unsupported`, because the guard must refuse what it cannot
 * enumerate rather than guess; extended globs and `**` are not shell defaults for `rm`.
 *
 * @es Comodines de shell leídos sin shell: qué nombres casa un glob, qué palabras representa una lista con llaves
 * y qué rutas reales alcanza un camino con comodines en el sistema de ficheros. Sin expresiones regulares.
 * SOPORTADO: `*`, `?`, clases `[abc]` / `[a-c]` / `[!a]` / `[^a]` (un `[` sin cerrar es literal) y listas con
 * llaves anidadas o multiplicadas. Un punto inicial se casa como cualquier carácter: saltarse los ficheros
 * ocultos dejaría pasar `rm dir/*` sobre uno oculto, y un casamiento de más solo hace al guard más estricto.
 * NO SOPORTADO: un RANGO de llaves (`{1..3}`) se informa como `unsupported` porque el guard rechaza lo que no
 * puede enumerar en vez de adivinar.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

const WILDCARD_CHARACTERS = '*?[';
const CLASS_NEGATIONS = '!^';

/** The most words one brace list may expand to; beyond it the list is reported unsupported. @es El máximo de palabras de una lista con llaves. */
const MAX_BRACE_WORDS = 1000;

/** Windows folds case in file names; POSIX does not. @es Windows ignora mayúsculas en los nombres; POSIX no. */
const FOLDS_CASE = process.platform === 'win32';

/** Whether `word` carries a wildcard character. @es Si `word` lleva un carácter comodín. */
export const hasWildcard = (word) => [...word].some((character) => WILDCARD_CHARACTERS.includes(character));

/**
 * One pattern element at `index` against one character: the index just past the element when it matches,
 * `-1` when it does not. A `[` with no closing `]` is a literal `[`.
 * @es Un elemento del patrón en `index` contra un carácter: el índice tras el elemento si casa, `-1` si no.
 */
function elementMatch(pattern, index, character) {
  const head = pattern.charAt(index);

  if (head === '?') return index + 1;
  if (head !== '[') return head === character ? index + 1 : -1;

  const close = pattern.indexOf(']', index + 2);

  if (close === -1) return head === character ? index + 1 : -1;

  const negated = CLASS_NEGATIONS.includes(pattern.charAt(index + 1));
  let cursor = negated ? index + 2 : index + 1;
  let inside = false;

  while (cursor < close) {
    const isRange = pattern.charAt(cursor + 1) === '-' && cursor + 2 < close;

    if (isRange) {
      inside = inside || (character >= pattern.charAt(cursor) && character <= pattern.charAt(cursor + 2));
      cursor += 3;
    } else {
      inside = inside || pattern.charAt(cursor) === character;
      cursor += 1;
    }
  }

  return inside !== negated ? close + 1 : -1;
}

/**
 * Whether the glob `pattern` matches the whole file name `name`, by the classic two-pointer walk that remembers
 * the last `*` and retries one character further on a mismatch.
 * @es Si el glob `pattern` casa el nombre completo `name`, con el recorrido de dos punteros que recuerda el
 * último `*` y reintenta un carácter más allá ante un fallo.
 */
export function wildcardMatch(pattern, name, fold = false) {
  const glob = fold ? pattern.toLowerCase() : pattern;
  const subject = fold ? name.toLowerCase() : name;
  let patternAt = 0;
  let nameAt = 0;
  let starAt = -1;
  let starName = 0;

  while (nameAt < subject.length) {
    if (glob.charAt(patternAt) === '*') {
      starAt = patternAt;
      starName = nameAt;
      patternAt += 1;
      continue;
    }

    const next = patternAt < glob.length ? elementMatch(glob, patternAt, subject.charAt(nameAt)) : -1;

    if (next !== -1) {
      patternAt = next;
      nameAt += 1;
    } else if (starAt !== -1) {
      patternAt = starAt + 1;
      starName += 1;
      nameAt = starName;
    } else {
      return false;
    }
  }

  while (glob.charAt(patternAt) === '*') patternAt += 1;

  return patternAt === glob.length;
}

/** The index of the `}` closing the `{` at `open`, or `-1`. @es El índice de la `}` que cierra la `{` en `open`, o `-1`. */
function closingBrace(word, open) {
  let depth = 0;

  for (let index = open; index < word.length; index += 1) {
    if (word.charAt(index) === '{') depth += 1;
    if (word.charAt(index) === '}') depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

/** The comma-separated parts of a brace body, ignoring commas inside nested braces. @es Las partes separadas por coma, sin contar las de llaves anidadas. */
function topLevelParts(body) {
  const parts = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const character = body.charAt(index);

    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;

    if (character === ',' && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(body.slice(start));

  return parts;
}

/**
 * The words a bash brace list stands for. `unsupported` is true when a group is a range (`{1..3}`) or the list
 * would grow past `MAX_BRACE_WORDS`: the caller must then treat the word as unknowable.
 * @es Las palabras que representa una lista con llaves de bash. `unsupported` es verdadero ante un rango o una
 * lista demasiado grande: el llamador debe tratar la palabra como no resoluble.
 */
export function braceExpansion(word) {
  const open = word.indexOf('{');

  if (open === -1) return { words: [word], unsupported: false };

  const close = closingBrace(word, open);

  if (close === -1) return { words: [word], unsupported: false };

  const parts = topLevelParts(word.slice(open + 1, close));

  if (parts.length < 2) {
    const isRange = parts[0].includes('..');
    const rest = braceExpansion(word.slice(close + 1));
    const words = rest.words.map((tail) => `${word.slice(0, close + 1)}${tail}`);

    return { words, unsupported: isRange || rest.unsupported };
  }

  const prefix = word.slice(0, open);
  const suffix = word.slice(close + 1);
  const words = [];
  let unsupported = false;

  for (const part of parts) {
    const inner = braceExpansion(`${prefix}${part}${suffix}`);

    words.push(...inner.words);
    unsupported = unsupported || inner.unsupported;
  }

  return words.length > MAX_BRACE_WORDS ? { words: [word], unsupported: true } : { words, unsupported };
}

/**
 * Every path an absolute `pattern` reaches, folder by folder against the real file system. A segment without a
 * wildcard is kept as written (it may not exist: the caller tests existence); a wildcard segment lists its
 * folder and keeps the names that match.
 * @es Cada ruta que alcanza un `pattern` absoluto, carpeta a carpeta sobre el sistema de ficheros real. Un
 * segmento sin comodín se conserva tal cual; uno con comodín lista su carpeta y conserva los nombres que casan.
 */
export function expandPath(pattern, fold = FOLDS_CASE) {
  const { root } = path.parse(pattern);
  const segments = pattern.slice(root.length).split('\\').join('/').split('/').filter((segment) => segment.length > 0);
  let current = [root];

  for (const segment of segments) {
    const next = [];

    for (const base of current) {
      if (!hasWildcard(segment)) {
        next.push(path.join(base, segment));
        continue;
      }

      let names = [];

      try {
        names = readdirSync(base);
      } catch {
        continue;
      }

      for (const name of names) {
        if (wildcardMatch(segment, name, fold)) next.push(path.join(base, name));
      }
    }

    current = next;
  }

  return current;
}
