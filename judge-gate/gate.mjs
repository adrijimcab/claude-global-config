/**
 * The decisions the gate takes out of the model, in code and in this order: a nested run passes, input the gate
 * cannot read is a malfunction that passes, a continued stop (`stop_hook_active` true) passes once its turn has
 * had `MAX_BLOCKS_PER_TURN` blocks, a stop with no message passes, and only then is the model asked. The model's answer is read by `verdict.mjs`: a block needs a
 * valid rubric verdict, and a failed model call or an answer that is no verdict is a malfunction that passes. A
 * malfunction never holds a turn; it is recorded by the caller with its cost and latency.
 *
 * @es Las decisiones que la compuerta le quita al modelo, en código y en este orden: una corrida anidada pasa,
 * una entrada ilegible es un fallo de funcionamiento que pasa, una parada continuada (`stop_hook_active` true)
 * pasa cuando su turno ya tuvo `MAX_BLOCKS_PER_TURN` bloqueos, una parada sin mensaje pasa, y solo entonces se consulta al modelo. La respuesta la lee `verdict.mjs`:
 * un bloqueo exige un veredicto de rúbrica válido, y una llamada fallida o una respuesta que no es veredicto es
 * un fallo que pasa. Un fallo nunca retiene un turno; quien llama lo registra con su costo y latencia.
 */

import { NESTED_VARIABLE } from './nesting.mjs';
import { readVerdict } from './verdict.mjs';

export { NESTED_VARIABLE };

/** The hook input as an object, or undefined. @es La entrada del hook como objeto, o undefined. */
function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The rubric of `judge` with the hook input in place of `$ARGUMENTS`. @es La rúbrica con la entrada en lugar de `$ARGUMENTS`. */
const promptFor = (judge, payload) => judge.prompt.replace('$ARGUMENTS', () => JSON.stringify(payload));

/**
 * The most blocks one judge may issue in one turn. A continued stop is judged until the turn has had this many,
 * then passes as `pass-continued-capped`, so a rewrite is checked once and no loop is possible.
 * @es El máximo de bloqueos de un juez en un turno. Una parada continuada se juzga hasta que el turno lleve
 * tantos; después pasa como `pass-continued-capped`: el reescrito se revisa una vez y no hay bucle posible.
 */
export const MAX_BLOCKS_PER_TURN = 2;

/**
 * Decides one Stop for `judge`. `ask(prompt)` resolves `{ answer, costUsd, durationMs }` or throws;
 * `blocksThisTurn()` returns how many times `judge` blocked this session's current turn, read only for a continued
 * stop, and a throw there is a malfunction that passes. Returns
 * `{ outcome, costUsd, durationMs, reason?, why?, continued? }` with outcome `pass-nested`,
 * `pass-continued-capped`, `pass-no-message`, `pass`, `block` or `malfunction`; only `block` carries a reason,
 * and `continued` is true for every outcome of a continued stop.
 * @es Decide una parada para `judge`. `ask(prompt)` devuelve `{ answer, costUsd, durationMs }` o lanza;
 * `blocksThisTurn()` devuelve cuántas veces `judge` bloqueó el turno actual de la sesión, se lee solo en una
 * parada continuada, y si lanza es un fallo que pasa. `continued` es true en todo desenlace de una continuada.
 */
export async function decide({ judge, raw, ask, nested, blocksThisTurn }) {
  const free = (outcome, extra = {}) => ({ outcome, costUsd: 0, durationMs: 0, ...extra });

  if (nested) return free('pass-nested');

  const payload = parsePayload(raw);

  if (payload === undefined) return free('malfunction', { why: 'the hook input is not a JSON object @es la entrada del hook no es un objeto JSON' });

  // Only a continued stop is marked, so the log can tell where a turn begins. @es Solo la continuada se marca.
  const mark = payload.stop_hook_active === true ? { continued: true } : {};

  if (mark.continued === true) {
    try {
      if (blocksThisTurn() >= MAX_BLOCKS_PER_TURN) return free('pass-continued-capped', mark);
    } catch (error) {
      return free('malfunction', { ...mark, why: error.message });
    }
  }

  if (typeof payload.last_assistant_message !== 'string' || payload.last_assistant_message.trim() === '') return free('pass-no-message', mark);

  let reply;

  try {
    reply = await ask(promptFor(judge, payload));
  } catch (error) {
    return free('malfunction', { ...mark, why: error.message });
  }

  const { costUsd, durationMs } = reply;
  const verdict = readVerdict(reply.answer, judge.marker);

  if (verdict.kind === 'block') return { outcome: 'block', costUsd, durationMs, reason: verdict.reason, ...mark };
  if (verdict.kind === 'malfunction') return { outcome: 'malfunction', costUsd, durationMs, why: verdict.why, ...mark };

  return { outcome: 'pass', costUsd, durationMs, ...mark };
}
