/**
 * The hook protocol, once: reading a payload, shaping a PreToolUse decision, journaling, and running a
 * guard's `main()` only when it is the main process.
 *
 * @es El protocolo de hooks, una sola vez: leer el payload, dar forma a una decisión de PreToolUse,
 * registrar en el diario, y correr el `main()` de una guarda solo cuando es el proceso principal.
 */

import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { kitStateRoot } from './state.mjs';

/** A raw payload parsed, tolerating the UTF-8 BOM a PowerShell writer adds. @es El payload parseado, tolerando el BOM. */
export const parsePayload = (raw) => JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

/** A PreToolUse refusal. @es Una negativa de PreToolUse. */
export const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

/** PreToolUse context injected without refusing. @es Contexto de PreToolUse sin negar. */
export const advise = (context) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } });

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

/**
 * Wraps a guard's decision into the dispatchable `evaluate(raw)` contract: parse, decide, and turn every
 * malfunction into an ALLOW that is journaled — a guard that can wedge every shell is a larger hazard
 * than the one it names, but a silent failure is not allowed either.
 * @es Envuelve la decisión de una guarda en el contrato `evaluate(raw)`: toda avería propia deja pasar y
 * queda registrada.
 */
export function evaluator(guard, decide) {
  return async (raw) => {
    try {
      return await decide(parsePayload(raw));
    } catch (error) {
      journal(guard, 'malfunctions.jsonl', { error: error instanceof Error ? error.stack : String(error), raw });

      return undefined;
    }
  };
}

/**
 * Runs `main` only when `moduleUrl` is the main process — never when the dispatcher or a selftest
 * imports the guard (the `guard-that-cannot-go-red` face about entry points).
 * @es Corre `main` solo si el módulo es el proceso principal, nunca al importarlo.
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

/** The standalone-hook `main()` for an `evaluate`: stdin in, JSON out. @es El `main()` de hook independiente. */
export const hookMain = (evaluate) => async () => {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = await evaluate(raw);

  if (output !== undefined) process.stdout.write(`${JSON.stringify(output)}\n`);
};
