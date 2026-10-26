/**
 * The fleet kit's view of the hook protocol: the port lives in `hook-io/hook-io.mjs` and is re-exported here
 * under unchanged names and signatures; only `journal` (the kit's state adapter) is defined here, and the
 * `evaluator` is bound to it.
 *
 * @es La vista del kit del protocolo de hooks: el puerto vive en `hook-io/hook-io.mjs` y se reexporta aquí con
 * los mismos nombres y firmas; solo `journal` (el adaptador de estado del kit) se define aquí, y el
 * `evaluator` queda atado a él.
 */

import { appendFileSync, closeSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

import { evaluator as portEvaluator } from '../../hook-io/hook-io.mjs';
import { kitStateRoot } from './state.mjs';

export { advise, deny, hookMain, parsePayload, runWhenMain } from '../../hook-io/hook-io.mjs';

/**
 * Whether `file` exists, is not empty, and does not end in a line break: the last line of a writer stopped mid-line.
 * @es Si `file` existe, no está vacío y no termina en salto de línea: la última línea de un escritor cortado.
 */
function endsTorn(file) {
  let size;

  try {
    size = statSync(file).size;
  } catch {
    return false;
  }

  if (size === 0) return false;

  const last = Buffer.alloc(1);
  const fd = openSync(file, 'r');

  try {
    readSync(fd, last, 0, 1, size - 1);
  } finally {
    closeSync(fd);
  }

  return last[0] !== 0x0a;
}

/**
 * Appends one JSON line to `<kit state>/<guard>/<file>`. When the journal ends in a torn line (a writer stopped
 * mid-line), the record starts with a line break, so the torn line never swallows it. A journal that cannot be
 * written loses a record, never a decision.
 * @es Añade una línea JSON al diario de la guarda. Si el diario termina en una línea rota (un escritor cortado a
 * mitad), el registro empieza con un salto de línea, así la línea rota nunca se lo traga. Perder una línea
 * pierde un registro, nunca una decisión.
 */
export function journal(guard, file, entry, stateRoot = kitStateRoot()) {
  try {
    const directory = path.join(stateRoot, guard);
    const target = path.join(directory, file);

    mkdirSync(directory, { recursive: true });
    appendFileSync(target, `${endsTorn(target) ? '\n' : ''}${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Losing a journal line loses evidence, never a decision.
  }
}

/** The port's `evaluator`, recording every malfunction in the guard's `malfunctions.jsonl`. @es El `evaluator` del puerto, que registra cada avería en `malfunctions.jsonl`. */
export const evaluator = (guard, decide) => portEvaluator(guard, decide, (name, entry) => journal(name, 'malfunctions.jsonl', entry));
