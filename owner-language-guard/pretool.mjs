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

import { isSubagentCaller, isUnderSubagentDirectory } from '../hook-caller/identify-caller.mjs';
import { deny, hookMain, parseFailureMessage, parsePayload, runWhenMain } from '../hook-io/hook-io.mjs';
import { englishParagraphs } from './decide.mjs';
import { readInterstitialTexts } from './interstitial.mjs';
import { recordLastRun } from './last-run.mjs';
import { speaker } from './pretool-messages.mjs';

/**
 * Decides one raw PreToolUse payload: the hook output (or `undefined` to allow) and the trace of the run.
 * @es Decide un payload crudo de PreToolUse: la salida de hook (o `undefined` para permitir) y la traza de la corrida.
 */
function judge(raw, readTexts) {
  const payload = parsePayload(raw);
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
    output: deny(speaker.line('english-before-tool', { excerpt: first.excerpt })),
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
    result = { output: undefined, trace: { verdict: 'error', error: parseFailureMessage(error) } };
  }

  recordLastRun({ ...result.trace, ms: Date.now() - started });

  return result.output;
}

runWhenMain(import.meta.url, hookMain(evaluate));
