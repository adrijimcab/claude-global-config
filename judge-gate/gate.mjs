/**
 * The decisions the gate takes out of the model, in code and in this order: input the gate cannot read is a
 * malfunction that passes; a judge that carries an `observe` step (the pending judge's turn window) runs it on
 * EVERY readable stop, before any other early return, and a throw there is a malfunction that passes; a nested run
 * passes; a continued stop (`stop_hook_active` true) passes once its turn has had `MAX_BLOCKS_PER_TURN` blocks; a
 * stop with no message passes; a judge that carries a `prefilter` (a cheap code test over the hook input) passes
 * every stop the prefilter rejects with no model call; and only then is the model asked. A judge may also carry an
 * `appendix`, a fixed text built from the hook input that follows the model's reason in a block. The model's answer
 * is read by `verdict.mjs`: a block needs a valid rubric verdict. A failed model call or an answer that is no
 * verdict is a malfunction that passes, UNLESS the judge carries a `fallback`: then it is a block whose reason is the
 * fallback's text and whose `why` says why the judge was unavailable (only a judge whose prefilter already found its
 * case, the pending judge, carries one). Any other malfunction never holds a turn; the caller records every outcome
 * with its cost and latency.
 *
 * @es Las decisiones que la compuerta le quita al modelo, en código y en este orden: una entrada ilegible es un
 * fallo de funcionamiento que pasa; un juez que trae un paso `observe` (la ventana del turno del juez de
 * pendientes) lo corre en TODA parada legible, antes de cualquier otra salida temprana, y si lanza es un fallo que
 * pasa; una corrida anidada pasa; una parada continuada (`stop_hook_active` true) pasa cuando su turno ya tuvo
 * `MAX_BLOCKS_PER_TURN` bloqueos; una parada sin mensaje pasa; un juez que trae un `prefilter` (una prueba barata
 * en código sobre la entrada) deja pasar sin llamar al modelo toda parada que el prefiltro rechaza; y solo entonces
 * se consulta al modelo. Un juez puede traer además un `appendix`, un texto fijo construido con la entrada que sigue
 * al motivo del modelo en un bloqueo. La respuesta la lee `verdict.mjs`: un bloqueo exige un veredicto de rúbrica
 * válido. Una llamada fallida o una respuesta que no es veredicto es un fallo que pasa, SALVO que el juez traiga un
 * `fallback`: entonces es un bloqueo con el texto del respaldo como motivo y un `why` que dice por qué el juez no
 * estuvo disponible (solo lo trae un juez cuyo prefiltro ya halló su caso, el de pendientes). Cualquier otro fallo
 * nunca retiene un turno; quien llama registra cada desenlace con su costo y latencia.
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
 * `pass-continued-capped`, `pass-no-message`, `pass-prefilter`, `pass`, `block` or `malfunction`; only `block` carries a
 * reason, a fallback block carries a `why` too, and `continued` is true for every outcome of a continued stop.
 * @es Decide una parada para `judge`. `ask(prompt)` devuelve `{ answer, costUsd, durationMs }` o lanza;
 * `blocksThisTurn()` devuelve cuántas veces `judge` bloqueó el turno actual de la sesión, se lee solo en una
 * parada continuada, y si lanza es un fallo que pasa. Solo `block` trae motivo, un bloqueo de respaldo trae además
 * `why`, y `continued` es true en todo desenlace de una continuada.
 */
export async function decide({ judge, raw, ask, nested, blocksThisTurn }) {
  const free = (outcome, extra = {}) => ({ outcome, costUsd: 0, durationMs: 0, ...extra });

  const payload = parsePayload(raw);

  if (payload === undefined) return free('malfunction', { why: 'the hook input is not a JSON object @es la entrada del hook no es un objeto JSON' });

  // Only a continued stop is marked, so the log can tell where a turn begins. @es Solo la continuada se marca.
  const mark = payload.stop_hook_active === true ? { continued: true } : {};

  // Every readable stop is observed before any early return, so no path leaves the judge's state behind.
  // @es Toda parada legible se observa antes de cualquier salida temprana: ningún camino deja atrás su estado.
  if (judge.observe !== undefined) {
    try {
      judge.observe(payload);
    } catch (error) {
      return free('malfunction', { ...mark, why: error.message });
    }
  }

  if (nested) return free('pass-nested');

  if (mark.continued === true) {
    try {
      if (blocksThisTurn() >= MAX_BLOCKS_PER_TURN) return free('pass-continued-capped', mark);
    } catch (error) {
      return free('malfunction', { ...mark, why: error.message });
    }
  }

  if (typeof payload.last_assistant_message !== 'string' || payload.last_assistant_message.trim() === '') return free('pass-no-message', mark);

  // A judge whose question only matters for some messages names them in code, so the others cost no model call.
  // @es Un juez cuya pregunta solo importa en algunos mensajes los nombra en código; los demás no cuestan modelo.
  if (judge.prefilter !== undefined) {
    try {
      if (!judge.prefilter(payload)) return free('pass-prefilter', mark);
    } catch (error) {
      return free('malfunction', { ...mark, why: error.message });
    }
  }

  // The judge could not answer: its fallback blocks when it has one, otherwise the stop passes as a malfunction.
  // @es El juez no pudo responder: su respaldo bloquea si lo tiene; si no, la parada pasa como fallo.
  const unavailable = (why, cost) => {
    if (judge.fallback === undefined) return { outcome: 'malfunction', ...cost, why, ...mark };

    try {
      return { outcome: 'block', ...cost, reason: judge.fallback(payload, why), why, ...mark };
    } catch (error) {
      return { outcome: 'malfunction', ...cost, why: `${why}; ${error.message}`, ...mark };
    }
  };

  let reply;

  try {
    reply = await ask(promptFor(judge, payload));
  } catch (error) {
    return unavailable(error.message, { costUsd: 0, durationMs: 0 });
  }

  const { costUsd, durationMs } = reply;
  const verdict = readVerdict(reply.answer, judge.marker);

  if (verdict.kind === 'block') {
    try {
      return { outcome: 'block', costUsd, durationMs, reason: judge.appendix === undefined ? verdict.reason : `${verdict.reason}\n\n${judge.appendix(payload)}`, ...mark };
    } catch (error) {
      return { outcome: 'malfunction', costUsd, durationMs, why: error.message, ...mark };
    }
  }

  if (verdict.kind === 'malfunction') return unavailable(verdict.why, { costUsd, durationMs });

  return { outcome: 'pass', costUsd, durationMs, ...mark };
}
