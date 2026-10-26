#!/usr/bin/env node
/**
 * Stop command hook: `node run.mjs <premise|voice|pending>`. Reads the hook input on stdin, loads only the named
 * judge (`judges.mjs`), lets `gate.mjs` decide, records the outcome, and prints `{"decision":"block","reason":...}`
 * only for a block. It never holds a turn by its own fault: an unknown judge, a judge whose modules cannot load, an
 * unreadable input or a log that cannot be written all exit 0 and print nothing for that fault.
 *
 * THE CAP NEEDS THE LOG. The per-turn cap (`MAX_BLOCKS_PER_TURN`) counts the blocks the outcome log holds. When the
 * log cannot be read, a continued stop is a malfunction that passes (`gate.mjs`); when the outcome of a continued
 * stop cannot be written, its block is not printed, because an unrecorded block would leave the next count short
 * and the turn could be blocked without end. So with a broken log a continued stop never blocks again.
 *
 * WHY A COMMAND HOOK. code.claude.com/docs/en/hooks (read 2026-10-12): `if` is evaluated only on tool events, and
 * on any other event a hook with `if` set never runs; a `prompt` hook has no other condition field. So the only
 * way to decide `stop_hook_active` in code is a `command` hook, which reads it from stdin and asks the model
 * itself only when it must.
 *
 * @es Hook de comando de Stop: `node run.mjs <premise|voice|pending>`. Lee la entrada del hook por stdin, carga solo
 * el juez nombrado, deja que `gate.mjs` decida, registra el desenlace e imprime `{"decision":"block","reason":...}`
 * solo ante un bloqueo. Nunca retiene un turno por culpa propia: un juez desconocido, un juez cuyos módulos no
 * cargan, una entrada ilegible o un registro que no se puede escribir salen con 0 sin imprimir por ese fallo. EL
 * TOPE NECESITA EL REGISTRO: si no se puede leer, una parada continuada es un fallo que pasa; si no se puede
 * escribir el desenlace de una continuada, su bloqueo no se imprime, porque un bloqueo sin registrar dejaría corta
 * la cuenta siguiente y el turno podría bloquearse sin fin. POR QUÉ UN HOOK DE COMANDO: según las docs, `if` solo se
 * evalúa en eventos de herramienta y un hook `prompt` no tiene otra condición; la única forma de decidir
 * `stop_hook_active` en código es un hook `command`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decide } from './gate.mjs';
import { importJudgeModule, JUDGE_NAMES, loadJudge } from './judges.mjs';
import { askModel } from './model.mjs';
import { isNested } from './nesting.mjs';
import { blocksThisTurn, recordOutcome } from './outcome-log.mjs';

/** The session id of a raw hook input, '' when it has none. @es El id de sesión de una entrada, '' si no lo trae. */
function sessionOf(raw) {
  try {
    const id = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)?.session_id;

    return typeof id === 'string' ? id : '';
  } catch {
    return '';
  }
}

/** The outcome of a judge that could not be loaded. @es El desenlace de un juez que no se pudo cargar. */
const notLoaded = (judgeName, error) => ({ outcome: 'malfunction', costUsd: 0, durationMs: 0, why: `the ${judgeName} judge could not be loaded: ${error.message} @es no se pudo cargar el juez ${judgeName}: ${error.message}` });

/**
 * Runs the gate for `judgeName` over `raw`; returns the text to print ('' for none: a pass, and a shadow block too).
 * `model`, `importModule`, `modes`, `record` and `countBlocks` are the model call, the judge module import, the modes
 * record, the outcome writer and the turn count (test seams).
 * @es Corre la compuerta; devuelve el texto a imprimir ('' si nada: un pase, y también un bloqueo en sombra).
 * `model`, `importModule`, `modes`, `record` y `countBlocks` son la llamada al modelo, la importación de los módulos
 * del juez, el registro de modos, el escritor de desenlaces y la cuenta del turno.
 */
export async function run(judgeName, raw, { model = askModel, importModule = importJudgeModule, modes, record = recordOutcome, countBlocks = blocksThisTurn } = {}) {
  if (!JUDGE_NAMES.includes(judgeName)) {
    console.error(`Unknown judge "${judgeName}" (known: ${JUDGE_NAMES.join(', ')}); the gate passes. @es Juez desconocido "${judgeName}" (conocidos: ${JUDGE_NAMES.join(', ')}); la compuerta deja pasar.`);

    return '';
  }

  let judge;
  let outcome;

  try {
    judge = await loadJudge(judgeName, { importModule, modes });
  } catch (error) {
    outcome = notLoaded(judgeName, error);
  }

  if (outcome === undefined) outcome = await decide({ judge, raw, nested: isNested(), blocksThisTurn: () => countBlocks(judgeName, sessionOf(raw)), ask: (prompt) => model(prompt, { timeoutMs: judge.askTimeoutMs }) });

  let recorded = true;

  try {
    record(judgeName, sessionOf(raw), outcome);
  } catch (error) {
    recorded = false;
    console.error(`The outcome could not be recorded: ${error.message} @es No se pudo registrar el desenlace: ${error.message}`);
  }

  if (outcome.outcome !== 'block') return '';

  if (!recorded && outcome.continued === true) {
    console.error('A continued stop is not blocked when its block cannot be recorded: the per-turn cap could not hold. @es Una parada continuada no se bloquea si su bloqueo no se puede registrar: el tope por turno no se sostendría.');

    return '';
  }

  return JSON.stringify({ decision: 'block', reason: outcome.reason });
}

async function main() {
  const chunks = [];

  for await (const chunk of process.stdin) chunks.push(chunk);

  const printed = await run(process.argv[2], Buffer.concat(chunks).toString('utf8'));

  if (printed !== '') process.stdout.write(printed);
  process.exit(0);
}

// Only as the main process; imported it must not read stdin. @es Solo como proceso principal.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) await main();
