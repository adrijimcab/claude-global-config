/**
 * Finds the fixed sleeps of a selftest: an `await <name>(<number literal>)` that is not inside a loop. A wait for
 * something to happen is a condition polled up to a deadline (a loop); a bare sleep followed by a single read loses
 * the race on a loaded machine (2026-11-11 reaper.selftest, 2026-11-16 kill-tree.selftest, red only under the full
 * runner's load). A window that proves something did NOT happen is a timer port the proof fires itself
 * (process-control/kill-tree.mjs `startTimer`), so no legitimate fixed sleep is left for this rule to allow.
 * @es Encuentra las esperas fijas de un selftest: un `await <nombre>(<número literal>)` que no está dentro de un bucle.
 * Esperar a que algo pase es una condición sondeada hasta un plazo (un bucle); una pausa suelta seguida de una sola
 * lectura pierde la carrera en una máquina cargada (reaper.selftest y kill-tree.selftest, rojos solo bajo la carga del
 * runner completo). Una ventana que prueba que algo NO pasó es un puerto de timer que la prueba dispara ella misma
 * (`startTimer` de process-control/kill-tree.mjs), así que no queda ninguna espera fija legítima que esta regla deba permitir.
 */

import { tokenize } from './lexer.mjs';

/** The keywords that open a loop. @es Las palabras clave que abren un bucle. */
const LOOP_WORDS = new Set(['for', 'while']);

/** The opener of each closer. @es El de apertura de cada cierre. */
const OPENER = { ')': '(', '}': '{', ']': '[' };

/**
 * The index of the token that opens the group closed at `close` (walking backwards), or -1.
 * @es El índice del token que abre el grupo cerrado en `close` (hacia atrás), o -1.
 */
function matchingOpen(tokens, close) {
  const want = OPENER[tokens[close].text];
  let depth = 0;

  for (let at = close; at >= 0; at -= 1) {
    const text = tokens[at].kind === 'punct' ? tokens[at].text : '';

    if (text === tokens[close].text) depth += 1;
    else if (text === want) {
      depth -= 1;

      if (depth === 0) return at;
    }
  }

  return -1;
}

/** Whether the parenthesis at `open` holds the header of a for or while loop. @es Si el paréntesis en `open` es el encabezado de un for o un while. */
const isLoopHeader = (tokens, open) => tokens[open - 1]?.kind === 'word' && LOOP_WORDS.has(tokens[open - 1].text);

/**
 * Whether the statement starting at `at` is the body of a loop: a braceless body right after a loop header, or a
 * block whose brace follows a loop header or `do`, at any depth of enclosing blocks.
 * @es Si la sentencia que empieza en `at` es el cuerpo de un bucle: un cuerpo sin llaves tras el encabezado, o un bloque
 * cuya llave sigue a un encabezado de bucle o a `do`, a cualquier profundidad.
 */
function insideLoop(tokens, at) {
  const before = tokens[at - 1];

  if (before?.text === ')' && isLoopHeader(tokens, matchingOpen(tokens, at - 1))) return true;

  let depth = 0;

  for (let index = at - 1; index >= 0; index -= 1) {
    const token = tokens[index];

    if (token.kind !== 'punct') continue;
    if (token.text === ')' || token.text === '}' || token.text === ']') depth += 1;
    else if (token.text === '(' || token.text === '[' || token.text === '{') {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      if (token.text === '(' && isLoopHeader(tokens, index)) return true;
      if (token.text === '{') {
        const opener = tokens[index - 1];

        if (opener?.text === 'do') return true;
        if (opener?.text === ')' && isLoopHeader(tokens, matchingOpen(tokens, index - 1))) return true;
      }
    }
  }

  return false;
}

/** The words that make a function a sleep when its definition uses them. @es Las palabras que hacen de una función una espera si su definición las usa. */
const TIMER_WORDS = new Set(['setTimeout']);

/**
 * The index just past the definition that starts at `from`: the end of its statement (a `;` or a line break at depth 0
 * after an expression), or the brace that closes a function body.
 * @es El índice justo después de la definición que empieza en `from`: el fin de su sentencia o la llave que cierra un cuerpo.
 */
function definitionEnd(tokens, from) {
  let depth = 0;

  for (let at = from; at < tokens.length; at += 1) {
    const text = tokens[at].kind === 'punct' ? tokens[at].text : '';

    if (text === '(' || text === '{' || text === '[') depth += 1;
    else if (text === ')' || text === '}' || text === ']') {
      depth -= 1;

      if (depth === 0 && text === '}' && tokens[at + 1]?.text !== ')') return at + 1;
    } else if (depth === 0 && (text === ';' || text === ',')) return at;
    else if (depth === 0 && at > from && tokens[at].line > tokens[at - 1].line && tokens[at - 1].text !== '=' && tokens[at - 1].text !== '=>') return at;
  }

  return tokens.length;
}

/**
 * The names this source defines or imports as a sleep: a function or arrow whose definition calls setTimeout, and a
 * `setTimeout as <name>` import (node:timers/promises). A function that merely takes a number is no sleep.
 * @es Los nombres que este fuente define o importa como espera: una función cuya definición llama a setTimeout, y un
 * import `setTimeout as <nombre>` (node:timers/promises). Una función que solo recibe un número no es una espera.
 */
export function sleepHelpers(tokens) {
  const names = new Set();

  tokens.forEach((token, at) => {
    if (token.kind !== 'word') return;

    if (token.text === 'as' && TIMER_WORDS.has(tokens[at - 1]?.text) && tokens[at + 1]?.kind === 'word') names.add(tokens[at + 1].text);

    const declared = tokens[at - 1]?.text === 'function' || (['const', 'let', 'var'].includes(tokens[at - 1]?.text) && tokens[at + 1]?.text === '=');

    if (!declared) return;

    const end = definitionEnd(tokens, at + 1);

    if (tokens.slice(at + 1, end).some((part) => part.kind === 'word' && TIMER_WORDS.has(part.text))) names.add(token.text);
  });

  return names;
}

/**
 * Lines of the fixed sleeps of a source, ascending and unique.
 * @param {string} source
 * @returns {number[]}
 * @es Las líneas de las esperas fijas de un fuente, ascendentes y únicas.
 */
export function fixedSleepLines(source) {
  const tokens = tokenize(source);
  const helpers = sleepHelpers(tokens);
  const lines = new Set();

  for (let at = 0; at + 4 < tokens.length; at += 1) {
    const [awaitWord, name, open, value, close] = tokens.slice(at, at + 5);
    const isSleep = awaitWord.kind === 'word' && awaitWord.text === 'await' && helpers.has(name.text) && open.text === '(' && value.kind === 'number' && close.text === ')';

    if (isSleep && tokens[at - 1]?.text !== '.' && !insideLoop(tokens, at)) lines.add(awaitWord.line);
  }

  return [...lines].sort((a, b) => a - b);
}
