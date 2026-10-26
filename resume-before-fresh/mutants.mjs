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
const W = 'resume-before-fresh/worktree-identity.mjs';
// The exhaustion classification moved into the shared holder decision (2026-10-26); its mutants follow it.
// @es La clasificación de agotamiento se movió a la decisión compartida de titular; sus mutantes la siguen.
const H = 'agent-liveness/holder.mjs';

const MUTANTS = [
  ['dispatch vocabulary counts as the errand again (the 2026-09-30 false identity)', G, '.filter((word) => !DISPATCH_VOCABULARY.has(word))', '.filter(() => true)'],
  ['a context-exhausted agent is offered for a resume that cannot work', H, 'exhausted: stoppedOnContextLength(transcript) || oversized', 'exhausted: oversized'],
  ['exhausted agents are refused like resumable ones', G, 'return matchingAgents(description, repoPath, own, now, prompt).filter((match) => !match.exhausted);', 'return matchingAgents(description, repoPath, own, now, prompt);'],
  ['the unresumable advice is dropped, so the replacement is told nothing', G, 'const advice = [unresumableNotice(', 'const advice = [undefined && unresumableNotice('],
  ['the advice stops asking for a TENANCY line', H, 'en: `TENANCY: ${worktree} —', 'en: `${worktree} —'],
  ['every API error reads as context exhaustion, so a rate-limited agent is never offered', H, 'last.error === CONTEXT_EXHAUSTED_ERROR_CLASS && text === CONTEXT_EXHAUSTED_TEXT', 'true'],
  ['the structured error class is ignored, so the text alone decides', H, 'last.error === CONTEXT_EXHAUSTED_ERROR_CLASS && ', ''],
  ['the error flag is ignored, so an agent quoting the text is written off', H, 'last?.isApiErrorMessage === true && ', ''],
  ['the message is searched instead of compared, so another invalid_request is written off', H, 'text === CONTEXT_EXHAUSTED_TEXT', 'text.startsWith(CONTEXT_EXHAUSTED_TEXT)'],
  ['a rate limit is read as context exhaustion', H, "export const CONTEXT_EXHAUSTED_ERROR_CLASS = 'invalid_request';", "export const CONTEXT_EXHAUSTED_ERROR_CLASS = 'rate_limit';"],
  ['the FIRST transcript record is read instead of the last', H, "JSON.parse(lines.at(-1) ?? '{}')", "JSON.parse(lines.at(0) ?? '{}')"],
  ['an identical label is no longer judged when too few object words remain', G, 'const wordingMatches = overlaps || sameLabel(label, significantWords(record.description));', 'const wordingMatches = overlaps;'],
  ['any label identical in size counts as the same label', G, 'left.size === right.size && [...left].every((word) => right.has(word))', 'left.size === right.size'],
  ['one shared word is enough to refuse', G, 'const overlaps = shared >= 2 && ratio >= OVERLAP_THRESHOLD;', 'const overlaps = shared >= 1;'],
  ['the overlap ratio is ignored, so two shared words refuse anything', G, 'const overlaps = shared >= 2 && ratio >= OVERLAP_THRESHOLD;', 'const overlaps = shared >= 2;'],
  ['two errands that each carry a word the other lacks are the same errand again (the fan-out siblings)', G, 'export const OVERLAP_THRESHOLD = 1;', 'export const OVERLAP_THRESHOLD = 0.6;'],
  ['numbers shorter than a word are dropped from the errand again (every batch of tasks is one label)', G, '(current.length >= MIN_WORD_LENGTH || isNumber(current))', '(current.length >= MIN_WORD_LENGTH)'],
  ['every short token counts as a number, so connecting words become errand words', G, "token.length > 0 && [...token].every((character) => character >= '0' && character <= '9')", 'token.length > 0'],
  ['an agent of another session is offered for a resume that cannot work from here', G, 'const own = records.filter((record) => sessionOf(record) === session);', 'const own = records;'],
  ['every session but the dispatching one is offered', G, 'sessionOf(record) === session', 'sessionOf(record) !== session'],
  ['the session is read one folder too low (the subagents folder)', G, 'path.basename(path.dirname(path.dirname(record.transcript)))', 'path.basename(path.dirname(record.transcript))'],
  ['decide forgets the session, so nobody is ever refused', G, 'const resumable = priorAgents(description, repoPath, records, now, session, prompt);', 'const resumable = priorAgents(description, repoPath, records, now);'],
  ['the hook entry point drops the payload session id', G, 'records ?? agentRecords(), now, payload?.session_id, ', 'records ?? agentRecords(), now, undefined, '],
  ['a transcript past the ledger size is offered for resume again', H, 'exhausted: stoppedOnContextLength(transcript) || oversized', 'exhausted: stoppedOnContextLength(transcript)'],
  ['the size is never read, so no transcript is ever oversized', G, 'bytes = stats.size;', 'bytes = 0;'],
  ['a transcript of exactly the threshold is written off', H, 'const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES;', 'const oversized = bytes >= EXHAUSTED_TRANSCRIPT_BYTES;'],
  ['one byte past the threshold is still resumable', H, 'const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES;', 'const oversized = bytes > EXHAUSTED_TRANSCRIPT_BYTES + 1;'],
  ['the threshold drops to 1 MB, so a 1.9 MB transcript is written off', H, 'export const EXHAUSTED_TRANSCRIPT_BYTES = 2_000_000;', 'export const EXHAUSTED_TRANSCRIPT_BYTES = 1_000_000;'],
  ['the threshold rises to 3 MB, so the reported 2.5 MB transcript is offered', H, 'export const EXHAUSTED_TRANSCRIPT_BYTES = 2_000_000;', 'export const EXHAUSTED_TRANSCRIPT_BYTES = 3_000_000;'],
  ['the ledger rule is not printed for an oversized agent', G, '...(oversized.length === 0 ? [] : sizeRule(oversized)),', ''],
  ['the Spanish half of the ledger rule is dropped', G, "    '@es se lanza un agente fresco con alcance acotado que lee el estado de los ficheros.',\n", ''],
  ['the oversized agent is named without its size', G, '...oversized.map((agent) => `  ${address(agent.id)}: ${(agent.bytes / 1e6).toFixed(2)} MB (${agent.bytes} bytes) > ${EXHAUSTED_TRANSCRIPT_BYTES} bytes`)', '...oversized.map((agent) => `  ${address(agent.id)}`)'],
  ['the closing TENANCY line names only the context failure again', H, 'unresumable agent (context failure or oversized transcript)', 'context-exhausted agent'],
  ['the worktrees the dispatches name are never compared (wording only again)', G, ": sameErrand(wantedTrees, recordWorktrees(record));", ": 'unknown';"],
  ['a different worktree no longer rules an errand out', G, "identity === 'different' || (", 'false || ('],
  ['the same worktree no longer matches without matching words', G, "(identity === 'unknown' && !wordingMatches)", '!wordingMatches'],
  ['an empty description is dropped even when it names a worktree', G, 'if (label.size === 0 && wantedTrees.size === 0) return [];', 'if (label.size === 0) return [];'],
  ['the prompt is not handed on to the refusal', G, 'priorAgents(description, repoPath, records, now, session, prompt)', 'priorAgents(description, repoPath, records, now, session)'],
  ['the prompt is not handed on to the oversized advice', G, 'exhaustedAgents(description, repoPath, records, now, prompt), {', 'exhaustedAgents(description, repoPath, records, now), {'],
  ['two disjoint worktree sets read as unknown instead of different', W, "? 'same' : 'different'", "? 'same' : 'unknown'"],
  ['a main checkout (.git directory) is an identity', W, "return statSync(path.join(candidate, '.git')).isFile();", "return statSync(path.join(candidate, '.git')).isFile() || true;"],
  ['a path that does not exist is an identity', W, 'return false; // missing, or unreadable: not an identity', 'return true;'],
  ['the harness worktree no longer wins over the brief', W, 'recorded.length > 0 ? linkedNames([recorded]) : declaredWorktrees(briefOf(record.transcript))', 'declaredWorktrees(briefOf(record.transcript))'],
  ['backslash paths are not read', W, "unwrap(raw.replaceAll('\\\\', '/'))", 'unwrap(raw)'],
  ['worktree names are compared case-sensitively', W, 'names.add(worktreeName(candidate).toLowerCase())', 'names.add(worktreeName(candidate))'],
  ['an empty side reads as different instead of unknown', W, 'if (wanted.size === 0 || recorded.size === 0) return', 'if (false) return'],
  ['the takeover advice ignores the holder decision (a newer resumable holder is advised away)', G, "const advised = holder.state === 'unresumable' || (holder.state === 'live' && holder.agentId === agent.id);", 'const advised = true;'],
  ['a worktree another live agent works in is advised for takeover', G, "(holder.state === 'live' && holder.agentId === agent.id)", "holder.state === 'live'"],
  ['the exhausted agent read live by its own fresh transcript is not advised', G, " || (holder.state === 'live' && holder.agentId === agent.id)", ''],
  ['the concrete takeover line is never printed, only the template', G, "advised.length === 0 ? [takeoverDeclaration('<that worktree folder>')] : advised.map((worktree) => takeoverDeclaration(worktree))", "[takeoverDeclaration('<that worktree folder>')]"],
  ['a worktree not advised for takeover is named as if it were', G, '  if (takeover.advised) return `${head}\\n    worktree: ${agent.worktreePath}`;', '  return `${head}\\n    worktree: ${agent.worktreePath}`;'],
  ['the Spanish takeover line is dropped', G, "    ...lines.map((line) => `@es   ${line.es}`)", '    ...[]'],
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
