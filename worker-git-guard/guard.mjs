#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell — worker-git-guard. Refuses the git commands that discard work,
 * move HEAD or skip the commit hooks when the caller is a delegated SUBAGENT; the main session always passes.
 *
 * MEASURED INCIDENTS (other sessions' reports, engram #1543 items 25, 25b, 31). A b100 worker ran the denied
 * `git checkout -- <path>` once and `git reset --soft <sha>` twice; another ran `git reset -q` to unstage
 * although its brief denied every reset form; a Discovery worker ran `git commit -q --no-verify -m "wip: ..."`
 * so commitlint and pre-commit were skipped. ROOT CAUSE: a permission prefix list drifts per shell and
 * matches text, not meaning. This guard parses the invocation instead.
 *
 * WHO IS A WORKER. `hook-caller/identify-caller.mjs`, the one definition the fleet shares.
 * WHAT IS REFUSED. Decided by `forbidden-invocations.mjs` over the parsed command, so a command that is only
 * mentioned (echo, commit message, heredoc) is data and passes. Stash is `worker-stash-guard`'s.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe command.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza los comandos de git que descartan trabajo, mueven
 * HEAD u omiten los hooks de commit cuando quien llama es un SUBAGENTE delegado; la sesión principal siempre
 * pasa. INCIDENTES MEDIDOS (informes de otras sesiones, engram #1543 ítems 25, 25b, 31). CAUSA RAÍZ: una lista
 * de prefijos permitidos deriva por shell y compara texto, no significado; este guard analiza la invocación.
 * Quién es worker lo decide `hook-caller/identify-caller.mjs`; qué se rechaza, `forbidden-invocations.mjs`.
 * Falla ABIERTO.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { forbiddenInvocations } from './forbidden-invocations.mjs';
import { refusalText } from './refusal.mjs';

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the command run. `decision` is
 * injectable so a selftest can make it fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr el comando.
 */
export function evaluate(raw, decision = forbiddenInvocations) {
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

  let offenders;

  try {
    offenders = decision(command, dialect, typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a command
  }

  if (offenders.length === 0) return undefined;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: refusalText(offenders[0].family, offenders[0].text)
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
