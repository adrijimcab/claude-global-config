/**
 * Which tokens of a source are an ELAPSED wall time: the difference of two clock readings, written directly
 * (`Date.now() - started`, `performance.now() - t0`, `process.hrtime(t0)`) or through a name that holds one
 * (`const spent = Date.now() - started;`). A clock reading is a call of `Date.now()`, `performance.now()`,
 * `process.hrtime()` or `process.hrtime.bigint()`, or a name assigned from one (`const started = Date.now();`).
 *
 * Three kinds of name are tracked, to a fixed point so a use before its declaration in the text still resolves:
 *   - READING: holds a clock reading (`started`, a `deadline = Date.now() + ms`);
 *   - ELAPSED: holds the difference of two readings (`spent`), or arithmetic over one;
 *   - BOUND COMPARISON: holds the verdict of comparing an elapsed value with a bound (`const fast = spent < 1000`).
 *
 * A difference counts only when BOTH operands are readings: `Date.now() - 60000` is a past instant, not an elapsed
 * time, and a DEADLINE (`Date.now() + ms`, `Date.now() < deadline`) has no difference in it, so waiting up to a
 * deadline is never an elapsed value. Names are tracked by spelling over the whole file, not by scope: a name that
 * holds a reading in one place and another value elsewhere is read as the reading, the cautious side.
 *
 * @es Qué tokens de un fuente son un tiempo de pared TRANSCURRIDO: la diferencia de dos lecturas de reloj,
 * escrita directamente (`Date.now() - started`, `performance.now() - t0`, `process.hrtime(t0)`) o mediante un nombre
 * que la guarda. Una lectura de reloj es una llamada a `Date.now()`, `performance.now()`, `process.hrtime()` o
 * `process.hrtime.bigint()`, o un nombre asignado desde una. Se siguen tres clases de nombre hasta un punto fijo:
 * LECTURA, TRANSCURRIDO y COMPARACIÓN CON COTA. Una diferencia cuenta solo si AMBOS operandos son lecturas:
 * `Date.now() - 60000` es un instante pasado, y un PLAZO (`Date.now() + ms`, `Date.now() < deadline`) no lleva
 * diferencia, así que esperar hasta un plazo nunca es un valor transcurrido. Los nombres se siguen por su
 * escritura en todo el fichero, no por ámbito: queda del lado cauteloso.
 */

import { assignments, matchingOpen, operandSpan } from './token-walk.mjs';

/** Comparison operators. @es Operadores de comparación. */
export const COMPARATORS = new Set(['<', '>', '<=', '>=', '==', '===', '!=', '!==']);

/** Values after which a `-` is a subtraction. @es Valores tras los que un `-` es una resta. */
const VALUE_KINDS = new Set(['word', 'number', 'string']);
const NOT_A_VALUE_WORD = new Set(['return', 'typeof', 'case', 'throw', 'in', 'of', 'void', 'delete', 'await', 'yield']);

const isWord = (token, text) => token?.kind === 'word' && token.text === text;
const isPunct = (token, text) => token?.kind === 'punct' && token.text === text;

/** The call shapes that read the clock, as word/punctuation sequences. @es Las formas de llamada que leen el reloj. */
const READING_CALLS = [
  ['Date', '.', 'now', '(', ')'],
  ['performance', '.', 'now', '(', ')'],
  ['process', '.', 'hrtime', '.', 'bigint', '(', ')'],
  ['process', '.', 'hrtime', '(', ')'],
  ['hrtime', '.', 'bigint', '(', ')'],
  ['hrtime', '(', ')'],
];

/** Length of the reading call that starts at `at`, or 0. @es Largo de la llamada de lectura que empieza en `at`, o 0. */
function readingCallLength(tokens, at) {
  if (isPunct(tokens[at - 1], '.')) return 0;

  for (const shape of READING_CALLS) {
    if (shape.every((text, offset) => tokens[at + offset]?.text === text)) return shape.length;
  }

  return 0;
}

/** Whether `hrtime(...)` with arguments starts at `at`: the difference form, already an elapsed value. @es Si en `at` empieza `hrtime(...)` con argumentos: la forma de diferencia, ya transcurrida. */
function isHrtimeDifference(tokens, at) {
  if (!isWord(tokens[at], 'hrtime') || !isPunct(tokens[at + 1], '(') || isPunct(tokens[at + 2], ')')) return false;

  return !isPunct(tokens[at - 1], '.') || isWord(tokens[at - 2], 'process');
}

/**
 * End (exclusive) of the clock reading that starts at `at`, or -1: a reading call, a name that holds a reading, or
 * a parenthesised one.
 * @es Fin (exclusivo) de la lectura de reloj que empieza en `at`, o -1.
 */
function readingStartingAt(tokens, at, readings) {
  const token = tokens[at];

  if (token === undefined) return -1;

  const call = readingCallLength(tokens, at);

  if (call > 0) return at + call;

  if (token.kind === 'word' && readings.has(token.text) && !isPunct(tokens[at - 1], '.') && !isPunct(tokens[at + 1], '(') && !isPunct(tokens[at + 1], '.')) return at + 1;

  if (isPunct(token, '(')) {
    const inner = readingStartingAt(tokens, at + 1, readings);

    return inner !== -1 && isPunct(tokens[inner], ')') ? inner + 1 : -1;
  }

  return -1;
}

/** Whether a clock reading ends at token `at`. @es Si una lectura de reloj termina en el token `at`. */
function readingEndingAt(tokens, at, readings) {
  if (isPunct(tokens[at], ')')) {
    const open = matchingOpen(tokens, at);

    for (let start = Math.max(0, open - 6); start <= open; start += 1) if (readingStartingAt(tokens, start, readings) === at + 1) return true;

    return false;
  }

  return readingStartingAt(tokens, at, readings) === at + 1;
}

/** Whether the `-` at `at` is a binary subtraction. @es Si el `-` en `at` es una resta binaria. */
function isSubtraction(tokens, at) {
  const before = tokens[at - 1];

  if (before === undefined) return false;
  if (before.kind === 'word') return !NOT_A_VALUE_WORD.has(before.text);

  return VALUE_KINDS.has(before.kind) || isPunct(before, ')') || isPunct(before, ']');
}

/** Whether a token range holds a clock reading call or a reading name. @es Si un rango de tokens lleva una lectura de reloj o un nombre de lectura. */
function holdsReading(tokens, from, to, readings) {
  for (let at = from; at < to; at += 1) if (readingStartingAt(tokens, at, readings) > at && !isPunct(tokens[at], '(')) return true;

  return false;
}

/** Indexes of the elapsed tokens for the names known so far. @es Índices de los tokens transcurridos para los nombres conocidos hasta ahora. */
function elapsedIndexes(tokens, { readings, elapsed }) {
  const found = new Set();

  tokens.forEach((token, at) => {
    if (token.kind === 'punct' && token.text === '-' && isSubtraction(tokens, at) && readingEndingAt(tokens, at - 1, readings) && readingStartingAt(tokens, at + 1, readings) !== -1) found.add(at);
    else if (token.kind === 'word' && token.text === 'hrtime' && isHrtimeDifference(tokens, at)) found.add(at);
    else if (token.kind === 'word' && elapsed.has(token.text) && !isPunct(tokens[at - 1], '.') && !isPunct(tokens[at + 1], '=')) found.add(at);
  });

  return found;
}

/** The comparison operators inside `[from, to)` that put an elapsed value against something. @es Los operadores de comparación de `[from, to)` que ponen un valor transcurrido frente a algo. */
export function boundComparisons(tokens, from, to, elapsedAt) {
  const hits = [];

  for (let at = from; at < to; at += 1) {
    if (tokens[at].kind !== 'punct' || !COMPARATORS.has(tokens[at].text)) continue;

    const sides = [operandSpan(tokens, at, 'left'), operandSpan(tokens, at, 'right')];

    if (sides.some((side) => [...elapsedAt].some((index) => index >= side.from && index < side.to))) hits.push(at);
  }

  return hits;
}

/**
 * Reads the whole source: the names of each kind and the elapsed token indexes.
 * @es Lee el fuente entero: los nombres de cada clase y los índices de los tokens transcurridos.
 * @returns {{ readings: Set<string>, elapsed: Set<string>, comparisons: Set<string>, elapsedAt: Set<number> }}
 */
export function analyseElapsed(tokens) {
  const names = { readings: new Set(), elapsed: new Set(), comparisons: new Set() };
  const statements = assignments(tokens).filter(({ from, to }) => !tokens.slice(from, to).some((token) => token.text === '=>' || (token.kind === 'word' && token.text === 'function')));
  let elapsedAt = elapsedIndexes(tokens, names);
  let changed = true;

  while (changed) {
    changed = false;

    for (const { name, from, to } of statements) {
      const own = new Set([...elapsedAt].filter((index) => index >= from && index < to));
      const kind =
        own.size > 0 && boundComparisons(tokens, from, to, own).length > 0 ? 'comparisons' : own.size > 0 ? 'elapsed' : holdsReading(tokens, from, to, names.readings) ? 'readings' : undefined;

      if (kind !== undefined && !names[kind].has(name)) {
        names[kind].add(name);
        changed = true;
      }
    }

    elapsedAt = elapsedIndexes(tokens, names);
  }

  return { ...names, elapsedAt };
}
