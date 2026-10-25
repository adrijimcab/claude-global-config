#!/usr/bin/env node
/**
 * Selftest of the voice judge: the WIRING (the settings entry is the rubric of `prompt.mjs`, byte for byte,
 * with its timeout; the rubric holds one `$`, never the literal marker, never sets `impossible`) and the
 * JOURNAL of its blocks through `../premise-judge/journal-guard.mjs` (a voice block lands in the `voice-judge`
 * journal and only there, a premise block never does, runs are counted per judge). Every journal write goes to
 * a temporary `HOOK_STATE_DIR`, never to the live state. It also pins the pure parts of `measure.mjs` (the rubric
 * module it loads, how it reads a verdict and a rule-4 reason, the summary `--rates` prints and the ship bar) and
 * the labels of `fixtures/`, without calling a model.
 *
 * @es Selftest del juez de voz: el CABLEADO (la entrada de settings es la rúbrica de `prompt.mjs`, byte a byte,
 * con su timeout; la rúbrica lleva un solo `$`, nunca la marca literal y nunca fija `impossible`) y el JOURNAL
 * de sus bloqueos por la guardia de `../premise-judge/journal-guard.mjs` (un bloqueo de voz cae en el journal de
 * `voice-judge` y solo ahí, uno de premisas nunca, y las corridas se cuentan por juez). Toda escritura va a un
 * `HOOK_STATE_DIR` temporal. También fija las partes puras de `measure.mjs` (el módulo de rúbrica que carga, cómo
 * lee un veredicto y un motivo de la regla 4, el resumen que imprime `--rates` y la barra) y las etiquetas de
 * `fixtures/`, sin llamar a un modelo.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE = mkdtempSync(path.join(tmpdir(), 'voice-judge-state-'));
const WORK = mkdtempSync(path.join(tmpdir(), 'voice-judge-work-'));

process.env.HOOK_STATE_DIR = STATE;
isolateState('voice-judge');

/**
 * COMPLETION SENTINEL: an import that ran a module's `main()` would end this process half way, green.
 * @es CENTINELA: un import que corriera el `main()` de un módulo terminaría este proceso a mitad, en verde.
 */
let summarised = false;
process.on('exit', () => {
  rmSync(STATE, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
  if (summarised) return;

  console.error('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen');
  process.exitCode = 1;
});

// The live rubric (what the hook runs), the v7 module and the v8f candidate, whose text the rubric checks below pin.
// A missing module is an empty one, so its absence fails checks instead of crashing the run.
const { MARKER, PROMPT: LIVE_PROMPT, TIMEOUT_SECONDS } = await import('./prompt.mjs');
const V7 = await import('./rubrics/v7.mjs').catch(() => ({}));
const { PROMPT = '', PROMPT_SIGNATURE = '' } = await import('./rubrics/v8f.mjs').catch(() => ({}));
const { createHash } = await import('node:crypto');
const sha256 = (text) => createHash('sha256').update(text ?? '').digest('hex');

/** The sha256 of the v7 rubric text live on master on 2026-10-25. @es El sha256 del texto v7 vivo en master. */
const V7_LIVE_SHA256 = 'edceb1c60fc251c65fefcab0b5361aea7ae2b41ebac829a735f54752cbe34ba4';
const { JUDGES: GATE_JUDGES, hookCommand } = await import('../judge-gate/judges.mjs');
const { MARKER: PREMISE_MARKER } = await import('../premise-judge/prompt.mjs');
const { JUDGES, VOICE_MECHANISM, evaluate, journalJudgeBlocks } = await import('../premise-judge/journal-guard.mjs');
const { digestInput, firesPath, journalPath } = await import('../hook-state/journal.mjs');

await new Promise((resolve) => setTimeout(resolve, 100));

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 200)}, expected ${JSON.stringify(expected)?.slice(0, 200)}`);
};

// --- WIRING. @es CABLEADO.
const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
const commandHooks = (settings.hooks?.Stop ?? []).flatMap((group) => group.hooks ?? []).filter((hook) => hook.command === hookCommand('voice'));

check('settings: exactly one command Stop hook runs the voice judge through the gate', commandHooks.length, 1);
check('settings: its timeout is the pinned one', commandHooks[0]?.timeout, TIMEOUT_SECONDS);
check('rubric: the gate runs the live rubric of prompt.mjs, the single source', GATE_JUDGES.voice.prompt === LIVE_PROMPT, true);
check('rubrics: v7 is byte for byte the text live on master, and the candidate is another text', [sha256(V7.PROMPT), V7.PROMPT_SIGNATURE, PROMPT_SIGNATURE, PROMPT !== V7.PROMPT], [V7_LIVE_SHA256, 'voice-judge rubric v7.', 'voice-judge rubric v8f.', true]);
check('rubric: starts with its signature', PROMPT.startsWith(`${PROMPT_SIGNATURE}\n`), true);
check('rubric: the signature is not the premise judge\'s', PROMPT_SIGNATURE.includes('premise-judge'), false);
check('rubric: one $ and it is $ARGUMENTS', [PROMPT.split('$').length - 1, PROMPT.split('$ARGUMENTS').length - 1], [1, 1]);
check('rubric: a first stop and the rewrite after a block are judged the same way', PROMPT.includes('The input may be a first stop or the rewrite after a block (stop_hook_active true), and you judge both the same way, by the rules below.'), true);
check('rubric: the model is no longer asked to test stop_hook_active', PROMPT.includes('If the input field stop_hook_active'), false);
check('rubric: judges only the final message', PROMPT.includes('Judge only the field last_assistant_message.'), true);
check('rubric: never judges earlier messages or the transcript', PROMPT.includes('Never judge earlier messages or anything you could read through transcript_path.'), true);
check('rubric: passes a message addressed to a subagent or peer', PROMPT.includes('addressed to a subagent or a peer session rather than to the owner (for example a brief with MEASURED: and HYPOTHESIS: lines'), true);
check('rubric: passes one or two lines with no status', PROMPT.includes('one or two lines with no status content'), true);
check('rubric: rule 4 looks at what carries the reply, prose or enumerations', PROMPT.includes('Look at what CARRIES it: full-sentence prose paragraphs that tell what happened and why, or enumerations'), true);
check('rubric: enumerations that carry a report fail', PROMPT.includes('when the enumerations carry a status or work report: after the opening sentence the body is mostly bullets, a table or a list of commits, hashes, paths or command results, each with at most a clause of explanation'), true);
check('rubric: rule 8 counts lines, not topics', PROMPT.includes('Rule 8 counts LINES, not topics: it applies only when bullet, numbered or table lines are most of the body.'), true);
check('rubric: names, numbers, commit references and a closing next step inside prose are content', PROMPT.includes('Names, numbers, commit references, file paths and a closing next-step sentence inside prose paragraphs are content, never an enumeration'), true);
check('rubric: a prose reply passes rule 8 even when every paragraph reports on work', PROMPT.includes('a reply made of full-sentence paragraphs with no list passes rule 8 even when every paragraph reports on work done'), true);
check('rubric: a rule 8 block quotes the lines it counted', PROMPT.includes('A block under rule 8 must quote the bullet, numbered or table lines it counted.'), true);
check('rubric: voseo does not rescue a changelog', PROMPT.includes('Voseo does not rescue it: a changelog with an accent is still a changelog.'), true);
check('rubric: prose that explains the why with a closing is the one exception', PROMPT.includes('full-sentence paragraphs explain the why of the decisions and that ends with a closing sentence that lands'), true);
check('rubric: prose with a supporting list passes only when the mentor test is met', PROMPT.includes('when prose carries the message, the mentor test of rule 6 is met and a list only supports it (a few short items, or a command block the owner must run)'), true);
check('rubric: unsure passes only for the tuteo and enumeration rules', PROMPT.includes('When unsure whether rule 4 or rule 8 applies, answer {"ok": true}.'), true);
check('rubric: the signature is the v8f line', PROMPT_SIGNATURE, 'voice-judge rubric v8f.');
check('rubric: tuteo fails only on a quoted tú or usted word, never on a reply with no second person', PROMPT.includes('Rule 4 fails only a tú or usted word that actually appears, and the reason must quote it: a reply with no second-person verb at all'), true);
check('rubric: the mentor test needs every trait the reply needs observable', PROMPT.includes('which means every trait below that the reply needs is observable in it'), true);
check('rubric: a reply fails when a trait it needs is absent', PROMPT.includes('Answer {"ok": false} when a trait the reply needs is absent.'), true);
check('rubric: a one-paragraph reply with no decision needs only (a) and must not be a log', PROMPT.includes('Which traits a reply needs: a reply of one paragraph that carries no decision, no explanation and no correction needs only (a), and it must not be a log of what was done or of who did what;'), true);
check('rubric: a one-paragraph reply with a decision needs all four; a longer one needs (a), (c) and a closing, and (b) and (d) when it states a decision', PROMPT.includes('a one-paragraph reply that carries a decision, an explanation or a correction needs all four; a reply longer than one paragraph needs (a), (c) and a closing sentence, and needs (b) and (d) as well when it states a decision.'), true);
check('rubric: the old all-four rule for every multi-paragraph reply is gone (A/B 2026-10-25)', PROMPT.includes('which means a reply longer than one paragraph whatever it carries'), false);
check('rubric: trait a follows the language of the reply, direct second person in English', PROMPT.includes('(a) It speaks to him as a person, in the language of the reply. In Spanish that is voseo aimed at him, through the pronoun vos, a verb conjugated for vos or an imperative aimed at him,') && PROMPT.includes('In English it is direct second-person address to him.'), true);
check('rubric: trait a in Spanish needs the Rioplatense register as cadence and warmth, and a cold report in voseo is not it', PROMPT.includes('in a Rioplatense register: the warm, colloquial cadence of a porteño mentor talking to him; no particular expression is required, and correct voseo that reads as a cold report is not that register.'), true);
check('rubric: a shared tú and vos form aimed at him is a vos verb for trait a, as rule 4 reads it', PROMPT.includes('A verb form that the tú and the vos conjugations share, aimed at him, is a verb conjugated for vos here too, exactly as rule 4 reads it.'), true);
check('rubric: a clitic te or a possessive tu counts as address only beside a vos verb or vos',PROMPT.includes('A clitic te or a possessive tu aimed at him counts as address only when the reply also has at least one verb conjugated for vos or the pronoun vos.'), true);
check('rubric: in a reply of one or two sentences, a whole sentence of voseo is woven', PROMPT.includes('in a reply of one or two sentences, a whole sentence of voseo aimed at him is woven, not bolted.'), true);
check('rubric: the mentor test lives inside rule 6, after the short-reply pass and before rule 7', PROMPT.indexOf('6. Mentor test') > PROMPT.indexOf('5. Answer') && PROMPT.indexOf('6. Mentor test') < PROMPT.indexOf('7. Otherwise'), true);
check('rubric: trait a is speaking to him in the sentences, not one bolted-on token', PROMPT.includes('woven into the sentences, and not one token bolted onto the opening or the closing line'), true);
check('rubric: a third-person log fails even with a voseo token at its start or end', PROMPT.includes('fails even when its first or last sentence carries a second-person token, because a token there is not speaking to him'), true);
check('rubric: trait b is the why as reasoning, not a log', PROMPT.includes('It carries the why of its decisions as reasoning, in sentences that connect a cause to a choice, and not as a log of what was done.'), true);
check('rubric: one instance of energy is enough, the closing sentence included (A/B 2026-10-25)', PROMPT.includes('or a lesson stated as a principle for any future case; one instance is enough, wherever it sits in the reply, the closing sentence included.'), true);
check('rubric: trait c is one of four forms of energy',PROMPT.includes('at least one rhetorical question, a deliberate emphasis on the point that matters, an image or an analogy, or a lesson stated as a principle for any future case'), true);
check('rubric: trait d is a takeaway or a stance, never only a next step, a promise or an offer', PROMPT.includes('a next step alone, a promise to report back or an offer of more help is not a close that lands, but a closing next step that carries the stance or the principle behind it does land'), true);
check('rubric: a closing question lands only after a stated stance or recommendation', PROMPT.includes('a closing question that asks him to decide lands only when the sentences just before it state a stance or a recommendation of the reply itself'), true);
check('rubric: a form tú and vos share in any tense is never a tuteo failure', PROMPT.includes('A verb form that the tú and the vos conjugations share in any tense is voseo too and never a tuteo failure: the preterite, the imperfect, the present subjunctive and every one-syllable present are shared, and a reason never quotes a shared form as a tú form.'), true);
check('rubric: voseo typed without its accent is voseo', PROMPT.includes('Voseo typed without its written accent is still voseo: a verb whose letters match the vos form once accents are ignored is read as that vos form, never as a tú form.'), true);
check('rubric: voseo is described by its grammar', PROMPT.includes('Voseo is correct and never a failure: a present-indicative verb conjugated for vos, stressed on its ending; an affirmative imperative conjugated for vos, stressed on its final vowel, with or without an attached clitic; the pronoun vos;'), true);
check('rubric: a tú or usted failure is described by its grammar', PROMPT.includes('A tú failure is only a present-indicative verb or an affirmative imperative conjugated for tú whose letters differ from the vos form of the same verb even with accents ignored, such as a stem that splits into a diphthong where vos keeps a single vowel, or an imperative that drops the final vowel vos keeps; a usted failure is a verb conjugated in the third person whose subject is the owner, or the possessive su or sus whose antecedent is the owner himself.'), true);
check('rubric: facts, a diagnosis and an admitted mistake are content, not the traits', PROMPT.includes('Facts, measurements, a diagnosis, an admitted mistake of this turn and a verdict on a result are content, not by themselves traits (b), (c) or (d).'), true);
check('rubric: brevity governs length, never presence, for a one-paragraph reply that carries a decision', PROMPT.includes('Brevity governs length, never presence: a one-paragraph reply that carries a decision, an explanation or a correction needs all four exactly like a long one.'), true);
check('rubric: the tu and usted rule and the caricature rule are intact', [PROMPT.includes('addresses him with tú or usted forms'), PROMPT.includes('slang stacked for its own sake, more than one rhetorical question in a short reply, or capital letters used as decoration')], [true, true]);
check('rubric: a caricature fails even when every trait is present', PROMPT.includes('A caricature fails as well, even when every trait is present:'), true);
check('rubric: the old blanket pass for a short plain reply is gone', [PROMPT.includes('however short or plain'), PROMPT.includes('Never fail a reply merely because it could be warmer.')], [false, false]);
check('rubric: no first-person-only pass remains, and no particular Rioplatense expression is required (A/B 2026-10-25)', [PROMPT.includes('Neutral-register test'), PROMPT.includes('is a first-person voice'), PROMPT.includes('with at least one natural Rioplatense expression')], [false, false, false]);
check('rubric: the Rioplatense register is the floor a caricature overshoots', PROMPT.includes('and the Rioplatense register of (a) is the floor that a caricature overshoots.'), true);
check('rubric: every double-quoted span is a token of the JSON answer, never a phrase to paste', [...new Set([...PROMPT.matchAll(/"([^"]*)"/g)].map((match) => match[1]))].sort(), ['<reason>', 'ok', 'reason']);
check('rubric: it quotes nothing with guillemets, curly quotes or single quotes', [/[«»“”‘’]/u.test(PROMPT), PROMPT.replace('assistant\'s', '').includes('\'')], [false, false]);
check('rubric: its only accented words are the pronoun name tú and the register name porteño, so it holds no accented example word', [...new Set(PROMPT.match(/\p{L}*[^\p{ASCII}]\p{L}*/gu))].sort(), ['porteño', 'tú']);
check('rubric: rules 4, 6 and 11 hold no parenthesised list of three or more words', PROMPT.split('\n').filter((line) => /^(4|6|11)\. /.test(line)).flatMap((line) => [...line.matchAll(/\(([^()]*)\)/g)].map((match) => match[1])).filter((inside) => inside.split(/,\s*|\s+(?:and|or)\s+/).length >= 3), []);
check('rubric: the example word lists of rule 4 are gone', ['(tienes, tiene usted', '(tenés, podés, querés, vos)', '(tenés, probalo, fijate, decime)', '(das, ves, vas)', '(que sepas', '(ten, ven, haz)', 'cierro la unidad'].some((list) => PROMPT.includes(list)), false);
check('rubric: a reply to a subagent or a peer still passes', PROMPT.includes('addressed to a subagent or a peer session rather than to the owner'), true);
check('rubric: the shared-forms sentence sits inside rule 4, before the rule 5 pass', PROMPT.indexOf('A verb form that the tú and the vos conjugations share') > PROMPT.indexOf('4. When the message') && PROMPT.indexOf('A verb form that the tú and the vos conjugations share') < PROMPT.indexOf('5. Answer {"ok": true} when the message is one or two lines'), true);
check('rubric: a Spanish reply with tu or usted forms fails', PROMPT.includes('answer {"ok": false} when it addresses him with tú or usted forms instead of Rioplatense voseo.'), true);
check('rubric: quoted text, code and the words of other people do not count for voseo', PROMPT.includes('Quoted text, code and the words of other people do not count,'), true);
check('rubric: su counts as usted only when its antecedent is the owner', PROMPT.includes('The possessive su or sus counts as usted only when its antecedent is the owner himself; judge it from the antecedent'), true);
check('rubric: a su of a third person never asks to be turned into tu', PROMPT.includes('is never usted, so the reason must not ask to turn it into tu.'), true);
check('rubric: tu alone is not a tuteo marker', PROMPT.includes('tu alone is normal in voseo and does not count'), true);
check('rubric: impersonal officialese is cold and fails', PROMPT.includes('Impersonal officialese with no first-person voice is cold and fails too.'), true);
check('rubric: rule 6 judges register and traits, and the paragraph count only decides which traits a reply needs', PROMPT.includes('Rule 6 judges register and the presence of these traits; the paragraph count decides only which traits a reply needs, never on its own whether it passes.'), true);
check('rubric: the reason names what is missing and where, in terms of the content', PROMPT.includes('then names what is missing and where, in terms of the content of that reply'), true);
check('rubric: the reason never supplies a sentence, an opening, a closing or an expression', PROMPT.includes('The reason never writes, suggests or quotes a sentence, an opening, a closing or an expression for the rewrite to use, and gives no example wording'), true);
check('rubric: the reason is in English, then in Spanish after @es', PROMPT.includes('The reason is written in English first, then the same reason in Spanish after the token @es.'), true);
check('rubric: words quoted inside the reason use single quotes, so the JSON stays valid', PROMPT.includes('Inside the reason, words quoted from the reply go between single quotes, never double quotes, so the JSON answer stays valid.'), true);
check('rubric: the rewrite is in a Gentleman mentor voice in the language of the reply',PROMPT.includes('in a Gentleman mentor voice that speaks to the owner in the language of the reply, Rioplatense voseo in Spanish and direct second person in English.'), true);
check('rubric: the old reason template that listed voseo forms and a tone is gone', [PROMPT.includes('(vos, tenés, podés)'), PROMPT.includes('warm, pleasant')], [false, false]);
check('rubric: the short-reply pass of rule 5 comes before the mentor test', PROMPT.indexOf('one or two lines with no status content') < PROMPT.indexOf('Mentor test'), true);
check('rubric: the subject of a verb is checked before citing a tú form', PROMPT.includes('before citing a tú form check its subject'), true);
check('rubric: a short reply is judged for voseo before it passes', PROMPT.indexOf('addresses him with tú or usted') < PROMPT.indexOf('one or two lines with no status content'), true);
check('rubric: never sets impossible', PROMPT.includes('Never set the field impossible.'), true);
check('rubric: never asks for length for its own sake', PROMPT.includes('Never ask for a longer message for its own sake'), true);
check('rubric: never holds the literal marker', PROMPT.includes(MARKER), false);
check('rubric: spells the marker in words', PROMPT.includes('starts with the word VOICE-JUDGE followed by a colon'), true);
check('rubric: the marker is what the words spell', MARKER, 'VOICE-JUDGE:');
check('rubric: it never answers with impossible true', PROMPT.includes('"impossible": true'), false);

// --- MEASUREMENT: the rubric measure.mjs loads and the summary it prints. @es MEDICIÓN: la rúbrica que carga y el resumen que imprime.
const measure = await import('./measure.mjs');
const rubricModule = (name, body) => {
  const file = path.join(WORK, name);

  writeFileSync(file, body);

  return file;
};
const thrown = async (run) => {
  try {
    await run();

    return 'no error';
  } catch (error) {
    return String(error?.message).split(' @es ')[0];
  }
};
const goodRubric = rubricModule('good.mjs', "export const PROMPT = 'judge $ARGUMENTS';\nexport const MARKER = 'X-JUDGE:';\n");
const noPrompt = rubricModule('no-prompt.mjs', "export const MARKER = 'X-JUDGE:';\n");
const promptWithoutInput = rubricModule('prompt-without-input.mjs', "export const PROMPT = 'judge';\nexport const MARKER = 'X-JUDGE:';\n");
const noMarker = rubricModule('no-marker.mjs', "export const PROMPT = 'judge $ARGUMENTS';\n");
const emptyMarker = rubricModule('empty-marker.mjs', "export const PROMPT = 'judge $ARGUMENTS';\nexport const MARKER = '';\n");
const missingRubric = path.join(WORK, 'missing.mjs');

check('measure: without --rubric it measures the current rubric', measure.rubricPathOf(['--rates']), path.join(HERE, 'prompt.mjs'));
check('measure: --rubric resolves its value', measure.rubricPathOf(['--rubric', goodRubric]), path.resolve(goodRubric));
check('measure: --rubric with no value is an error', await thrown(() => measure.rubricPathOf(['--rates', '--rubric'])), '--rubric needs the path of a rubric module after it');
check('measure: --rubric followed by another flag is an error', await thrown(() => measure.rubricPathOf(['--rubric', '--rates'])), '--rubric needs the path of a rubric module after it');
check('measure: --rubric with an empty value is an error', await thrown(() => measure.rubricPathOf(['--rubric', ''])), '--rubric needs the path of a rubric module after it');
const loaded = (file) => measure.loadRubric(file).catch((error) => ({ error: String(error?.message) }));

check('measure: a rubric module brings its own prompt and marker', await loaded(goodRubric), { path: goodRubric, prompt: 'judge $ARGUMENTS', marker: 'X-JUDGE:' });
check('measure: the current rubric loads with the marker of prompt.mjs', await loaded(measure.DEFAULT_RUBRIC).then((rubric) => [rubric.prompt === LIVE_PROMPT, rubric.marker]), [true, MARKER]);
check('measure: --rubric measures v7 or the v8f candidate by name', [measure.rubricPathOf(['--rubric', 'v7']), measure.rubricPathOf(['--rubric', 'v8f'])], [path.join(HERE, 'rubrics', 'v7.mjs'), path.join(HERE, 'rubrics', 'v8f.mjs')]);
const V8G = await import('./rubrics/v8g.mjs').catch(() => ({}));

check('measure: --rubric measures the v8g candidate by name', measure.rubricPathOf(['--rubric', 'v8g']), path.join(HERE, 'rubrics', 'v8g.mjs'));
check('rubrics: v8g is v8f with the register the owner hears as Argentine, and a Rioplatense turn as address', [V8G.PROMPT_SIGNATURE, V8G.PROMPT?.startsWith('voice-judge rubric v8g.\n'), V8G.PROMPT?.includes('in a Rioplatense register that a porteño reader hears as Argentine: a warm, colloquial cadence carried by natural Rioplatense turns of phrase aimed at him, not by the vos conjugation alone; voseo or shared forms inside an otherwise neutral Spanish lexicon do not sound Argentine and fail (a), however good the content.'), V8G.PROMPT?.includes('no particular expression is required'), V8G.PROMPT?.includes('the pronoun vos, or a colloquial Rioplatense turn or vocative aimed at him, which is address in itself.'), V8G.PROMPT?.split('\n').slice(1).join('\n').length > PROMPT.split('\n').slice(1).join('\n').length], ['voice-judge rubric v8g.', true, true, false, true, true]);
check('promotion: v8g is not live without a MET record either', measure.promotionAllowed(V8G.PROMPT ?? '', V7.PROMPT, measure.readShipBarRecord()), false);
check('measure: a named rubric loads its own text', [await loaded(measure.rubricPathOf(['--rubric', 'v7'])).then((rubric) => rubric.prompt === V7.PROMPT), await loaded(measure.rubricPathOf(['--rubric', 'v8f'])).then((rubric) => rubric.prompt === PROMPT)], [true, true]);

// --- PROMOTION: the live rubric is v7 until measure.mjs records the ship bar MET for the exact live text.
const metRecord = (prompt) => ({ promptSha256: sha256(prompt), met: true });

check('promotion: v7 is always allowed live', measure.promotionAllowed(V7.PROMPT ?? 'v7', V7.PROMPT ?? 'v7', undefined), true);
check('promotion: another rubric is allowed only with a MET record of its exact text', [measure.promotionAllowed(PROMPT, V7.PROMPT, undefined), measure.promotionAllowed(PROMPT, V7.PROMPT, { promptSha256: sha256(PROMPT), met: false }), measure.promotionAllowed(PROMPT, V7.PROMPT, metRecord(`${PROMPT} `)), measure.promotionAllowed(PROMPT, V7.PROMPT, metRecord(PROMPT))], [false, false, false, true]);
check('promotion: the live rubric is allowed by the recorded ship bar', measure.promotionAllowed(LIVE_PROMPT, V7.PROMPT, measure.readShipBarRecord()), true);
check('promotion: the hook runs v7 while the recorded ship bar has not passed', [measure.readShipBarRecord()?.met === true, LIVE_PROMPT === V7.PROMPT], [false, true]);
check('promotion: the ship-bar record lives beside the rubrics', measure.SHIP_BAR_RECORD, path.join(HERE, 'ship-bar.json'));
check('promotion: a ship-bar record names the rubric, its text hash, the verdict and the owner labels', measure.shipBarRecord({ path: '/r/v8f.mjs', prompt: 'P $ARGUMENTS' }, { met: false, en: 'not enough owner labels (2/10)' }, 2, 6, '2026-10-25'), { rubric: '/r/v8f.mjs', promptSha256: sha256('P $ARGUMENTS'), met: false, verdict: 'not enough owner labels (2/10)', ownerLabels: 2, runs: 6, measuredOn: '2026-10-25' });
check('measure: a module with no PROMPT is an error', await thrown(() => measure.loadRubric(noPrompt)), `the rubric module ${noPrompt} exports no PROMPT string holding $ARGUMENTS`);
check('measure: a PROMPT without $ARGUMENTS is an error', await thrown(() => measure.loadRubric(promptWithoutInput)), `the rubric module ${promptWithoutInput} exports no PROMPT string holding $ARGUMENTS`);
check('measure: a module with no MARKER is an error', await thrown(() => measure.loadRubric(noMarker)), `the rubric module ${noMarker} exports no MARKER string`);
check('measure: an empty MARKER is an error', await thrown(() => measure.loadRubric(emptyMarker)), `the rubric module ${emptyMarker} exports no MARKER string`);
check('measure: a module that cannot be loaded is an error', (await thrown(() => measure.loadRubric(missingRubric))).startsWith(`the rubric module ${missingRubric} cannot be loaded: `), true);
const printedErrors = [];
const consoleError = console.error;

console.error = (text) => printedErrors.push(String(text).split(' @es ')[0]);

// `--only` names no fixture, so a mutant that lets a wrong rubric through still reaches no model call.
const noFixture = ['--only', 'no-fixture-has-this-id'];
const exits = [await measure.main(['--rubric', ...noFixture]), await measure.main([...noFixture, '--rubric']), await measure.main([...noFixture, '--rubric', missingRubric])];

console.error = consoleError;
check('measure: a wrong --rubric exits 2 before any model call, and says why', [exits, printedErrors.slice(0, 2), printedErrors.length, printedErrors[2]?.startsWith(`the rubric module ${missingRubric} cannot be loaded: `)], [[2, 2, 2], ['--rubric needs the path of a rubric module after it', '--rubric needs the path of a rubric module after it'], 3, true]);
const printedLines = [];
const consoleLog = console.log;

console.log = (text) => printedLines.push(String(text));

const matrixExit = await measure.main(['--rubric', goodRubric, ...noFixture]);
const matrixLines = printedLines.splice(0);
const ratesExit = await measure.main(['--rates', '--runs', '1', '--rubric', goodRubric, ...noFixture]);

console.log = consoleLog;
check('measure: the matrix view starts and ends with the path of the active rubric, in both languages', [matrixExit, matrixLines[0], matrixLines.at(-1)], [0, `rubric=${goodRubric} @es rúbrica=${goodRubric}`, `rubric=${goodRubric} runs=0 cost=$0.0000 (mean $0.00000/run) latency median=0ms max=0ms @es rúbrica=${goodRubric} corridas=0 costo=$0.0000 (media $0.00000/corrida) latencia mediana=0ms máxima=0ms`]);
check('measure: --rates names the active rubric and never meets the ship bar without owner labels, in both languages', [ratesExit, printedLines[0], printedLines.at(-1)], [1, `rubric=${goodRubric} @es rúbrica=${goodRubric}`, `rubric=${goodRubric} cost=$0.0000 ship-bar(owner labels, every run: recall>=90% and precision>=95%)=not enough owner labels (0/10) @es rúbrica=${goodRubric} costo=$0.0000 barra(etiquetas del dueño, toda corrida: recall>=90% y precisión>=95%)=faltan etiquetas del dueño (0/10)`]);
check('measure: a matrix row says in both languages whether the label was met', [measure.matrixRow('OK', { id: 'f1', expect: 'pass' }, [true, false, null]), measure.matrixRow('MISS', { id: 'f2', expect: 'fail' }, [true]), measure.matrixRow('n/a', { id: 'f3', expect: 'unadjudicated' }, [false])], [
  `OK   ${'f1'.padEnd(40)} expect=${'pass'.padEnd(14)} pass FAIL ? @es bien f1 esperado=pass pasa FALLA ?`,
  `MISS ${'f2'.padEnd(40)} expect=${'fail'.padEnd(14)} pass @es FALLO f2 esperado=fail pasa`,
  `n/a  ${'f3'.padEnd(40)} expect=${'unadjudicated'.padEnd(14)} FAIL @es n/a f3 esperado=unadjudicated FALLA`,
]);

// The three rule-4 false positives of the v8e A/B run (2026-10-25), English halves, each sentence verbatim (the second
// and third abridged by whole sentences): each quotes a pinned
// form or names rule 4 only to say the voseo is correct, and blocks on another trait.
const praisingReasons = [
  ["VOICE-JUDGE: The reply has two paragraphs, so under rule 6 it needs trait (a), trait (c) and a closing sentence, and it needs (b) and (d) because it states a decision. Traits (a) and (b) are present: the voseo forms 'Hacé', 'avisame', 'querés' and the subjunctive 'reinicies' address the owner, and the reasoning 'para que no se pierda ninguna escritura en curso' connects a cause to a choice. Trait (c) is absent: there is no rhetorical question, no deliberate emphasis on the point that matters, no image or analogy, and no lesson stated as a principle for future cases. The closing sentence 'Cuando puedas, avisame si querés que lo integre, y cuando vengas de revisar lo cierro' is a next step and a promise to report back, with no stance or principle behind it, so it does not land.", ['reinicies']],
  ["VOICE-JUDGE: rule 6 fails. The reply is two paragraphs, so it needs traits (a), (c) and a landing close, plus (b) and (d) because it states a recommendation. Trait (a) is present: 'sepas', 'fijate' and 'decime' are voseo aimed at him. Trait (c) is absent: there is no rhetorical question, no deliberate emphasis, no image and no principle, only facts. Trait (b) is absent: the advice to check the session before integrating ('Antes de que lo integres, fijate que tengas la sesión limpia') gives no cause connecting it to the choice.", ['sepas', 'tengas', 'integres']],
  ["VOICE-JUDGE: The reply is two paragraphs, so it needs trait (c), energy that serves the point, and a closing sentence that lands. Both are missing. The second paragraph closes on an offer ('si hace falta que lo revisemos juntos, decime'), which is not a stance. The voseo aimed at the owner ('fijate', 'decime') is present, so rule 4 passes.", ['sepas', 'tengas', 'integres']],
];

// Two more, from the v8g owner-set run of 2026-10-26, sentences verbatim (abridged by whole sentences).
praisingReasons.push(
  ["VOICE-JUDGE: The reply is addressed to the owner in Rioplatense voseo ('sepas', 'fijate', 'decime'), so the address is present. It lacks the energy trait of rule 6(c).", ['sepas', 'tengas', 'integres']],
  ["VOICE-JUDGE: Rule 6 fails on missing traits. The closing sentence 'si hace falta que lo revisemos juntos, decime' is an offer of more help. Voseo in 'fijate' and 'decime' is correct, so rule 4 does not apply.", ['sepas', 'tengas', 'integres']],
);
check('measure: each form of praise is read on its own (constructed, one pattern per sentence)', ["VOICE-JUDGE: The voseo of 'sepas' is correct.", "VOICE-JUDGE: For 'sepas', rule 4 does not apply."].map((reason) => measure.citesRule4(reason, ['sepas'])), [false, false]);
check('measure: a reason that quotes a pinned form or names rule 4 only to call the voseo correct does not cite rule 4', praisingReasons.map(([reason, forms]) => measure.citesRule4(reason, forms)), [false, false, false, false, false]);
check('measure: a sentence that quotes a pinned form as a failure still cites rule 4, beside one that praises another form', [measure.citesRule4("VOICE-JUDGE: 'fijate' is voseo. 'sepas' in line 2 is the problem.", ['sepas']), measure.citesRule4("VOICE-JUDGE: the voseo forms are fine. Rule 4 fails on 'reinicies'.", ['reinicies'])], [true, true]);

const { spawnAsync } = await import('../judge-gate/model.mjs');

check('measure: the model runs through the asynchronous spawn, so --parallel is real', [typeof spawnAsync, measure.MODEL_SPAWN === spawnAsync], ['function', true]);

let inFlight = 0;
let maxInFlight = 0;
const asked = [];
const fakeAsk = async (prompt) => {
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  asked.push(prompt);
  await new Promise((resolve) => setTimeout(resolve, 20));
  inFlight -= 1;

  return { answer: '{"ok": true}', costUsd: 0, durationMs: 20 };
};
const pinnedCount = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json') && Array.isArray(JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8')).pinsRule4)).length;

console.log = (text) => printedLines.push(String(text));
printedLines.splice(0);

const written = [];
const writeRecord = (record) => written.push(record);
const prefixExit = await measure.main(['--rates', '--runs', '2', '--parallel', '3', '--prefix', 'held-owner-', '--rubric', goodRubric], { ask: fakeAsk, writeRecord }).catch((error) => `threw: ${error.message}`);
const prefixLines = printedLines.splice(0);
const prefixAsked = asked.splice(0);
const recordExit = await measure.main(['--rates', '--runs', '1', '--prefix', 'held-owner-', '--record', '--rubric', goodRubric, '--only', 'held-owner-red-5f411d3c-10181322'], { ask: fakeAsk, writeRecord }).catch((error) => `threw: ${error.message}`);

printedLines.splice(0);
check('measure: --rates writes the ship-bar record only with --record, for the rubric it measured', [recordExit, written.length, written[0]?.rubric, written[0]?.promptSha256, written[0]?.met, written[0]?.ownerLabels, written[0]?.runs, /^\d{4}-\d{2}-\d{2}$/.test(written[0]?.measuredOn ?? '')], [1, 1, goodRubric, sha256('judge $ARGUMENTS'), false, 1, 1, true]);

console.log = consoleLog;
check('measure: --prefix selects what --rates measures, plus every rule-4 pin, once per run', [prefixExit, prefixAsked.length, prefixAsked.filter((prompt) => prompt.includes('Ya tomé la decisión que me pidió Discovery')).length], [1, 2 * (1 + pinnedCount), 2]);
check('measure: --parallel keeps that many model calls in flight, and no more', maxInFlight, 3);
check('measure: a scored miss is printed with how it was judged', prefixLines.filter((line) => line.startsWith('    missed red held-owner-')), Array(2).fill('    missed red held-owner-red-5f411d3c-10181322, judged pass @es rojo no detectado held-owner-red-5f411d3c-10181322, juzgado pasa'));
check('measure: --rates measures the held-out set by default, and the bar needs 10 owner labels', [measure.DEFAULT_PREFIX, measure.OWNER_LABELS_NEEDED], ['held-', 10]);
check('measure: --rates measures the requested prefix plus every rule-4 pin', [measure.ratesFixtures([{ id: 'held-a' }, { id: 'real-b' }, { id: 'real-c', pinsRule4: ['x'] }], 'held-').map((fixture) => fixture.id), measure.ratesFixtures([{ id: 'held-a' }, { id: 'real-b' }], 'real-').map((fixture) => fixture.id)], [['held-a', 'real-c'], ['real-b']]);
check('measure: a block is read with the marker of the loaded rubric, with its reason', [measure.judgedOf('{"ok": false, "reason": "X-JUDGE: tuteo"}', 'X-JUDGE:'), measure.judgedOf('{"ok": false, "reason": "X-JUDGE: tuteo"}', MARKER), measure.judgedOf('{"ok": true}', 'X-JUDGE:')], [{ verdict: false, reason: 'X-JUDGE: tuteo' }, { verdict: null, reason: '' }, { verdict: true, reason: '' }]);
check('measure: a reason cites rule 4 by tuteo, usted, a tú form named as such or the rule number', ['VOICE-JUDGE: tuteo in the second line', 'VOICE-JUDGE: an Usted form', 'VOICE-JUDGE: the tú verb', 'VOICE-JUDGE: a tu form in line 2', 'VOICE-JUDGE: a tu-form in line 2', 'VOICE-JUDGE: the tú-forms', 'VOICE-JUDGE: rule 4, quoted word', 'VOICE-JUDGE: regla 4, la palabra'].map((reason) => measure.citesRule4(reason)), [true, true, true, true, true, true, true, true]);
check('measure: a mentor-test reason, the possessive tu, a tú inside a word and rule 40 do not cite rule 4', ['VOICE-JUDGE: trait (d) is absent, the close is only a next step', 'VOICE-JUDGE: the possessive tu of the closing line is a bolted token', 'VOICE-JUDGE: the verb actúa', 'VOICE-JUDGE: rule 40', 'VOICE-JUDGE: regla 40', 'VOICE-JUDGE: the tu formal close'].map((reason) => measure.citesRule4(reason)), [false, false, false, false, false, false]);
check('measure: a reason that only quotes a pinned form cites rule 4, in any quotes and any case', ['VOICE-JUDGE: "das" in line 2', 'VOICE-JUDGE: «Queres» aimed at him', 'VOICE-JUDGE: \'ves\' is wrong'].map((reason) => measure.citesRule4(reason, ['das', 'queres', 'ves'])), [true, true, true]);
check('measure: only the English half of a bilingual reason is read for rule 4', [measure.citesRule4('VOICE-JUDGE: trait (c) is absent @es VOICE-JUDGE: falta el rasgo (c), y no hay tuteo ni forma de tú', []), measure.citesRule4('VOICE-JUDGE: (d) is absent @es VOICE-JUDGE: «sepas» está bien', ['sepas']), measure.citesRule4('VOICE-JUDGE: tuteo in "quieres" @es VOICE-JUDGE: tuteo', [])], [false, false, true]);
check('measure: a pinned form inside a longer quote, or a quoted form that is not pinned, does not', ['VOICE-JUDGE: "das más margen" is a log line', 'VOICE-JUDGE: "dale" closes it'].map((reason) => measure.citesRule4(reason, ['das'])), [false, false]);

const summaryFixtures = [
  { id: 'ow1', expect: 'fail', labelledBy: 'owner' }, { id: 'ow2', expect: 'pass', labelledBy: 'owner' }, { id: 'ow3', expect: 'fail', labelledBy: 'owner' },
  { id: 'a1', expect: 'fail', labelledBy: 'author' }, { id: 'a2', expect: 'fail', labelledBy: 'author' },
  { id: 'a3', expect: 'pass', labelledBy: 'author', pinsRule4: ['das'] }, { id: 'a4', expect: 'pass', labelledBy: 'author' },
  { id: 'a5', expect: 'fail', labelledBy: 'author', pinsRule4: ['sepas'] }, { id: 'a6', expect: 'fail', labelledBy: 'author', pinsRule4: ['su'] },
  { id: 'a7', expect: 'fail', labelledBy: 'author' },
  { id: 'u1', expect: 'unadjudicated' }, { id: 'u2', expect: 'unadjudicated' }, { id: 'u3', expect: 'unadjudicated' },
];
const summaryVerdicts = {
  ow1: { verdict: false, reason: 'VOICE-JUDGE: (a) absent' }, ow2: { verdict: true, reason: '' }, ow3: { verdict: true, reason: '' },
  a1: { verdict: false, reason: 'VOICE-JUDGE: (c) absent' }, a2: { verdict: null, reason: '' },
  a3: { verdict: false, reason: 'VOICE-JUDGE: "das" in line 2' }, a4: { verdict: true, reason: '' },
  a5: { verdict: false, reason: 'VOICE-JUDGE: (b) is a log' }, a6: { verdict: false, reason: 'VOICE-JUDGE: usted in line 2' },
  a7: { verdict: false, reason: 'VOICE-JUDGE: tuteo' },
  u1: { verdict: false, reason: 'VOICE-JUDGE: (d) absent' }, u2: { verdict: true, reason: '' }, u3: { verdict: null, reason: '' },
};
const summary = measure.summarise(summaryFixtures, (fixture) => summaryVerdicts[fixture.id]);

check('measure: the owner set is scored on its own', summary.owner, { red: 2, missedRed: [{ id: 'ow3', verdict: true, reason: '' }], green: 1, blockedGreen: [] });
check('measure: the author set is scored on its own, a malfunction counted as missed', summary.author, { red: 5, missedRed: [{ id: 'a2', verdict: null, reason: '' }], green: 2, blockedGreen: [{ id: 'a3', verdict: false, reason: 'VOICE-JUDGE: "das" in line 2' }] });
check('measure: every unadjudicated verdict is kept with its reason, never scored', summary.unadjudicated, [{ id: 'u1', verdict: false, reason: 'VOICE-JUDGE: (d) absent' }, { id: 'u2', verdict: true, reason: '' }, { id: 'u3', verdict: null, reason: '' }]);
check('measure: a rule-4 false positive is a block citing rule 4 on a pinned fixture only', [summary.pinned, summary.rule4FalsePositives], [3, [{ id: 'a3', reason: 'VOICE-JUDGE: "das" in line 2' }, { id: 'a6', reason: 'VOICE-JUDGE: usted in line 2' }]]);
check('measure: a malfunction is counted', summary.malfunction, 2);
check('measure: --rates prints every line of the summary, in both languages', measure.ratesLines(1, summary), [
  'run 1 owner recall 50.0% (1/2) precision 100.0% (1/1) @es corrida 1 dueño: recall 50.0% (1/2), precisión 100.0% (1/1)',
  '    missed red ow3, judged pass @es rojo no detectado ow3, juzgado pasa',
  'run 1 author recall 80.0% (4/5) precision 50.0% (1/2) @es corrida 1 autor: recall 80.0% (4/5), precisión 50.0% (1/2)',
  '    missed red a2, judged ? @es rojo no detectado a2, juzgado ?',
  '    blocked green a3, judged FAIL: VOICE-JUDGE: "das" in line 2 @es verde bloqueado a3, juzgado FALLA: VOICE-JUDGE: "das" in line 2',
  'run 1 unadjudicated blocked 33.3% (1/3), never scored, for the owner to label @es corrida 1 sin adjudicar: bloqueadas 33.3% (1/3), nunca puntúan, para que las etiquete el dueño',
  '    FAIL u1: VOICE-JUDGE: (d) absent',
  '    pass u2',
  '    ?    u3',
  'run 1 rule-4 false positives 2/3 pinned @es corrida 1 falsos positivos de la regla 4: 2/3 fijados',
  '    rule-4 false positive a3 @es falso positivo de la regla 4: VOICE-JUDGE: "das" in line 2',
  '    rule-4 false positive a6 @es falso positivo de la regla 4: VOICE-JUDGE: usted in line 2',
  'run 1 malfunction=2 @es corrida 1 fallos de funcionamiento=2',
]);

const set = (red, missed, green, blocked) => ({ red, missedRed: Array(missed).fill('x'), green, blockedGreen: Array(blocked).fill('x') });

check('measure: the ship bar is recall 90% and precision 95%, both inclusive', [measure.meetsShipBar(set(10, 1, 20, 1)), measure.meetsShipBar(set(10, 2, 20, 1)), measure.meetsShipBar(set(10, 1, 20, 2))], [true, false, false]);
check('measure: an empty side never meets the ship bar', [measure.meetsShipBar(set(0, 0, 20, 0)), measure.meetsShipBar(set(10, 0, 0, 0))], [false, false]);
check('measure: the ship bar is not computed below 10 owner labels, in both languages', [measure.shipBarOf([set(5, 0, 4, 0)]), measure.shipBarOf([])], [{ met: false, en: 'not enough owner labels (9/10)', es: 'faltan etiquetas del dueño (9/10)' }, { met: false, en: 'not enough owner labels (0/10)', es: 'faltan etiquetas del dueño (0/10)' }]);
check('measure: from 10 owner labels the ship bar is MET only when every run meets it', [measure.shipBarOf([set(5, 0, 5, 0), set(5, 0, 5, 0)]), measure.shipBarOf([set(5, 0, 5, 0), set(5, 1, 5, 0)])], [{ met: true, en: 'MET', es: 'ALCANZADA' }, { met: false, en: 'NOT MET', es: 'NO ALCANZADA' }]);

const fixtureFiles = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => ({ name, fixture: JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8')) }));
const byId = Object.fromEntries(fixtureFiles.map(({ fixture }) => [fixture.id, fixture]));
const wordIn = (form, message) => new RegExp(`(^|[^\\p{L}])${form}([^\\p{L}]|$)`, 'iu').test(message);

check('fixtures: every label is pass, fail or unadjudicated', fixtureFiles.filter(({ fixture }) => !['pass', 'fail', 'unadjudicated'].includes(fixture.expect)).map(({ name }) => name), []);
check('fixtures: every scored label names who set it, owner or author, and an unadjudicated one names nobody', fixtureFiles.filter(({ fixture }) => (fixture.expect === 'unadjudicated' ? fixture.labelledBy !== undefined : !['owner', 'author'].includes(fixture.labelledBy))).map(({ name }) => name), []);
check('fixtures: an owner label carries its date, and no other label does', fixtureFiles.filter(({ fixture }) => (fixture.labelledBy === 'owner' ? !/^\d{4}-\d{2}-\d{2}$/.test(fixture.labelledOn ?? '') : fixture.labelledOn !== undefined)).map(({ name }) => name), []);
check('fixtures: every rule-4 pin lists forms that appear in its message', fixtureFiles.filter(({ fixture }) => fixture.pinsRule4 !== undefined && !(Array.isArray(fixture.pinsRule4) && fixture.pinsRule4.length > 0 && fixture.pinsRule4.every((form) => wordIn(form, fixture.message)))).map(({ name }) => name), []);
check('fixtures: the owner calibration of 2026-10-19 is recorded', [byId['held-owner-red-5f411d3c-10181322'], byId['held-v8-green-c4d7f854-10182025']].map((fixture) => [fixture?.expect, fixture?.labelledBy, fixture?.labelledOn]), [['fail', 'owner', '2026-10-19'], ['pass', 'owner', '2026-10-19']]);
check('fixtures: unaccented voseo and a shared preterite are pinned rule-4 fixtures, labelled by the author', ['voseo-unaccented-queres', 'voseo-shared-preterite-aprobaste'].map((id) => [byId[id]?.pinsRule4, byId[id]?.labelledBy]), [[['queres'], 'author'], [['aprobaste'], 'author']]);
check('fixtures: the two-sentence control passes, its whole voseo sentence woven, and says why', [byId['control-short-reply']?.expect, byId['control-short-reply']?.labelledBy, /whole sentence of voseo aimed at him is woven/.test(byId['control-short-reply']?.source ?? '')], ['pass', 'author', true]);
check('fixtures: the te-only real reply stays unadjudicated, with the clitic reading recorded', [byId['real-v8-red-5f411d3c-10050356']?.expect, /only address to him is the clitic te/.test(byId['real-v8-red-5f411d3c-10050356']?.source ?? '')], ['unadjudicated', true]);
check('fixtures: every real reply is unadjudicated unless the owner labelled it', fixtureFiles.filter(({ fixture }) => /^(real|held)-/.test(fixture.id) && fixture.expect !== 'unadjudicated' && fixture.labelledBy !== 'owner').map(({ name }) => name), []);
check('fixtures: a source never runs two sentences together', fixtureFiles.filter(({ fixture }) => /[a-z]\.[0-9a-z]{4,}/.test((fixture.source ?? '').replace(/\b[\w-]+\.(?:mjs|json|md|ts)\b/g, ''))).map(({ name }) => name), []);
check('fixtures: the owner labels of 2026-10-25 (Log L16) are recorded, two passes and eight fails', [['held-green-5f411d3c-10111846', 'fail'], ['held-v8-green-5f411d3c-10182239', 'fail'], ['held-green-5f411d3c-10111821', 'pass'], ['held-v8-red-5f411d3c-10181521', 'fail'], ['held-v8-red-664a8a26-10182039', 'fail'], ['held-green-5f411d3c-10111648', 'fail'], ['held-green-5f411d3c-10181535', 'fail'], ['held-v8-red-664a8a26-10182209', 'pass'], ['held-v8-red-c4d7f854-10182016', 'fail'], ['held-green-5f411d3c-10181320', 'fail']].filter(([id, expect]) => byId[id]?.expect !== expect || byId[id]?.labelledBy !== 'owner' || byId[id]?.labelledOn !== '2026-10-25').map(([id]) => id), []);
check('fixtures: the owner set holds 12 labels', fixtureFiles.filter(({ fixture }) => fixture.labelledBy === 'owner' && fixture.id.startsWith('held-')).length, 12);
check('fixtures: every file is named for its id', fixtureFiles.filter(({ name, fixture }) => `${fixture.id}.json` !== name).map(({ name }) => name), []);

const sidecar = JSON.parse(readFileSync(path.join(HERE, '..', 'premise-judge', 'journal-guard.mjs.hook-registration.json'), 'utf8'));

check('sidecar: the shared journal guard stays registered on Stop', sidecar.registrations, [{ event: 'Stop' }]);
check('mechanism: the folder name', VOICE_MECHANISM, path.basename(HERE));
check('judges: premise and voice, each with its marker', JUDGES.map((judge) => [judge.mechanism, judge.marker]), [['premise-judge', PREMISE_MARKER], ['voice-judge', MARKER]]);

// --- JOURNAL. @es JOURNAL.
let transcriptCount = 0;
const transcript = (records) => {
  transcriptCount += 1;
  const file = path.join(WORK, `t${transcriptCount}.jsonl`);

  writeFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');

  return file;
};
const feedback = (reason) => ({ type: 'user', isMeta: true, message: { role: 'user', content: `Stop hook feedback:\n${reason}` } });
const stopPayload = (file, extra = {}) => ({ hook_event_name: 'Stop', session_id: 'v1', transcript_path: file, stop_hook_active: true, last_assistant_message: 'ok', ...extra });
const read = (file) => {
  try {
    return readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  } catch {
    return [];
  }
};
const voiceJournal = () => read(journalPath(VOICE_MECHANISM));
const premiseJournal = () => read(journalPath('premise-judge'));
const fires = (mechanism) => {
  try {
    return JSON.parse(readFileSync(firesPath(mechanism), 'utf8')).count;
  } catch {
    return 0;
  }
};

const voiceReason = `${MARKER} rewrite the status as a mentor would: say why each commit was made and close with the next step`;
const premiseReason = `${PREMISE_MARKER} (a) "the docs say" - cite them`;

check('journal: a voice block is journaled', journalJudgeBlocks(stopPayload(transcript([feedback(voiceReason)]))), 1);

const [voiceRecord] = voiceJournal();

check('journal: the voice record is a Stop decision of the voice mechanism', [voiceRecord?.kind, voiceRecord?.event, voiceRecord?.toolUseId], ['decision', 'Stop', null]);
check('journal: the voice reason starts at the marker', voiceRecord?.reason, voiceReason);
check('journal: the voice digest is of session and reason', voiceRecord?.inputDigest, digestInput(`v1\n${voiceReason}`));
check('journal: a voice block is not a premise block', premiseJournal().length, 0);

check('journal: a premise block is journaled', journalJudgeBlocks(stopPayload(transcript([feedback(premiseReason)]), { session_id: 'v2' })), 1);
check('journal: a premise block is not a voice block', [voiceJournal().length, premiseJournal().length], [1, 1]);
check('journal: a voice block seen again is journaled once', journalJudgeBlocks(stopPayload(transcript([feedback(voiceReason)]))), 0);
check('journal: both judges blocking in one stop are two records', journalJudgeBlocks(stopPayload(transcript([feedback(voiceReason), feedback(premiseReason)]), { session_id: 'v3' })), 2);
check('journal: the assistant quoting the voice marker is not a block', journalJudgeBlocks(stopPayload(transcript([{ type: 'assistant', message: { content: [{ type: 'text', text: voiceReason }] } }]), { session_id: 'v4' })), 0);
check('journal: a first stop is never read for voice blocks', journalJudgeBlocks(stopPayload(transcript([feedback(voiceReason)]), { session_id: 'v5', stop_hook_active: false })), 0);

const runsBefore = [fires('premise-judge'), fires(VOICE_MECHANISM)];

check('hook: evaluate never returns a verdict', evaluate(JSON.stringify(stopPayload(transcript([]), { session_id: 'v6' }))), undefined);
check('hook: a Stop counts one run of each judge', [fires('premise-judge') - runsBefore[0], fires(VOICE_MECHANISM) - runsBefore[1]], [1, 1]);

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
summarised = true;
process.exitCode = failures.length === 0 ? 0 : 1;
