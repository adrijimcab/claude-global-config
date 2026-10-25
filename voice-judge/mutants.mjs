#!/usr/bin/env node
/**
 * The decisions of the voice judge, each broken once, that `selftest.mjs` must catch: the wiring of the rubric,
 * the pure parts of `measure.mjs` and how the shared journal guard tells the voice judge's blocks from the premise
 * judge's. The runner lives in `../mutation-proof/run-mutants.mjs` and mutates a COPY. Every kill is an assertion
 * kill (`crashKills: 'fail'`).
 *
 * @es Las decisiones del juez de voz, rotas una a una, que su selftest debe cazar: el cableado de la rúbrica, las
 * partes puras de `measure.mjs` y cómo la guardia de journal compartida distingue los bloqueos del juez de voz de
 * los de premisas.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PROMPT = 'voice-judge/prompt.mjs';
const GUARD = 'premise-judge/journal-guard.mjs';
const MEASURE = 'voice-judge/measure.mjs';

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
  ['a reply with no second person can fail as tuteo', PROMPT, ' Rule 4 fails only a tú or usted word that actually appears, and the reason must quote it: a reply with no second-person verb at all, written in the first and the third person, is not tuteo.', ''],
  ['every su counts as usted whatever its antecedent', PROMPT, ' The possessive su or sus counts as usted only when its antecedent is the owner himself; judge it from the antecedent, and a su that belongs to a third person such as a session, a worker or a tool is never usted, so the reason must not ask to turn it into tu.', ''],
  ['voseo is described by example words again, not by its grammar', PROMPT, 'a present-indicative verb conjugated for vos, stressed on its ending', 'a voseo verb'],
  ['a tú failure is described by example words again, not by its grammar', PROMPT, 'A tú failure is only a present-indicative verb or an affirmative imperative conjugated for tú whose letters differ from the vos form of the same verb even with accents ignored', 'A tú failure is a tú verb'],
  ['the rubric quotes a Spanish phrase again', PROMPT, 'a verb whose subject is a thing or a third person is not a tú form.', 'a verb whose subject is a thing or a third person ("el juez revisa") is not a tú form.'],
  ['the rubric quotes a phrase with guillemets', PROMPT, 'a verb whose subject is a thing or a third person is not a tú form.', 'a verb whose subject is a thing or a third person («el juez revisa») is not a tú form.'],
  ['the rubric lists an accented example word again', PROMPT, 'the pronoun vos; and the possessive tu,', 'the pronoun vos, as in tenés; and the possessive tu,'],
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

  // --- RULE 4: UNACCENTED VOSEO AND THE FORMS TU AND VOS SHARE (DECISION 4).
  ['voseo typed without its accent can fail as tuteo', PROMPT, ' Voseo typed without its written accent is still voseo: a verb whose letters match the vos form once accents are ignored is read as that vos form, never as a tú form.', ''],
  ['a form tú and vos share can fail as tuteo', PROMPT, ' A verb form that the tú and the vos conjugations share in any tense is voseo too and never a tuteo failure: the preterite, the imperfect, the present subjunctive and every one-syllable present are shared, and a reason never quotes a shared form as a tú form.', ''],
  ['a one-syllable present is no longer a shared form', PROMPT, 'the present subjunctive and every one-syllable present are shared', 'the present subjunctive are shared'],
  ['an unaccented vos verb can be quoted as a tú failure', PROMPT, 'whose letters differ from the vos form of the same verb even with accents ignored', 'whose letters differ from the vos form of the same verb'],

  // --- THE MENTOR TEST OF RUBRIC V8 AND ITS FEEDBACK.
  ['the rubric blocks prose with a supporting list', PROMPT, 'Answer {"ok": true} when prose carries the message, the mentor test of rule 6 is met and a list only supports it', 'Answer ok false when a list is present'],
  ['the signature is still v1', PROMPT, "'voice-judge rubric v8.'", "'voice-judge rubric v1.'"],
  ['the signature is the premise judge\'s', PROMPT, "'voice-judge rubric v8.'", "'premise-judge rubric v2.'"],
  ['the rubric blocks when unsure about tuteo and enumerations', PROMPT, 'When unsure whether rule 4 or rule 8 applies, answer {"ok": true}.', 'When unsure whether rule 4 or rule 8 applies, answer ok false.'],
  ['the mentor test needs only one trait', PROMPT, 'which means every trait below that the reply needs is observable in it', 'which means one of these traits is observable in it'],
  ['a reply missing a trait passes', PROMPT, 'Answer {"ok": false} when a trait the reply needs is absent.', 'Answer {"ok": true} when a trait the reply needs is absent.'],
  ['a one-paragraph reply with no decision may be a log (decision 3)', PROMPT, 'needs only (a), and it must not be a log of what was done or of who did what;', 'needs only (a);'],
  ['a one-paragraph reply with no decision needs (b) too (decision 3)', PROMPT, 'needs only (a), and it must not', 'needs (a) and (b), and it must not'],
  ['a reply longer than one paragraph needs only (a) (A/B 2026-10-25)', PROMPT, 'a reply longer than one paragraph needs (a), (c) and a closing sentence, and needs (b) and (d) as well when it states a decision.', 'a reply longer than one paragraph needs only (a).'],
  ['a longer reply that states a decision is exempt from (b) and (d) (A/B 2026-10-25)', PROMPT, ', and needs (b) and (d) as well when it states a decision', ''],
  ['every longer reply needs all four again (A/B 2026-10-25)', PROMPT, 'a one-paragraph reply that carries a decision, an explanation or a correction needs all four; a reply longer', 'every other reply needs all four, which means a reply longer than one paragraph whatever it carries, and a one-paragraph reply that carries a decision, an explanation or a correction needs all four; a reply longer'],
  ['trait a asks for voseo in an English reply too', PROMPT, ' In English it is direct second-person address to him.', ''],
  ['trait a in Spanish is voseo in a neutral register again (decision 2)', PROMPT, ' in a Rioplatense register: the warm, colloquial cadence of a porteño mentor talking to him; no particular expression is required, and correct voseo that reads as a cold report is not that register.', '.'],
  ['trait a demands one Rioplatense expression again (A/B 2026-10-25)', PROMPT, 'no particular expression is required', 'at least one natural Rioplatense expression is required'],
  ['a shared tú and vos verb is no address for trait a (A/B 2026-10-25)', PROMPT, ' A verb form that the tú and the vos conjugations share, aimed at him, is a verb conjugated for vos here too, exactly as rule 4 reads it.', ''],
  ['energy in the closing sentence does not count (A/B 2026-10-25)', PROMPT, '; one instance is enough, wherever it sits in the reply, the closing sentence included', ''],
  ['a closing step that carries its stance does not land (A/B 2026-10-25)', PROMPT, ', but a closing next step that carries the stance or the principle behind it does land', ''],
  ['the reason language is left to the model (rule 11)', PROMPT, ' The reason is written in English first, then the same reason in Spanish after the token @es.', ''],
  ['the reason quotes with double quotes and can break the JSON (rule 11)', PROMPT, ' Inside the reason, words quoted from the reply go between single quotes, never double quotes, so the JSON answer stays valid.', ''],
  ['the Rioplatense register is no longer the floor a caricature overshoots (decision 2)', PROMPT, ', and the Rioplatense register of (a) is the floor that a caricature overshoots', ''],
  ['a clitic or a possessive alone counts as address (decision 5)', PROMPT, ' A clitic te or a possessive tu aimed at him counts as address only when the reply also has at least one verb conjugated for vos or the pronoun vos.', ''],
  ['a whole voseo sentence in a short reply counts as bolted (decision 5)', PROMPT, '; in a reply of one or two sentences, a whole sentence of voseo aimed at him is woven, not bolted', ''],
  ['any closing question counts as a close that lands', PROMPT, ', and a closing question that asks him to decide lands only when the sentences just before it state a stance or a recommendation of the reply itself', ''],
  ['a voseo token at the start or the end counts as speaking to him', PROMPT, ', and not one token bolted onto the opening or the closing line', ''],
  ['a third-person log with a voseo token passes', PROMPT, ' A reply that narrates workers, judges or sessions in the third person, a log of who did what and what is running, fails even when its first or last sentence carries a second-person token, because a token there is not speaking to him.', ''],
  ['a log of what was done counts as the why', PROMPT, ', in sentences that connect a cause to a choice, and not as a log of what was done', ''],
  ['energy is no longer one of four forms', PROMPT, 'at least one rhetorical question, a deliberate emphasis on the point that matters, an image or an analogy, or a lesson stated as a principle for any future case', 'a pleasant tone'],
  ['a next step is a close that lands', PROMPT, '; a next step alone, a promise to report back or an offer of more help is not a close that lands', ''],
  ['a fact or a diagnosis counts as a trait', PROMPT, ' Facts, measurements, a diagnosis, an admitted mistake of this turn and a verdict on a result are content, not by themselves traits (b), (c) or (d).', ''],
  ['a one-paragraph reply that carries a decision is exempt from the mentor test', PROMPT, ' Brevity governs length, never presence: a one-paragraph reply that carries a decision, an explanation or a correction needs all four exactly like a long one.', ''],
  ['the rubric stops failing impersonal officialese', PROMPT, ' Impersonal officialese with no first-person voice is cold and fails too.', ''],
  ['the rubric lets slang caricatures pass', PROMPT, 'slang stacked for its own sake, more than one rhetorical question in a short reply, or capital letters used as decoration', 'nothing stacked'],
  ['a caricature that meets every trait passes', PROMPT, 'A caricature fails as well, even when every trait is present:', 'A caricature fails as well:'],
  ['the rubric judges the mentor test by structure and length', PROMPT, 'Rule 6 judges register and the presence of these traits; the paragraph count decides only which traits a reply needs, never on its own whether it passes.', 'Rule 6 judges structure and length.'],
  ['rule 11 gets a parenthesised list of three words (decision 6)', PROMPT, 'which closing line is only a next step,', 'which closing line (step, promise, offer) is only a next step,'],
  ['the reason stops naming what is missing and where', PROMPT, 'then names what is missing and where, in terms of the content of that reply: which trait of rule 6 is absent', 'then says what to rewrite: which trait of rule 6 is absent'],
  ['the reason may supply a sentence for the rewrite', PROMPT, 'The reason never writes, suggests or quotes a sentence, an opening, a closing or an expression for the rewrite to use, and gives no example wording: ', ''],
  ['the reason template lists voseo forms again', PROMPT, 'voseo in Spanish and direct second person in English.', 'voseo in Spanish (vos, tenés, podés) and direct second person in English.'],
  ['the rubric drops the mentor voice', PROMPT, 'in a Gentleman mentor voice that speaks to the owner in the language of the reply', 'in a neutral voice'],
  ['the rewrite is asked for voseo whatever the language of the reply', PROMPT, 'in the language of the reply, Rioplatense voseo in Spanish and direct second person in English.', 'in voseo.'],
  ['the reason template quotes a phrase to paste', PROMPT, 'and gives no example wording: ', 'and gives no example wording beyond "dale": '],

  // --- THE MEASUREMENT TOOL: THE RUBRIC IT LOADS.
  ['--rubric followed by a flag is read as its path', MEASURE, " || value.startsWith('--')", ''],
  ['--rubric with no value falls through', MEASURE, "value === undefined || value === '' || ", ''],
  ['--rubric with an empty value is read as its path', MEASURE, " || value === ''", ''],
  ['the default rubric is not prompt.mjs', MEASURE, "path.join(HERE, 'prompt.mjs')", "path.join(HERE, 'measure.mjs')"],
  ['a module with no PROMPT is accepted', MEASURE, "typeof module.PROMPT !== 'string' || !module.PROMPT.includes('$ARGUMENTS')", "typeof module.PROMPT !== 'string'"],
  ['a module with no PROMPT at all is accepted', MEASURE, "typeof module.PROMPT !== 'string' || ", ''],
  ['a module with no MARKER is accepted', MEASURE, "typeof module.MARKER !== 'string' || module.MARKER === ''", "module.MARKER === ''"],
  ['an empty MARKER is accepted', MEASURE, " || module.MARKER === ''", ''],
  ['the marker is always the current rubric\'s', MEASURE, 'marker: module.MARKER', "marker: 'VOICE-JUDGE:'"],
  ['a module that cannot be loaded is not named', MEASURE, '`the rubric module ${file} cannot be loaded: ${error?.message ?? error} @es', '`the rubric cannot be loaded @es'],
  ['a wrong --rubric exits 0', MEASURE, '    return 2;\n', '    return 0;\n'],
  ['a wrong --rubric is not printed', MEASURE, '    console.error(String(error?.message ?? error));\n\n    return 2;', '    return 2;'],
  ['the active rubric is not printed first', MEASURE, '  console.log(`rubric=${rubric.path} @es rúbrica=${rubric.path}`);\n', ''],
  ['a block reason is dropped', MEASURE, 'return { verdict: false, reason: read.reason };', "return { verdict: false, reason: '' };"],

  // --- WHAT CITES RULE 4 (DECISION 6).
  ['tuteo is not a rule-4 reason', MEASURE, '/tuteo|usted|', '/usted|'],
  ['usted is not a rule-4 reason', MEASURE, '|usted|', '|'],
  ['a tu form named as such is not a rule-4 reason', MEASURE, '|(^|[^\\p{L}])t[uú][ -]forms?([^\\p{L}]|$)', ''],
  ['a hyphenated tu-form is not a rule-4 reason', MEASURE, 't[uú][ -]forms?', 't[uú] forms?'],
  ['a tú form is not a rule-4 reason', MEASURE, '|(^|[^\\p{L}])tú([^\\p{L}]|$)', ''],
  ['a tú inside a word is a rule-4 reason', MEASURE, '(^|[^\\p{L}])tú([^\\p{L}]|$)', 'tú'],
  ['rule 4 by number is not a rule-4 reason', MEASURE, '/rule 4\\b|regla', '/regla'],
  ['rule 40 is a rule-4 reason', MEASURE, 'rule 4\\b', 'rule 4'],
  ['regla 4 is not a rule-4 reason', MEASURE, '|regla 4\\b/iu', '/iu'],
  ['the rule-4 words are matched case sensitively', MEASURE, '([^\\p{L}]|$)/iu;', '([^\\p{L}]|$)/u;'],
  ['a quoted pinned form is not a rule-4 reason', MEASURE, "|| forms.some((form) => new RegExp(`[\"“«'‘]${form}[\"”»'’]`, 'iu').test(sentence))", '|| false'],
  ['a sentence that praises the voseo still cites rule 4', MEASURE, '    if (PRAISES_VOSEO.test(sentence)) return false;\n', ''],
  ['calling forms voseo is not praise', MEASURE, '\\b(?:is|are) voseo\\b|', ''],
  ['naming the voseo forms is not praise', MEASURE, '|\\bvoseo forms?\\b', ''],
  ['saying rule 4 passes is not praise', MEASURE, '|\\brule 4 (?:passes|holds|is met)\\b', ''],
  ['the reason is read whole, not sentence by sentence', MEASURE, 'reason.split(/(?<=[.;!?])\\s+/u)', '[reason]'],
  ['a quoted pinned form is matched case sensitively', MEASURE, "[\"”»'’]`, 'iu')", "[\"”»'’]`, 'u')"],

  ['the Spanish half of a reason is read for rule 4', MEASURE, "const reason = bilingualReason.split(' @es ')[0];", 'const reason = bilingualReason;'],

  // --- THE MODEL CALLS: ASYNCHRONOUS, BOUNDED, INJECTABLE.
  ['the model runs through the blocking spawn again', MEASURE, 'MODEL_SPAWN = spawnAsync;', 'MODEL_SPAWN = undefined;'],
  ['--parallel keeps one call in flight', MEASURE, 'Array.from({ length: parallel }, async', 'Array.from({ length: 1 }, async'],
  ['--rates drops the injected model call', MEASURE, "Number(option('--parallel', '6')), rubric, ask);", "Number(option('--parallel', '6')), rubric);"],
  ['--prefix is ignored', MEASURE, "option('--prefix', DEFAULT_PREFIX)", 'DEFAULT_PREFIX'],
  ['a scored miss loses how it was judged', MEASURE, "verdict: judgedFor(fixture).verdict, reason: judgedFor(fixture).reason", "verdict: true, reason: ''"],
  ['a missed red is printed without its verdict', MEASURE, ', judged ${shown(verdict)} @es rojo no detectado', ' @es rojo no detectado'],
  ['a blocked green is printed without its reason', MEASURE, "${reason === '' ? '' : `: ${reason}`} @es verde bloqueado", ' @es verde bloqueado'],

  // --- WHO LABELLED WHAT, AND THE SHIP BAR (DECISION 1).
  ['the owner set is every fixture', MEASURE, "owner: scored(fixtures.filter((fixture) => fixture.labelledBy === 'owner'), judgedFor)", 'owner: scored(fixtures, judgedFor)'],
  ['the author set is the owner set', MEASURE, "fixture.labelledBy === 'author'", "fixture.labelledBy === 'owner'"],
  ['unadjudicated verdicts are dropped', MEASURE, "fixture.expect === 'unadjudicated'", "fixture.expect === 'borderline'"],
  ['a rule-4 reason on any fixture is a false positive', MEASURE, 'pinned.filter((fixture) => judgedFor(fixture).verdict === false && citesRule4(', 'fixtures.filter((fixture) => judgedFor(fixture).verdict === false && citesRule4('],
  ['the pinned forms are not read for a rule-4 reason', MEASURE, 'citesRule4(judgedFor(fixture).reason, fixture.pinsRule4)', 'citesRule4(judgedFor(fixture).reason)'],
  ['a missed red is only a pass, never a malfunction', MEASURE, 'red.filter((fixture) => judgedFor(fixture).verdict !== false)', 'red.filter((fixture) => judgedFor(fixture).verdict === true)'],
  ['a malfunction is not what is counted', MEASURE, 'fixtures.filter((fixture) => judgedFor(fixture).verdict === null).length', 'fixtures.filter((fixture) => judgedFor(fixture).verdict === false).length'],
  ['the recall bar is lower', MEASURE, '>= 0.9 &&', '> 0.9 &&'],
  ['the precision bar is lower', MEASURE, '>= 0.95;', '> 0.95;'],
  ['an empty side meets the ship bar', MEASURE, '(whole === 0 ? 0 : part / whole)', '(whole === 0 ? 1 : part / whole)'],
  ['the ship bar needs 9 owner labels', MEASURE, 'OWNER_LABELS_NEEDED = 10', 'OWNER_LABELS_NEEDED = 9'],
  ['the ship bar is computed with any number of owner labels', MEASURE, 'if (labels < OWNER_LABELS_NEEDED)', 'if (labels < 0)'],
  ['one run meeting the bar is enough', MEASURE, 'ownerSets.every(meetsShipBar)', 'ownerSets.some(meetsShipBar)'],
  ['--rates measures the tuning set by default', MEASURE, "DEFAULT_PREFIX = 'held-'", "DEFAULT_PREFIX = 'real-'"],
  ['--rates leaves the rule-4 pins out', MEASURE, 'fixture.id.startsWith(prefix) || Array.isArray(fixture.pinsRule4)', 'fixture.id.startsWith(prefix)'],
  ['--rates ignores the requested prefix', MEASURE, 'fixture.id.startsWith(prefix) ||', 'fixture.id.startsWith(DEFAULT_PREFIX) ||'],

  // --- WHAT --rates AND THE MATRIX PRINT, IN BOTH LANGUAGES (DECISION 6).
  ['the author set is not printed', MEASURE, "    ...scoredLines(run, 'author', 'autor', summary.author),\n", ''],
  ['the unadjudicated verdicts are not listed', MEASURE, "    ...summary.unadjudicated.map(({ id, verdict, reason }) => `    ${shown(verdict).padEnd(4)} ${id}${reason === '' ? '' : `: ${reason}`}`),\n", ''],
  ['the rule-4 false positives are not listed', MEASURE, '    ...summary.rule4FalsePositives.map(({ id, reason }) => `    rule-4 false positive ${id} @es falso positivo de la regla 4: ${reason}`),\n', ''],
  ['a matrix row loses its Spanish half', MEASURE, ' @es ${CUMPLIDO[met]} ${fixture.id} esperado=', ' esperado='],
  ['the matrix summary loses its Spanish half', MEASURE, ' @es rúbrica=${rubric.path} corridas=', ' corridas='],
  ['the ship-bar line loses its Spanish half', MEASURE, ' @es rúbrica=${rubric.path} costo=', ' costo='],

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
