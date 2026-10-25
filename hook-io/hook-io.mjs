/**
 * The hook protocol port: reading a payload, shaping the decisions a hook prints, wrapping a guard's decision
 * into the dispatchable `evaluate(raw)` contract, and running a guard's `main()` only as the main process.
 * It talks to no store: where a malfunction is recorded is the caller's adapter (`record`).
 *
 * @es El puerto del protocolo de hooks: leer el payload, dar forma a las decisiones que imprime un hook,
 * envolver la decisión de una guarda en el contrato `evaluate(raw)` y correr su `main()` solo como proceso
 * principal. No conoce ningún almacén: dónde se registra una avería lo decide el adaptador del llamador.
 */

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A raw payload parsed, tolerating the UTF-8 BOM a PowerShell writer adds. Throws a bilingual error.
 * @es El payload parseado, tolerando el BOM. Lanza un error bilingüe.
 */
export function parsePayload(raw) {
  try {
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (cause) {
    throw new Error('Invalid hook payload: not JSON. @es Payload de hook inválido: no es JSON.', { cause });
  }
}

/** `parsePayload` that returns `undefined` instead of throwing. @es `parsePayload` que devuelve `undefined` en vez de lanzar. */
export function tryParsePayload(raw) {
  try {
    return parsePayload(raw);
  } catch {
    return undefined;
  }
}

/**
 * Why a run failed, as a journal records it: the message of the parser's own error when `parsePayload` wrapped one
 * (its cause), else the error's message, else the text of a thrown non-error.
 * @es Por qué falló una corrida, como la anota un diario: el mensaje del error propio del parser si `parsePayload`
 * envolvió uno (su causa), si no el mensaje del error, si no el texto de lo lanzado que no es un error.
 */
export const parseFailureMessage = (error) => (error instanceof Error ? (error.cause ?? error).message : String(error));

/** All of a stream (stdin by default) as UTF-8 text. @es Todo un stream (stdin por defecto) como texto UTF-8. */
export async function readStdin(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) chunks.push(Buffer.from(chunk));

  return Buffer.concat(chunks).toString('utf8');
}

/** A PreToolUse refusal. @es Una negativa de PreToolUse. */
export const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

/** PreToolUse context injected without refusing. @es Contexto de PreToolUse sin negar. */
export const advise = (context) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } });

/** A Stop block, with optional extra context for the model. @es Un bloqueo de Stop, con contexto opcional para el modelo. */
export const blockStop = (reason, context) => ({ decision: 'block', reason, ...(context === undefined ? {} : { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context } }) });

/** Default malfunction record: one bilingual stderr line. @es Registro por defecto de una avería: una línea bilingüe en stderr. */
const toStderr = (guard, entry) => process.stderr.write(`${guard}: malfunction, allowed. @es ${guard}: avería, se deja pasar. ${entry.error}\n`);

/**
 * Wraps a guard's decision into `evaluate(raw)`: parse, decide, and turn every malfunction into an ALLOW that is
 * recorded through `record(guard, { error, raw })` — a guard that can wedge every shell is a larger hazard than the
 * one it names, but a silent failure is not allowed either.
 * @es Envuelve la decisión de una guarda en `evaluate(raw)`: toda avería propia deja pasar y se registra con `record`.
 */
export function evaluator(guard, decide, record = toStderr) {
  return async (raw) => {
    try {
      return await decide(parsePayload(raw));
    } catch (error) {
      record(guard, { error: error instanceof Error ? error.stack : String(error), raw });

      return undefined;
    }
  };
}

/**
 * Runs `main` only when `moduleUrl` is the main process, comparing real paths so a junction or symlink still
 * counts — never when the dispatcher or a selftest imports the guard.
 * @es Corre `main` solo si el módulo es el proceso principal, comparando rutas reales (una junction cuenta).
 */
export function runWhenMain(moduleUrl, main) {
  if (process.argv[1] === undefined) return;

  let isMain;

  try {
    isMain = realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(moduleUrl));
  } catch {
    isMain = path.resolve(process.argv[1]) === path.resolve(fileURLToPath(moduleUrl));
  }

  if (isMain) main();
}

/**
 * The standalone-hook `main()` for an `evaluate`: stdin in, JSON out. `readInput` is the seam for the input; an
 * unreadable stdin ends the hook silently.
 * @es El `main()` de hook independiente: stdin entra, JSON sale. `readInput` es la costura de la entrada; un
 * stdin ilegible termina el hook en silencio.
 */
export const hookMain = (evaluate, readInput = () => readFileSync(0, 'utf8')) => async () => {
  let raw;

  try {
    raw = readInput();
  } catch {
    return;
  }

  const output = await evaluate(raw);

  if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);
};
