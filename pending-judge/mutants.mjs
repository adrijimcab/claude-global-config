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

const MUTANTS = [
  // --- THE RUBRIC.
  ['the rubric stops naming the durable stores', PROMPT, 'A durable store is engram, a backlog record, a feature document or a commit.', 'A durable store is a place.'],
  ['the rubric stops counting a cited record as a record', PROMPT, '4. Answer {"ok": true} when every item it leaves for later is recorded:', '4. Answer {"ok": true} when it is'],
  ['the rubric stops treating not-yet as pending', PROMPT, '6. «todavía no», «aún no» and «not yet» followed by a deferral are pending, not a negation of pending:', '6. «todavía no» is a negation:'],
  ['the rubric stops passing a plain negation', PROMPT, 'A negation that only says nothing is pending is not: "todavía no hay nada pendiente" passes.', ''],
  ['the rubric stops passing a measurement', PROMPT, 'it states a measurement ("queda por debajo de 200 ms", "the latency stays under 200 ms"), ', ''],
  ['the rubric stops passing an offer', PROMPT, 'or it only offers or asks ("si querés lo agrego al backlog", "want me to add it?")', 'or it only asks'],
  ['the rubric stops passing a brief to a worker', PROMPT, '2. Answer {"ok": true} when the message is addressed to a subagent or a peer session rather than to the owner', '2. Answer {"ok": true} when the message is addressed to the owner'],
  ['the rubric stops failing open on doubt', PROMPT, 'When unsure whether something is left for later, answer {"ok": true}; ', ''],
  ['the rubric gives a Spanish block example no more', PROMPT, '"Queda por revisar el matcher."', '"x"'],
  ['the rubric gives an English block example no more', PROMPT, '"I found a defect in the parser; I will fix it later."', '"x"'],
  ['the rubric stops asking for the marker word', PROMPT, 'The reason starts with the word PENDING-JUDGE followed by a colon', 'The reason starts with a word'],
  ['the rubric asks for a rewrite phrase', PROMPT, '8. Never set the field impossible. Never ask for a rewrite or suggest a phrase to say.', '8. Never set the field impossible. Suggest a phrase to say.'],
  ['the rubric lets the model set impossible', PROMPT, 'Never set the field impossible.', ''],
  ['the rubric spells the marker literally', PROMPT, 'starts with the word PENDING-JUDGE followed by a colon', 'starts with PENDING-JUDGE:'],
  ['the rubric loses its second dollar-free guarantee', PROMPT, 'is: $ARGUMENTS', 'is: $ARGUMENTS and $x'],
  ['the signature is still v0', PROMPT, "'pending-judge rubric v1.'", "'pending-judge rubric v0.'"],
  ['the timeout drifts', PROMPT, 'TIMEOUT_SECONDS = 30', 'TIMEOUT_SECONDS = 20'],
  ['the marker drifts', PROMPT, "MARKER = 'PENDING-JUDGE:'", "MARKER = 'PENDING:'"],

  // --- THE PREFILTER.
  ['a stop owing nothing still asks the model', PREFILTER, 'if (owes(payload) === undefined) return false;', ''],
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
  ['the cap sentence is dropped', APPENDIX, "'This judge blocks at most twice per turn. @es Este juez bloquea como mucho dos veces por turno.',", "''"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['pending-judge', 'judge-gate', 'backlog-guard', 'backlog-owner-guard', 'voice-judge', 'premise-judge', 'hook-state', 'bilingual-output'],
  selftest: 'pending-judge/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
