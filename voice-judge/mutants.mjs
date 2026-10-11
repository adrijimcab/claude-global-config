#!/usr/bin/env node
/**
 * The decisions of the voice judge, each broken once, that `selftest.mjs` must catch: the wiring of the rubric
 * and how the shared journal guard tells the voice judge's blocks from the premise judge's. The runner lives in
 * `../mutation-proof/run-mutants.mjs` and mutates a COPY. Every kill is an assertion kill (`crashKills: 'fail'`).
 *
 * @es Las decisiones del juez de voz, rotas una a una, que su selftest debe cazar: el cableado de la rúbrica y
 * cómo la guardia de journal compartida distingue los bloqueos del juez de voz de los de premisas.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PROMPT = 'voice-judge/prompt.mjs';
const GUARD = 'premise-judge/journal-guard.mjs';

const MUTANTS = [
  // --- THE RUBRIC AND ITS WIRING.
  ['the rubric stops passing on stop_hook_active', PROMPT, "  '1. If the input field stop_hook_active is true, answer {\"ok\": true}.',\n", ''],
  ['the rubric judges more than the final message', PROMPT, 'Judge only the field last_assistant_message.', 'Judge the whole input.'],
  ['the rubric stops passing briefs to subagents', PROMPT, 'addressed to a subagent or a peer session rather than to the owner', 'addressed to the owner'],
  ['the rubric stops passing one or two lines', PROMPT, 'or when it is one or two lines with no status content', ''],
  ['the rubric lets voseo rescue a changelog', PROMPT, 'Voseo does not rescue it: a changelog with an accent is still a changelog. ', ''],
  ['the rubric drops the enumeration test', PROMPT, 'when the enumerations carry a status or work report', 'when the message is a status report'],
  ['the rubric drops the prose exception', PROMPT, 'The one exception is a body whose full-sentence paragraphs explain the why of the decisions and that ends with a closing sentence that lands.', ''],
  ['the rubric blocks prose with a supporting list', PROMPT, 'Answer {"ok": true} when prose carries the message and a list only supports it', 'Answer ok false when a list is present'],
  ['the rubric stops looking at what carries the reply', PROMPT, 'Look at what CARRIES it:', 'Look at it:'],
  ['the signature is still v1', PROMPT, "'voice-judge rubric v2.'", "'voice-judge rubric v1.'"],
  ['the rubric blocks when unsure', PROMPT, 'When unsure, answer {"ok": true}.', 'When unsure, answer ok false.'],
  ['the rubric allows impossible', PROMPT, 'Never set the field impossible.', 'Set the field impossible when the owner repeats himself.'],
  ['the rubric asks for length', PROMPT, 'Never ask for a longer message for its own sake: ask only for what is missing.', 'Ask for a longer message.'],
  ['the rubric drops the mentor voice', PROMPT, 'Gentleman mentor voice: prose that talks to the person', 'a neutral voice: text that talks to the person'],
  ['the rubric spells the marker literally', PROMPT, 'starts with the word VOICE-JUDGE followed by a colon', 'starts with VOICE-JUDGE:'],
  ['the rubric loses its signature line', PROMPT, '  PROMPT_SIGNATURE,\n', ''],
  ['the rubric drifts from the settings entry', PROMPT, 'for voice only', 'for tone only'],
  ['the pinned timeout is not the settings one', PROMPT, 'TIMEOUT_SECONDS = 30', 'TIMEOUT_SECONDS = 20'],
  ['the marker is not what the rubric spells', PROMPT, "MARKER = 'VOICE-JUDGE:'", "MARKER = 'VOICE JUDGE:'"],
  ['the signature is the premise judge\'s', PROMPT, "'voice-judge rubric v2.'", "'premise-judge rubric v2.'"],

  // --- THE SHARED JOURNAL GUARD, FOR THE VOICE JUDGE.
  ['the guard does not journal the voice judge', GUARD, '  { mechanism: VOICE_MECHANISM, marker: VOICE_MARKER },\n', ''],
  ['the voice mechanism is not the folder', GUARD, "VOICE_MECHANISM = 'voice-judge'", "VOICE_MECHANISM = 'voice-judgeX'"],
  ['the voice judge is journaled under the premise mechanism', GUARD, '{ mechanism: VOICE_MECHANISM, marker: VOICE_MARKER }', '{ mechanism: MECHANISM, marker: VOICE_MARKER }'],
  ['the premise judge is read with the voice marker', GUARD, '{ mechanism: MECHANISM, marker: MARKER }', '{ mechanism: MECHANISM, marker: VOICE_MARKER }'],
  ['the reasons are read with the default marker only', GUARD, 'judgeReasons(records, marker)', 'judgeReasons(records)'],
  ['the marker of a string is always the premise one', GUARD, "value.includes(marker) ? [value.slice(value.indexOf(marker))]", "value.includes(MARKER) ? [value.slice(value.indexOf(MARKER))]"],
  ['the journaled digests are always the premise ones', GUARD, 'const known = journaledDigests(mechanism);', "const known = journaledDigests('premise-judge');"],
  ['only the premise judge counts its runs', GUARD, 'for (const { mechanism } of JUDGES) incrementFires(mechanism);', 'incrementFires(MECHANISM);'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['voice-judge', 'premise-judge', 'hook-state', 'hook-dispatch', 'bilingual-output', 'settings.json'],
  selftest: 'voice-judge/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
