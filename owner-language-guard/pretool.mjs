#!/usr/bin/env node
/**
 * `PreToolUse` guard: refuses a tool call when the assistant text written just before it, addressed to the
 * owner, is English prose. Thin shell over the one classifier (`decide.mjs#englishParagraphs`); the text
 * comes from `interstitial.mjs`. Main session only: a subagent's calls are never judged. The tool call's
 * own payload is never read (it is data for another agent); only its `tool_use_id` anchors the read, because
 * the transcript lags the hook. FAILS OPEN on any problem of its own.
 *
 * @es Guardia `PreToolUse`: rechaza la llamada cuando el texto escrito justo antes, dirigido al dueño, es
 * prosa en inglés. Usa el único clasificador (`decide.mjs`). Solo sesión principal; el payload de la
 * llamada nunca se lee, salvo su `tool_use_id`, que ancla la lectura porque el transcript va por detrás del
 * hook. FALLA ABIERTO ante cualquier fallo propio.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSubagentCaller, isUnderSubagentDirectory } from '../hook-caller/identify-caller.mjs';
import { englishParagraphs } from './decide.mjs';
import { readInterstitialTexts } from './interstitial.mjs';
import { recordLastRun } from './last-run.mjs';
import { speaker } from './pretool-messages.mjs';

const withoutBom = (raw) => (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

/**
 * Decides one raw PreToolUse payload: the hook output (or `undefined` to allow) and the trace of the run.
 * @es Decide un payload crudo de PreToolUse: la salida de hook (o `undefined` para permitir) y la traza de la corrida.
 */
function judge(raw, readTexts) {
  const payload = JSON.parse(withoutBom(raw));
  const transcript = payload?.transcript_path;
  const trace = {
    toolName: payload?.tool_name,
    toolUseId: typeof payload?.tool_use_id === 'string' ? payload.tool_use_id : undefined,
    transcriptPath: typeof transcript === 'string' ? transcript : undefined,
    hasAgentId: typeof payload?.agent_id === 'string' && payload.agent_id.length > 0,
    underSubagentDirectory: typeof transcript === 'string' && isUnderSubagentDirectory(transcript)
  };

  if (isSubagentCaller(payload)) return { output: undefined, trace: { ...trace, verdict: 'skipped:subagent' } };
  if (typeof transcript !== 'string' || transcript.length === 0) return { output: undefined, trace: { ...trace, verdict: 'skipped:no-transcript' } };

  const toolUseId = typeof payload.tool_use_id === 'string' && payload.tool_use_id.length > 0 ? payload.tool_use_id : undefined;
  const paragraphs = englishParagraphs(readTexts(transcript, toolUseId));
  const [first] = paragraphs;

  if (first === undefined) return { output: undefined, trace: { ...trace, verdict: 'allow', judged: 0 } };

  return {
    output: {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: speaker.line('english-before-tool', { excerpt: first.excerpt })
      }
    },
    trace: { ...trace, verdict: 'deny', judged: paragraphs.length }
  };
}

/**
 * The hook output for a raw PreToolUse payload, or `undefined` to allow; every run leaves its trace.
 * `readTexts` is injectable. @es La salida de hook para un payload crudo, o `undefined` para permitir; cada
 * corrida deja su traza.
 */
export function evaluate(raw, readTexts = readInterstitialTexts) {
  const started = Date.now();
  let result;

  try {
    result = judge(raw, readTexts);
  } catch (error) {
    result = { output: undefined, trace: { verdict: 'error', error: error instanceof Error ? error.message : String(error) } };
  }

  recordLastRun({ ...result.trace, ms: Date.now() - started });

  return result.output;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  let output;

  try {
    output = evaluate(readFileSync(0, 'utf8'));
  } catch {
    output = undefined;
  }

  if (output !== undefined) process.stdout.write(JSON.stringify(output));
  process.exitCode = 0;
}
