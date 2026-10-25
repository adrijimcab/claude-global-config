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
 * WHAT IS A DELETION. `deletion-targets.mjs`, on the vendored shell parser. WHAT THE AGENT CREATED. The agent's
 * own transcript (`authorship.mjs`). THE DECISION AND ITS ORDER. `judge.mjs`.
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
 * borrado, `deletion-targets.mjs`; qué creó el agente, su transcript (`authorship.mjs`); la decisión y su orden,
 * `judge.mjs`. Falla ABIERTO.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
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

  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string') return undefined;

  try {
    const verdict = judge(payload, dialect, command, deps);

    if (verdict === undefined) return undefined;

    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(verdict) } };
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a call
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
