#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — `orchestrator-cwd-change-leaked-to-workers`. Refuses a
 * FOREGROUND shell call from the MAIN session that changes the session shell's directory (`cd`, `pushd`,
 * `Set-Location`…), because the harness broadcasts that change to every live worker as an "Environment
 * update — Primary working directory" (measured twice on 2026-09-30; see `decide.mjs`).
 *
 * The decision lives in `decide.mjs`, pure; this file is the thin shim — stdin -> `offendingDirectoryChange()`
 * -> a bilingual refusal naming the three allowed shapes -> stdout — plus a journal so a real refusal is
 * auditable. Subagents are never refused. FAILS OPEN on every malfunction of its own.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza una llamada de shell en PRIMER PLANO de la
 * sesión PRINCIPAL que cambia el directorio de la shell de la sesión, porque el harness lo difunde a todos
 * los workers vivos (medido dos veces el 2026-09-30). La decisión vive en `decide.mjs`; este fichero es el
 * conducto fino. Los subagentes nunca son rechazados. Falla ABIERTO ante cualquier fallo propio.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { offendingDirectoryChange } from './decide.mjs';

const STATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'state');

/** The bilingual refusal for one offending command. @es La negativa bilingüe para un comando infractor. */
export function refusalText({ executable, text }) {
  return [
    `CWD-CHANGE GUARD REFUSED this call: \`${text}\` runs \`${executable}\` in the main session's own shell.`,
    '',
    "WHY. A foreground directory change moves the SESSION's working directory, and the harness announces that",
    'to every live worker as "Environment update — Primary working directory". Measured twice on 2026-09-30:',
    'a `cd …/worktrees/fix-spec-types && node …` moved it, a later `cd` back restored it. A subshell or a',
    'background call did NOT move it.',
    '',
    'USE ONE OF THESE THREE SHAPES INSTEAD:',
    '  1. absolute paths, or `git -C <dir> <subcommand>` — no directory change at all;',
    '  2. a subshell:          ( cd <dir> && <command> )',
    '  3. a background call:   the same command with `run_in_background: true`.',
    '',
    `@es CWD-CHANGE GUARD RECHAZÓ esta llamada: \`${text}\` ejecuta \`${executable}\` en la shell propia de la`,
    'sesión principal.',
    '',
    'POR QUÉ. Un cambio de directorio en primer plano mueve el directorio de trabajo de la SESIÓN, y el harness',
    'lo anuncia a todos los workers vivos como «Environment update — Primary working directory». Medido dos',
    'veces el 2026-09-30: un `cd …/worktrees/fix-spec-types && node …` lo movió y otro `cd` de vuelta lo',
    'restauró. Un subshell o una llamada en segundo plano NO lo movió.',
    '',
    'USA UNA DE ESTAS TRES FORMAS:',
    '  1. rutas absolutas, o `git -C <dir> <subcomando>` — sin cambio de directorio;',
    '  2. un subshell:            ( cd <dir> && <comando> )',
    '  3. una llamada en segundo plano: el mismo comando con `run_in_background: true`.'
  ].join('\n');
}

function journal(entry) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(path.join(STATE_DIR, 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/**
 * The hook output for a raw payload, or `undefined` to allow. Exported for the dispatcher. Fails open.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Falla abierto.
 */
export function evaluate(raw) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  let offender;

  try {
    offender = offendingDirectoryChange(payload);
  } catch {
    return undefined;
  }

  if (offender === undefined) return undefined;

  journal({ at: new Date().toISOString(), session: payload?.session_id, tool: payload?.tool_name, executable: offender.executable });

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(offender) } };
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
