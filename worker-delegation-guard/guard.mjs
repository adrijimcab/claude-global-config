#!/usr/bin/env node
/**
 * `PreToolUse` hook shim, global (every project): stdin -> `evaluate()` -> stdout, plus a journal of
 * refusals. The decision itself lives in `decide.mjs`; the text in `reason.mjs`.
 *
 * WHY THIS EXISTS. A delegated worker split its errand among 6 agents of its own, past the owner's cap
 * of 3 heavy workers, because nothing but a sentence in a brief forbade a worker to delegate (ledger key
 * `worker-subdelegated-past-the-concurrency-cap`). The owner ruled that it cannot happen again; a
 * sentence is not a mechanism, so this guard refuses the call itself.
 *
 * FAILS OPEN on a malfunction of its own (unparseable stdin, a throw in the decision), like every
 * sibling guard: those are guard bugs, not a verdict about the call. The caller decision itself fails
 * CLOSED on a single subagent signal — see `decide.mjs`.
 *
 * @es Shim del hook `PreToolUse`, global: stdin -> `evaluate()` -> stdout, más un diario de rechazos. La
 * decisión vive en `decide.mjs` y el texto en `reason.mjs`. Existe porque un worker delegado repartió su
 * encargo entre 6 agentes propios, por encima del tope de 3 del dueño, cuando solo una frase de un brief
 * lo prohibía. Falla ABIERTO ante un fallo propio (stdin ilegible, una excepción en la decisión); la
 * decisión del llamante falla CERRADO ante una sola señal de subagente (ver `decide.mjs`).
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decide } from './decide.mjs';
import { reason } from './reason.mjs';

const STATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'state');

function journal(entry) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(path.join(STATE_DIR, 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition @es el diario es evidencia, nunca una precondición */
  }
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow. Exported for the dispatcher.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Exportada para el dispatcher.
 */
export function evaluate(raw) {
  let refusal;

  try {
    refusal = decide(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));
  } catch {
    return undefined;
  }

  if (refusal === undefined) return undefined;

  journal({ at: new Date().toISOString(), session: refusal.sessionId, agentId: refusal.agentId, tool: refusal.toolName });

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason(refusal) } };
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

// Only as the process entry point; an importer (the dispatcher, a selftest) never triggers a stdin read.
// @es Solo como proceso principal; un importador nunca provoca una lectura de stdin.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
