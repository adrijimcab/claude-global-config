#!/usr/bin/env node
/**
 * Mutant campaign of resume-before-fresh against its selftest: each mutant breaks one decision — identity,
 * recency, resumability — and the selftest must go red. Written when the guard moved to `~/.claude/`
 * (2026-09-30) and gained two states: dispatch vocabulary and the context-length stop.
 * @es Campaña de mutantes de resume-before-fresh: cada mutante rompe una decisión y el selftest debe ponerse rojo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const G = 'resume-before-fresh/guard.mjs';

const MUTANTS = [
  ['dispatch vocabulary counts as the errand again (the 2026-09-30 false identity)', G, '.filter((word) => !DISPATCH_VOCABULARY.has(word))', '.filter(() => true)'],
  ['a context-exhausted agent is offered for a resume that cannot work', G, 'exhausted: stoppedOnContextLength(record.transcript)', 'exhausted: false'],
  ['exhausted agents are refused like resumable ones', G, 'return matchingAgents(description, repoPath, own, now).filter((match) => !match.exhausted);', 'return matchingAgents(description, repoPath, own, now);'],
  ['the unresumable advice is dropped, so the replacement is told nothing', G, 'const advice = [unresumableNotice(', 'const advice = [undefined && unresumableNotice('],
  ['the advice stops asking for a TENANCY line', G, "'  TENANCY: <that worktree folder>", "'  <that worktree folder>"],
  ['every API error reads as context exhaustion, so a rate-limited agent is never offered', G, 'last.error === CONTEXT_EXHAUSTED_ERROR_CLASS && text === CONTEXT_EXHAUSTED_TEXT', 'true'],
  ['the structured error class is ignored, so the text alone decides', G, 'last.error === CONTEXT_EXHAUSTED_ERROR_CLASS && ', ''],
  ['the error flag is ignored, so an agent quoting the text is written off', G, 'last?.isApiErrorMessage === true && ', ''],
  ['the message is searched instead of compared, so another invalid_request is written off', G, 'text === CONTEXT_EXHAUSTED_TEXT', 'text.startsWith(CONTEXT_EXHAUSTED_TEXT)'],
  ['a rate limit is read as context exhaustion', G, "export const CONTEXT_EXHAUSTED_ERROR_CLASS = 'invalid_request';", "export const CONTEXT_EXHAUSTED_ERROR_CLASS = 'rate_limit';"],
  ['the FIRST transcript record is read instead of the last', G, "JSON.parse(lines.at(-1) ?? '{}')", "JSON.parse(lines.at(0) ?? '{}')"],
  ['an identical label is no longer judged when too few object words remain', G, 'if (!overlaps && !sameLabel(label, significantWords(record.description))) continue;', 'if (!overlaps) continue;'],
  ['any label identical in size counts as the same label', G, 'left.size === right.size && [...left].every((word) => right.has(word))', 'left.size === right.size'],
  ['one shared word is enough to refuse', G, 'const overlaps = shared >= 2 && ratio >= OVERLAP_THRESHOLD;', 'const overlaps = shared >= 1;'],
  ['the overlap ratio is ignored, so two shared words refuse anything', G, 'const overlaps = shared >= 2 && ratio >= OVERLAP_THRESHOLD;', 'const overlaps = shared >= 2;'],
  ['two errands that each carry a word the other lacks are the same errand again (the fan-out siblings)', G, 'export const OVERLAP_THRESHOLD = 1;', 'export const OVERLAP_THRESHOLD = 0.6;'],
  ['numbers shorter than a word are dropped from the errand again (every batch of tasks is one label)', G, '(current.length >= MIN_WORD_LENGTH || isNumber(current))', '(current.length >= MIN_WORD_LENGTH)'],
  ['every short token counts as a number, so connecting words become errand words', G, "token.length > 0 && [...token].every((character) => character >= '0' && character <= '9')", 'token.length > 0'],
  ['an agent of another session is offered for a resume that cannot work from here', G, 'const own = records.filter((record) => sessionOf(record) === session);', 'const own = records;'],
  ['every session but the dispatching one is offered', G, 'sessionOf(record) === session', 'sessionOf(record) !== session'],
  ['the session is read one folder too low (the subagents folder)', G, 'path.basename(path.dirname(path.dirname(record.transcript)))', 'path.basename(path.dirname(record.transcript))'],
  ['decide forgets the session, so nobody is ever refused', G, 'const resumable = priorAgents(description, repoPath, records, now, session);', 'const resumable = priorAgents(description, repoPath, records, now);'],
  ['the hook entry point drops the payload session id', G, 'records ?? agentRecords(), now, payload?.session_id);', 'records ?? agentRecords(), now);'],
  ['an agent older than the window is offered', G, '    if (now - lastWrite > RESUMABLE_WINDOW_MS) continue;\n', ''],
  ['a record from another project is offered', G, 'if (projectSlug(record.project) !== slug) continue;', ''],
  ['an agent whose worktree was removed is offered', G, '    if (recordedWorktree.length > 0 && !existsSync(recordedWorktree)) continue;\n', '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['resume-before-fresh', 'agent-liveness', 'brief-tenancy', 'mutation-proof'],
  selftest: 'resume-before-fresh/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
