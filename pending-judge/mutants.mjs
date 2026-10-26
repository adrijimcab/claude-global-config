#!/usr/bin/env node
/**
 * The decisions of the pending judge, each broken once, that `selftest.mjs` must catch: the rubric's load-bearing
 * sentences, the prefilter's three outcomes, the dismissal lookup and the block appendix. The runner lives in
 * `../mutation-proof/run-mutants.mjs` and mutates a COPY. Every kill is an assertion kill (`crashKills: 'fail'`).
 *
 * @es Las decisiones del juez de pendientes, rotas una a una, que su selftest debe cazar: las frases de la
 * rúbrica que cargan peso, las tres salidas del prefiltro, la búsqueda del descarte y el apéndice del bloqueo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PROMPT = 'pending-judge/prompt.mjs';
const PREFILTER = 'pending-judge/prefilter.mjs';
const APPENDIX = 'pending-judge/appendix.mjs';
const FALLBACK = 'pending-judge/fallback.mjs';
const MEASURE = 'pending-judge/measure.mjs';

const MUTANTS = [
  // --- THE RUBRIC.
  ['the rubric v3 lets work in flight excuse a record put off', PROMPT, ' This holds even when the record waits on work in flight: "el checkpoint lo anoto en el backlog junto con el resultado del PDF" is pending.', ''],
  ['the rubric v3 reads blocked work as queued', PROMPT, "  '- Blocked work is not queued work: a launch a guard refused, or work waiting on a precondition that is not itself under way, is deferred, so it is pending unless its record is cited (\"preparé E7, pero el guard bloquea writers nuevos hasta integrar E5/E6\").',\n", ''],
  ['the rubric v3 stops passing work queued into the current run', PROMPT, ' So is work queued into the current run or landing (the next free worker slot, the next checkpoint or batch: "en cuanto se libere un lugar entra el juez de voz", "lo sumo al checkpoint-42"),', ' So is'],
  ['the rubric v3 stops passing the listed remaining steps of the change', PROMPT, 'and the remaining steps of the change the message reports on, when it lists them as its plan ("lo que queda antes del reporte: 1. validar, 2. mover develop", "queda archivar el SDD" at the end of a finished change).', 'and nothing else.'],
  ['the rubric v3 stops blocking a record put off', PROMPT, '- Putting off the RECORD of an item is pending, because the item stays unrecorded:', '- Putting off the RECORD of an item is fine:'],
  ['the rubric v3 stops blocking a claim check put off', PROMPT, "  '- Putting off the check of a claim the message states now without measuring it is pending: \"lo estimó a mano en 138 mil; lo mido de verdad cuando aterrice\".',\n", ''],
  ['the rubric v3 stops passing an item put to the owner', PROMPT, ', or it names an item and asks the owner, in this message, what to do with it ("¿lo sumo ahora o lo dejo en la fila?")', ''],
  ['the rubric stops naming the durable stores', PROMPT, 'A durable store is engram, a backlog record, a feature document or a commit.', 'A durable store is a place.'],
  ['the rubric stops counting a cited record as a record', PROMPT, '3. Answer {"ok": true} when every item it leaves for later is recorded:', '3. Answer {"ok": true} when it is'],
  ['the rubric stops treating not-yet as pending', PROMPT, '5. «todavía no», «aún no» and «not yet» followed by a deferral are pending, not a negation of pending:', '5. «todavía no» is a negation:'],
  ['the rubric counts any cited record again, not the record of that item', PROMPT, 'A message RECORDS an item only when it names the record OF THAT ITEM:', 'A message RECORDS an item when it cites a record:'],
  ['the rubric counts a hash or path of other work again', PROMPT, 'A commit hash, a path or an engram topic counts only when it is that record; a hash or a path of other work records nothing.', 'A commit hash, a path or an engram topic counts.'],
  ['the rubric drops its record-of-other-work example', PROMPT, 'A record of other work does not count: "Queda pendiente el bug del retry; el arreglo del parser está en a1b2c3d." cites nothing for the retry bug.', ''],
  ['the rubric stops parking an item deferred past a wait', PROMPT, "  '- An ITEM deferred past that wait is still parked:", "  '- An ITEM deferred past that wait is in flight too:"],
  ['the rubric drops its deferred-past-a-worker block example', PROMPT, ', "Cuando termine el worker miro el bug del retry.".', '.'],
  ['the rubric stops passing work in flight', PROMPT, '- Work in flight is NOT parked, so it is not pending: a worker or a run that is still going, a landing underway, a wait for a report', '- Work in flight is pending'],
  ['the rubric exempts a message by whom it is addressed to again', PROMPT, ' Judge every message the same way, whoever it is addressed to.', ' Answer {"ok": true} when the message is addressed to a subagent or a peer session.'],
  ['the rubric skips a rule number', PROMPT, "  '2. Answer {\"ok\": true} when the message leaves nothing for later:", "  '9. Answer {\"ok\": true} when the message leaves nothing for later:"],
  ['the rubric stops passing a plain negation', PROMPT, 'A negation that only says nothing is pending is not: "todavía no hay nada pendiente" passes.', ''],
  ['the rubric stops passing a measurement', PROMPT, 'it states a measurement ("queda por debajo de 200 ms", "the latency stays under 200 ms"), ', ''],
  ['the rubric stops passing an offer', PROMPT, 'or it only offers or asks ("si querés lo agrego al backlog", "want me to add it?")', 'or it only asks'],
  ['the rubric stops failing open on doubt', PROMPT, 'When unsure whether something is left for later, answer {"ok": true}; ', ''],
  ['the rubric gives a Spanish block example no more', PROMPT, '"Queda por revisar el matcher."', '"x"'],
  ['the rubric gives an English block example no more', PROMPT, '"I found a defect in the parser; I will fix it later."', '"x"'],
  ['the rubric stops asking for the marker word', PROMPT, 'The reason starts with the word PENDING-JUDGE followed by a colon', 'The reason starts with a word'],
  ['the rubric asks for a rewrite phrase', PROMPT, '7. Never set the field impossible. Never ask for a rewrite or suggest a phrase to say.', '7. Never set the field impossible. Suggest a phrase to say.'],
  ['the rubric lets the model set impossible', PROMPT, 'Never set the field impossible.', ''],
  ['the rubric spells the marker literally', PROMPT, 'starts with the word PENDING-JUDGE followed by a colon', 'starts with PENDING-JUDGE:'],
  ['the rubric loses its second dollar-free guarantee', PROMPT, 'is: $ARGUMENTS', 'is: $ARGUMENTS and $x'],
  ['the signature is still v2', PROMPT, "'pending-judge rubric v3.'", "'pending-judge rubric v2.'"],
  ['the timeout drifts', PROMPT, 'TIMEOUT_SECONDS = 30', 'TIMEOUT_SECONDS = 20'],
  ['the marker drifts', PROMPT, "MARKER = 'PENDING-JUDGE:'", "MARKER = 'PENDING:'"],

  // --- THE PREFILTER.
  ['a stop owing nothing still asks the model', PREFILTER, '  if (owes(payload, { reportDegraded: (info) => journal(payload, info) }) === undefined) return false;\n', ''],
  ['a fail-open is reported to nobody', PREFILTER, 'owes(payload, { reportDegraded: (info) => journal(payload, info) })', 'owes(payload)'],
  ['a fail-open is journaled without its stop', PREFILTER, 'journal(payload, info)', 'journal({}, info)'],
  ['a fail-open is journaled without its errors', PREFILTER, 'journal(payload, info)', 'journal(payload, {})'],
  ['the real journal is not the default', PREFILTER, 'journal = journalDegraded }', 'journal = () => {} }'],
  ['a first stop reads the dismissals', PREFILTER, 'if (payload?.stop_hook_active !== true) return true;', ''],
  ['a continued stop with no block of this turn is silenced by a dismissal', PREFILTER, 'return blockedAt === undefined || !dismissed(session, blockedAt);', 'return !dismissed(session, blockedAt);'],
  ['a dismissal no longer silences the continued stop', PREFILTER, '!dismissed(session, blockedAt)', 'true'],
  ['every continued stop is silenced', PREFILTER, '!dismissed(session, blockedAt)', 'false'],
  ['the block is looked up for another judge', PREFILTER, "const JUDGE_NAME = 'pending';", "const JUDGE_NAME = 'voice';"],
  ['the dismissal is looked up for another session', PREFILTER, 'dismissed(session, blockedAt)', "dismissed('other', blockedAt)"],
  ['a payload with no session id is given a session', PREFILTER, "typeof payload.session_id === 'string' ? payload.session_id : ''", "typeof payload.session_id === 'string' ? payload.session_id : 'unknown'"],

  // --- THE APPENDIX.
  ['the appendix loses its Spanish half', APPENDIX, "'@es Tu mensaje final deja el ítem de arriba para después y este turno no guardó nada en el backlog maestro.',", "'',"],
  ['the appendix stops offering to record', APPENDIX, "'  A) RECORD IT.", "'  A) DO IT."],
  ['the appendix stops offering to dismiss', APPENDIX, "'  B) DISMISS IT, with a reason that is written down:'", "'  B) IGNORE IT:'"],
  ['the appendix stops offering the document commit', APPENDIX, 'o commiteá el documento versionado', 'o algo distinto'],
  ['the dismiss command loses the session', APPENDIX, '--session ${session} ', ''],
  ['the dismiss command loses the marker', APPENDIX, ' --marker "${marker}"', ''],
  ['the marker is not the candidate that fired', APPENDIX, 'findCandidate(payload?.last_assistant_message) ?? ', ''],
  ['the marker fallback is not the judge', APPENDIX, "?? 'pending-judge'", "?? 'x'"],
  ['the session fallback is not unknown', APPENDIX, ": 'unknown';", ": 'anon';"],
  ['the dismiss command points elsewhere', APPENDIX, "'backlog-guard', 'dismiss.mjs'", "'backlog-guard', 'other.mjs'"],
  ['the cap sentence is dropped', APPENDIX, '    `This judge blocks at most ${String(cap)} times per turn. @es Este juez bloquea como mucho ${String(cap)} veces por turno.`,\n', ''],
  ['the cap is not the gate\'s', APPENDIX, 'cap = MAX_BLOCKS_PER_TURN }', 'cap = 3 }'],
  ['the cap stated is not the one given', APPENDIX, 'at most ${String(cap)} times', 'at most ${String(MAX_BLOCKS_PER_TURN)} times'],
  ['the cap loses its Spanish half', APPENDIX, ' @es Este juez bloquea como mucho ${String(cap)} veces por turno.', ''],

  // --- THE FALLBACK.
  ['the fallback does not say the judge was unavailable', FALLBACK, 'the pending judge was unavailable (${why})', 'the lexical guard fired'],
  ['the fallback does not say why', FALLBACK, 'the pending judge was unavailable (${why})', 'the pending judge was unavailable ()'],
  ['the fallback loses its Spanish half', FALLBACK, '    `@es ${MARKER} el juez de pendientes no estuvo disponible', '    `${MARKER} el juez de pendientes no estuvo disponible'],
  ['the fallback does not start with the marker', FALLBACK, '    `${MARKER} the pending judge', '    `the pending judge'],
  ['the fallback loses the instructions', FALLBACK, '    appendix(payload),\n', ''],
  ['the fallback names no marker', FALLBACK, 'findCandidate(payload?.last_assistant_message) ?? ', ''],
  ['the fallback marker default is not the judge', FALLBACK, "?? 'pending-judge'", "?? 'x'"],

  // --- THE MEASUREMENT: provenance, the ship bar and the owner packet.
  ['the ship bar is lowered', MEASURE, 'SHIP_BAR_OWNER_LABELS = 10;', 'SHIP_BAR_OWNER_LABELS = 9;'],
  ['the ship bar counts any label', MEASURE, "SHIP_BAR_PROVENANCES.includes(fixture.provenance) && fixture.expect !== 'unknowable'", "fixture.expect !== 'unknowable'"],
  ['delegated labels stop counting', MEASURE, "SHIP_BAR_PROVENANCES = Object.freeze(['owner', 'owner-delegated'])", "SHIP_BAR_PROVENANCES = Object.freeze(['owner'])"],
  ['author labels count toward the bar', MEASURE, "SHIP_BAR_PROVENANCES = Object.freeze(['owner', 'owner-delegated'])", "SHIP_BAR_PROVENANCES = Object.freeze(['owner', 'owner-delegated', 'author'])"],
  ['the reason delegated labels count is not stated', MEASURE, ' * OWNER-DELEGATED LABELS COUNT FOR THIS JUDGE ONLY.', ' * Delegated labels.'],
  ['a met bar lands only a candidate', MEASURE, '  return met\n    ? { wire: true,', '  return false\n    ? { wire: true,'],
  ['an unmet bar wires the judge', MEASURE, "    : { wire: false, line: 'landing: CANDIDATE", "    : { wire: true, line: 'landing: CANDIDATE"],
  ['the wire line loses its Spanish half', MEASURE, ' @es aterrizaje: CABLEAR el juez de pendientes (su hook Stop de settings.json) y retirar la guardia léxica backlog-guard', ''],
  ['the candidate line stops keeping backlog-guard live', MEASURE, 'keep backlog-guard/guard.mjs live in the Stop manifest and ', ''],
  ['the ship bar counts an unknowable owner fixture', MEASURE, " && fixture.expect !== 'unknowable'", ''],
  ['the ship bar is met one label early', MEASURE, 'ownerLabels >= SHIP_BAR_OWNER_LABELS', 'ownerLabels >= SHIP_BAR_OWNER_LABELS - 1'],
  ['the ship bar line loses its Spanish half', MEASURE, ' @es vara de salida: ${count} etiquetas del dueño o delegadas por él, NO CUMPLIDA', ''],
  ['a provenance drops out', MEASURE, "Object.freeze(['owner', 'owner-delegated', 'author', 'unadjudicated'])", "Object.freeze(['owner', 'author', 'unadjudicated'])"],
  ['the packet draws owner fixtures too', MEASURE, "const PACKET_PROVENANCES = ['unadjudicated', 'author'];", "const PACKET_PROVENANCES = ['unadjudicated', 'author', 'owner'];"],
  ['the packet draws delegated fixtures too', MEASURE, "const PACKET_PROVENANCES = ['unadjudicated', 'author'];", "const PACKET_PROVENANCES = ['unadjudicated', 'author', 'owner-delegated'];"],
  ['the packet puts author cases first', MEASURE, 'a[0] - b[0] || ', ''],
  ['the packet holds six of each verdict', MEASURE, 'const PACKET_PER_VERDICT = 5;', 'const PACKET_PER_VERDICT = 6;'],
  ['the packet holds no passed case', MEASURE, ', ...eligible.filter((entry) => entry.verdict === true).slice(0, PACKET_PER_VERDICT)]', ']'],
  ['the packet loses the blank owner label', MEASURE, "    'Owner label: ____ (pending / not pending) @es Etiqueta del dueño: ____ (pendiente / no pendiente)',\n", ''],
  ['the packet loses the provenance line', MEASURE, '    `- provenance: ${fixture.provenance}; current label: ${fixture.expect}`,\n', ''],
  ['the packet loses the judge reason', MEASURE, "typeof reason === 'string' ? reason.replace(/\\s+/g, ' ').slice(0, 300) : ", ''],
  ['the packet loses its Spanish header', MEASURE, '    `@es Generado ${generatedAt} con el modelo ${model}, corrida 1.', '    `Generado ${generatedAt} con el modelo ${model}, corrida 1.'],
  ['the packet does not say how to record a label', MEASURE, 'stored in its fixture as "provenance": "owner"', 'stored'],
  ['the excerpt grows', MEASURE, 'PACKET_EXCERPT_CHARS = 600;', 'PACKET_EXCERPT_CHARS = 700;'],
  ['the excerpt is not centred on the marker', MEASURE, 'at - Math.floor(size / 2)', 'at'],
  ['the excerpt may run past the end', MEASURE, 'Math.min(Math.max(0, at - Math.floor(size / 2)), message.length - size)', 'Math.max(0, at - Math.floor(size / 2))'],
  ['a message with no marker is excerpted from the end', MEASURE, 'const start = at < 0 ? 0 : ', 'const start = at < 0 ? message.length - size : '],
  ['the excerpt is not quoted line by line', MEASURE, "...excerpt.split('\\n').map((line) => `> ${line}`),", '`> ${excerpt}`,'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['pending-judge', 'judge-gate', 'backlog-guard', 'backlog-owner-guard', 'voice-judge', 'premise-judge', 'hook-state', 'bilingual-output'],
  selftest: 'pending-judge/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
