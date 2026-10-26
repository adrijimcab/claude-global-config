#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell — protected-branch-guard. Refuses any command that deletes `main` or
 * `develop`, locally or on a remote, or that deletes branches whose names it cannot read.
 *
 * THE RULE, the owner's, verbatim: «main y develop NUNCA se borran». WHICH NAMES: `protected-branches.mjs`. WHAT A
 * LINE DELETES: `branch-deletions.mjs`, over the shared parser, so a deletion only mentioned (quoted text, a heredoc,
 * a comment) passes. EVERY caller is held to it, the main session and the workers alike: the rule names no exception.
 * This is the CLIENT layer; the real one is server-side branch protection, and the refusal says so.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must not silence a safe command.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza todo comando que borre `main` o `develop`, en local o en
 * un remoto, o que borre ramas cuyos nombres no puede leer. LA REGLA, del dueño, literal: «main y develop NUNCA se
 * borran». Qué nombres: `protected-branches.mjs`; qué borra una línea: `branch-deletions.mjs`, sobre el parser
 * compartido. TODO llamador está sujeto. Es la capa del CLIENTE; la real es la protección de ramas del servidor.
 * Falla ABIERTO ante cualquier fallo propio.
 */

import { deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { protectedBranchDeletions } from './branch-deletions.mjs';
import { refusalText } from './refusal.mjs';

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the command run. Exported for the
 * dispatcher. `decision` is injectable so a selftest can make it fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr el comando.
 */
export function evaluate(raw, decision = protectedBranchDeletions) {
  const payload = tryParsePayload(raw);
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string') return undefined;

  let offenders;

  try {
    offenders = decision(command, dialect, typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a command
  }

  if (offenders.length === 0) return undefined;

  return deny(refusalText(offenders));
}

// Only as the main process; imported by the dispatcher or a selftest, it does not run.
// @es Solo como proceso principal; importada por el dispatcher o un selftest, no corre.
runWhenMain(import.meta.url, hookMain(evaluate));
