#!/usr/bin/env node
/**
 * SessionStart hook: gives the session its own TEMP through CLAUDE_ENV_FILE (`session-temp.mjs`). Prints nothing
 * and always exits 0: a malfunction leaves the session on the shared temp root, never blocks it.
 * @es Hook SessionStart: da a la sesión su propio TEMP por CLAUDE_ENV_FILE. No imprime nada y siempre sale con 0:
 * un fallo deja la sesión en la raíz temporal compartida, nunca la bloquea.
 */

import { hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { startSession } from './session-temp.mjs';

/** @param {string} raw the SessionStart payload @es el payload de SessionStart */
export function evaluate(raw) {
  try {
    startSession({ payload: tryParsePayload(raw), envFile: process.env.CLAUDE_ENV_FILE });
  } catch {
    // fail open: the session keeps the shared root. @es falla abierto: la sesión sigue en la raíz compartida.
  }

  return undefined;
}

runWhenMain(import.meta.url, hookMain(evaluate));
