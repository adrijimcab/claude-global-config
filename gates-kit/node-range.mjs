/**
 * Decides whether a Node version satisfies an npm `engines.node` range, for the forms those ranges use:
 * alternatives joined by `||`, each a space-separated set of comparators that must all hold; a comparator is
 * an optional operator (`^`, `~`, `>=`, `<=`, `>`, `<`, `=`) and a version that may be partial (`18`,
 * `20.11`) or hold a wildcard (`6.*`, `x`), or a bare `*`. A bare partial version is the whole span it names
 * (`18` is `>=18.0.0 <19.0.0`). `^` holds the leftmost non-zero part, `~` the minor (the major alone when only
 * the major is given). Prerelease tags are not read: no `engines.node` range of a pinned toolchain holds one.
 *
 * Decision: a range or version this module cannot read throws, never answers; a guess here would let a
 * toolchain be handed to a Node it cannot run on, or refuse one it can.
 *
 * @es Decide si una versión de Node cumple un rango `engines.node` de npm, en las formas que usan: alternativas
 * unidas por `||`, cada una un conjunto de comparadores separados por espacios que deben cumplirse todos; un
 * comparador es un operador opcional y una versión que puede ser parcial o llevar comodín, o un `*` suelto.
 * Una versión parcial suelta es todo el tramo que nombra. `^` fija la primera parte no cero, `~` el minor.
 * No se leen etiquetas prerelease. Un rango o versión ilegible lanza, nunca responde: adivinar aquí
 * entregaría una toolchain a un Node que no puede ejecutarla, o rechazaría uno que sí puede.
 */

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
const COMPARATOR = /^(\^|~|>=|<=|>|<|=)?(\*|x|X|\d+)(?:\.(\*|x|X|\d+))?(?:\.(\*|x|X|\d+))?$/;

/** The `[major, minor, patch]` of an exact version. @es Las tres partes de una versión exacta. */
export function parseVersion(text) {
  const match = VERSION.exec(String(text).trim());

  if (match === null) throw new Error(`not an exact version: ${text} @es no es una versión exacta: ${text}`);

  return match.slice(1).map(Number);
}

/** -1, 0 or 1 as `left` is below, equal to or above `right`. @es -1, 0 o 1 según `left` sea menor, igual o mayor. */
function compare(left, right) {
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;

  return 0;
}

/** The parts actually given, a wildcard ending them. @es Las partes dadas; un comodín las termina. */
function givenParts(raw) {
  const parts = [];

  for (const part of raw) {
    if (part === undefined || /^[*xX]$/.test(part)) break;
    parts.push(Number(part));
  }

  return parts;
}

/** `[lower, upper)` bounds of a partial version: the span it names. @es Límites del tramo que nombra una versión parcial. */
function span(parts) {
  const lower = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];

  if (parts.length === 0) return { lower, upper: undefined };
  if (parts.length === 3) return { lower, upper: [lower[0], lower[1], lower[2] + 1] };

  const upper = [...lower];

  upper[parts.length - 1] += 1;

  return { lower, upper };
}

/** The upper bound a caret puts over `parts`. @es El límite superior de un caret. */
function caretUpper(parts) {
  const full = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  const pivot = full.findIndex((value, index) => value !== 0 || index === parts.length - 1);
  const at = pivot === -1 ? 0 : pivot;
  const upper = full.map((value, index) => (index < at ? value : 0));

  upper[at] = full[at] + 1;

  return upper;
}

/** True when `version` satisfies one comparator. @es Verdadero si `version` cumple un comparador. */
function satisfiesComparator(version, token) {
  const match = COMPARATOR.exec(token);

  if (match === null) throw new Error(`unreadable comparator: ${token} @es comparador ilegible: ${token}`);

  const [, operator = '', ...raw] = match;
  const parts = givenParts(raw);
  const { lower, upper } = span(parts);
  const below = (bound) => bound === undefined || compare(version, bound) < 0;

  if (parts.length === 0) return operator === '' || operator === '=' || operator === '>=' || operator === '<=';

  switch (operator) {
    case '':
    case '=':
      return compare(version, lower) >= 0 && below(upper);
    case '>=':
      return compare(version, lower) >= 0;
    case '>':
      return !below(upper);
    case '<':
      return compare(version, lower) < 0;
    case '<=':
      return below(upper);
    case '^':
      return compare(version, lower) >= 0 && compare(version, caretUpper(parts)) < 0;
    default: {
      const tildeUpper = parts.length === 1 ? [lower[0] + 1, 0, 0] : [lower[0], lower[1] + 1, 0];

      return compare(version, lower) >= 0 && compare(version, tildeUpper) < 0;
    }
  }
}

/** The comparator tokens of one alternative, an operator glued to its version. @es Los comparadores de una alternativa. */
function comparators(alternative) {
  return alternative.trim().replace(/(\^|~|>=|<=|>|<|=)\s+/g, '$1').split(/\s+/).filter((token) => token !== '');
}

/**
 * True when `version` (exact, `v` prefix allowed) satisfies `range`.
 * @es Verdadero si `version` (exacta, admite prefijo `v`) cumple `range`.
 */
export function satisfies(version, range) {
  const parsed = parseVersion(version);
  const alternatives = String(range).split('||');

  if (alternatives.some((alternative) => comparators(alternative).length === 0)) throw new Error(`empty alternative in range: ${range} @es alternativa vacía en el rango: ${range}`);

  return alternatives.some((alternative) => comparators(alternative).every((token) => satisfiesComparator(parsed, token)));
}
