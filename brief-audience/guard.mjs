#!/usr/bin/env node
/**
 * `PreToolUse` guard on briefs and durable records — a brief may not end by addressing someone other
 * than the worker, and no brief, message, task record or saved memory may carry the author's own
 * unfinished tool-call markup. The decision, the carriers and the census behind them live in
 * `audience.mjs`; this file is the hook shim.
 *
 * THE LESSON THIS CLOSES: `user-facing-prose-leaked-into-a-worker-brief`.
 * @es LA LECCION QUE CIERRA: `user-facing-prose-leaked-into-a-worker-brief`.
 *
 * WHAT HAPPENED, measured 2026-09-09. An `sdd-tasks` agent's prompt ended with several paragraphs of
 * my status report to the OWNER: how many parity anchors were green, how many agents were running,
 * which tasks had returned to the backlog, and the closing question "¿Las lanzo, o las quieres ver
 * primero?". The owner found it in the agent's own transcript and said it must not happen again.
 *
 * THE CAUSE is structural, not a lapse of attention: I began writing the user-facing reply while the
 * Agent call's parameter block was still open, so the prose was captured as the prompt argument. The
 * XML shape of my own output is what carries the audience boundary, and nothing checks it.
 *
 * WHY IT IS WORSE THAN UNTIDY. A worker cannot tell my report to the owner from my instructions to
 * it. Orchestration state — agent counts, anchor totals, what landed on develop — is noise that can
 * steer a brief, and a question addressed to the owner sitting in a worker's prompt invites the worker
 * to answer it or act on it. It is the mirror image of the provenance defect this fleet already
 * guards: there, guesses were laundered INTO a worker as facts; here, a conversation with someone
 * else was laundered into a worker as instructions.
 *
 * WHAT IT CHECKS, and why this particular property. Not language — briefs in this project quote the
 * owner's Spanish directives verbatim all the time, so Spanish anywhere is a false positive that
 * would get the guard switched off within the day. Not length. The discriminating property is
 * POSITION plus ADDRESSEE: a leak lands at the END, because it begins the moment the author believes
 * the call is closed. And a well-formed brief ENDS BY INSTRUCTING THE WORKER — report this, commit
 * that, verify the other — while a leaked reply ends by asking the decision-maker what to do.
 *
 * So only the TAIL is inspected, and only for phrases that address a decider. A brief that quotes an
 * owner directive in its middle passes untouched, which is what keeps this guard usable.
 *
 * FAILS OPEN on every malfunction of its own: a guard able to wedge delegation is a larger hazard
 * than the one it closes.
 *
 * @es Guard de `PreToolUse` sobre delegación: un brief no puede TERMINAR dirigiéndose a alguien que
 * no sea el worker. La causa es estructural: empecé a escribir la respuesta al usuario con el bloque
 * de parámetros aún abierto, así que la prosa quedó capturada como el prompt. Un worker no puede
 * distinguir mi informe al propietario de mis órdenes para él, y una pregunta dirigida al propietario
 * metida en su prompt le invita a responderla. No se comprueba el IDIOMA —los briefs citan directivas
 * en español constantemente— sino la POSICIÓN y el DESTINATARIO: la fuga cae siempre al final, y un
 * brief bien formado termina dando una orden al worker.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectPayload } from './audience.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(HERE, 'state');

function journal(entry) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(join(STATE_DIR, 'refusals.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition: its failure must not change the decision */
  }
}

function markupReason(refusal) {
  return [
    `BRIEF-AUDIENCE REFUSED this ${refusal.toolName} call: ${refusal.toolName}.${refusal.field} contains the bare tool-call tag ${refusal.tag}`,
    '',
    'That tag in the TEXT means a parameter block was still open while the author kept writing: the text',
    'swallowed the call\'s own markup — its closing tags, or the next parameter. Measured on task #6: its',
    'record stores "…is itself debt.</parameter>" and then a line opening the activeForm parameter, so the',
    'description ate the activeForm and the record has none. A census of 504 transcripts found 108 such',
    'leaks in prompts, messages, task records and saved memories, every one real, none of them caught.',
    '',
    'THE FIX: close the value where it ends, and put each parameter in its own parameter. Nothing after',
    'the value belongs inside it.',
    '',
    'IF YOU ARE QUOTING THE TAG ON PURPOSE — writing about this incident — wrap it in backticks or a',
    'fenced block. A tag inside code is data and passes; only a bare tag is refused.'
  ].join('\n');
}

function deciderReason(refusal) {
  return [
    'BRIEF-AUDIENCE REFUSED this delegation: the brief ENDS by addressing someone who is not the worker.',
    '',
    `Found in the last ${refusal.tailLength} characters: ${refusal.found.map((phrase) => `"${phrase}"`).join(', ')}`,
    '',
    'That is the signature of a user-facing reply captured inside the tool call — which is exactly what',
    'happened on 2026-09-09: an sdd-tasks prompt ended with a status report to the owner (parity anchor',
    'counts, how many agents were running, which tasks had returned to the backlog) and the question',
    '"¿Las lanzo, o las quieres ver primero?". The owner found it in the agent\'s transcript.',
    '',
    'WHY THIS IS REFUSED RATHER THAN TRIMMED FOR YOU. A worker cannot tell your report to the owner',
    'from your instructions to it. Orchestration state can steer a brief, and a question addressed to',
    'the decision-maker invites the worker to answer it or act on it. It is the mirror of the',
    'provenance defect: there, guesses reach a worker as facts; here, a conversation with someone else',
    'reaches a worker as instructions.',
    '',
    'THE FIX: close every tool call BEFORE writing the user-facing reply. Then re-read the last',
    'paragraph of the prompt — it must instruct the WORKER (report this, commit that, verify the',
    'other). If it addresses anyone else, the block is malformed.',
    '',
    'Only the TAIL is inspected, deliberately: quoting an owner directive in the BODY of a brief is',
    'legitimate and this guard never touches it. If a decider phrase genuinely belongs in your brief —',
    'quoting an owner question a worker must be aware of — put it in the body, not the last paragraph.'
  ].join('\n');
}

/**
 * La salida de hook para un payload crudo (deny cuando la cola de un brief le habla a otro), o
 * `undefined`. Exportada para que `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso.
 */
export function evaluate(raw) {
  let payload;

  try {
    // A PowerShell-written payload can carry a UTF-8 BOM, which makes JSON.parse throw.
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

    payload = JSON.parse(text);
  } catch {
    return undefined;
  }

  let refusal;

  try {
    refusal = inspectPayload(payload);
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a call
  }

  if (refusal === undefined) return undefined;

  journal({ at: new Date().toISOString(), session: payload?.session_id, tool: refusal.toolName, field: refusal.field, kind: refusal.kind, tag: refusal.tag, found: refusal.found, length: refusal.length });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: refusal.kind === 'markup' ? markupReason(refusal) : deciderReason(refusal)
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

// Dentro del dispatcher, stdin ya lo leyó él: leerlo acá consumiría su entrada.
if (globalThis[Symbol.for('hook-dispatch.in-process')] !== true) main();
