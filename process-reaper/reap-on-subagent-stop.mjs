#!/usr/bin/env node
/**
 * `SubagentStop` hook: when a subagent stops, reap the processes it left behind (`reaper.mjs`). Owner rule,
 * closure item 5: closing an agent kills every live or zombie process of it, whatever its executable. Session
 * b100-am-ui-f8 measured polling loops alive 18 h after their worker ended; no hook ran at the stop.
 *
 * It NEVER blocks: it returns nothing and the stop proceeds. Each run appends one record to
 * `<state>/reaps.jsonl` (time, agent id, the payload's keys, the worktree it derived, and counts of what was
 * matched, killed and left alive, or why it refused), which is also the measurement of the real `SubagentStop`
 * payload shape. It fails open: a malfunction of its own is recorded and the stop proceeds.
 *
 * TRADE-OFF, stated because it is real: `SubagentStop` fires every time a worker stops, including a worker
 * that is resumed later by `SendMessage`. A background process a worker meant to outlive its turn dies at the
 * stop. The rule closes an agent's processes at its end; a process a worker needs across turns must be started
 * by the orchestrator, not by the worker.
 *
 * @es Hook `SubagentStop`: cuando un subagente para, siega los procesos que dejó (`reaper.mjs`). Regla del
 * dueño, punto 5 del cierre: cerrar un agente mata todo proceso vivo o zombi suyo, sea cual sea su ejecutable.
 * NUNCA bloquea: no devuelve nada y la parada sigue. Cada corrida añade un registro a `<estado>/reaps.jsonl`
 * (hora, id, claves del payload, worktree derivado y cuántos procesos coincidieron, murieron o siguen vivos, o
 * por qué se rechazó), que también es la medición de la forma real del payload de `SubagentStop`. Falla abierto.
 * COMPROMISO, dicho porque es real: `SubagentStop` dispara cada vez que un worker para, también el que se
 * reanuda luego con `SendMessage`; un proceso de fondo que un worker quería que sobreviviera a su turno muere
 * en la parada. Lo que un worker necesite entre turnos lo arranca el orquestador, no el worker.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir as stateDirOf } from '../hook-state/locations.mjs';
import { reapAgentProcesses } from './reaper.mjs';
import { stoppedAgentOf } from './stopped-agent.mjs';

const EVENT = 'SubagentStop';
const BOM = 0xfe_ff;

export const defaultStateDir = () => stateDirOf('process-reaper');

/** Appends one record to the journal; a failure to write is swallowed (fail open). @es Añade un registro; un fallo se traga. */
function record(stateDir, entry) {
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(path.join(stateDir, 'reaps.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* recording is best effort and never blocks a stop @es registrar es de mejor esfuerzo y nunca frena */
  }
}

/**
 * Reaps for a raw payload and lets the stop proceed. Exported so `hook-dispatch/dispatch.mjs` runs it.
 * @es Siega para un payload crudo y deja seguir la parada. Exportada para que el dispatcher la corra.
 */
export function evaluate(raw, { stateDir = defaultStateDir(), reap = reapAgentProcesses } = {}) {
  try {
    const payload = JSON.parse(raw.charCodeAt(0) === BOM ? raw.slice(1) : raw);

    if (payload?.hook_event_name !== undefined && payload.hook_event_name !== EVENT) return undefined;

    const { agentId, worktree } = stoppedAgentOf(payload);
    const keys = payload !== null && typeof payload === 'object' ? Object.keys(payload).sort() : [];
    const outcome = reap({ worktree, agentId });

    record(stateDir, { agentId, keys, worktree, refused: outcome.refused, matched: outcome.matched.length, killed: outcome.killed.length, survivors: outcome.survivors.length, protected: outcome.protected.length });
  } catch (error) {
    record(stateDir, { malfunction: error instanceof Error ? error.message : String(error) });
  }

  return undefined;
}

function main() {
  let raw = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    evaluate(raw);
    process.exit(0);
  });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
