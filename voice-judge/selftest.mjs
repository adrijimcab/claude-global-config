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

const { MARKER, PROMPT, PROMPT_SIGNATURE, TIMEOUT_SECONDS } = await import('./prompt.mjs');
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
check('rubric: the gate runs this rubric, the single source', GATE_JUDGES.voice.prompt === PROMPT, true);
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
check('rubric: the signature is the v8 line', PROMPT_SIGNATURE, 'voice-judge rubric v8.');
check('rubric: tuteo fails only on a quoted tú or usted word, never on a reply with no second person', PROMPT.includes('Rule 4 fails only a tú or usted word that actually appears, and the reason must quote it: a reply with no second-person verb at all'), true);
check('rubric: the mentor test needs every trait the reply needs observable', PROMPT.includes('which means every trait below that the reply needs is observable in it'), true);
check('rubric: a reply fails when a trait it needs is absent', PROMPT.includes('Answer {"ok": false} when a trait the reply needs is absent.'), true);
check('rubric: (a) and (b) hold for every judged reply, (c) and (d) when it carries a decision, an explanation or a correction', PROMPT.includes('Which traits a reply needs: (a) and (b) hold for every reply rule 6 judges, and (c) and (d) are needed when the reply carries a decision, an explanation or a correction.'), true);
check('rubric: a short operational reply needs (a), must not be a third-person log, and needs neither (c) nor (d)', PROMPT.includes('A short operational reply, at most one paragraph of status that carries no decision, no explanation and no correction, needs (a) and must not be a third-person log, which is all that (b) asks of a reply with no decision; it needs neither (c) nor (d).'), true);
check('rubric: trait a follows the language of the reply, direct second person in English', PROMPT.includes('in the language of the reply: in Spanish, voseo aimed at him (the pronoun vos, a verb conjugated for vos, an imperative aimed at him); in English, direct second-person address to him; in either language woven into the sentences'), true);
check('rubric: the mentor test lives inside rule 6, after the short-reply pass and before rule 7', PROMPT.indexOf('6. Mentor test') > PROMPT.indexOf('5. Answer') && PROMPT.indexOf('6. Mentor test') < PROMPT.indexOf('7. Otherwise'), true);
check('rubric: trait a is speaking to him in the sentences, not one bolted-on token', PROMPT.includes('woven into the sentences, and not one token bolted onto the opening or the closing line'), true);
check('rubric: a third-person log fails even with a voseo token at its start or end', PROMPT.includes('fails even when its first or last sentence carries a second-person token, because a token there is not speaking to him'), true);
check('rubric: trait b is the why as reasoning, not a log', PROMPT.includes('It carries the why of its decisions as reasoning, in sentences that connect a cause to a choice, and not as a log of what was done.'), true);
check('rubric: trait c is one of four forms of energy', PROMPT.includes('at least one rhetorical question, a deliberate emphasis on the point that matters, an image or an analogy, or a lesson stated as a principle for any future case'), true);
check('rubric: trait d is a takeaway or a stance, never only a next step, a promise or an offer', PROMPT.includes('a next step alone, a promise to report back or an offer of more help is not a close that lands'), true);
check('rubric: a closing question lands only after a stated stance or recommendation', PROMPT.includes('a closing question that asks him to decide lands only when the sentences just before it state a stance or a recommendation of the reply itself'), true);
check('rubric: forms that tú and vos spell the same are never a tuteo failure', PROMPT.includes('Forms that the tú and the vos conjugations spell the same, such as the one-syllable present forms of a few common verbs, are voseo too and never a tuteo failure.'), true);
check('rubric: voseo is described by its grammar', PROMPT.includes('Voseo is correct and never a failure: a present-indicative verb conjugated for vos, stressed on its ending; an affirmative imperative conjugated for vos, stressed on its final vowel, with or without an attached clitic; the pronoun vos;'), true);
check('rubric: a tú or usted failure is described by its grammar', PROMPT.includes('A tú failure is only an indicative verb conjugated for tú, stressed on its stem, or an affirmative imperative conjugated for tú; a usted failure is a verb conjugated in the third person whose subject is the owner, or the possessive su or sus whose antecedent is the owner himself.'), true);
check('rubric: facts, a diagnosis and an admitted mistake are content, not the traits', PROMPT.includes('Facts, measurements, a diagnosis, an admitted mistake of this turn and a verdict on a result are content, not by themselves traits (b), (c) or (d).'), true);
check('rubric: brevity governs length, never presence, for a short reply that carries a decision', PROMPT.includes('Brevity governs length, never presence: a short reply that carries a decision, an explanation or a correction needs all four exactly like a long one.'), true);
check('rubric: the tu and usted rule and the caricature rule are intact', [PROMPT.includes('addresses him with tú or usted forms'), PROMPT.includes('slang stacked for its own sake, more than one rhetorical question in a short reply, or capital letters used as decoration')], [true, true]);
check('rubric: a caricature fails even when every trait is present', PROMPT.includes('A caricature fails as well, even when every trait is present:'), true);
check('rubric: the old blanket pass for a short plain reply is gone', [PROMPT.includes('however short or plain'), PROMPT.includes('Never fail a reply merely because it could be warmer.')], [false, false]);
check('rubric: no first-person-only pass and no neutral-register test remain', [PROMPT.includes('Neutral-register test'), PROMPT.includes('is a first-person voice'), PROMPT.includes('one or two natural')], [false, false, false]);
check('rubric: every double-quoted span is a token of the JSON answer, never a phrase to paste', [...new Set([...PROMPT.matchAll(/"([^"]*)"/g)].map((match) => match[1]))].sort(), ['<reason>', 'ok', 'reason']);
check('rubric: it quotes nothing with guillemets, curly quotes or single quotes', [/[«»“”‘’]/u.test(PROMPT), PROMPT.replace('assistant\'s', '').includes('\'')], [false, false]);
check('rubric: its only accented word is the pronoun name tú, so it holds no example word list', [...new Set(PROMPT.match(/\p{L}*[^\p{ASCII}]\p{L}*/gu))], ['tú']);
check('rubric: the example word lists of rule 4 are gone', ['(tienes, tiene usted', '(tenés, podés, querés, vos)', '(tenés, probalo, fijate, decime)', '(das, ves, vas)', '(que sepas', '(ten, ven, haz)', 'cierro la unidad'].some((list) => PROMPT.includes(list)), false);
check('rubric: a reply to a subagent or a peer still passes', PROMPT.includes('addressed to a subagent or a peer session rather than to the owner'), true);
check('rubric: a present-subjunctive second-person form is voseo, never a tú failure', PROMPT.includes('A present-subjunctive second-person form is normal Rioplatense voseo and never a tú failure.'), true);
check('rubric: the subjunctive sentence sits inside rule 4, before the rule 5 pass', PROMPT.indexOf('A present-subjunctive second-person form') < PROMPT.indexOf('5. Answer {"ok": true} when the message is one or two lines'), true);
check('rubric: a Spanish reply with tu or usted forms fails', PROMPT.includes('answer {"ok": false} when it addresses him with tú or usted forms instead of Rioplatense voseo.'), true);
check('rubric: quoted text, code and the words of other people do not count for voseo', PROMPT.includes('Quoted text, code and the words of other people do not count,'), true);
check('rubric: su counts as usted only when its antecedent is the owner', PROMPT.includes('The possessive su or sus counts as usted only when its antecedent is the owner himself; judge it from the antecedent'), true);
check('rubric: a su of a third person never asks to be turned into tu', PROMPT.includes('is never usted, so the reason must not ask to turn it into tu.'), true);
check('rubric: tu alone is not a tuteo marker', PROMPT.includes('tu alone is normal in voseo and does not count'), true);
check('rubric: impersonal officialese is cold and fails', PROMPT.includes('Impersonal officialese with no first-person voice is cold and fails too.'), true);
check('rubric: rule 6 judges register and traits, never structure or length', PROMPT.includes('Rule 6 judges register and the presence of these traits, never structure or length.'), true);
check('rubric: the reason names what is missing and where, in terms of the content', PROMPT.includes('then names what is missing and where, in terms of the content of that reply'), true);
check('rubric: the reason never supplies a sentence, an opening, a closing or an expression', PROMPT.includes('The reason never writes, suggests or quotes a sentence, an opening, a closing or an expression for the rewrite to use, and gives no example wording'), true);
check('rubric: the rewrite is in a Gentleman mentor voice in the language of the reply', PROMPT.includes('in a Gentleman mentor voice that speaks to the owner in the language of the reply, voseo in Spanish and direct second person in English.'), true);
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
check('measure: the current rubric loads with the marker of prompt.mjs', await loaded(measure.DEFAULT_RUBRIC).then((rubric) => [rubric.prompt === PROMPT, rubric.marker]), [true, MARKER]);
check('measure: a module with no PROMPT is an error', await thrown(() => measure.loadRubric(noPrompt)), `the rubric module ${noPrompt} exports no PROMPT string holding $ARGUMENTS`);
check('measure: a PROMPT without $ARGUMENTS is an error', await thrown(() => measure.loadRubric(promptWithoutInput)), `the rubric module ${promptWithoutInput} exports no PROMPT string holding $ARGUMENTS`);
check('measure: a module with no MARKER is an error', await thrown(() => measure.loadRubric(noMarker)), `the rubric module ${noMarker} exports no MARKER string`);
check('measure: an empty MARKER is an error', await thrown(() => measure.loadRubric(emptyMarker)), `the rubric module ${emptyMarker} exports no MARKER string`);
check('measure: a module that cannot be loaded is an error', (await thrown(() => measure.loadRubric(missingRubric))).startsWith(`the rubric module ${missingRubric} cannot be loaded: `), true);
const printedErrors = [];
const consoleError = console.error;

console.error = (text) => printedErrors.push(String(text).split(' @es ')[0]);

const exits = [await measure.main(['--rubric']), await measure.main(['--rubric', '--rates']), await measure.main(['--rubric', noMarker])];

console.error = consoleError;
check('measure: a wrong --rubric exits 2 before any model call, and says why', [exits, printedErrors], [[2, 2, 2], ['--rubric needs the path of a rubric module after it', '--rubric needs the path of a rubric module after it', `the rubric module ${noMarker} exports no MARKER string`]]);
check('measure: the held-out prefix', measure.HELD_OUT_PREFIX, 'held-');
check('measure: a block is read with the marker of the loaded rubric, with its reason', [measure.judgedOf('{"ok": false, "reason": "X-JUDGE: tuteo"}', 'X-JUDGE:'), measure.judgedOf('{"ok": false, "reason": "X-JUDGE: tuteo"}', MARKER), measure.judgedOf('{"ok": true}', 'X-JUDGE:')], [{ verdict: false, reason: 'X-JUDGE: tuteo' }, { verdict: null, reason: '' }, { verdict: true, reason: '' }]);
check('measure: a reason cites rule 4 by tuteo, usted, a tú form or the rule number', ['VOICE-JUDGE: tuteo in the second line', 'VOICE-JUDGE: an Usted form', 'VOICE-JUDGE: the tú verb', 'VOICE-JUDGE: rule 4, quoted word', 'VOICE-JUDGE: regla 4, la palabra'].map(measure.citesRule4), [true, true, true, true, true]);
check('measure: a mentor-test reason, the possessive tu, a tú inside a word and rule 40 do not cite rule 4', ['VOICE-JUDGE: trait (d) is absent, the close is only a next step', 'VOICE-JUDGE: the possessive tu of the closing line is a bolted token', 'VOICE-JUDGE: the verb actúa', 'VOICE-JUDGE: rule 40', 'VOICE-JUDGE: regla 40'].map(measure.citesRule4), [false, false, false, false, false]);

const summaryFixtures = [
  { id: 'r1', expect: 'fail' }, { id: 'r2', expect: 'fail' }, { id: 'r3', expect: 'fail' }, { id: 'r4', expect: 'fail' },
  { id: 'g1', expect: 'pass' }, { id: 'g2', expect: 'pass', pinsRule4: true },
  { id: 'o1', expect: 'owner-accepted' }, { id: 'o2', expect: 'owner-accepted' }, { id: 'o3', expect: 'owner-accepted' },
  { id: 'b1', expect: 'borderline' },
  { id: 'p1', expect: 'fail', pinsRule4: true }, { id: 'p2', expect: 'fail', pinsRule4: true },
];
const summaryVerdicts = {
  r1: { verdict: false, reason: 'VOICE-JUDGE: (c) absent' }, r2: { verdict: true, reason: '' }, r3: { verdict: false, reason: 'VOICE-JUDGE: tuteo' }, r4: { verdict: null, reason: '' },
  g1: { verdict: true, reason: '' }, g2: { verdict: false, reason: 'VOICE-JUDGE: tuteo: das' },
  o1: { verdict: false, reason: 'VOICE-JUDGE: (d) absent' }, o2: { verdict: true, reason: '' }, o3: { verdict: null, reason: '' },
  b1: { verdict: null, reason: '' },
  p1: { verdict: false, reason: 'VOICE-JUDGE: (b) is a log' }, p2: { verdict: false, reason: 'VOICE-JUDGE: usted in line 2' },
};
const summary = measure.summarise(summaryFixtures, (fixture) => summaryVerdicts[fixture.id]);

check('measure: recall counts the fail fixtures, precision the pass ones, owner-accepted in neither', [summary.red, summary.missedRed, summary.green, summary.blockedGreen], [6, ['r2', 'r4'], 2, ['g2']]);
check('measure: the owner-accepted fixtures the rubric blocks are counted apart, with their reasons, a malfunction not among them', [summary.accepted, summary.blockedAccepted], [3, [{ id: 'o1', reason: 'VOICE-JUDGE: (d) absent' }]]);
check('measure: every borderline verdict is kept', summary.borderline, [{ id: 'b1', verdict: null }]);
check('measure: a rule-4 false positive is a block citing rule 4 on a pinned fixture only', [summary.pinned, summary.rule4FalsePositives], [3, [{ id: 'g2', reason: 'VOICE-JUDGE: tuteo: das' }, { id: 'p2', reason: 'VOICE-JUDGE: usted in line 2' }]]);
check('measure: a malfunction is counted', summary.malfunction, 3);
check('measure: --rates prints every line of the summary', measure.ratesLines('run 1 held', summary), [
  'run 1 held recall 66.7% (4/6) precision 50.0% (1/2) malfunction=3',
  '    missed red    r2',
  '    missed red    r4',
  '    blocked green g2',
  'run 1 held owner-accepted blocked 33.3% (1/3), the false-positive rate for the owner to adjudicate',
  '    blocked owner-accepted o1: VOICE-JUDGE: (d) absent',
  'run 1 held borderline verdicts (1, never counted)',
  '    borderline ?    b1',
  'run 1 held rule-4 false positives 2/3 pinned',
  '    rule-4 false positive g2: VOICE-JUDGE: tuteo: das',
  '    rule-4 false positive p2: VOICE-JUDGE: usted in line 2',
]);

const bar = (red, missed, green, blocked) => measure.meetsShipBar({ red, missedRed: Array(missed).fill('x'), green, blockedGreen: Array(blocked).fill('x') });

check('measure: the ship bar is recall 90% and precision 95%, both inclusive', [bar(10, 1, 20, 1), bar(10, 2, 20, 1), bar(10, 1, 20, 2)], [true, false, false]);
check('measure: an empty side never meets the ship bar', [bar(0, 0, 20, 0), bar(10, 0, 0, 0)], [false, false]);

const fixtureFiles = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => ({ name, fixture: JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8')) }));

check('fixtures: every label is one of the four classes', fixtureFiles.filter(({ fixture }) => !['pass', 'fail', 'owner-accepted', 'borderline'].includes(fixture.expect)).map(({ name }) => name), []);
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
