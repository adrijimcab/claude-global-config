#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell — worker-stash-guard. Refuses any `git stash` that changes the
 * stack when the caller is a delegated SUBAGENT; the main session is always allowed.
 *
 * MEASURED INCIDENT, 2026-10-11 (peer session push-commit-4c04bdb-feature-meet). Workers f4 and f5 ran in
 * linked worktrees of one repository. `refs/stash` is stored in the common git directory, so the worktrees
 * share ONE stack (proved on a constructed repository: a stash made in a linked worktree is listed from the
 * main checkout). f5's `git stash pop` applied f4's lint-staged backup stash (124b632f, 7 spec files) into
 * f5's worktree, and f4 then hit "lint-staged automatic backup is missing". ROOT CAUSE: a stash is the one git
 * object a worktree cannot keep to itself, so two concurrent workers can never use it safely. The fix that
 * works is the commit: it belongs to the worker's own branch.
 *
 * WHO IS A WORKER. `hook-caller/identify-caller.mjs`, the one definition the fleet shares with
 * `backlog-owner-guard`: `agent_id` present OR a transcript under a `subagents` directory.
 *
 * WHAT IS A STASH. Decided by `stash-invocations.mjs` over the parsed command, so a stash that is only
 * mentioned (quoted text, heredoc, commit message) is data and passes. `list` and `show` read only.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe command.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza todo `git stash` que cambie la pila cuando quien
 * llama es un SUBAGENTE delegado; la sesión principal siempre pasa. INCIDENTE MEDIDO el 2026-10-11: los
 * workers f4 y f5, en worktrees enlazados de un repo, compartieron `refs/stash` (vive en el directorio git
 * común) y el `pop` de f5 aplicó el stash de respaldo de lint-staged de f4. CAUSA RAÍZ: el stash es el único
 * objeto de git que un worktree no puede guardar para sí; el commit en la rama propia sí. Quién es worker lo
 * decide `hook-caller/identify-caller.mjs`; qué es un stash, `stash-invocations.mjs`. Falla ABIERTO.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { refusalText } from './refusal.mjs';
import { stackChangingStashes } from './stash-invocations.mjs';

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the command run. Exported so the
 * dispatcher can run it in its own process. `decision` is injectable so a selftest can make it fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr el comando.
 */
export function evaluate(raw, decision = stackChangingStashes) {
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
      permissionDecisionReason: refusalText(offenders[0].text)
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
