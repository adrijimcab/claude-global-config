/**
 * The decisions the gate takes out of the model, in code and in this order: a nested run passes, input the gate
 * cannot read is a malfunction that passes, a continued stop (`stop_hook_active` true) passes, a stop with no
 * message passes, and only then is the model asked. The model's answer is read by `verdict.mjs`: a block needs a
 * valid rubric verdict, and a failed model call or an answer that is no verdict is a malfunction that passes. A
 * malfunction never holds a turn; it is recorded by the caller with its cost and latency.
 *
 * @es Las decisiones que la compuerta le quita al modelo, en código y en este orden: una corrida anidada pasa,
 * una entrada ilegible es un fallo de funcionamiento que pasa, una parada continuada (`stop_hook_active` true)
 * pasa, una parada sin mensaje pasa, y solo entonces se consulta al modelo. La respuesta la lee `verdict.mjs`:
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
 * Decides one Stop for `judge`. `ask(prompt)` resolves `{ answer, costUsd, durationMs }` or throws.
 * `{ outcome, costUsd, durationMs, reason?, why? }` with outcome `pass-nested`, `pass-continued`,
 * `pass-no-message`, `pass`, `block` or `malfunction`; only `block` carries a reason.
 * @es Decide una parada para `judge`. `ask(prompt)` devuelve `{ answer, costUsd, durationMs }` o lanza.
 */
export async function decide({ judge, raw, ask, nested }) {
  const free = (outcome, extra = {}) => ({ outcome, costUsd: 0, durationMs: 0, ...extra });

  if (nested) return free('pass-nested');

  const payload = parsePayload(raw);

  if (payload === undefined) return free('malfunction', { why: 'the hook input is not a JSON object @es la entrada del hook no es un objeto JSON' });
  if (payload.stop_hook_active === true) return free('pass-continued');
  if (typeof payload.last_assistant_message !== 'string' || payload.last_assistant_message.trim() === '') return free('pass-no-message');

  let reply;

  try {
    reply = await ask(promptFor(judge, payload));
  } catch (error) {
    return free('malfunction', { why: error.message });
  }

  const { costUsd, durationMs } = reply;
  const verdict = readVerdict(reply.answer, judge.marker);

  if (verdict.kind === 'block') return { outcome: 'block', costUsd, durationMs, reason: verdict.reason };
  if (verdict.kind === 'malfunction') return { outcome: 'malfunction', costUsd, durationMs, why: verdict.why };

  return { outcome: 'pass', costUsd, durationMs };
}
