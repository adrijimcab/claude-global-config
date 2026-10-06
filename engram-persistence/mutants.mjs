#!/usr/bin/env node
/**
 * The decisions of the engram-persistence guard, each broken once, that `selftest.mjs` must catch: when a
 * turn may end, when a session counts as first seen, what counts as a save and in which ORDER, and how it
 * fails open. The campaign runner and its rules (green baseline first, exactly-once targets, parse-checked
 * mutants) live in `../mutation-proof/run-mutants.mjs`. A mutant is never deleted or softened to get a
 * clean campaign: a survivor is a missing assertion in the selftest.
 *
 * @es Las decisiones del guard de persistencia en engram, rotas una a una, que `selftest.mjs` debe cazar:
 * cuándo puede terminar un turno, cuándo una sesión es la primera vista, qué cuenta como guardado y en qué
 * ORDEN, y cómo falla abierto. Un mutante nunca se borra ni se ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'engram-persistence/guard.mjs';
const SATISFIED = "tail.includes(marker))) {\n    writeState(sessionId, { head, offset: size ?? 0 });";

const MUTANTS = [
  // When the guard steps aside / Cuándo se aparta el guard
  ['a Stop the guard already refused once is refused again, trapping the turn', GUARD, 'if (payload?.stop_hook_active === true) return;', 'if (false) return;'],
  ['outside a repository the guard goes on to record a baseline', GUARD, 'return; // no git, no verdict', 'head = undefined; // no git, no verdict'],
  // First sighting and the baseline / Primera vista y línea base
  ['a state file whose head is not a string is compared instead of re-baselined', GUARD, "if (state === undefined || typeof state.head !== 'string') {", 'if (state === undefined) {'],
  ['the first sighting records no baseline', GUARD, "typeof state.head !== 'string') {\n    writeState(sessionId, { head, offset: size ?? 0 });", "typeof state.head !== 'string') {\n    void sessionId;"],
  ['an unmoved HEAD is read as moved, and a moved one as unmoved', GUARD, 'if (state.head === head) {', 'if (state.head !== head) {'],
  ['an idle Stop keeps the old transcript offset, so a save made while idle covers later commits', GUARD, 'offset: size ?? state.offset', 'offset: state.offset'],
  // What counts as a save, and when / Qué cuenta como guardado y cuándo
  ['the transcript tail is cut on the decoded string by a byte offset', GUARD, "readFileSync(path).subarray(offset).toString('utf8')", "readFileSync(path, 'utf8').slice(offset)"],
  ['mem_save no longer counts as a save', GUARD, "['mem_save', 'mem_session_summary']", "['mem_session_summary']"],
  ['mem_session_summary no longer counts as a save', GUARD, "['mem_save', 'mem_session_summary']", "['mem_save']"],
  ['every marker must appear before the save counts', GUARD, 'SAVE_MARKERS.some(', 'SAVE_MARKERS.every('],
  ['a satisfied guard keeps its old baseline, so the same save is spent twice', GUARD, SATISFIED, "tail.includes(marker))) {\n    void sessionId;"],
  // Fail open / Falla abierto
  ['an unreadable transcript crashes the guard instead of re-baselining', GUARD, 'if (tail === undefined) {', 'if (false) {'],
  ['an unresolvable recorded head re-baselines instead of leaving state alone', GUARD, 'return; // the range is unreadable (rebased, gone) — no honest verdict', 'subjects = []; // the range is unreadable (rebased, gone) — no honest verdict'],
  ['a HEAD that moved backwards is refused with no commits to name', GUARD, 'if (subjects.length === 0) {', 'if (false) {'],
  ['an empty git log is read as one blank commit subject', GUARD, "subjects = log === '' ? [] : log.split('\\n').slice(0, 12);", "subjects = log.split('\\n').slice(0, 12);"],
  ['the refusal lists thirteen subjects', GUARD, ".slice(0, 12)", ".slice(0, 13)"],
  ['the refusal lists every subject', GUARD, "log.split('\\n').slice(0, 12)", "log.split('\\n')"],
  ['a payload with a byte-order mark is not judged', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['engram-persistence', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'engram-persistence/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
