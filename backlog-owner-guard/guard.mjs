#!/usr/bin/env node
/**
 * `PreToolUse` guard, global (every project): a delegated subagent may never write, update, or delete
 * the project's master backlog through engram's `mem_save` / `mem_update` (/ `mem_delete`, defence in
 * depth — see `decide.mjs`) MCP tools. The main orchestrator session is always allowed.
 *
 * WHY THIS EXISTS. MEASURED this session (2026-09-30): subagent `a7a6a1fc42286edd6` called
 * `mem_save({ topic_key: "backlog/1.0.0-master", ... })` and overwrote engram observation #972 — the
 * owner's master backlog — as revision 50. Its own saved content cited
 * `~/.claude/rules/00-owner-mandates.md`'s "Backlog maestro — todo hallazgo entra en el momento" section
 * as its justification: that file loads into every subagent's context too (`~/.claude/rules/` is global,
 * not orchestrator-scoped), so a rule written to tell the ORCHESTRATOR to keep the backlog current was
 * read and obeyed by a worker instead. The owner ruled: the backlog belongs to the orchestrator only. A
 * worker reports its finding in its `SubagentHandback`; the orchestrator transcribes it the same turn.
 * The rule text was fixed too (`00-owner-mandates.md`, both project contract files) — this guard is the
 * MECHANISM that makes the rule impossible to violate again, not a restatement of it.
 *
 * THE DECISION lives in `decide.mjs`, pure and dependency-injected (`resolveTopicKeyById` from
 * `resolve-topic-key.mjs`), so the whole state space is exercisable in `selftest.mjs` without a live
 * engram store or a live subagent session. This file is the thin shim: stdin -> `evaluate()` -> stdout,
 * plus a journal so a real refusal is auditable evidence.
 *
 * CALLER IDENTITY (`../hook-caller/identify-caller.mjs`, shared) is MEASURED against 3,040 real `PreToolUse` payloads captured
 * this session, not assumed: a subagent payload always carries `agent_id`, and its `transcript_path`
 * always sits under `.../subagents/agent-<id>.jsonl`; a main-session payload has neither. Both signals
 * are checked (OR), so one drifting alone cannot misclassify a subagent as the main session.
 *
 * FAILS CLOSED ON THE ONE THING IT PROTECTS, unlike every sibling guard in this fleet. An id this guard
 * cannot resolve (missing store, unreadable file, query error, id not found) is treated as unsafe for a
 * subagent caller — see `resolve-topic-key.mjs` for why that asymmetry is deliberate here. It still fails
 * OPEN on every malfunction of its OWN — unreadable stdin, unparseable JSON, a payload shape it does not
 * recognise — because those are guard bugs, not unresolved backlog identity.
 *
 * @es Guardia `PreToolUse`, global: un subagente delegado nunca escribe, actualiza ni borra el backlog
 * maestro del proyecto vía `mem_save`/`mem_update` (/`mem_delete`) de engram. La sesión orquestadora
 * siempre está permitida. Existe porque el subagente `a7a6a1fc42286edd6` sobreescribió el backlog
 * maestro citando la propia sección de `00-owner-mandates.md` escrita para el orquestador — ese fichero
 * de reglas es global, no solo del orquestador. El dueño ordenó: el backlog es solo del orquestador; un
 * worker reporta su hallazgo en su `SubagentHandback`. La decisión vive en `decide.mjs`, pura e
 * inyectada. FALLA CERRADO sobre lo que protege (a diferencia de toda guardia hermana): un id que no
 * puede resolver se trata como inseguro para un subagente. Sigue fallando ABIERTO ante cualquier fallo
 * PROPIO (stdin ilegible, JSON inválido, una forma de payload desconocida).
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decide, DELETE_TOOLS, SAVE_TOOLS, UPDATE_TOOLS } from './decide.mjs';
import { reason } from './reason.mjs';
import { resolveTopicKeyById } from './resolve-topic-key.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(HERE, 'state');
const REFUSALS = path.join(STATE_DIR, 'refusals.jsonl');

/** Every tool name this guard has an opinion about, across both engram mount points and every save-family tool. @es Toda herramienta sobre la que esta guardia opina. */
export const GUARDED_TOOLS = new Set([...SAVE_TOOLS, ...UPDATE_TOOLS, ...DELETE_TOOLS]);

function journal(entry) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(REFUSALS, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition: its failure must not change the decision */
  }
}

function withoutBom(raw) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow the tool call. Exported so
 * `~/.claude/hook-dispatch/dispatch.mjs` can run it inside its own process, and so `guard.mjs` remains a
 * complete standalone hook when run directly.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Exportada para que el
 * dispatcher la corra en su propio proceso.
 */
export function evaluate(raw) {
  let payload;

  try {
    payload = JSON.parse(withoutBom(raw));
  } catch {
    return undefined;
  }

  const toolName = payload?.tool_name;

  if (!GUARDED_TOOLS.has(toolName)) return undefined;

  let refusal;

  try {
    refusal = decide(payload, toolName, payload?.tool_input, resolveTopicKeyById);
  } catch {
    // An unexpected throw in the decision is a malfunction of THIS guard, not a verdict on the call.
    return undefined;
  }

  if (refusal === undefined) return undefined;

  journal({
    at: new Date().toISOString(),
    session: payload?.session_id,
    agentId: payload?.agent_id,
    tool: toolName,
    kind: refusal.kind
  });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal)
    }
  };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
  process.exit(0);
}

// Only when RUN as the hook — a module that EXPORTS runs no work when imported
// (`guard-that-cannot-go-red`): main() runs only when this file is the process entry point, never on
// import, so the dispatcher (and this guard's own selftest) can import `evaluate` freely without also
// triggering a stdin read.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
