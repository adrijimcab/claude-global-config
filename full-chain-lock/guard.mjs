#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash and PowerShell — full-chain-lock. Refuses a FULL CHAIN run without the runner and
 * names the exact runner command to use instead, so one full chain runs at a time on this machine by mechanism
 * and not by messages between sessions.
 *
 * WHICH COMMANDS ARE FULL CHAINS is configuration (`chains.json`, read by `chains-config.mjs`): per project, the
 * package scripts and node programs that are full chains. WHAT A LINE RUNS is decided by `chain-invocations.mjs`
 * over the parsed command, so a chain only mentioned (quoted text, heredoc, comment) passes, and the wrapped form
 * (`node .../full-chain-lock/run.mjs --chain <name> -- <command>`) passes by construction.
 *
 * EVERY caller is held to it, the main session and the delegated workers alike: the memory pressure is the
 * machine's, whoever starts the chain.
 *
 * FAILS OPEN on every malfunction of its own (an unreadable declaration included): a guard that cannot decide must
 * not silence a safe command. The selftest loads the real declaration, so a broken file is caught there.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza una CADENA COMPLETA ejecutada sin el runner y nombra el
 * comando exacto del runner que hay que usar, para que una sola cadena corra a la vez en esta máquina por mecanismo
 * y no por mensajes entre sesiones. Qué comandos son cadenas completas es configuración (`chains.json`); qué ejecuta
 * una línea lo decide `chain-invocations.mjs` sobre el comando parseado: una mención pasa y la forma envuelta pasa
 * por construcción. TODO llamador, sesión principal y workers, está sujeto: la presión de memoria es de la máquina.
 * Falla ABIERTO ante cualquier malfunción propia (una declaración ilegible incluida).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { fullChainInvocations } from './chain-invocations.mjs';
import { loadChains } from './chains-config.mjs';
import { refusalText } from './refusal.mjs';

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to let the command run. Exported so the
 * dispatcher can run it in its own process. `chainsOf` and `decision` are injectable so a selftest can make them fail.
 * @es La salida de hook para un payload crudo, o `undefined` para dejar correr el comando.
 */
export function evaluate(raw, { chainsOf = loadChains, decision = fullChainInvocations } = {}) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string') return undefined;

  let offenders;

  try {
    offenders = decision(command, dialect, chainsOf());
  } catch {
    return undefined; // fail open: a malfunction of the decision or of the declaration must never block a command
  }

  if (offenders.length === 0) return undefined;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: refusalText(offenders[0], typeof payload.session_id === 'string' ? payload.session_id : undefined, {
        cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
        dialect,
        script: command
      })
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
