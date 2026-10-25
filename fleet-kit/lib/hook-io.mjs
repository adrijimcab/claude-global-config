/**
 * The fleet kit's view of the hook protocol: the port lives in `hook-io/hook-io.mjs` and is re-exported here
 * under unchanged names and signatures; only `journal` (the kit's state adapter) is defined here, and the
 * `evaluator` is bound to it.
 *
 * @es La vista del kit del protocolo de hooks: el puerto vive en `hook-io/hook-io.mjs` y se reexporta aquí con
 * los mismos nombres y firmas; solo `journal` (el adaptador de estado del kit) se define aquí, y el
 * `evaluator` queda atado a él.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { evaluator as portEvaluator } from '../../hook-io/hook-io.mjs';
import { kitStateRoot } from './state.mjs';

export { advise, deny, hookMain, parsePayload, runWhenMain } from '../../hook-io/hook-io.mjs';

/**
 * Appends one JSON line to `<kit state>/<guard>/<file>`. A journal that cannot be written loses a
 * record, never a decision.
 * @es Añade una línea JSON al diario de la guarda. Perder una línea pierde un registro, nunca una decisión.
 */
export function journal(guard, file, entry, stateRoot = kitStateRoot()) {
  try {
    const directory = path.join(stateRoot, guard);

    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, file), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Losing a journal line loses evidence, never a decision.
  }
}

/** The port's `evaluator`, recording every malfunction in the guard's `malfunctions.jsonl`. @es El `evaluator` del puerto, que registra cada avería en `malfunctions.jsonl`. */
export const evaluator = (guard, decide) => portEvaluator(guard, decide, (name, entry) => journal(name, 'malfunctions.jsonl', entry));
