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

import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('pending-judge');

const { appendix } = await import('./appendix.mjs');
const { unavailableBlock } = await import('./fallback.mjs');
const { prefilter } = await import('./prefilter.mjs');
const { MARKER, PROMPT, PROMPT_SIGNATURE, TIMEOUT_SECONDS } = await import('./prompt.mjs');
const { describeShipBar, excerptAround, ownerPacket, PACKET_EXCERPT_CHARS, PROVENANCES, SHIP_BAR_OWNER_LABELS, shipBar } = await import('./measure.mjs');
const { decide, MAX_BLOCKS_PER_TURN } = await import('../judge-gate/gate.mjs');
const { loadJudge } = await import('../judge-gate/judges.mjs');
const { blocksThisTurn, lastBlockTimeThisTurn, recordOutcome } = await import('../judge-gate/outcome-log.mjs');
const { dismissalsFile } = await import('../backlog-guard/dismissals.mjs');
const { refusalsFile } = await import('../backlog-guard/degradation-journal.mjs');
const { readOffsetState } = await import('../backlog-guard/state.mjs');
const { findCandidate } = await import('../backlog-guard/announcement.mjs');
const { advanceTurnWindow } = await import('../backlog-guard/turn-window.mjs');

const PENDING_JUDGE = await loadJudge('pending');

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
check('rubric: a record is the record OF THAT ITEM (master backlog, its engram id, its feature-document entry)', ['A message RECORDS an item only when it names the record OF THAT ITEM:', 'the master backlog save or revision that holds it', 'the engram id of its own record (such as #1234)', 'the feature-document entry for it (such as odd/tasks/x.md T3)'].every((cue) => PROMPT.includes(cue)), true);
check('rubric: a hash, a path or a topic counts only when it is that record', PROMPT.includes('A commit hash, a path or an engram topic counts only when it is that record; a hash or a path of other work records nothing.'), true);
check('rubric: a record of other work is shown not to count', PROMPT.includes('A record of other work does not count: "Queda pendiente el bug del retry; el arreglo del parser está en a1b2c3d." cites nothing for the retry bug.'), true);
check('rubric: waiting on work in flight passes, an item deferred past the wait is pending', [PROMPT.includes('- Work in flight is NOT parked, so it is not pending: a worker or a run that is still going, a landing underway, a wait for a report'), PROMPT.includes('- An ITEM deferred past that wait is still parked: a finding, a defect, a debt or a decision that the message puts off until a worker, a landing or a report finishes is pending unless its record is cited'), PROMPT.includes('"Cuando termine el worker miro el bug del retry."')], [true, true, true]);
check('rubric: no message is exempt for whom it is addressed to', [PROMPT.includes('Judge every message the same way, whoever it is addressed to.'), PROMPT.includes('addressed to a subagent'), PROMPT.includes('peer session')], [true, false, false]);
check('rubric: «todavía no / aún no / not yet» plus a deferral is pending', ['todavía no', 'aún no', 'not yet'].every((cue) => PROMPT.includes(cue)) && PROMPT.includes('No lo anoto todavía en el backlog.'), true);
check('rubric: a plain negation that says nothing is pending is not pending', PROMPT.includes('A negation that only says nothing is pending is not') && PROMPT.includes('no queda nada pendiente'), true);
check('rubric: it has both-language examples of a block and of a pass', ['Queda por revisar el matcher.', 'I found a defect in the parser; I will fix it later.', 'nothing is left', 'si querés lo agrego al backlog'].every((example) => PROMPT.includes(example)), true);
check('rubric: the signature and the marker are the pinned ones', [PROMPT_SIGNATURE, MARKER], ['pending-judge rubric v2.', 'PENDING-JUDGE:']);
check('rubric: a message whose every item is recorded passes', PROMPT.includes('3. Answer {"ok": true} when every item it leaves for later is recorded:'), true);
check('rubric: the rules are numbered 1 to 8 with no gap', [1, 2, 3, 4, 5, 6, 7, 8].every((rule) => PROMPT.includes(`\n${String(rule)}. `)) && !PROMPT.includes('\n9. '), true);
check('rubric: a measurement passes', PROMPT.includes('it states a measurement ("queda por debajo de 200 ms", "the latency stays under 200 ms")'), true);
check('rubric: it fails open on doubt', PROMPT.includes('When unsure whether something is left for later, answer {"ok": true}'), true);
check('rubric: it never sets impossible', PROMPT.includes('Never set the field impossible'), true);
check('rubric: the timeout is the pinned one', TIMEOUT_SECONDS, 30);
check('judges: the pending judge is registered with its rubric, marker and timeout', [PENDING_JUDGE.prompt === PROMPT, PENDING_JUDGE.marker, PENDING_JUDGE.timeoutSeconds, PENDING_JUDGE.mechanism], [true, MARKER, 30, 'pending-judge']);
check('judges: the pending judge carries its prefilter, appendix, fallback and turn window', [PENDING_JUDGE.prefilter === prefilter, PENDING_JUDGE.appendix === appendix, PENDING_JUDGE.fallback === unavailableBlock, PENDING_JUDGE.observe === advanceTurnWindow], [true, true, true, true]);

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

// The prefilter hands `decide()` a reportDegraded that journals the fail-open with the stop's payload.
// @es El prefiltro le pasa a `decide()` un reportDegraded que registra el fallo abierto con el payload de la parada.
{
  const journaled = [];
  const reported = payloadOf({ session_id: 's-degraded' });

  prefilter(reported, {
    owes: (payload, options) => {
      options.reportDegraded({ errors: ['store-unreadable'] });

      return undefined;
    },
    journal: (payload, info) => journaled.push([payload, info]),
  });
  check('prefilter: a fail-open the decision reports is journaled with the stop that caused it', journaled, [[reported, { errors: ['store-unreadable'] }]]);
}

// --- THE APPENDIX. @es EL APÉNDICE.
const text = appendix({ session_id: 'sess-7', last_assistant_message: 'Queda pendiente el cambio del hook.' });

check('appendix: it is bilingual', text.includes('@es Tu mensaje final deja el ítem') && text.includes('Your final message leaves the item above'), true);
check('appendix: it offers recording and dismissing, in both languages', ['RECORD IT', 'DISMISS IT', 'REGISTRALO', 'DESCARTALO'].every((word) => text.includes(word)), true);
check('appendix: it offers committing the versioned document', text.includes('git commit -- <repo>/checklists/master-backlog.md') && text.includes('o commiteá el documento versionado'), true);
check('appendix: the dismiss command carries the session and the marker that fired', text.includes('--session sess-7 --marker "pendiente"'), true);
check('appendix: the dismiss command points at the real dismiss.mjs', text.includes('backlog-guard') && text.includes('dismiss.mjs'), true);
check('appendix: it states the gate\'s cap, in both languages', text.includes(`This judge blocks at most ${String(MAX_BLOCKS_PER_TURN)} times per turn. @es Este juez bloquea como mucho ${String(MAX_BLOCKS_PER_TURN)} veces por turno.`), true);
check('appendix: the cap it states is the one it is given', appendix({}, { cap: 5 }).includes('at most 5 times per turn') && appendix({}, { cap: 5 }).includes('como mucho 5 veces'), true);

// --- THE FALLBACK: the block the gate gives when the judge is unavailable. @es EL BLOQUEO DE RESPALDO.
{
  const fallback = unavailableBlock({ session_id: 'sess-8', last_assistant_message: 'Queda pendiente el cambio del hook.' }, 'model unavailable');

  check('fallback: it starts with the judge marker, so the journal records it', fallback.startsWith(`${MARKER} `), true);
  check('fallback: it says the judge was unavailable and why, in both languages', [fallback.includes('the pending judge was unavailable (model unavailable)'), fallback.includes('@es PENDING-JUDGE: el juez de pendientes no estuvo disponible (model unavailable)')], [true, true]);
  check('fallback: it names the lexical marker that fired, in both languages', [fallback.includes('the deterministic lexical block: your final message carries the marker "pendiente"'), fallback.includes('el bloqueo léxico determinista: tu mensaje final lleva el marcador «pendiente»')], [true, true]);
  check('fallback: it ends with the same instructions as a judged block', fallback.endsWith(appendix({ session_id: 'sess-8', last_assistant_message: 'Queda pendiente el cambio del hook.' })), true);
  check('fallback: with no marker it names the judge', unavailableBlock({}, 'x').includes('carries the marker "pending-judge"'), true);
}
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

  // PROVENANCE: who decided a label. `author`: the mechanism's author, by reading (synthetic, or a real reply with a
  // written LABEL); `unadjudicated`: a real reply whose label only mirrors what a session did with the old guard's
  // refusal; `owner`: the owner. @es PROCEDENCIA: quién decidió la etiqueta.
  const provenanceOf = (fixture) => (String(fixture.source).startsWith('owner') ? 'owner' : String(fixture.source).startsWith('real') && !String(fixture.source).includes('LABEL (') ? 'unadjudicated' : 'author');

  check('fixtures: the provenances are owner, author and unadjudicated', PROVENANCES, ['owner', 'author', 'unadjudicated']);
  check('fixtures: every one carries the provenance its source states', fixtures.filter((fixture) => fixture.provenance !== provenanceOf(fixture)).map((fixture) => fixture.id), []);
  check('fixtures: both non-owner provenances are present', ['author', 'unadjudicated'].map((provenance) => fixtures.some((fixture) => fixture.provenance === provenance)), [true, true]);
  check('fixtures: the in-flight and record-of-other-work cases are there and reach the judge', ['synthetic-item-deferred-past-worker', 'synthetic-waiting-on-worker', 'synthetic-record-of-other-work'].map((id) => { const found = fixtures.find((fixture) => fixture.id === id); return [found?.expect, found?.provenance, found === undefined ? false : findCandidate(found.message) !== undefined]; }), [['fail', 'author', true], ['pass', 'author', true], ['fail', 'author', true]]);

  // THE SHIP BAR: the judge ships only on at least ten owner labels. @es LA VARA DE SALIDA: diez etiquetas del dueño.
  const owned = (count, expect = 'pass') => Array.from({ length: count }, (_, index) => ({ id: `o${String(index)}`, provenance: 'owner', expect }));

  check('ship bar: it needs ten owner labels', SHIP_BAR_OWNER_LABELS, 10);
  check('ship bar: today it is not met', shipBar(fixtures), { ownerLabels: fixtures.filter((fixture) => fixture.provenance === 'owner').length, required: 10, met: false });
  check('ship bar: ten owner labels meet it, nine do not', [shipBar(owned(10)).met, shipBar(owned(9)).met], [true, false]);
  check('ship bar: an owner fixture marked unknowable is no label', shipBar([...owned(9), ...owned(1, 'unknowable')]).met, false);
  check('ship bar: author and unadjudicated labels never count', shipBar([...owned(9), { provenance: 'author', expect: 'fail' }, { provenance: 'unadjudicated', expect: 'pass' }]).ownerLabels, 9);
  check('ship bar: it is described in both languages', [describeShipBar({ ownerLabels: 3, required: 10, met: false }), describeShipBar({ ownerLabels: 12, required: 10, met: true })], [
    'ship bar: 3/10 owner labels, NOT MET: author and unadjudicated labels do not ship the judge @es vara de salida: 3/10 etiquetas del dueño, NO CUMPLIDA: las etiquetas del autor y las no adjudicadas no habilitan al juez',
    'ship bar: 12/10 owner labels, MET @es vara de salida: 12/10 etiquetas del dueño, CUMPLIDA',
  ]);
}

// --- THE OWNER PACKET: five stops the judge blocked and five it passed, for the owner to label. @es EL PAQUETE DEL DUEÑO.
{
  const judged = (id, verdict, extra = {}) => ({ fixture: { id, expect: 'pass', provenance: 'unadjudicated', source: 'real: x', message: `Intro.\n${id} queda pendiente el bug.`, ...extra }, verdict, reason: `${MARKER} reason of ${id}` });
  const entries = [
    ...['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((id) => judged(id, false)),
    ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => judged(id, true)),
    judged('owned', false, { provenance: 'owner' }),
    judged('unknown', null),
    judged('author-1', false, { provenance: 'author' }),
  ];
  const packet = ownerPacket(entries, { generatedAt: '2026-10-25T10:00:00.000Z', model: 'haiku' });
  const cases = packet.split('\n').filter((line) => line.startsWith('## '));

  check('packet: ten cases, five blocked then five passed', cases.map((line) => line.split(' — ')[1]), [...Array(5).fill('the judge BLOCKED @es el juez BLOQUEÓ'), ...Array(5).fill('the judge PASSED @es el juez DEJÓ PASAR')]);
  check('packet: an owner label, a missing verdict and a later provenance are left out first', ['owned', 'unknown', 'author-1', 'b6', 'p6'].map((id) => packet.includes(`. ${id} — `)), [false, false, false, false, false]);
  check('packet: each case carries its provenance, current label, the judge reason and a blank owner label', [packet.includes('- provenance: unadjudicated; current label: pass'), packet.includes(`- judge reason: ${MARKER} reason of b1`), packet.split('Owner label: ____ (pending / not pending) @es Etiqueta del dueño: ____ (pendiente / no pendiente)').length - 1], [true, true, 10]);
  check('packet: it says when, with which model, and how to record a label, in both languages', [packet.includes('Generated 2026-10-25T10:00:00.000Z with model haiku, run 1.'), packet.includes('"provenance": "owner"'), packet.includes('@es Generado 2026-10-25T10:00:00.000Z con el modelo haiku, corrida 1.')], [true, true, true]);
  check('packet: a judge that blocked fewer than five gets what there is', ownerPacket(entries.slice(0, 2), { generatedAt: 'x', model: 'm' }).split('\n').filter((line) => line.startsWith('## ')).length, 2);
  check('packet: author cases fill in when unadjudicated ones run out', ownerPacket([judged('author-2', true, { provenance: 'author' })], { generatedAt: 'x', model: 'm' }).includes('. author-2 — '), true);

  const long = `${'a'.repeat(2000)} queda pendiente el bug ${'z'.repeat(2000)}`;

  check('excerpt: at most the packet size, around the marker', [PACKET_EXCERPT_CHARS, excerptAround(long).length, excerptAround(long).includes('queda pendiente el bug')], [600, 600, true]);
  check('excerpt: a short message is whole', excerptAround('Queda pendiente.'), 'Queda pendiente.');
  check('excerpt: a marker near the start keeps the start', excerptAround(`Queda pendiente. ${'x'.repeat(2000)}`).startsWith('Queda pendiente.'), true);
  check('excerpt: a marker near the end keeps the end', excerptAround(`${'x'.repeat(2000)} queda pendiente.`).endsWith('queda pendiente.'), true);
  check('excerpt: a message with no marker starts at its start', excerptAround(`Hola. ${'x'.repeat(2000)}`).startsWith('Hola.'), true);
  check('packet: a multi-line excerpt is quoted line by line', packet.includes('> Intro.\n> b1 queda pendiente el bug.'), true);
  check('excerpt: a marker near the end still gets the whole packet size', excerptAround(`${'x'.repeat(2000)} queda pendiente.`).length, PACKET_EXCERPT_CHARS);
  check('packet: every excerpt is a quote of at most the packet size', packet.split('\n').filter((line) => line.startsWith('> ')).every((line) => line.length <= PACKET_EXCERPT_CHARS + 2), true);
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
const gate = (raw, ask) => decide({ judge: PENDING_JUDGE, raw, ask, nested: false, blocksThisTurn: () => 0 });
const failing = async () => {
  asked.push('failed');
  throw new Error('model unavailable');
};
const SAVE_LINE = '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master"}}\n';
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
  const capped = await decide({ judge: PENDING_JUDGE, raw: rawOf(session, PENDING, { stop_hook_active: true }), ask: blocking, nested: false, blocksThisTurn: () => MAX_BLOCKS_PER_TURN });

  check('cap: the per-turn block cap passes a continued stop, the same as the other judges', capped.outcome, 'pass-continued-capped');
}
{
  // THE TURN WINDOW through the real gate: a save made after a block counts for that turn only.
  // @es LA VENTANA DEL TURNO por la compuerta real: un guardado posterior al bloqueo cuenta solo para ese turno.
  const session = newSession();

  writeFileSync(transcript, '{"type":"assistant","text":"turn A"}\n', 'utf8');
  check('window: the first stop of a turn with nothing saved blocks', (await gate(rawOf(session, PENDING), blocking)).outcome, 'block');
  appendFileSync(transcript, SAVE_LINE, 'utf8');
  asked.length = 0;
  const rewrite = await gate(rawOf(session, PENDING, { stop_hook_active: true }), blocking);

  check('window: a save made after the block counts for its turn, with no model call', [rewrite.outcome, asked.length], ['pass-prefilter', 0]);
  appendFileSync(transcript, '{"type":"assistant","text":"turn B"}\n', 'utf8');
  asked.length = 0;
  const next = await gate(rawOf(session, PENDING), blocking);

  check('window: the next turn is not covered by the previous turn\'s save', [next.outcome, asked.length], ['block', 1]);
}
{
  // The window moves on EVERY parseable stop, before any early return. @es La ventana se mueve en TODA parada legible.
  const session = newSession();
  const grow = (text) => appendFileSync(transcript, `{"type":"assistant","text":"${text}"}\n`, 'utf8');
  const windowEnd = () => readOffsetState(session)?.offset;
  const end = () => statSync(transcript).size;
  const stops = [
    ['a capped continued stop', () => decide({ judge: PENDING_JUDGE, raw: rawOf(session, PENDING, { stop_hook_active: true }), ask: blocking, nested: false, blocksThisTurn: () => MAX_BLOCKS_PER_TURN })],
    ['a stop with no message', () => gate(rawOf(session, '   '), blocking)],
    ['a nested run', () => decide({ judge: PENDING_JUDGE, raw: rawOf(session, PENDING), ask: blocking, nested: true, blocksThisTurn: () => 0 })],
    ['a continued stop whose count cannot be read', () => decide({ judge: PENDING_JUDGE, raw: rawOf(session, PENDING, { stop_hook_active: true }), ask: blocking, nested: false, blocksThisTurn: () => { throw new Error('log unreadable'); } })],
    ['a stop the prefilter clears', () => gate(rawOf(session, 'Listo, todo verde.'), blocking)],
  ];

  for (const [label, stop] of stops) {
    grow(label);
    await stop();
    check(`window: ${label} moves the window to the transcript end`, windowEnd(), end());
  }

  const before = readOffsetState(session);

  grow('garbage');
  await decide({ judge: PENDING_JUDGE, raw: 'not json', ask: blocking, nested: false, blocksThisTurn: () => 0 });
  check('window: an unreadable stop moves nothing', readOffsetState(session), before);
}
{
  // THE FALLBACK: when the judge cannot answer, the lexical prefilter's finding blocks, saying the judge was down.
  // @es EL RESPALDO: si el juez no puede responder, bloquea el hallazgo léxico, diciendo que el juez no estuvo.
  const session = newSession();

  writeFileSync(transcript, '{"type":"assistant","text":"turn F"}\n', 'utf8');
  const down = await gate(rawOf(session, PENDING), failing);

  check('fallback: a judge that cannot be asked blocks deterministically, saying why', [down.outcome, down.reason?.startsWith(`${MARKER} the pending judge was unavailable (model unavailable)`), down.why, down.reason?.includes('RECORD IT')], ['block', true, 'model unavailable', true]);

  const prose = await gate(rawOf(session, PENDING), answering('Sorry, I cannot.'));

  check('fallback: an answer that is no verdict blocks deterministically too, keeping its cost', [prose.outcome, prose.reason?.includes('the pending judge was unavailable'), prose.costUsd], ['block', true, 0.0002]);

  asked.length = 0;
  check('fallback: a stop the prefilter clears never reaches the model or the fallback', [(await gate(rawOf(session, 'Listo, todo verde.'), failing)).outcome, asked.length], ['pass-prefilter', 0]);

  const unreadable = await decide({ judge: PENDING_JUDGE, raw: rawOf(session, PENDING, { stop_hook_active: true }), ask: failing, nested: false, blocksThisTurn: () => { throw new Error('log unreadable'); } });

  check('fallback cap: a continued stop whose block count cannot be read never blocks', [unreadable.outcome, unreadable.reason], ['malfunction', undefined]);
}
{
  // A fail-open over an unreadable engram store is journaled through the real prefilter.
  // @es Un fallo abierto sobre un almacén de engram ilegible queda registrado por el prefiltro real.
  const session = newSession();
  const previous = process.env.ENGRAM_DATA_DIR;
  const journalLines = () => {
    try {
      return readFileSync(refusalsFile(), 'utf8').split('\n').filter((line) => line !== '');
    } catch {
      return [];
    }
  };
  const before = journalLines().length;

  process.env.ENGRAM_DATA_DIR = path.join(scratch, 'no-engram-here');
  writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_x', name: 'mcp__plugin_engram_engram__mem_update', input: { id: 972 } }] } })}\n`, 'utf8');
  asked.length = 0;
  const degraded = await gate(rawOf(session, PENDING), blocking);

  if (previous === undefined) delete process.env.ENGRAM_DATA_DIR;
  else process.env.ENGRAM_DATA_DIR = previous;

  const added = journalLines().slice(before).map((line) => JSON.parse(line));

  check('degraded: a mem_update the store cannot resolve fails open with no model call', [degraded.outcome, asked.length], ['pass-prefilter', 0]);
  check('degraded: the fail-open is journaled once, for this session and transcript', added.map((line) => [line.kind, line.session, line.transcript, line.errors]), [['store-unreadable-fail-open', session, transcript, ['store-unreadable']]]);
}

for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
