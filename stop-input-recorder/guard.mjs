#!/usr/bin/env node
/**
 * Records what the harness actually hands the Stop hooks, so a judge's verdict can be checked against the input
 * it really saw. Two sessions saw the voice judge refuse rewrites while quoting content those rewrites no longer
 * held, and the rubric passed the same texts when measured in isolation, so the open question is the INPUT: what
 * `last_assistant_message` holds on a stop and on a re-stop, and whether `stop_hook_active` is set. This guard
 * never blocks. Each stop appends one record to its state: the time, the session, `stop_hook_active`, the payload
 * keys, and of `last_assistant_message` its length, sha256, first and last 160 characters. It fails open.
 *
 * @es Registra lo que el harness entrega realmente a los hooks de Stop, para contrastar el veredicto de un juez con
 * la entrada que vio. Dos sesiones vieron al juez de voz rechazar reescrituras citando contenido que ya no tenían, y
 * la rúbrica dejó pasar esos textos medidos aparte, así que la pregunta abierta es la ENTRADA: qué trae
 * `last_assistant_message` en una parada y en una re-parada, y si llega `stop_hook_active`. Nunca bloquea. Cada
 * parada añade un registro con la hora, la sesión, `stop_hook_active`, las claves del payload y, del mensaje, su
 * largo, su sha256 y sus primeros y últimos 160 caracteres. Ante un fallo propio deja pasar.
 */

import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { parsePayload, readStdin, runWhenMain } from '../hook-io/hook-io.mjs';
import { stateDir as stateDirOf } from '../hook-state/locations.mjs';

/** How many characters of each end of the message a record keeps. @es Cuántos caracteres de cada extremo guarda un registro. */
export const EXCERPT = 160;

export const defaultStateDir = () => stateDirOf('stop-input-recorder');

/** The record of one stop payload. @es El registro de un payload de parada. */
export function recordOf(payload, now = new Date()) {
  const message = typeof payload?.last_assistant_message === 'string' ? payload.last_assistant_message : undefined;

  return {
    at: now.toISOString(),
    session: typeof payload?.session_id === 'string' ? payload.session_id : undefined,
    stopHookActive: payload?.stop_hook_active === true,
    keys: payload !== null && typeof payload === 'object' ? Object.keys(payload).sort() : [],
    message: message === undefined
      ? undefined
      : { length: message.length, sha256: createHash('sha256').update(message).digest('hex'), head: message.slice(0, EXCERPT), tail: message.slice(-EXCERPT) },
  };
}

/** Appends one line to the journal; a failure to write is swallowed (fail open). @es Añade una línea al diario; un fallo se traga. */
function append(stateDir, line) {
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(path.join(stateDir, 'stops.jsonl'), `${JSON.stringify(line)}\n`, 'utf8');
  } catch {
    /* recording is best effort and never blocks a stop @es registrar es de mejor esfuerzo y nunca frena */
  }
}

/**
 * Records a raw payload and lets the turn end. Exported so `hook-dispatch/dispatch.mjs` runs it.
 * @es Registra un payload crudo y deja terminar el turno. Exportada para que el dispatcher la corra.
 */
export function evaluate(raw, { stateDir = defaultStateDir(), now = new Date() } = {}) {
  try {
    // The port strips the BOM PowerShell 5.1 prepends. @es El puerto quita el BOM que antepone PowerShell 5.1.
    append(stateDir, recordOf(parsePayload(raw), now));
  } catch (error) {
    // A parse failure keeps the parser's own message, the port's error cause. @es Un fallo de parseo conserva el mensaje del parser, la causa del error del puerto.
    append(stateDir, { at: now.toISOString(), malfunction: error instanceof Error ? (error.cause ?? error).message : String(error), rawLength: raw.length });
  }

  return undefined;
}

async function run() {
  evaluate(await readStdin());
  process.exit(0);
}

runWhenMain(import.meta.url, run);
