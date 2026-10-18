/**
 * A minimal JavaScript lexer with ONE responsibility: yield the string and template-literal segments of a
 * source text, each with the line it starts on, while skipping comments and regular-expression literals
 * (where a backslash escape is valid and must never be judged).
 *
 * Templates nest through `${ ... }`: a stack of brace depths tells the `}` that closes an expression from
 * one that closes a block inside it. Regex versus division is decided by the previous significant token, as
 * every tokenizer does: after `)`, `]`, `}`, an identifier, a number or a string a `/` is division, otherwise
 * it opens a regex; keywords that precede an expression (`return`, `typeof`, ...) count as operators.
 * Inside a regex a `/` within a character class `[...]` does not end it.
 *
 * Deliberately NOT a parser: it is accurate for the question "is this backslash inside a string or a
 * template?", and a `}` that closes a block followed by a regex is the one known blind spot.
 *
 * @es Un lexer mínimo de JavaScript con UNA responsabilidad: entregar los segmentos de cadena y de plantilla
 * de un texto fuente, cada uno con su línea de inicio, saltando comentarios y literales de expresión regular
 * (donde un escape con barra invertida es válido y nunca se juzga). Las plantillas anidan con `${ ... }`:
 * una pila de profundidades de llaves distingue la `}` que cierra una expresión de la que cierra un bloque.
 * Regex o división se decide por el token significativo previo; las palabras clave que preceden a una
 * expresión cuentan como operadores. No es un parser: su único punto ciego conocido es una `}` que cierra un
 * bloque seguida de una regex.
 */

const BS = String.fromCharCode(92);

/** Keywords after which a `/` starts a regex. @es Palabras clave tras las que `/` abre una regex. */
const OPERATOR_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

const isWordStart = (character) => /[A-Za-z_$]/.test(character) || character.charCodeAt(0) > 127;
const isWordPart = (character) => /[A-Za-z0-9_$]/.test(character) || character.charCodeAt(0) > 127;
const countNewlines = (text) => text.split('\n').length - 1;

/**
 * @param {string} source
 * @returns {Generator<{ kind: 'string' | 'template', text: string, line: number, tagged: boolean }>}
 */
export function* literalSegments(source) {
  const state = { at: 0, line: 1 };
  const openExpressions = [];
  let previous = 'operator';

  while (state.at < source.length) {
    const character = source[state.at];
    const next = source[state.at + 1];

    if (character === '\n') {
      state.line += 1;
      state.at += 1;
    } else if (character === ' ' || character === '\t' || character === '\r') {
      state.at += 1;
    } else if (character === '/' && next === '/') {
      skipLine(source, state);
    } else if (character === '/' && next === '*') {
      skipBlockComment(source, state);
    } else if (character === '/') {
      if (previous === 'value') {
        state.at += 1;
        previous = 'operator';
      } else {
        skipRegex(source, state);
        previous = 'value';
      }
    } else if (character === "'" || character === '"') {
      yield readQuoted(source, state, character);
      previous = 'value';
    } else if (character === '`') {
      const tagged = previous === 'value';

      state.at += 1;
      const closed = yield* readTemplate(source, state, openExpressions, tagged);

      previous = closed ? 'value' : 'operator';
    } else if (isWordStart(character)) {
      const word = readWhile(source, state, isWordPart);

      previous = OPERATOR_KEYWORDS.has(word) ? 'operator' : 'value';
    } else if (/[0-9]/.test(character)) {
      readWhile(source, state, (digit) => /[0-9A-Za-z_.]/.test(digit));
      previous = 'value';
    } else if (character === '}' && openExpressions.length > 0 && openExpressions.at(-1) === 0) {
      openExpressions.pop();
      state.at += 1;
      const closed = yield* readTemplate(source, state, openExpressions, false);

      previous = closed ? 'value' : 'operator';
    } else {
      if (openExpressions.length > 0 && character === '{') openExpressions[openExpressions.length - 1] += 1;
      if (openExpressions.length > 0 && character === '}') openExpressions[openExpressions.length - 1] -= 1;

      previous = character === ')' || character === ']' || character === '}' ? 'value' : 'operator';
      state.at += 1;
    }
  }
}

/** Advances while the predicate holds and returns what was read. @es Avanza mientras se cumpla el predicado. */
function readWhile(source, state, predicate) {
  const start = state.at;

  while (state.at < source.length && predicate(source[state.at])) state.at += 1;

  return source.slice(start, state.at);
}

/** Skips to the end of the line, leaving the newline for the caller to count. @es Salta al fin de línea. */
function skipLine(source, state) {
  while (state.at < source.length && source[state.at] !== '\n') state.at += 1;
}

function skipBlockComment(source, state) {
  const end = source.indexOf('*/', state.at + 2);
  const stop = end === -1 ? source.length : end + 2;

  state.line += countNewlines(source.slice(state.at, stop));
  state.at = stop;
}

/** Skips a regex literal, its class `[...]` and its flags. @es Salta una regex, su clase y sus banderas. */
function skipRegex(source, state) {
  let inClass = false;

  state.at += 1;

  while (state.at < source.length) {
    const character = source[state.at];

    if (character === BS) {
      state.at += 2;
    } else if (character === '\n') {
      return;
    } else {
      state.at += 1;

      if (character === '[') inClass = true;
      else if (character === ']') inClass = false;
      else if (character === '/' && !inClass) break;
    }
  }

  readWhile(source, state, isWordPart);
}

/** Reads a quoted string; an unterminated one ends at its line. @es Lee una cadena; sin cerrar acaba en su línea. */
function readQuoted(source, state, quote) {
  const line = state.line;
  const start = state.at + 1;
  let at = start;

  while (at < source.length && source[at] !== quote && source[at] !== '\n') at += source[at] !== BS ? 1 : source.startsWith('\r\n', at + 1) ? 3 : 2;

  const text = source.slice(start, Math.min(at, source.length));

  state.line += countNewlines(source.slice(state.at, Math.min(at, source.length)));
  state.at = source[at] === quote ? at + 1 : Math.min(at, source.length);

  return { kind: 'string', text, line, tagged: false };
}

/**
 * Reads template text up to the closing backtick or the next `${`, yielding each chunk. A `${` pushes a new
 * expression depth for the main loop to track.
 * @returns {Generator<object, boolean>} true when the template was closed, false when an expression opened.
 */
function* readTemplate(source, state, openExpressions, tagged) {
  const line = state.line;
  const start = state.at;

  while (state.at < source.length) {
    const character = source[state.at];

    if (character === BS) {
      state.at += 2;
    } else if (character === '`' || (character === '$' && source[state.at + 1] === '{')) {
      const text = source.slice(start, state.at);

      yield { kind: 'template', text, line, tagged };
      state.line += countNewlines(text);

      if (character === '`') {
        state.at += 1;

        return true;
      }

      openExpressions.push(0);
      state.at += 2;

      return false;
    } else {
      state.at += 1;
    }
  }

  // Unterminated template: the text up to the end of the file is still judged. @es Plantilla sin cerrar.
  yield { kind: 'template', text: source.slice(start), line, tagged };
  state.line += countNewlines(source.slice(start));

  return true;
}
