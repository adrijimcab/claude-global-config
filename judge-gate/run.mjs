#!/usr/bin/env node
/**
 * Stop command hook: `node run.mjs <premise|voice>`. Reads the hook input on stdin, lets `gate.mjs` decide,
 * records the outcome, and prints `{"decision":"block","reason":...}` only for a valid block. It never holds a
 * turn by its own fault: an unknown judge, an unreadable input, a failed model call or a log that cannot be
 * written all exit 0 and print nothing.
 *
 * WHY A COMMAND HOOK. code.claude.com/docs/en/hooks (read 2026-10-12): `if` is evaluated only on tool events, and
 * on any other event a hook with `if` set never runs; a `prompt` hook has no other condition field. So the only
 * way to decide `stop_hook_active` in code is a `command` hook, which reads it from stdin and asks the model
 * itself only when it must.
 *
 * @es Hook de comando de Stop: `node run.mjs <premise|voice>`. Lee la entrada del hook por stdin, deja que
 * `gate.mjs` decida, registra el desenlace e imprime `{"decision":"block","reason":...}` solo ante un bloqueo
 * válido. Nunca retiene un turno por culpa propia: un juez desconocido, una entrada ilegible, una llamada
 * fallida o un registro que no se puede escribir salen con 0 sin imprimir. POR QUÉ UN HOOK DE COMANDO: según
 * las docs, `if` solo se evalúa en eventos de herramienta y un hook `prompt` no tiene otra condición; la única
 * forma de decidir `stop_hook_active` en código es un hook `command`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decide } from './gate.mjs';
import { JUDGES } from './judges.mjs';
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

/**
 * Runs the gate for `judgeName` over `raw`; returns the text to print ('' for none). `model` is the model call (a test seam).
 * @es Corre la compuerta; devuelve el texto a imprimir. `model` es la llamada al modelo (punto de inyección de pruebas).
 */
export async function run(judgeName, raw, { model = askModel } = {}) {
  const judge = JUDGES[judgeName];

  if (judge === undefined) {
    console.error(`Unknown judge "${judgeName}"; the gate passes. @es Juez desconocido "${judgeName}"; la compuerta deja pasar.`);

    return '';
  }

  const outcome = await decide({ judge, raw, nested: isNested(), blocksThisTurn: () => blocksThisTurn(judgeName, sessionOf(raw)), ask: (prompt) => model(prompt, { timeoutMs: judge.askTimeoutMs }) });

  try {
    recordOutcome(judgeName, sessionOf(raw), outcome);
  } catch (error) {
    console.error(`The outcome could not be recorded: ${error.message} @es No se pudo registrar el desenlace: ${error.message}`);
  }

  return outcome.outcome === 'block' ? JSON.stringify({ decision: 'block', reason: outcome.reason }) : '';
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
