#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell — foreign-delete-guard. Refuses a deletion by a delegated SUBAGENT
 * when it would remove a file that agent did not create in its session; the main session is never judged.
 *
 * MEASURED INCIDENT. 2026-10-19, third occurrence of the lesson `worker-temp-file-collided-across-sessions`
 * (reported by Discovery): several writers had been told to "delete the scratch scripts after"; during that
 * cleanup the orchestrator's provision.mjs, engram-save.mjs, mirror-odd.mjs, split-backlog.mjs and contrast.mjs
 * disappeared from the shared session scratchpad root. `shared-temp-guard` already stops a worker WRITING into the
 * shared TEMP root; nothing stopped it DELETING what another actor had put in a shared folder. ROOT CAUSE: an
 * instruction to clean up names no files, so a worker expresses it with a wildcard over a folder it shares.
 *
 * WHO IS A WORKER. `hook-caller/identify-caller.mjs`, the one definition the fleet shares.
 * WHAT IS A DELETION. `deletion-targets.mjs`, on the vendored shell parser. WHAT THE AGENT CREATED. Recorded BY
 * EFFECT: on every allowed call of a delegated agent (shell, Write, MultiEdit) this guard records each creation
 * target that does not exist yet in the agent's own journal (`authored-journal.mjs`, `authorship.mjs`); a path is
 * the agent's only if it is recorded, exists and was born after the record. THE DECISION AND ITS ORDER. `judge.mjs`.
 * Registered on Bash|PowerShell (judge and record) and on Write|MultiEdit (record only).
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe command.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza un borrado de un SUBAGENTE delegado cuando eliminaría
 * un fichero que ese agente no creó en su sesión; la sesión principal nunca se juzga. INCIDENTE MEDIDO: el
 * 2026-10-19, tercera ocurrencia de `worker-temp-file-collided-across-sessions` (informada por Discovery):
 * escritores a los que se les dijo "borra los scripts temporales al terminar" hicieron desaparecer provision.mjs,
 * engram-save.mjs, mirror-odd.mjs, split-backlog.mjs y contrast.mjs del orquestador de la raíz compartida del
 * scratchpad. `shared-temp-guard` ya impide ESCRIBIR en la raíz TEMP compartida; nada impedía BORRAR lo que otro
 * actor había puesto en una carpeta compartida. CAUSA RAÍZ: «limpia» no nombra ficheros, así que el worker lo
 * expresa con un comodín sobre una carpeta que comparte. Quién es worker lo decide `hook-caller`; qué es un
 * borrado, `deletion-targets.mjs`; qué creó el agente se ANOTA POR EFECTO: en cada llamada permitida de un agente
 * delegado (shell, Write, MultiEdit) se anota en su journal propio cada objetivo de creación que aún no existe
 * (`authored-journal.mjs`, `authorship.mjs`); una ruta es del agente solo si está anotada, existe y nació después;
 * la decisión y su orden, `judge.mjs`. Registrada en Bash|PowerShell (juzga y anota) y en Write|MultiEdit (solo
 * anota). Falla ABIERTO.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { agentKeyOf, confirmCall, recordCall } from './authored-journal.mjs';
import { pendingCreations } from './authorship.mjs';
import { judgeDeletion } from './judge.mjs';
import { refusalText } from './refusal.mjs';

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the call run. Exported so the dispatcher
 * can run it in its own process. `deps.judge` is injectable so a selftest can make the decision fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr la llamada.
 */
export function evaluate(raw, deps = {}) {
  const { judge = judgeDeletion } = deps;
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  if (!isSubagentCaller(payload)) return undefined;

  try {
    if (payload?.hook_event_name === 'PostToolUse') {
      // The call completed: confirm what it really created. @es La llamada se completó: confirmar lo que creó de verdad.
      confirmCall(agentKeyOf(payload), payload.tool_use_id, Date.now());

      return undefined;
    }

    const dialect = dialectOfTool(payload?.tool_name);
    const command = payload?.tool_input?.command;
    const verdict = dialect === undefined || typeof command !== 'string' ? undefined : judge(payload, dialect, command, deps);

    if (verdict !== undefined) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(verdict) } };

    // The call is allowed: record its start and what it is about to create, AFTER the decision, so it can never
    // authorize its own line. An agent that cannot be told apart has no safe key and nothing is written.
    // @es La llamada se permite: se anota su inicio y lo que va a crear, DESPUÉS de decidir, para que nunca
    // autorice su propia línea. Un agente que no se distingue no tiene clave segura y no se escribe nada.
    recordCall(agentKeyOf(payload), payload.tool_use_id ?? `pre-${Date.now()}-${process.pid}`, Date.now(), pendingCreations(payload));

    return undefined;
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a call. @es Falla ABIERTO: una avería de la decisión nunca bloquea una llamada.
  }
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
