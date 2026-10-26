#!/usr/bin/env node
/**
 * The decisions of the shared holder decision (`holder.mjs`), each broken once, that `holder.selftest.mjs`
 * must catch with an assertion. The runner and its rules live in `../mutation-proof/run-mutants.mjs`;
 * `crashKills: 'fail'` makes a mutant that only crashes the selftest count as a survivor.
 * @es Las decisiones de la decisión compartida de titular, rotas una a una, que `holder.selftest.mjs` debe
 * cazar con una aserción. Un mutante que solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const H = 'agent-liveness/holder.mjs';

const MUTANTS = [
  // --- the states
  ['a live owner is not asked first', H, 'if (live !== undefined) return { state:', 'if (false) return { state:'],
  ['an unresumable holder reads resumable', H, "if (resumability.resumable) return { state: 'resumable'", "if (true) return { state: 'resumable'"],
  ['a resumable holder reads unresumable', H, "if (resumability.resumable) return { state: 'resumable'", "if (false) return { state: 'resumable'"],
  ['a record with no transcript still holds the worktree', H, '        continue; // no transcript: nothing to resume and nothing exhausted', '        stats = { mtimeMs: 0, size: 0 };'],
  ['no holder reads resumable instead of none', H, "if (newest === undefined) return { state: 'none',", "if (newest === undefined) return { state: 'resumable',"],

  // --- the latest-record rule
  ['the OLDEST record decides', H, 'stats.mtimeMs > newest.mtimeMs', 'stats.mtimeMs < newest.mtimeMs'],
  ['the last record in list order decides', H, 'if (newest === undefined || stats.mtimeMs > newest.mtimeMs)', 'if (true)'],
  ['the first record in list order decides', H, 'if (newest === undefined || stats.mtimeMs > newest.mtimeMs)', 'if (newest === undefined)'],

  // --- the exhaustion classification
  ['the size is ignored', H, "oversized && ['oversized',", "false && ['oversized',"],
  ['the context-length stop is ignored', H, "contextStopped && ['context-length',", "false && ['context-length',"],
  ['exhausted forgets the size half', H, 'exhausted: contextStopped || oversized,', 'exhausted: contextStopped,'],
  ['exhausted forgets the context half', H, 'exhausted: contextStopped || oversized,', 'exhausted: oversized,'],
  ['the causes are not reported', H, 'causes: reasons.map(([cause]) => cause),', 'causes: [],'],

  // --- the resume window and the dispatching session (2026-10-26)
  ['the resume window is ignored', H, "stale && ['stale',", "false && ['stale',"],
  ['exactly the window edge is outside it', H, 'const stale = now - lastWrite > RESUMABLE_WINDOW_MS;', 'const stale = now - lastWrite >= RESUMABLE_WINDOW_MS;'],
  ['the window doubles, so a 25 h holder is resumed', H, 'export const RESUMABLE_WINDOW_MS = 24 * 60 * 60 * 1000;', 'export const RESUMABLE_WINDOW_MS = 48 * 60 * 60 * 1000;'],
  ['the session is ignored', H, "otherSession && ['other-session',", "false && ['other-session',"],
  ['every session but the dispatching one is its own', H, 'const otherSession = sessionOf(record) !== session;', 'const otherSession = sessionOf(record) === session;'],
  ['the session is read one folder too low', H, 'return basename(dirname(dirname(record.transcript)));', 'return basename(dirname(record.transcript));'],
  ['holderOf drops the dispatching session', H, 'resumabilityOf(record, { now, session, bytes, lastWrite: mtimeMs })', 'resumabilityOf(record, { now, session: sessionOf(record), bytes, lastWrite: mtimeMs })'],
  ['holderOf reads the age from the clock, not the transcript', H, 'resumabilityOf(record, { now, session, bytes, lastWrite: mtimeMs })', 'resumabilityOf(record, { now, session, bytes, lastWrite: now })'],
  ['the window reason loses its Spanish half', H, ", `se escribió por última vez hace ${Math.round((now - lastWrite) / 3_600_000)} h, fuera de la ventana de ${RESUMABLE_WINDOW_MS / 3_600_000} h`]", ", '']"],
  ['the session reason does not name the sessions', H, '`it belongs to session ${sessionOf(record)}, not the dispatching one (${session ?? \'unknown\'})', '`it belongs to another session'],
  ['exactly the threshold is exhausted', H, 'const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES;', 'const oversized = bytes >= EXHAUSTED_TRANSCRIPT_BYTES;'],
  ['one byte past the threshold is not exhausted', H, 'const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES;', 'const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES + 1;'],
  ['the threshold is the full incident size, so a 2 MB transcript is resumed', H, 'export const EXHAUSTED_TRANSCRIPT_BYTES = 2_000_000;', 'export const EXHAUSTED_TRANSCRIPT_BYTES = 21_870_000;'],
  ['the context error class is ignored', H, 'last.error === CONTEXT_EXHAUSTED_ERROR_CLASS && ', ''],
  ['the context text is never matched', H, 'text === CONTEXT_EXHAUSTED_TEXT', "text === ''"],
  ['the size is read from the record list, not the transcript', H, 'bytes: stats.size }', 'bytes: 0 }'],

  // --- what claims a worktree
  ['every record claims every worktree', H, 'if (!claims(record, wanted, linked)) continue;', ''],
  ['the harness worktree name is compared with case', H, "if (record.worktree !== '') return record.worktree.toLowerCase() === wanted;", "if (record.worktree !== '') return record.worktree === wanted;"],
  ['the harness worktree does not win over the brief', H, "  if (record.worktree !== '') return record.worktree.toLowerCase() === wanted;\n", ''],
  ['a brief claim is read for a folder that is no linked worktree', H, "return linked && declarationOf(briefOf(record.transcript), wanted) === 'present';", "return declarationOf(briefOf(record.transcript), wanted) === 'present';"],
  ['a brief naming another worktree claims this one', H, "declarationOf(briefOf(record.transcript), wanted) === 'present'", "declarationOf(briefOf(record.transcript), wanted) !== 'absent'"],
  ['a brief never claims', H, "return linked && declarationOf(briefOf(record.transcript), wanted) === 'present';", 'return false;'],

  // --- the reasons and the declaration
  ['the size reason drops the byte count', H, 'its transcript is ${bytes} bytes, past', 'its transcript is past'],
  ['the reason loses its Spanish half', H, " @es ningún registro de agente con transcript legible lo tiene'", "'"],
  ['the declaration is no TENANCY marker', H, 'en: `TENANCY: ${worktree} —', 'en: `Tenancy: ${worktree} —'],
  ['the declaration does not name the worktree', H, 'en: `TENANCY: ${worktree} —', 'en: `TENANCY: <worktree> —'],
  ['the Spanish declaration does not name the worktree', H, 'es: `TENANCY: ${worktree} —', 'es: `TENANCY: <worktree> —']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['agent-liveness', 'brief-tenancy', 'hook-state', 'resume-before-fresh/fixtures', 'mutation-proof'],
  selftest: 'agent-liveness/holder.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
