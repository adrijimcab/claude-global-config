#!/usr/bin/env node
/**
 * `SubagentStart` / `SubagentStop` hook: records that an agent started or stopped, so liveness can read the
 * agent's real lifecycle (`active-owner.mjs`) instead of inferring it from a transcript's mtime. Each event
 * appends one line to the lifecycle file (`lifecycle-log.mjs`): the event, the agent id, the time, and what
 * identifies where the agent works (the `cwd` the harness reports, its session, its type and its transcript).
 *
 * It NEVER blocks and never prints a verdict: recording is bookkeeping, and a worker must not stop because the
 * bookkeeping failed. A payload it cannot read, or one with no agent id, is itself recorded as a `malfunction`
 * line; a write that fails is swallowed (fail open, but a payload the recorder cannot read leaves a trace when
 * the file can be written). An event that is neither a start nor a stop is ignored: the dispatcher may hand it
 * any payload of its event.
 *
 * @es Hook `SubagentStart` / `SubagentStop`: registra que un agente empezó o paró, para que la vivacidad lea el
 * ciclo de vida real (`active-owner.mjs`) en vez de inferirlo del mtime de un transcript. Cada evento añade una
 * línea al fichero de ciclo de vida: el evento, el id del agente, la hora y lo que identifica dónde trabaja (el
 * `cwd` que informa el harness, su sesión, su tipo y su transcript). NUNCA bloquea ni imprime veredicto: un worker
 * no debe parar porque falle el registro. Un payload ilegible o sin id de agente se registra como línea
 * `malfunction`; una escritura que falla se traga. Un evento que no es ni start ni stop se ignora.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendLifecycle, START, STOP } from './lifecycle-log.mjs';

/** The hook events this recorder understands, and what each one records. @es Los eventos que entiende y qué registra cada uno. */
const EVENTS = Object.freeze({ SubagentStart: START, SubagentStop: STOP });

/** A string field of the payload, or `undefined`. @es Un campo de texto del payload, o `undefined`. */
const textOf = (value) => (typeof value === 'string' && value !== '' ? value : undefined);

/**
 * The line to record for one payload, or `undefined` when the payload is not a start or a stop.
 * @es La línea a registrar para un payload, o `undefined` si no es un start ni un stop.
 */
export function lineOf(payload, now = new Date()) {
  const event = EVENTS[payload?.hook_event_name];

  if (event === undefined) return undefined;

  const agentId = textOf(payload.agent_id);

  if (agentId === undefined) return { event: 'malfunction', time: now.toISOString(), why: `${payload.hook_event_name} without agent_id`, keys: Object.keys(payload).sort() };

  return {
    event,
    agent_id: agentId,
    time: now.toISOString(),
    cwd: textOf(payload.cwd),
    session_id: textOf(payload.session_id),
    agent_type: textOf(payload.agent_type),
    transcript: textOf(payload.agent_transcript_path),
    keys: Object.keys(payload).sort()
  };
}

/** Appends a line; a failure to write is swallowed. @es Añade una línea; un fallo de escritura se traga. */
function record(line) {
  try {
    appendLifecycle(line);
  } catch {
    /* recording is best effort and never blocks a worker @es registrar es de mejor esfuerzo y nunca frena a un worker */
  }
}

/**
 * Records one raw payload and lets the agent go on. Exported so `hook-dispatch/dispatch.mjs` runs it.
 * @es Registra un payload crudo y deja seguir al agente. Exportada para que el dispatcher la corra.
 */
export function evaluate(raw, { now = new Date() } = {}) {
  try {
    // PowerShell 5.1 prepends a BOM when it pipes a string into a native process. @es PowerShell 5.1 antepone un BOM.
    const line = lineOf(JSON.parse(raw.charCodeAt(0) === 0xfe_ff ? raw.slice(1) : raw), now);

    if (line !== undefined) record(line);
  } catch (error) {
    record({ event: 'malfunction', time: now.toISOString(), why: error instanceof Error ? error.message : String(error), rawLength: raw.length });
  }

  return undefined;
}

function run() {
  let raw = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    evaluate(raw);
    process.exit(0);
  });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) run();
