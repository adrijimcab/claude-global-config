/**
 * The assertion calls of a selftest and what each one puts against a wall-time bound. An assertion call is a call
 * of `check`, `expect`, `assert`, `ok`, `equal` or one of the `assert` comparisons (`assert.strictEqual(...)`); its
 * arguments are the proof. Inside them, a comparison is a FINDING when one side holds an elapsed wall time
 * (`elapsed-values.mjs`), directly or through a name, and so is the use of a name that already holds the verdict of
 * such a comparison. An elapsed value that is only REPORTED (a template literal naming how long it took) is not
 * compared and is not a finding, and neither is a deadline that bounds waiting outside an assertion.
 *
 * @es Las llamadas de aserción de un selftest y lo que cada una pone frente a una cota de tiempo de pared. Una
 * llamada de aserción es una llamada a `check`, `expect`, `assert`, `ok`, `equal` o una comparación de `assert`; sus
 * argumentos son la prueba. Dentro, una comparación es un HALLAZGO cuando un lado lleva un tiempo de pared
 * transcurrido, directo o por un nombre, y también lo es el uso de un nombre que ya guarda el veredicto de una
 * comparación así. Un valor transcurrido que solo se INFORMA (una plantilla que dice cuánto tardó) no se compara y
 * no es hallazgo, ni lo es un plazo que acota una espera fuera de una aserción.
 */

import { analyseElapsed, boundComparisons } from './elapsed-values.mjs';
import { tokenize } from './lexer.mjs';
import { matchingClose } from './token-walk.mjs';

/** Names whose call is an assertion. @es Nombres cuya llamada es una aserción. */
export const ASSERTION_NAMES = new Set(['check', 'expect', 'assert', 'ok', 'equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'notEqual', 'notStrictEqual']);

/** Argument ranges `[from, to)` of every assertion call. @es Rangos `[from, to)` de los argumentos de cada llamada de aserción. */
function assertionArguments(tokens) {
  const found = [];

  tokens.forEach((token, at) => {
    if (!ASSERTION_NAMES.has(token.text) || tokens[at + 1]?.text !== '(') return;

    const close = matchingClose(tokens, at + 1);

    found.push({ from: at + 2, to: close === -1 ? tokens.length : close });
  });

  return found;
}

/**
 * Lines of the assertions of a source that compare an elapsed wall time against a bound, ascending and unique.
 * @es Líneas de las aserciones de un fuente que comparan un tiempo de pared transcurrido con una cota, ascendentes y sin repetir.
 * @param {string} source
 * @returns {number[]}
 */
export function elapsedAssertionLines(source) {
  const tokens = tokenize(source);
  const { comparisons, elapsedAt } = analyseElapsed(tokens);
  const lines = new Set();

  for (const { from, to } of assertionArguments(tokens)) {
    for (const at of boundComparisons(tokens, from, to, elapsedAt)) lines.add(tokens[at].line);

    for (let at = from; at < to; at += 1) {
      const isVerdictName = tokens[at].kind === 'word' && comparisons.has(tokens[at].text) && tokens[at - 1]?.text !== '.';

      if (isVerdictName) lines.add(tokens[at].line);
    }
  }

  return [...lines].sort((a, b) => a - b);
}
