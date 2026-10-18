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
  ['the rubric stops telling the model it may see the rewrite after a block', PROMPT, "  '1. The input may be a first stop or the rewrite after a block (stop_hook_active true), and you judge both the same way, by the rules below.',\n", ''],
  ['the rubric asks the model to test stop_hook_active again', PROMPT, 'by the rules below.', 'by the rules below. If the input field stop_hook_active is true, answer ok.'],
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
  ['the rubric stops looking at what carries the reply', PROMPT, 'Look at what CARRIES it:', 'Look at it:'],
  ['a reply with no second person can fail as tuteo', PROMPT, ' Rule 4 fails only a tú or usted word that actually appears, and the reason must quote it: a reply with no second-person verb at all, written in the first person ("cierro la unidad", "me traiga") and the third person ("tiene que quedar"), is not tuteo.', ''],
  ['a present-subjunctive second-person form can fail as tuteo', PROMPT, ' A present-subjunctive second-person form (que sepas, que reinicies, que puedas, que tengas, cuando vuelvas) is normal Rioplatense voseo and never a tú failure; only indicative tú forms (tienes, puedes, quieres, sabes) and imperative tú forms (ten, ven, haz) fail.', ''],
  ['every su counts as usted whatever its antecedent', PROMPT, ' The possessive su or sus counts as usted only when its antecedent is the owner himself; judge it from the antecedent, and a su that belongs to a third person (a session, a worker, a tool: "medidas por su sesión", "Su prueba reprodujo", "subió su declaración") is never usted, so the reason must not ask to turn it into tu.', ''],
  ['the rubric allows impossible', PROMPT, 'Never set the field impossible.', 'Set the field impossible when the owner repeats himself.'],
  ['the rubric asks for length', PROMPT, 'Never ask for a longer message for its own sake: ask only for what is missing.', 'Ask for a longer message.'],
  ['the rubric stops failing tu and usted forms', PROMPT, 'when it addresses him with tú or usted forms', 'when it addresses him in Spanish'],
  ['the rubric counts quotes as tuteo', PROMPT, ' Quoted text, code and the words of other people do not count,', ''],
  ['the rubric fails tu as a possessive', PROMPT, 'tu alone is normal in voseo and does not count', 'tu counts'],
  ['the rubric stops checking the subject of a tu form', PROMPT, 'before citing a tú form check its subject', 'before citing a tú form'],
  ['a short reply passes before voseo is judged', PROMPT, "'3. Answer {\"ok\": true} when the message is addressed", "'0. Answer {\"ok\": true} when it is one or two lines with no status content.',\n  '3. Answer {\"ok\": true} when the message is addressed"],
  ['the rubric spells the marker literally', PROMPT, 'starts with the word VOICE-JUDGE followed by a colon', 'starts with VOICE-JUDGE:'],
  ['the rubric loses its signature line', PROMPT, '  PROMPT_SIGNATURE,\n', ''],
  ['the pinned timeout is not the settings one', PROMPT, 'TIMEOUT_SECONDS = 30', 'TIMEOUT_SECONDS = 20'],
  ['the marker is not what the rubric spells', PROMPT, "MARKER = 'VOICE-JUDGE:'", "MARKER = 'VOICE JUDGE:'"],

  // --- THE MENTOR TEST OF RUBRIC V8 AND ITS FEEDBACK.
  ['the rubric blocks prose with a supporting list', PROMPT, 'Answer {"ok": true} when prose carries the message, the mentor test of rule 6 is met and a list only supports it', 'Answer ok false when a list is present'],
  ['the signature is still v1', PROMPT, "'voice-judge rubric v8.'", "'voice-judge rubric v1.'"],
  ['the signature is the premise judge\'s', PROMPT, "'voice-judge rubric v8.'", "'premise-judge rubric v2.'"],
  ['the rubric blocks when unsure about tuteo and enumerations', PROMPT, 'When unsure whether rule 4 or rule 8 applies, answer {"ok": true}.', 'When unsure whether rule 4 or rule 8 applies, answer ok false.'],
  ['the mentor test needs only one trait', PROMPT, 'which means all four of these traits are observable in it', 'which means one of these traits is observable in it'],
  ['a reply missing a trait passes', PROMPT, 'Answer {"ok": false} when any of the four is absent.', 'Answer {"ok": true} when any of the four is absent.'],
  ['a voseo token at the start or the end counts as speaking to him', PROMPT, ', and not one token bolted onto the opening or the closing line', ''],
  ['a third-person log with a voseo token passes', PROMPT, ' A reply that narrates workers, judges or sessions in the third person, a log of who did what and what is running, fails even when its first or last sentence carries a voseo token, because a token there is not speaking to him.', ''],
  ['a log of what was done counts as the why', PROMPT, ', in sentences that connect a cause to a choice, and not as a log of what was done', ''],
  ['energy is no longer one of four forms', PROMPT, 'at least one rhetorical question, a deliberate emphasis on the point that matters, an image or an analogy, or a lesson stated as a principle for any future case', 'a pleasant tone'],
  ['a next step is a close that lands', PROMPT, '; a next step alone, a promise to report back or an offer of more help is not a close that lands', ''],
  ['a fact or a diagnosis counts as a trait', PROMPT, ' Facts, measurements, a diagnosis, an admitted mistake of this turn and a verdict on a result are content, not by themselves traits (b), (c) or (d).', ''],
  ['a short status reply is exempt from the mentor test', PROMPT, 'Brevity governs length, never presence: a short status reply needs all four exactly like a long one, and the only exception is rule 5. ', ''],
  ['the rubric stops failing impersonal officialese', PROMPT, ' Impersonal officialese with no first-person voice is cold and fails too.', ''],
  ['the rubric lets slang caricatures pass', PROMPT, ' A caricature fails as well: slang stacked for its own sake, more than one rhetorical question in a short reply, or capital letters used as decoration; one deliberate emphasis is energy, a pile of them is noise.', ''],
  ['the rubric judges the mentor test by structure and length', PROMPT, 'Rule 6 judges register and the presence of these traits, never structure or length.', 'Rule 6 judges structure and length.'],
  ['the reason stops naming what is missing and where', PROMPT, 'then names what is missing and where, in terms of the content of that reply: which trait of rule 6 is absent', 'then says what to rewrite: which trait of rule 6 is absent'],
  ['the reason may supply a sentence for the rewrite', PROMPT, 'The reason never writes, suggests or quotes a sentence, an opening, a closing or an expression for the rewrite to use, and gives no example wording: ', ''],
  ['the reason template lists voseo forms again', PROMPT, 'in a Gentleman mentor voice that speaks to the owner in voseo.', 'in a Gentleman mentor voice that speaks to the owner in voseo (vos, tenés, podés).'],
  ['the rubric drops the mentor voice', PROMPT, 'in a Gentleman mentor voice that speaks to the owner in voseo', 'in a neutral voice'],

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
