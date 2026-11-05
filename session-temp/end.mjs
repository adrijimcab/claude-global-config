#!/usr/bin/env node
/**
 * SessionEnd hook: removes the session's private TEMP folder (`session-temp.mjs`) without following a link inside
 * it. Prints nothing and always exits 0.
 * @es Hook SessionEnd: borra la carpeta TEMP privada de la sesión sin seguir un enlace de dentro. No imprime nada y
 * siempre sale con 0.
 */

import { hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { endSession } from './session-temp.mjs';

/** @param {string} raw the SessionEnd payload @es el payload de SessionEnd */
export function evaluate(raw) {
  try {
    endSession({ payload: tryParsePayload(raw) });
  } catch {
    // fail open: a folder left behind is only disk. @es falla abierto: una carpeta que queda es solo disco.
  }

  return undefined;
}

runWhenMain(import.meta.url, hookMain(evaluate));
