/**
 * Del payload REAL de Stop al veredicto: junta los textos del turno y se los pasa a `decide()`.
 *
 * Forma del payload, CAPTURADA del harness real (claude 2.1.283, `claude -p` con un hook de captura,
 * 2026-09-28; copia en `fixtures/stop-payload.captured.json`): `session_id`, `transcript_path`, `cwd`,
 * `prompt_id`, `permission_mode`, `effort`, `hook_event_name: 'Stop'`, `stop_hook_active`,
 * `last_assistant_message`, `background_tasks`, `session_crons`.
 *
 * Es la pieza que el despachador por evento puede cargar en proceso: no toca stdin, stdout ni
 * `process.exit`. Los errores de lectura del transcript NO se tragan acá: se devuelven en `problems`
 * para que quien llame los registre.
 */

import { decide } from './decide.mjs';
import { readTurnTexts } from './turn.mjs';

/** El único evento que este guard juzga: la respuesta del orquestador al dueño. */
export const GUARDED_EVENT = 'Stop';

/**
 * Suma el `last_assistant_message` del payload si el transcript todavía no lo tiene escrito: el
 * guard no depende de que el harness haya volcado el último mensaje antes de disparar el hook.
 */
function withLastMessage(texts, lastMessage) {
  if (typeof lastMessage !== 'string' || lastMessage.trim().length === 0) return texts;
  if (texts.join('\n').includes(lastMessage.trim())) return texts;

  return [...texts, lastMessage];
}

/**
 * @param payload El JSON de Stop tal como llega.
 * @param readTurn Inyectable para pruebas; por defecto lee el transcript real.
 * @returns `{ verdict, problems }`: `verdict` es el de `decide()`; `problems`, lo que impidió leer.
 */
export function evaluate(payload, readTurn = readTurnTexts) {
  const problems = [];

  if (payload === null || typeof payload !== 'object') return { verdict: { block: false }, problems: ['payload no es un objeto'] };
  // Un payload SIN evento es una forma que no se midió: se deja pasar pero queda registrado, para que
  // un cambio del harness no convierta al guard en uno que nunca dispara sin que nadie se entere.
  if (payload.hook_event_name === undefined) return { verdict: { block: false }, problems: ['el payload no trae hook_event_name'] };
  if (payload.hook_event_name !== GUARDED_EVENT) return { verdict: { block: false }, problems };
  if (payload.stop_hook_active === true) return { verdict: { block: false }, problems };

  let texts = [];

  if (typeof payload.transcript_path === 'string' && payload.transcript_path.length > 0) {
    try {
      const turn = readTurn(payload.transcript_path);

      texts = turn.texts;

      if (!turn.complete) problems.push('no se encontró el comienzo del turno dentro de la ventana leída; se juzga lo leído');
    } catch (error) {
      problems.push(`no se pudo leer el transcript: ${error?.message ?? error}`);
    }
  } else {
    problems.push('el payload no trae transcript_path; se juzga solo last_assistant_message');
  }

  return { verdict: decide({ texts: withLastMessage(texts, payload.last_assistant_message), stopHookActive: false }), problems };
}
