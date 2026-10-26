#!/usr/bin/env node
/**
 * The places where the two guards could fall out of agreement again, each broken once, that the cross-guard
 * consistency selftest (`holder-consistency.selftest.mjs`) must catch with an assertion: the shared
 * classification, orphan-work's acceptance of a declared takeover, and resume-before-fresh's gating of its
 * takeover advice. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 * @es Los puntos donde los dos guards podrían volver a discrepar, rotos uno a uno, que el selftest de
 * consistencia entre guards debe cazar con una aserción.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const H = 'agent-liveness/holder.mjs';
const O = 'fleet-kit/orphan-work/guard.mjs';
const R = 'resume-before-fresh/guard.mjs';

const MUTANTS = [
  ['orphan-work ignores the holder decision again (the 2026-10-26 incident)', O, "    .filter(({ holder }) => holder?.state !== 'unresumable');", ';'],
  ['orphan-work accepts a declared takeover of any holder', O, "holder?.state !== 'unresumable'", 'holder === undefined'],
  ['orphan-work accepts any declaration for every worktree', O, 'declared.has(canonicalPath(entry.worktree.path))', 'declared.size > 0'],
  ['resume-before-fresh advises a takeover whatever the holder', R, "const advised = holder.state === 'unresumable' || (holder.state === 'live' && holder.agentId === agent.id);", 'const advised = true;'],
  ['resume-before-fresh never advises a takeover', R, "const advised = holder.state === 'unresumable' || (holder.state === 'live' && holder.agentId === agent.id);", 'const advised = false;'],
  ['the printed takeover line names no worktree', H, 'en: `TENANCY: ${worktree} —', 'en: `TENANCY: <worktree> —'],
  ['the shared classification forgets the size, so the incident reads resumable', H, "oversized && ['oversized',", "false && ['oversized',"],
  ['resume-before-fresh classifies on its own again (size ignored there only)', R, 'const resumability = resumabilityOf(record, { now, session, bytes, lastWrite });', 'const resumability = resumabilityOf(record, { now, session, bytes: 0, lastWrite });'],
  ['resume-before-fresh offers a resume across sessions again (the a8ca9df scope lost)', R, 'const resumability = resumabilityOf(record, { now, session, bytes, lastWrite });', 'const resumability = resumabilityOf(record, { now, session: sessionOf(record), bytes, lastWrite });'],
  ['resume-before-fresh offers a resume outside the window again', R, 'const resumability = resumabilityOf(record, { now, session, bytes, lastWrite });', 'const resumability = resumabilityOf(record, { now, session, bytes, lastWrite: now });'],
  ['orphan-work judges the holder without the payload session', O, 'withDeclaredHolder(entry, declared, { records, now, session: payload.session_id })', 'withDeclaredHolder(entry, declared, { records, now })'],
  ['the shared decision ignores the session', H, "otherSession && ['other-session',", "false && ['other-session',"],
  ['the shared decision ignores the window', H, "stale && ['stale',", "false && ['stale',"],
  ['a live holder reads as stopped', H, 'if (live !== undefined) return { state:', 'if (false) return { state:']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['agent-liveness', 'fleet-kit', 'resume-before-fresh', 'brief-tenancy', 'hook-state', 'mutation-proof'],
  selftest: 'agent-liveness/holder-consistency.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
