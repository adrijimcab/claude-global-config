#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the pending judge: its rubric (text, not behaviour: a model call is measured by
 * `measure.mjs`, never by a selftest), its prefilter, its block appendix, and the whole thing through the REAL
 * judge gate with the model call injected over a real transcript and real state files.
 *
 * @es PRUEBA DE DISCRIMINACIÓN del juez de pendientes: su rúbrica (el texto; el comportamiento del modelo lo mide
 * `measure.mjs`), su prefiltro, el apéndice del bloqueo y todo junto por la compuerta REAL con el modelo inyectado,
 * sobre un transcript y ficheros de estado reales.
 */

import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('pending-judge');

const { appendix } = await import('./appendix.mjs');
const { prefilter } = await import('./prefilter.mjs');
const { MARKER, PROMPT, PROMPT_SIGNATURE, TIMEOUT_SECONDS } = await import('./prompt.mjs');
const { decide, MAX_BLOCKS_PER_TURN } = await import('../judge-gate/gate.mjs');
const { JUDGES } = await import('../judge-gate/judges.mjs');
const { blocksThisTurn, lastBlockTimeThisTurn, recordOutcome } = await import('../judge-gate/outcome-log.mjs');
const { dismissalsFile } = await import('../backlog-guard/dismissals.mjs');
const { findCandidate } = await import('../backlog-guard/announcement.mjs');

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 240)}, expected ${JSON.stringify(expected)?.slice(0, 240)}`);
};

// --- THE RUBRIC. @es LA RÚBRICA.
check('rubric: the first line is the signature', PROMPT.split('\n')[0], PROMPT_SIGNATURE);
check('rubric: $ARGUMENTS is the only dollar sign and appears once', [PROMPT.split('$').length - 1, PROMPT.includes('$ARGUMENTS')], [1, true]);
check('rubric: the marker is spelled in words, never literally', PROMPT.includes(MARKER), false);
check('rubric: it names the word PENDING-JUDGE and a colon for the reason', PROMPT.includes('starts with the word PENDING-JUDGE followed by a colon'), true);
check('rubric: it is short (under 6000 characters)', PROMPT.length < 6000, true);
check('rubric: it never asks for a rewrite phrase', [PROMPT.includes('Never ask for a rewrite or suggest a phrase to say'), /\bsay:\s*"/i.test(PROMPT)], [true, false]);
check('rubric: the durable stores are named', ['engram', 'backlog record', 'feature document', 'commit'].every((store) => PROMPT.includes(store)), true);
check('rubric: a cited record is a record (#id, path, hash, topic)', ['#1234', 'odd/tasks/x.md', 'commit hash', 'engram topic'].every((cue) => PROMPT.includes(cue)), true);
check('rubric: «todavía no / aún no / not yet» plus a deferral is pending', ['todavía no', 'aún no', 'not yet'].every((cue) => PROMPT.includes(cue)) && PROMPT.includes('No lo anoto todavía en el backlog.'), true);
check('rubric: a plain negation that says nothing is pending is not pending', PROMPT.includes('A negation that only says nothing is pending is not') && PROMPT.includes('no queda nada pendiente'), true);
check('rubric: it has both-language examples of a block and of a pass', ['Queda por revisar el matcher.', 'I found a defect in the parser; I will fix it later.', 'nothing is left', 'si querés lo agrego al backlog'].every((example) => PROMPT.includes(example)), true);
check('rubric: the signature and the marker are the pinned ones', [PROMPT_SIGNATURE, MARKER], ['pending-judge rubric v1.', 'PENDING-JUDGE:']);
check('rubric: a message whose every item is recorded passes', PROMPT.includes('4. Answer {"ok": true} when every item it leaves for later is recorded:'), true);
check('rubric: a measurement passes', PROMPT.includes('it states a measurement ("queda por debajo de 200 ms", "the latency stays under 200 ms")'), true);
check('rubric: a brief to a subagent or a peer passes', PROMPT.includes('2. Answer {"ok": true} when the message is addressed to a subagent or a peer session rather than to the owner'), true);
check('rubric: it fails open on doubt', PROMPT.includes('When unsure whether something is left for later, answer {"ok": true}'), true);
check('rubric: it never sets impossible', PROMPT.includes('Never set the field impossible'), true);
check('rubric: the timeout is the pinned one', TIMEOUT_SECONDS, 30);
check('judges: the pending judge is registered with its rubric, marker and timeout', [JUDGES.pending.prompt === PROMPT, JUDGES.pending.marker, JUDGES.pending.timeoutSeconds, JUDGES.pending.mechanism], [true, MARKER, 30, 'pending-judge']);

// --- THE PREFILTER, with every dependency injected. @es EL PREFILTRO, con toda dependencia inyectada.
const payloadOf = (extra = {}) => ({ session_id: 's-p', stop_hook_active: false, last_assistant_message: 'x', ...extra });
const FINDING = { marker: 'backlog', sessionId: 's-p', transcriptPath: 't' };
const seen = [];
// `owes: undefined` must mean «nothing owed», so the default is applied by presence and not by value.
// @es `owes: undefined` debe significar «nada debido»: el valor por defecto se aplica por presencia.
const deps = (options = {}) => {
  const owes = 'owes' in options ? options.owes : FINDING;

  return {
    owes: () => owes,
    lastBlockTime: (judge, session) => {
      seen.push(['lastBlockTime', judge, session]);

      return options.blockedAt;
    },
    dismissed: (session, since) => {
      seen.push(['dismissed', session, since]);

      return options.dismissed === true;
    },
  };
};

check('prefilter: no candidate owed -> the model is not asked', prefilter(payloadOf(), deps({ owes: undefined })), false);
check('prefilter: a candidate owed on a first stop -> asked', prefilter(payloadOf(), deps()), true);
seen.length = 0;
check('prefilter: a first stop never reads the dismissals', [prefilter(payloadOf(), deps({ blockedAt: 5, dismissed: true })), seen.length], [true, 0]);
check('prefilter: a continued stop with no block of this turn -> asked', prefilter(payloadOf({ stop_hook_active: true }), deps({ blockedAt: undefined, dismissed: true })), true);
seen.length = 0;
check('prefilter: a continued stop after a block that the session dismissed -> not asked', prefilter(payloadOf({ stop_hook_active: true }), deps({ blockedAt: 1234, dismissed: true })), false);
check('prefilter: it asks for the block of the pending judge in this session, and the dismissals after it', seen, [['lastBlockTime', 'pending', 's-p'], ['dismissed', 's-p', 1234]]);
check('prefilter: a continued stop after a block with no dismissal -> asked', prefilter(payloadOf({ stop_hook_active: true }), deps({ blockedAt: 1234, dismissed: false })), true);
check('prefilter: a continued stop with no candidate owed -> not asked, dismissal or not', prefilter(payloadOf({ stop_hook_active: true }), deps({ owes: undefined, blockedAt: 1, dismissed: false })), false);
seen.length = 0;
prefilter(payloadOf({ stop_hook_active: true, session_id: undefined }), deps({ blockedAt: 1 }));
check('prefilter: a payload with no session id asks with the empty session', seen[0], ['lastBlockTime', 'pending', '']);

// --- THE APPENDIX. @es EL APÉNDICE.
const text = appendix({ session_id: 'sess-7', last_assistant_message: 'Queda pendiente el cambio del hook.' });

check('appendix: it is bilingual', text.includes('@es Tu mensaje final deja el ítem') && text.includes('Your final message leaves the item above'), true);
check('appendix: it offers recording and dismissing, in both languages', ['RECORD IT', 'DISMISS IT', 'REGISTRALO', 'DESCARTALO'].every((word) => text.includes(word)), true);
check('appendix: it offers committing the versioned document', text.includes('git commit -- <repo>/checklists/master-backlog.md') && text.includes('o commiteá el documento versionado'), true);
check('appendix: the dismiss command carries the session and the marker that fired', text.includes('--session sess-7 --marker "pendiente"'), true);
check('appendix: the dismiss command points at the real dismiss.mjs', text.includes('backlog-guard') && text.includes('dismiss.mjs'), true);
check('appendix: it states the cap', text.includes('at most twice per turn') && text.includes('como mucho dos veces'), true);
check('appendix: with no marker the dismissal is recorded under the judge', appendix({ session_id: 's', last_assistant_message: 'ok' }).includes('--marker "pending-judge"'), true);
check('appendix: with no session it still builds', appendix({}).includes('--session unknown'), true);
check('appendix: a non-object input still builds', appendix(undefined).includes('--session unknown'), true);

// --- THE FIXTURES of `measure.mjs`: well formed, and every one the judge must block is REACHED by the prefilter
// --- (the pipeline's recall is the prefilter's AND the judge's; the judge's half is measured, this half is exact).
// @es LOS FIXTURES de `measure.mjs`: bien formados, y cada uno que el juez debe bloquear LLEGA por el prefiltro.
{
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
  const fixtures = readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => ({ name, ...JSON.parse(readFileSync(path.join(dir, name), 'utf8')) }));
  const blocks = fixtures.filter((fixture) => fixture.expect === 'fail');

  check('fixtures: there are real and synthetic ones, of the three kinds', [fixtures.length >= 100, blocks.length >= 25, fixtures.some((fixture) => fixture.expect === 'pass'), fixtures.some((fixture) => fixture.expect === 'unknowable'), fixtures.some((fixture) => String(fixture.source).startsWith('real')), fixtures.some((fixture) => String(fixture.source).startsWith('synthetic') || String(fixture.source).startsWith('JUDGES'))], [true, true, true, true, true, true]);
  check('fixtures: every one is well formed, named by its file', fixtures.every((fixture) => fixture.name === `${fixture.id}.json` && ['fail', 'pass', 'unknowable'].includes(fixture.expect) && typeof fixture.source === 'string' && typeof fixture.message === 'string' && fixture.message.trim() !== ''), true);
  check('fixtures: the ids are unique', new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
  check('fixtures: the prefilter reaches EVERY fixture the judge must block', blocks.filter((fixture) => findCandidate(fixture.message) === undefined).map((fixture) => fixture.id), []);
  check('fixtures: the sentences the judges of 2026-10-19 confirmed are all there and all reach the judge', ['judges-post-posed-not-yet', 'judges-enclitic-verlo', 'judges-enclitic-darle', 'judges-enclitic-irse', 'judges-enclitic-avisarme', 'judges-enclitic-pasarte'].map((id) => { const found = fixtures.find((fixture) => fixture.id === id); return [found?.expect, found === undefined ? false : findCandidate(found.message) !== undefined]; }), Array(6).fill(['fail', true]));
}

// --- THE WHOLE JUDGE THROUGH THE REAL GATE, model injected, real transcript and state. @es TODO POR LA COMPUERTA REAL.
const scratch = mkdtempSync(path.join(tmpdir(), 'pending-judge-selftest-'));

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

const transcript = path.join(scratch, 'transcript.jsonl');
const REASON = `${MARKER} "Queda pendiente el cambio del hook." is left for later and no record of it is cited.`;
const asked = [];
const answering = (answer) => async (prompt) => {
  asked.push(prompt);

  return { answer, costUsd: 0.0002, durationMs: 800 };
};
const blocking = answering(JSON.stringify({ ok: false, reason: REASON }));
const passing = answering('{"ok": true}');
let sessionCounter = 0;
const newSession = () => `sess-${String((sessionCounter += 1))}`;
const rawOf = (session, message, extra = {}) => JSON.stringify({ hook_event_name: 'Stop', session_id: session, transcript_path: transcript, stop_hook_active: false, last_assistant_message: message, ...extra });
const gate = (raw, ask) => decide({ judge: JUDGES.pending, raw, ask, nested: false, blocksThisTurn: () => 0 });
const PENDING = 'Queda pendiente el cambio del hook.';

writeFileSync(transcript, '{"type":"assistant","text":"turn start"}\n', 'utf8');

{
  const session = newSession();

  asked.length = 0;
  const silent = await gate(rawOf(session, 'Listo, todo verde.'), blocking);

  check('gate: a message with no marker passes with no model call', [silent.outcome, asked.length, silent.costUsd], ['pass-prefilter', 0, 0]);
}
{
  const session = newSession();

  asked.length = 0;
  const blocked = await gate(rawOf(session, PENDING), blocking);

  check('gate: a marker with nothing saved asks the model and blocks', [blocked.outcome, asked.length], ['block', 1]);
  check('gate: the block carries the judge reason and then the fixed instructions', [blocked.reason.startsWith(REASON), blocked.reason.includes('RECORD IT'), blocked.reason.includes(`--session ${session}`)], [true, true, true]);
  check('gate: the model sees the whole hook input in the rubric', asked[0].includes(JSON.stringify(JSON.parse(rawOf(session, PENDING)))), true);

  asked.length = 0;
  const passed1 = await gate(rawOf(session, PENDING), passing);

  check('gate: a marker the judge clears (a record is cited, or nothing is left) passes', [passed1.outcome, asked.length], ['pass', 1]);
}
{
  const session = newSession();

  appendFileSync(transcript, '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master"}}\n', 'utf8');
  asked.length = 0;
  const saved = await gate(rawOf(session, PENDING), blocking);

  check('gate: a turn that saved to the master backlog passes with no model call', [saved.outcome, asked.length], ['pass-prefilter', 0]);
}
{
  // The dismissal path: block, then a dismissal LATER than the block ends the question for the turn.
  // @es El camino del descarte: un descarte POSTERIOR al bloqueo cierra la pregunta del turno.
  const session = newSession();

  writeFileSync(transcript, '{"type":"assistant","text":"a new turn"}\n', 'utf8');
  const first = await gate(rawOf(session, PENDING), blocking);

  check('dismissal: the first stop blocks', first.outcome, 'block');
  recordOutcome('pending', session, first);
  check('dismissal: the block is counted for the turn', blocksThisTurn('pending', session), 1);

  const blockedAt = lastBlockTimeThisTurn('pending', session);
  const dismiss = (at) => appendFileSync(dismissalsFile(), `${JSON.stringify({ at: new Date(at).toISOString(), session, marker: 'pendiente', reason: 'a written reason of more than twenty-five characters' })}\n`, 'utf8');

  mkdirSync(path.dirname(dismissalsFile()), { recursive: true });
  asked.length = 0;
  check('dismissal: with no dismissal the rewrite is judged again', [(await gate(rawOf(session, PENDING, { stop_hook_active: true }), blocking)).outcome, asked.length], ['block', 1]);

  dismiss(blockedAt - 60000);
  asked.length = 0;
  check('dismissal: a dismissal from BEFORE the block silences nothing', [(await gate(rawOf(session, PENDING, { stop_hook_active: true }), blocking)).outcome, asked.length], ['block', 1]);

  dismiss(blockedAt + 5000);
  asked.length = 0;
  const dismissed = await gate(rawOf(session, PENDING, { stop_hook_active: true }), blocking);

  check('dismissal: a dismissal AFTER the block ends the question with no model call', [dismissed.outcome, asked.length, dismissed.continued], ['pass-prefilter', 0, true]);

  const other = newSession();

  recordOutcome('pending', other, first);
  asked.length = 0;
  check('dismissal: another session\'s dismissal does not end this one\'s', [(await gate(rawOf(other, PENDING, { stop_hook_active: true }), blocking)).outcome, asked.length], ['block', 1]);
}
{
  // The cap is the gate's: two blocks in a turn and the continued stop passes without even the prefilter.
  // @es El tope es de la compuerta: con dos bloqueos el turno pasa.
  const session = newSession();
  const capped = await decide({ judge: JUDGES.pending, raw: rawOf(session, PENDING, { stop_hook_active: true }), ask: blocking, nested: false, blocksThisTurn: () => MAX_BLOCKS_PER_TURN });

  check('cap: the per-turn block cap passes a continued stop, the same as the other judges', capped.outcome, 'pass-continued-capped');
}

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
