#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell: shared-resource-guard. A DELEGATED worker may USE a shared
 * resource of its project but never CONTROL it. Any command of a subagent that starts, stops or
 * reconfigures a resource the project declares in `.claude/shared-resources.json` is refused, with a
 * bilingual message that names the resource and says to ask the orchestrator. The orchestrator session is
 * always allowed, and a project without the file is untouched.
 *
 * MEASURED INCIDENT, 2026-10-12 (Discovery). The shared brief told workers to start the local PROD
 * themselves. One restarted it (`bin/www`, port 3100) with `FRT_URL` set to its own `ng serve` port (PROD's
 * CORS origin is `process.env.FRT_URL`, `start/default-app.js:51` of that copy), and later stopped PROD and
 * the prod-guard on :3000: three other writers lost the backend. ROOT CAUSE: nothing in the fleet knew a
 * resource was SHARED, so "start it" read as an ordinary command. The remedy is the DECLARATION plus this
 * one enforcement, not a rule per port: any project names its shared resources once.
 *
 * WHO OWNS WHAT. The decisions are split so each question has one owner: `declaration.mjs` (what is
 * shared), `control-actions.mjs` with `start-match.mjs`, `stop-match.mjs` and `reconfigure-match.mjs` (what
 * counts as controlling it), `decide.mjs` (the verdict), `refusal.mjs` (the words). WHO IS A WORKER is
 * `hook-caller/identify-caller.mjs`, the one definition the fleet shares; the shell is read by
 * `shell-command/shell-command.mjs`, the one parser, so a resource that is only MENTIONED (quoted text, a
 * heredoc, a comment, a commit message) is data and passes.
 *
 * RELATION TO A PROJECT'S OWN GUARD. Discovery's `.claude/prod-guard/` is a reverse proxy in FRONT of the
 * local PROD: it decides which HTTP requests (reads, session, the endpoints measured to break PROD) reach
 * it, whoever sends them. That stays the project's, because it is about the traffic. This guard owns the
 * other question, WHO MAY START, STOP OR RECONFIGURE the processes (PROD on :3100, the proxy on :3000, the
 * `FRT_URL` that sets PROD's CORS origin), which no project guard can enforce on a worker's shell. The
 * proxy is itself a declared resource here, so a worker can neither stop it nor start another in its place.
 *
 * FAILS OPEN on every malfunction of its own (a guard that cannot decide must not silence a safe command),
 * but NOT on an unusable declaration, which is a refusal with its reasons: reading a misspelt key as
 * "no resources" would switch the protection off in silence.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Un worker DELEGADO puede USAR un recurso compartido de
 * su proyecto pero nunca CONTROLARLO: todo comando de un subagente que arranque, detenga o reconfigure un
 * recurso declarado en `.claude/shared-resources.json` se rechaza, con un mensaje bilingüe que nombra el
 * recurso y manda pedírselo al orquestador. La sesión orquestadora siempre pasa y un proyecto sin el fichero
 * no se toca. INCIDENTE MEDIDO el 2026-10-12 (Discovery): el brief compartido mandaba a los workers a
 * arrancar el PROD local; uno lo reinició (`bin/www`, puerto 3100) con `FRT_URL` apuntando a su `ng serve`
 * y luego detuvo PROD y el guardián de :3000; tres writers perdieron el backend. CAUSA RAÍZ: nada en la
 * flota sabía que un recurso era COMPARTIDO. El remedio es la DECLARACIÓN más este único control, no una
 * regla por puerto. RELACIÓN CON EL GUARD DE PROYECTO: `.claude/prod-guard/` de Discovery es un proxy
 * inverso DELANTE del PROD que decide qué peticiones HTTP llegan, las mande quien las mande; eso sigue siendo
 * del proyecto porque trata del tráfico. Este guard es dueño de la otra pregunta: QUIÉN puede arrancar,
 * detener o reconfigurar los procesos (PROD en :3100, el proxy en :3000, el `FRT_URL`). El proxy es también
 * un recurso declarado aquí. Falla ABIERTO ante sus propios fallos, pero NO ante una declaración inservible:
 * esa se rechaza con sus motivos.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { decide } from './decide.mjs';

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the command run. Exported so the
 * dispatcher can run it in its own process. `verdict` is injectable so a selftest can make it fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr el comando.
 */
export function evaluate(raw, verdict = decide) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string') return undefined;
  if (!isSubagentCaller(payload)) return undefined;

  let refusal;

  try {
    refusal = verdict(payload, dialect, command);
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a command
  }

  if (refusal === undefined) return undefined;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: refusal.reason
    }
  };
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
