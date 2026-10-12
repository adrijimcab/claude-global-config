/**
 * The recorded lifecycle of subagents: what the harness SAID about each agent starting and stopping, kept as an
 * append-only JSON-lines file in the state of the `agent-liveness` mechanism. One line per event:
 * `{ event: 'start' | 'stop', agent_id, time, ... }`. This module owns that file: where it is, how a line is
 * written, and how the file is read back into "what is the last thing recorded about each agent".
 *
 * WHY IT EXISTS. Liveness read only from a transcript's mtime is wrong in BOTH directions (measured 2026-10-12):
 * a worker that had finished still read as live for up to 30 minutes after its last write, and a worker launched
 * minutes earlier that had not written yet read as not live. The harness knows both facts exactly (it fires
 * `SubagentStart` and `SubagentStop`); this is where they are kept.
 *
 * The LAST line recorded for an agent wins, in file order: start, stop, start (a resumed worker) is a worker
 * that is running. A line that is not JSON, has no usable agent id, no known event or no valid time is skipped,
 * never guessed at; a missing file is "nothing recorded". Reading never throws.
 *
 * @es El ciclo de vida registrado de los subagentes: lo que el harness DIJO de cada agente al empezar y al parar,
 * en un fichero JSON-lines de solo añadir en el estado del mecanismo `agent-liveness`. Una línea por evento:
 * `{ event: 'start' | 'stop', agent_id, time, ... }`. Este módulo es dueño de ese fichero: dónde está, cómo se
 * escribe una línea y cómo se lee de vuelta como «lo último registrado de cada agente».
 * POR QUÉ EXISTE: la vivacidad leída solo del mtime del transcript falla en AMBOS sentidos (medido el
 * 2026-10-12): un worker terminado seguía leyéndose vivo hasta 30 minutos, y uno lanzado minutos antes que aún no
 * había escrito se leía como no vivo. El harness sabe las dos cosas con exactitud (dispara `SubagentStart` y
 * `SubagentStop`); aquí se guardan. Gana la ÚLTIMA línea de un agente, en orden de fichero: start, stop, start
 * (un worker reanudado) es un worker en marcha. Una línea que no es JSON, sin id usable, sin evento conocido o
 * sin hora válida se omite, nunca se adivina; un fichero ausente es «nada registrado». Leer nunca lanza.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The mechanism whose state holds the lifecycle. @es El mecanismo cuyo estado guarda el ciclo de vida. */
export const MECHANISM = 'agent-liveness';

/** The events that decide liveness. @es Los eventos que deciden la vivacidad. */
export const START = 'start';
export const STOP = 'stop';

/** The prefix the harness puts on an agent's files: `agent-<id>.meta.json`. @es El prefijo de los ficheros de un agente. */
const FILE_PREFIX = 'agent-';

/** Where the lifecycle is kept. @es Dónde se guarda el ciclo de vida. */
export const lifecyclePath = () => path.join(stateDir(MECHANISM), 'lifecycle.jsonl');

/**
 * The key an agent is known by, whether it arrives as a hook's `agent_id` (`a8534307c229206b6`) or as the harness's
 * record id (`agent-a8534307c229206b6`). `undefined` for anything that is not a non-empty string.
 * @es La clave por la que se conoce a un agente, llegue como `agent_id` de un hook o como id de registro del harness.
 */
export function agentKey(id) {
  if (typeof id !== 'string') return undefined;

  const bare = id.startsWith(FILE_PREFIX) ? id.slice(FILE_PREFIX.length) : id;

  return bare === '' ? undefined : bare;
}

/**
 * Appends one line to the lifecycle file. Throws on a write failure: the caller (the recorder) decides that a
 * failure is swallowed, because recording must never stop a worker.
 * @es Añade una línea al fichero. Lanza si falla la escritura: quien llama (el registrador) decide tragarla.
 */
export function appendLifecycle(line) {
  mkdirSync(stateDir(MECHANISM), { recursive: true });
  appendFileSync(lifecyclePath(), `${JSON.stringify(line)}\n`, 'utf8');
}

/** The parsed JSON of a line, or `undefined`. @es El JSON de una línea, o `undefined`. */
function parsed(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/**
 * What is recorded about each agent: a map from agent key to `{ event, at }`, `at` being the time of the event in
 * milliseconds. Built from the text of the file so a test can hand it any text.
 * @es Lo registrado de cada agente: un mapa de clave de agente a `{ event, at }` (`at` en milisegundos).
 */
export function lifecycleFrom(text) {
  const last = new Map();

  for (const line of text.split('\n')) {
    const record = parsed(line);
    const key = agentKey(record?.agent_id);
    const at = Date.parse(record?.time);

    if (key === undefined || (record.event !== START && record.event !== STOP) || Number.isNaN(at)) continue;

    last.set(key, { event: record.event, at });
  }

  return last;
}

/**
 * The lifecycle recorded in the state of this process. Nothing recorded (or an unreadable file) is an empty map:
 * the agents of that moment fall back to the transcript's mtime, which is what they had before the recorder.
 * @es El ciclo de vida registrado en el estado de este proceso. Nada registrado (o fichero ilegible) es un mapa
 * vacío: esos agentes vuelven al mtime del transcript, que es lo que tenían antes del registrador.
 */
export function readLifecycle() {
  try {
    return lifecycleFrom(readFileSync(lifecyclePath(), 'utf8'));
  } catch {
    return new Map();
  }
}
