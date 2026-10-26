#!/usr/bin/env node
/**
 * `PreToolUse` on `Write` and `Edit` for `.mjs`, `.js` and `.cjs` files, for every caller on this machine:
 * a script whose string or template literals hold a USELESS ESCAPE (a backslash JavaScript drops silently)
 * may not be written. Third occurrence of `shell-one-liner-corrupted-data`: a worker wrote a regex source
 * through a script and the spec file lost its backslashes.
 *
 * For `Write` it judges `content`; for `Edit` it judges the file as it will be after the replacement,
 * reconstructed by the same simulation the type-assertion guard uses. Detection is a minimal lexer
 * (`lexer.mjs`) so regex literals and comments, where the escape is valid, are never judged
 * (`useless-escapes.mjs`). Stated bound: only literals are judged.
 *
 * FAILS OPEN on every malfunction of its own, naming it on stderr and journaling it: being unable to
 * verify is not the same as clean.
 *
 * @es `PreToolUse` sobre `Write` y `Edit` para ficheros `.mjs`, `.js` y `.cjs`: un script con un ESCAPE
 * INÚTIL en una cadena o plantilla (una barra que JavaScript descarta en silencio) no puede escribirse.
 * `Write` juzga `content`; `Edit` juzga el fichero tal como quedará tras el reemplazo. FALLA ABIERTO ante
 * un fallo propio, lo nombra en stderr y lo anota: no poder verificar no es lo mismo que estar limpio.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { simulateEdit } from '../type-assertion-guard/simulate-edit.mjs';
import { refusalText } from './refusal.mjs';
import { findUselessEscapes } from './useless-escapes.mjs';

/** Where a malfunction of THIS guard is counted. @es Donde se cuenta un fallo propio de esta guardia. */
export const errorsFile = () => path.join(stateDir('useless-escape-guard'), 'guard-errors.jsonl');

const SCRIPT_EXTENSIONS = new Set(['.mjs', '.js', '.cjs']);
const GUARDED_TOOLS = new Set(['Write', 'Edit']);

/** stderr only: stdout is the hook decision. @es Solo stderr: stdout es la decisión del hook. */
function reportMalfunction(message) {
  process.stderr.write(`[useless-escape-guard] ${message} — failing OPEN: unable to verify is not the same as clean.\n`);
  process.stderr.write(`[useless-escape-guard] @es ${message} — fallando ABIERTO: no poder verificar no es lo mismo que estar limpio.\n`);

  try {
    mkdirSync(path.dirname(errorsFile()), { recursive: true });
    appendFileSync(errorsFile(), `${JSON.stringify({ at: new Date().toISOString(), message })}\n`, 'utf8');
  } catch {
    // A journal is evidence, never a precondition. @es El diario es evidencia, nunca una precondición.
  }
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow the call. Exported so the
 * dispatcher can run it in its own process.
 * @es La salida del hook para un payload `PreToolUse` crudo, o `undefined` para permitir.
 */
export function evaluate(raw) {
  const payload = tryParsePayload(raw);
  const toolInput = payload?.tool_input;
  const filePathRaw = toolInput?.file_path;

  if (!GUARDED_TOOLS.has(payload?.tool_name)) return undefined;
  if (typeof filePathRaw !== 'string' || !SCRIPT_EXTENSIONS.has(path.extname(filePathRaw).toLowerCase())) return undefined;

  const cwd = typeof payload?.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd();
  const filePath = path.isAbsolute(filePathRaw) ? filePathRaw : path.resolve(cwd, filePathRaw);
  const simulated = simulateEdit(payload.tool_name, toolInput, filePath);

  if ('error' in simulated) {
    reportMalfunction(simulated.error);

    return undefined;
  }

  let findings;

  try {
    findings = findUselessEscapes(simulated.after);
  } catch (error) {
    reportMalfunction(`the lexer threw while checking ${filePath}: ${error instanceof Error ? error.message : String(error)}`);

    return undefined;
  }

  if (findings.length === 0) return undefined;

  return deny(refusalText(filePath, findings));
}

// Runs only as the process entry point, never on import. @es Corre solo como punto de entrada, nunca al importarse.
runWhenMain(import.meta.url, hookMain(evaluate));
