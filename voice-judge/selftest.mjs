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
const promptHooks = (settings.hooks?.Stop ?? []).flatMap((group) => group.hooks ?? []).filter((hook) => hook.type === 'prompt' && hook.prompt.startsWith(`${PROMPT_SIGNATURE}\n`));

check('settings: exactly one prompt Stop hook is the voice judge', promptHooks.length, 1);
check('settings: its prompt is the rubric of prompt.mjs, byte for byte', promptHooks[0]?.prompt === PROMPT, true);
check('settings: its timeout is the pinned one', promptHooks[0]?.timeout, TIMEOUT_SECONDS);
check('rubric: starts with its signature', PROMPT.startsWith(`${PROMPT_SIGNATURE}\n`), true);
check('rubric: the signature is not the premise judge\'s', PROMPT_SIGNATURE.includes('premise-judge'), false);
check('rubric: one $ and it is $ARGUMENTS', [PROMPT.split('$').length - 1, PROMPT.split('$ARGUMENTS').length - 1], [1, 1]);
check('rubric: passes on stop_hook_active', PROMPT.includes('If the input field stop_hook_active is true, answer {"ok": true}.'), true);
check('rubric: judges only the final message', PROMPT.includes('Judge only the field last_assistant_message.'), true);
check('rubric: never judges earlier messages or the transcript', PROMPT.includes('Never judge earlier messages or anything you could read through transcript_path.'), true);
check('rubric: passes a message addressed to a subagent or peer', PROMPT.includes('addressed to a subagent or a peer session rather than to the owner (for example a brief with MEASURED: and HYPOTHESIS: lines'), true);
check('rubric: passes one or two lines with no status', PROMPT.includes('one or two lines with no status content'), true);
check('rubric: rule 4 looks at what carries the reply, prose or enumerations', PROMPT.includes('Look at what CARRIES it: full-sentence prose paragraphs that tell what happened and why, or enumerations'), true);
check('rubric: enumerations that carry a report fail', PROMPT.includes('when the enumerations carry a status or work report: after the opening sentence the body is mostly bullets, a table or a list of commits, hashes, paths or command results, each with at most a clause of explanation'), true);
check('rubric: voseo does not rescue a changelog', PROMPT.includes('Voseo does not rescue it: a changelog with an accent is still a changelog.'), true);
check('rubric: prose that explains the why with a closing is the one exception', PROMPT.includes('full-sentence paragraphs explain the why of the decisions and that ends with a closing sentence that lands'), true);
check('rubric: prose with a supporting list passes', PROMPT.includes('when prose carries the message and a list only supports it (a few short items, or a command block the owner must run)'), true);
check('rubric: unsure passes', PROMPT.includes('When unsure, answer {"ok": true}.'), true);
check('rubric: the signature is the v3 line', PROMPT_SIGNATURE, 'voice-judge rubric v3.');
check('rubric: a Spanish reply with tu or usted forms fails', PROMPT.includes('answer {"ok": false} when it addresses him with tú or usted forms (tienes, tiene usted, puedes, quieres, su as his possessive) instead of Rioplatense voseo (tenés, podés, querés, vos)'), true);
check('rubric: quoted text, code and the words of other people do not count for voseo', PROMPT.includes('Quoted text, code and the words of other people do not count.'), true);
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
