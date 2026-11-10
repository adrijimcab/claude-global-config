/**
 * Structure over a token list: where a bracket closes, which expression a statement assigns to a name, and how far
 * the operand of an operator reaches. It answers shape questions only; what the shapes MEAN (a clock, a bound) is
 * decided by the files that use it.
 *
 * @es Estructura sobre una lista de tokens: dónde cierra un paréntesis, qué expresión asigna una sentencia a un
 * nombre y hasta dónde llega el operando de un operador. Responde solo preguntas de forma; lo que las formas
 * SIGNIFICAN (un reloj, una cota) lo deciden los ficheros que lo usan.
 */

const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);

/** Tokens that end an operand of a comparison. @es Tokens que cierran un operando de una comparación. */
const OPERAND_BOUNDARY = new Set([',', ';', '&&', '||', '??', '?', ':', '=', '=>']);

const isPunct = (token, text) => token?.kind === 'punct' && token.text === text;

/**
 * Index of the bracket that closes the one at `open`, or -1.
 * @es Índice del paréntesis que cierra el de `open`, o -1.
 */
export function matchingClose(tokens, open) {
  let depth = 0;

  for (let at = open; at < tokens.length; at += 1) {
    if (tokens[at].kind !== 'punct') continue;
    if (OPEN.has(tokens[at].text)) depth += 1;
    else if (CLOSE.has(tokens[at].text)) {
      depth -= 1;

      if (depth === 0) return at;
    }
  }

  return -1;
}

/**
 * Index of the bracket that opens the one at `close`, or -1.
 * @es Índice del paréntesis que abre el de `close`, o -1.
 */
export function matchingOpen(tokens, close) {
  let depth = 0;

  for (let at = close; at >= 0; at -= 1) {
    if (tokens[at].kind !== 'punct') continue;
    if (CLOSE.has(tokens[at].text)) depth += 1;
    else if (OPEN.has(tokens[at].text)) {
      depth -= 1;

      if (depth === 0) return at;
    }
  }

  return -1;
}

/**
 * Where the expression assigned to a name ends: at the `;` or `,` of its own level, or at the bracket that closes
 * the enclosing one. `from` is the first token of the expression.
 * @es Dónde acaba la expresión asignada a un nombre: en el `;` o `,` de su nivel, o en el paréntesis que cierra el
 * que la contiene. `from` es el primer token de la expresión.
 */
function expressionEnd(tokens, from) {
  let depth = 0;

  for (let at = from; at < tokens.length; at += 1) {
    const token = tokens[at];

    if (token.kind !== 'punct') continue;
    if (OPEN.has(token.text)) depth += 1;
    else if (CLOSE.has(token.text)) {
      if (depth === 0) return at;

      depth -= 1;
    } else if (depth === 0 && (token.text === ';' || token.text === ',')) return at;
  }

  return tokens.length;
}

/**
 * Every `name = expression` of the source (a declaration or an assignment to a plain name, never to a property),
 * with the token range `[from, to)` of the expression.
 * @es Cada `nombre = expresión` del fuente (una declaración o una asignación a un nombre simple, nunca a una
 * propiedad), con el rango de tokens `[from, to)` de la expresión.
 * @returns {{ name: string, from: number, to: number }[]}
 */
export function assignments(tokens) {
  const found = [];

  for (let at = 0; at + 1 < tokens.length; at += 1) {
    if (tokens[at].kind !== 'word' || !isPunct(tokens[at + 1], '=') || isPunct(tokens[at - 1], '.')) continue;

    found.push({ name: tokens[at].text, from: at + 2, to: expressionEnd(tokens, at + 2) });
  }

  return found;
}

/**
 * The token range `[from, to)` of the operand on one side of the operator at `operator`: it reaches outward until
 * a token that separates operands at the same level, or a bracket that is not its own.
 * @es El rango de tokens `[from, to)` del operando de un lado del operador en `operator`: llega hacia fuera hasta
 * un token que separa operandos del mismo nivel o un paréntesis que no es suyo.
 * @param {'left' | 'right'} side
 */
export function operandSpan(tokens, operator, side) {
  const step = side === 'left' ? -1 : 1;
  let depth = 0;
  let at = operator + step;

  while (at >= 0 && at < tokens.length) {
    const token = tokens[at];

    if (token.kind === 'punct') {
      const opens = side === 'left' ? CLOSE.has(token.text) : OPEN.has(token.text);
      const closes = side === 'left' ? OPEN.has(token.text) : CLOSE.has(token.text);

      if (opens) depth += 1;
      else if (closes) {
        if (depth === 0) break;

        depth -= 1;
      } else if (depth === 0 && OPERAND_BOUNDARY.has(token.text)) break;
    }

    at += step;
  }

  return side === 'left' ? { from: at + 1, to: operator } : { from: operator + 1, to: at };
}
