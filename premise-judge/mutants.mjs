#!/usr/bin/env node
/**
 * The decisions of the premise judge, each broken once, that `selftest.mjs` must catch: the wiring of the
 * rubric, what the journal guard reads, journals and counts, and the latency arithmetic. The runner lives in
 * `../mutation-proof/run-mutants.mjs` and mutates a COPY. Every mutant keeps the file runnable and the selftest
 * reports each failure as a value, so every kill is an assertion kill (`crashKills: 'fail'`).
 *
 * @es Las decisiones del juez de premisas, rotas una a una, que su selftest debe cazar: el cableado de la
 * rúbrica, lo que la guardia de journal lee, registra y cuenta, y la aritmética de latencia. Cada muerte es por
 * aserción.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PROMPT = 'premise-judge/prompt.mjs';
const GUARD = 'premise-judge/journal-guard.mjs';
const LATENCY = 'premise-judge/latency.mjs';

const MUTANTS = [
  // --- THE RUBRIC AND ITS WIRING.
  ['the rubric stops telling the model the gate passes continued stops', PROMPT, "  '1. The gate in front of you already passed every continued stop (stop_hook_active true) in code, so you only see first stops.',\n", ''],
  ['the rubric asks the model to test stop_hook_active again', PROMPT, 'so you only see first stops.', 'so you only see first stops. If the input field stop_hook_active is true, answer ok.'],
  ['the rubric drops the own-decision case', PROMPT, '(c) The message states its own decision', '(x) The message states its own decision'],
  ['the rubric brings case d back', PROMPT, "  '4. In every other case", "  '   (d) A reply is judged for a state.',\n  '4. In every other case"],
  ['rule 4 lets any unverified claim pass', PROMPT, 'as unverified passes ONLY when it cannot be measured this turn (', 'as unverified passes ('],
  ['the rubric counts four cases', PROMPT, 'in one of these three cases', 'in one of these four cases'],
  ['the signature is still v3', PROMPT, 'premise-judge rubric v5.', 'premise-judge rubric v3.'],
  ['the rubric spells the marker literally', PROMPT, 'starts with the word PREMISE-JUDGE followed by a colon', 'starts with PREMISE-JUDGE:'],
  ['the rubric loses its signature line', PROMPT, '  PROMPT_SIGNATURE,\n', ''],
  ['the pinned timeout is not the settings one', PROMPT, 'TIMEOUT_SECONDS = 30', 'TIMEOUT_SECONDS = 20'],
  ['the marker is not what the rubric spells', PROMPT, "MARKER = 'PREMISE-JUDGE:'", "MARKER = 'PREMISE JUDGE:'"],

  // --- WHAT THE JOURNAL GUARD READS.
  ['a first stop is read', GUARD, 'payload?.stop_hook_active !== true || ', ''],
  ['a transcript path that is not text is read', GUARD, " || typeof payload.transcript_path !== 'string'", ''],
  ['the assistant\'s own text counts as feedback', GUARD, "record?.type !== 'assistant' && ", ''],
  ['a tool output counts as feedback', GUARD, 'record?.toolUseResult === undefined && ', ''],
  ['a tool result counts as feedback', GUARD, ' && !holdsToolResult(record)', ''],
  ['a tool result is not recognised', GUARD, "value.type === 'tool_result'", "value.type === 'tool_resultX'"],
  ['a nested tool result is not looked for', GUARD, '  return Object.values(value).some(holdsToolResult);', '  return false;'],
  ['the reason keeps the text before the marker', GUARD, '[value.slice(value.indexOf(marker))]', '[value]'],
  ['the reason is not trimmed', GUARD, '.map((text) => text.trim().slice(0, REASON_LIMIT))', '.map((text) => text.slice(0, REASON_LIMIT))'],
  ['the reason is not cut', GUARD, '.map((text) => text.trim().slice(0, REASON_LIMIT))', '.map((text) => text.trim())'],
  ['one reason twice is two reasons', GUARD, 'return [...new Set(reasons)];', 'return reasons;'],
  ['the whole transcript is read', GUARD, 'lastRecords(payload.transcript_path, TAIL_RECORDS)', 'lastRecords(payload.transcript_path, Infinity)'],

  // --- WHAT IT JOURNALS.
  ['a reason already journaled is journaled again', GUARD, '    if (known.has(inputDigest)) continue;\n', ''],
  ['the journal is not read back', GUARD, 'lastRecords(journalPath(mechanism), JOURNAL_TAIL)', 'lastRecords(journalPath(MECHANISM), 0)'],
  ['no journal yet stops the first block', GUARD, "    if (error.code === 'ENOENT') return new Set();\n", ''],
  ['the key forgets the session', GUARD, 'digestInput(`${session}\\n${reason}`)', 'digestInput(`${reason}`)'],
  ['a missing session id is keyed as a word', GUARD, "typeof payload.session_id === 'string' ? payload.session_id : ''", "typeof payload.session_id === 'string' ? payload.session_id : 'none'"],
  ['the record is not a decision', GUARD, "kind: 'decision', blockId", "kind: 'dismissal', blockId"],
  ['the record names another event', GUARD, "event: 'Stop', reason", "event: 'SubagentStop', reason"],
  ['the mechanism is not the folder', GUARD, "MECHANISM = 'premise-judge'", "MECHANISM = 'premise-judgeX'"],

  // --- THE HOOK.
  ['a run is not counted', GUARD, '    for (const { mechanism } of JUDGES) incrementFires(mechanism);\n', ''],
  ['the hook journals nothing', GUARD, '    journalJudgeBlocks(payload);\n', ''],
  ['a BOM-prefixed payload is not decoded', GUARD, "raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw", 'raw'],
  ['the hook returns something', GUARD, '  return undefined;\n}\n\nconst main', '  return {};\n}\n\nconst main'],
  ['the process journals nothing', GUARD, "    evaluate(Buffer.concat(chunks).toString('utf8'));\n", ''],
  ['importing the guard runs it as a process', GUARD, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],

  // --- THE LATENCY ARITHMETIC.
  ['any record is read as a summary', LATENCY, "if (record?.type !== 'system' || ", 'if ('],
  ['any system record is read as a summary', LATENCY, "record.subtype !== 'stop_hook_summary' || !Array", '!Array'],
  ['a summary with no hook list is read', LATENCY, " || !Array.isArray(record.hookInfos)) return undefined;", ') return undefined;'],
  ['an entry with no duration is timed', LATENCY, 'const timed = record.hookInfos.filter((info) => Number.isFinite(info?.durationMs));', 'const timed = record.hookInfos;'],
  ['the judge is not found by its signature', LATENCY, "labelOf(info).includes(hookCommand('premise'))", "labelOf(info).includes('x-none')"],
  ['the judge is its own slowest other', LATENCY, '.filter((info) => info !== judge)', ''],
  ['a judge alone is compared with nothing', LATENCY, 'Math.max(0, ...timed', 'Math.max(...timed'],
  ['a judge faster than another adds negative time', LATENCY, 'addedMs: Math.max(0, judge.durationMs - slowestOther)', 'addedMs: judge.durationMs - slowestOther'],
  ['labels are listed when the judge was found', LATENCY, 'if (samples.length > 0 || summaries.length === 0) return report;', 'if (summaries.length === 0) return report;'],
  ['labels are listed when there are no summaries', LATENCY, 'if (samples.length > 0 || summaries.length === 0) return report;', 'if (samples.length > 0) return report;'],
  ['labels are not ordered by count', LATENCY, '.sort((left, right) => right[1] - left[1])', ''],
  ['one label is shown', LATENCY, 'const LABELS_SHOWN = 10;', 'const LABELS_SHOWN = 1;'],
  ['workers\' transcripts are not read', LATENCY, 'withFileTypes: true, recursive: true', 'withFileTypes: true, recursive: false'],
  ['--since is ignored', LATENCY, 'since === undefined || Date.parse(record.timestamp) >= since', 'true'],
  ['a date that is not one is accepted', LATENCY, '  if (Number.isNaN(since)) {', '  if (false) {'],
  ['an unknown option is accepted', LATENCY, '    return 2;\n  }\n\n  const since', '    return 0;\n  }\n\n  const since'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['premise-judge', 'judge-gate', 'voice-judge', 'hook-state', 'hook-dispatch', 'bilingual-output', 'settings.json'],
  selftest: 'premise-judge/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
