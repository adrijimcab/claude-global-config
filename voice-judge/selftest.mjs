#!/usr/bin/env node
/**
 * Selftest of the voice judge: the WIRING (the settings entry is the rubric of `prompt.mjs`, byte for byte,
 * with its timeout; the rubric holds one `$`, never the literal marker, never sets `impossible`) and the
 * JOURNAL of its blocks through `../premise-judge/journal-guard.mjs` (a voice block lands in the `voice-judge`
 * journal and only there, a premise block never does, runs are counted per judge). Every journal write goes to
 * a temporary `HOOK_STATE_DIR`, never to the live state.
 *
 * @es Selftest del juez de voz: el CABLEADO (la entrada de settings es la rúbrica de `prompt.mjs`, byte a byte,
 * con su timeout; la rúbrica lleva un solo `$`, nunca la marca literal y nunca fija `impossible`) y el JOURNAL
 * de sus bloqueos por la guardia de `../premise-judge/journal-guard.mjs` (un bloqueo de voz cae en el journal de
 * `voice-judge` y solo ahí, uno de premisas nunca, y las corridas se cuentan por juez). Toda escritura va a un
 * `HOOK_STATE_DIR` temporal.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const { hookCommand, loadJudges } = await import('../judge-gate/judges.mjs');
const GATE_JUDGES = await loadJudges();
const { MARKER: PREMISE_MARKER } = await import('../premise-judge/prompt.mjs');
const { MARKER: PENDING_MARKER } = await import('../pending-judge/prompt.mjs');
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
check('rubric: prose with a supporting list passes', PROMPT.includes('when prose carries the message and a list only supports it (a few short items, or a command block the owner must run)'), true);
check('rubric: unsure passes', PROMPT.includes('When unsure, answer {"ok": true}.'), true);
check('rubric: the signature is the v7 line', PROMPT_SIGNATURE, 'voice-judge rubric v7.');
check('rubric: tuteo fails only on a quoted tú or usted word, never on a reply with no second person', PROMPT.includes('Rule 4 fails only a tú or usted word that actually appears, and the reason must quote it: a reply with no second-person verb at all'), true);
check('rubric: a first-person reply is not cold when it also speaks to him somewhere', PROMPT.includes('so a reply that explains its why in them and also speaks to him somewhere is not cold.'), true);
check('rubric: the neutral-register test fails a long reply that never speaks to the owner', PROMPT.includes('Neutral-register test, for a reply to the owner of more than two lines: answer {"ok": false} when NO sentence anywhere speaks to him'), true);
check('rubric: the neutral-register test lives inside rule 6, before rule 7', PROMPT.indexOf('Neutral-register test') > PROMPT.indexOf('6. Also answer') && PROMPT.indexOf('Neutral-register test') < PROMPT.indexOf('7. Otherwise'), true);
check('rubric: the neutral-register test scans the whole reply before failing', PROMPT.includes('scan the whole reply for these before you decide, since a single one is enough to pass'), true);
check('rubric: a short stand-alone principle is the mentor voice that passes the neutral test', PROMPT.includes('no short stand-alone sentence that states a general principle or lesson for any future case'), true);
check('rubric: a diagnosis or a mistake of this turn is still only a fact', PROMPT.includes('admitting a mistake of this turn or judging a result'), true);
check('rubric: the tu and usted rule and the caricature rule are intact', [PROMPT.includes('addresses him with tú or usted forms'), PROMPT.includes('overloaded with slang until it is a caricature fails too')], [true, true]);
check('rubric: the old blanket pass for a short plain reply is gone', [PROMPT.includes('however short or plain'), PROMPT.includes('Never fail a reply merely because it could be warmer.')], [false, false]);
check('rubric: a reply that speaks to him, or carries a principle, is never failed by the neutral test', PROMPT.includes('A reply that speaks to him even once in voseo, or that carries such a sentence of reflection or lesson in prose, is never failed by this test'), true);
check('rubric: a past form like pediste does not count as speaking to him', PROMPT.includes('The possessive tu or tus and a past form such as pediste or dejaste do not count as speaking to him.'), true);
check('rubric: a reply to a subagent or a peer still passes', PROMPT.includes('addressed to a subagent or a peer session rather than to the owner'), true);
check('rubric: a present-subjunctive second-person form is voseo, never a tú failure', PROMPT.includes('A present-subjunctive second-person form (que sepas, que reinicies, que puedas, que tengas, cuando vuelvas) is normal Rioplatense voseo and never a tú failure; only indicative tú forms (tienes, puedes, quieres, sabes) and imperative tú forms (ten, ven, haz) fail.'), true);
check('rubric: the subjunctive sentence sits inside rule 4, before the rule 5 pass', PROMPT.indexOf('A present-subjunctive second-person form') < PROMPT.indexOf('5. Answer {"ok": true} when the message is one or two lines'), true);
check('rubric: a Spanish reply with tu or usted forms fails', PROMPT.includes('answer {"ok": false} when it addresses him with tú or usted forms (tienes, tiene usted, puedes, quieres, su as his possessive) instead of Rioplatense voseo (tenés, podés, querés, vos)'), true);
check('rubric: quoted text, code and the words of other people do not count for voseo', PROMPT.includes('Quoted text, code and the words of other people do not count,'), true);
check('rubric: su counts as usted only when its antecedent is the owner', PROMPT.includes('The possessive su or sus counts as usted only when its antecedent is the owner himself; judge it from the antecedent'), true);
check('rubric: a su of a third person never asks to be turned into tu', PROMPT.includes('is never usted, so the reason must not ask to turn it into tu.'), true);
check('rubric: tu alone is not a tuteo marker', PROMPT.includes('tu alone is normal in voseo and does not count'), true);
check('rubric: a cold, stiff or bureaucratic reply fails', PROMPT.includes('reads cold, stiff or bureaucratic'), true);
check('rubric: the wanted voice is simpatico, comfortable and pleasant', PROMPT.includes('simpático, comfortable and pleasant, the voice of a warm Argentine mentor'), true);
check('rubric: slang is limited to one or two natural expressions', PROMPT.includes('one or two natural Rioplatense expressions at most, and a reply overloaded with slang until it is a caricature fails too'), true);
check('rubric: the reason asks for voseo and warmth', PROMPT.includes('speak to the owner in voseo (vos, tenés, podés) with a warm, pleasant, simpático tone'), true);
check('rubric: a short reply passes before the coldness rule is applied', PROMPT.indexOf('one or two lines with no status content') < PROMPT.indexOf('reads cold, stiff or bureaucratic'), true);
check('rubric: coldness is register only, voseo first person is not cold', PROMPT.includes('Judge register only, never structure or length: a reply in the first person that speaks to him directly in voseo'), true);
check('rubric: the subject of a verb is checked before citing a tú form', PROMPT.includes('before citing a tú form check its subject'), true);
check('rubric: a short reply is judged for voseo before it passes', PROMPT.indexOf('addresses him with tú or usted') < PROMPT.indexOf('one or two lines with no status content'), true);
check('rubric: never sets impossible', PROMPT.includes('Never set the field impossible.'), true);
check('rubric: never asks for length for its own sake', PROMPT.includes('Never ask for a longer message for its own sake'), true);
check('rubric: the reason asks for the Gentleman mentor voice in prose', PROMPT.includes('Gentleman mentor voice: prose that talks to the person with warmth and energy, the why of each decision in sentences, a list only where a list genuinely helps, and a closing that lands'), true);
check('rubric: never holds the literal marker', PROMPT.includes(MARKER), false);
check('rubric: spells the marker in words', PROMPT.includes('starts with the word VOICE-JUDGE followed by a colon'), true);
check('rubric: the marker is what the words spell', MARKER, 'VOICE-JUDGE:');
check('rubric: it never answers with impossible true', PROMPT.includes('"impossible": true'), false);

const sidecar = JSON.parse(readFileSync(path.join(HERE, '..', 'premise-judge', 'journal-guard.mjs.hook-registration.json'), 'utf8'));

check('sidecar: the shared journal guard stays registered on Stop', sidecar.registrations, [{ event: 'Stop' }]);
check('mechanism: the folder name', VOICE_MECHANISM, path.basename(HERE));
check('judges: premise, voice and pending, each with its marker', JUDGES.map((judge) => [judge.mechanism, judge.marker]), [['premise-judge', PREMISE_MARKER], ['voice-judge', MARKER], ['pending-judge', PENDING_MARKER]]);

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
