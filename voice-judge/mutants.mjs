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
  ['the rubric stops telling the model the gate passes continued stops', PROMPT, "  '1. The gate in front of you already passed every continued stop (stop_hook_active true) in code, so you only see first stops.',\n", ''],
  ['the rubric asks the model to test stop_hook_active again', PROMPT, 'so you only see first stops.', 'so you only see first stops. If the input field stop_hook_active is true, answer ok.'],
  ['the rubric judges more than the final message', PROMPT, 'Judge only the field last_assistant_message.', 'Judge the whole input.'],
  ['the rubric judges the transcript too', PROMPT, ' Never judge earlier messages or anything you could read through transcript_path.', ''],
  ['the rubric stops passing briefs to subagents', PROMPT, 'addressed to a subagent or a peer session rather than to the owner', 'addressed to the owner'],
  ['the rubric stops passing one or two lines', PROMPT, 'the message is one or two lines with no status content', 'the message is a long report'],
  ['the rubric lets voseo rescue a changelog', PROMPT, 'Voseo does not rescue it: a changelog with an accent is still a changelog. ', ''],
  ['the rubric drops the enumeration test', PROMPT, 'when the enumerations carry a status or work report', 'when the message is a status report'],
  ['rule 8 stops counting lines', PROMPT, 'Rule 8 counts LINES, not topics: it applies only when bullet, numbered or table lines are most of the body. ', ''],
  ['rule 8 fails names and a closing step inside prose', PROMPT, 'Names, numbers, commit references, file paths and a closing next-step sentence inside prose paragraphs are content, never an enumeration, so ', ''],
  ['rule 8 fails prose that reports on work', PROMPT, ' passes rule 8 even when every paragraph reports on work done.', ' passes rule 8.'],
  ['a rule 8 block need not quote its lines', PROMPT, ' A block under rule 8 must quote the bullet, numbered or table lines it counted.', ''],
  ['the rubric drops the prose exception', PROMPT, 'The one exception is a body whose full-sentence paragraphs explain the why of the decisions and that ends with a closing sentence that lands.', ''],
  ['the rubric blocks prose with a supporting list', PROMPT, 'Answer {"ok": true} when prose carries the message and a list only supports it', 'Answer ok false when a list is present'],
  ['the rubric stops looking at what carries the reply', PROMPT, 'Look at what CARRIES it:', 'Look at it:'],
  ['the signature is still v1', PROMPT, "'voice-judge rubric v6.'", "'voice-judge rubric v1.'"],
  ['a reply with no second person can fail as tuteo', PROMPT, ' Rule 4 fails only a tú or usted word that actually appears, and the reason must quote it: a reply with no second-person verb at all, written in the first person ("cierro la unidad", "me traiga") and the third person ("tiene que quedar"), is not tuteo.', ''],
  ['a first-person reply can fail as cold for lacking a second-person verb', PROMPT, ' Sentences in the first person (cierro, paso, lo medí, me traiga) are a first-person voice, so a reply that explains its why in them is not cold, and a reply is never failed for not addressing him with a second-person verb.', ''],
  ['a present-subjunctive second-person form can fail as tuteo', PROMPT, ' A present-subjunctive second-person form (que sepas, que reinicies, que puedas, que tengas, cuando vuelvas) is normal Rioplatense voseo and never a tú failure; only indicative tú forms (tienes, puedes, quieres, sabes) and imperative tú forms (ten, ven, haz) fail.', ''],
  ['every su counts as usted whatever its antecedent', PROMPT, ' The possessive su or sus counts as usted only when its antecedent is the owner himself; judge it from the antecedent, and a su that belongs to a third person (a session, a worker, a tool: "medidas por su sesión", "Su prueba reprodujo", "subió su declaración") is never usted, so the reason must not ask to turn it into tu.', ''],
  ['the rubric blocks when unsure', PROMPT, 'When unsure, answer {"ok": true}.', 'When unsure, answer ok false.'],
  ['the rubric allows impossible', PROMPT, 'Never set the field impossible.', 'Set the field impossible when the owner repeats himself.'],
  ['the rubric asks for length', PROMPT, 'Never ask for a longer message for its own sake: ask only for what is missing.', 'Ask for a longer message.'],
  ['the rubric stops failing tu and usted forms', PROMPT, 'when it addresses him with tú or usted forms', 'when it addresses him in Spanish'],
  ['the rubric counts quotes as tuteo', PROMPT, ' Quoted text, code and the words of other people do not count,', ''],
  ['the rubric fails tu as a possessive', PROMPT, 'tu alone is normal in voseo and does not count', 'tu counts'],
  ['the rubric stops checking the subject of a tu form', PROMPT, 'before citing a tú form check its subject', 'before citing a tú form'],
  ['the rubric judges coldness by structure', PROMPT, 'Judge register only, never structure or length:', 'Judge structure and length:'],
  ['the rubric stops failing cold replies', PROMPT, 'reads cold, stiff or bureaucratic', 'reads long'],
  ['the rubric drops the simpatico voice', PROMPT, 'simpático, comfortable and pleasant, the voice of a warm Argentine mentor', 'correct and complete'],
  ['the rubric lets slang caricatures pass', PROMPT, ', and a reply overloaded with slang until it is a caricature fails too', ''],
  ['the reason stops asking for voseo and warmth', PROMPT, 'speak to the owner in voseo (vos, tenés, podés) with a warm, pleasant, simpático tone', 'speak to the owner'],
  ['a short reply passes before voseo is judged', PROMPT, "'3. Answer {\"ok\": true} when the message is addressed", "'0. Answer {\"ok\": true} when it is one or two lines with no status content.',\n  '3. Answer {\"ok\": true} when the message is addressed"],
  ['the rubric drops the mentor voice', PROMPT, 'Gentleman mentor voice: prose that talks to the person', 'a neutral voice: text that talks to the person'],
  ['the rubric spells the marker literally', PROMPT, 'starts with the word VOICE-JUDGE followed by a colon', 'starts with VOICE-JUDGE:'],
  ['the rubric loses its signature line', PROMPT, '  PROMPT_SIGNATURE,\n', ''],
  ['the pinned timeout is not the settings one', PROMPT, 'TIMEOUT_SECONDS = 30', 'TIMEOUT_SECONDS = 20'],
  ['the marker is not what the rubric spells', PROMPT, "MARKER = 'VOICE-JUDGE:'", "MARKER = 'VOICE JUDGE:'"],
  ['the signature is the premise judge\'s', PROMPT, "'voice-judge rubric v6.'", "'premise-judge rubric v2.'"],

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
  paths: ['voice-judge', 'premise-judge', 'judge-gate', 'hook-state', 'hook-dispatch', 'bilingual-output', 'settings.json'],
  selftest: 'voice-judge/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
