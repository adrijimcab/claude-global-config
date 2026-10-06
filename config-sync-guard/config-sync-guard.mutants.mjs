#!/usr/bin/env node
/**
 * The decisions of config-sync-guard, each broken once, that `selftest.mjs` must catch. Runner and
 * rules live in `../mutation-proof/run-mutants.mjs` (vendored, generic, shared with `backlog-guard`).
 *
 * Both directions represented: a mutant that makes the guard BLIND (a real drift stops blocking) and
 * one that makes it LOUD (a clean or live-owned state starts blocking). The second kind is what gets a
 * delivery gate switched off.
 * @es Las decisiones de config-sync-guard, rotas una a una. Ambas direcciones representadas.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The guard's folder, relative to the tree its sandbox copies. @es La carpeta del guard, relativa al árbol que copia el sandbox. */
const SELF = path.basename(HERE);

const MUTANTS = [
  ['the loop bound is gone: a retry is judged again instead of passing through', 'decide.mjs', 'if (payload?.stop_hook_active === true) return undefined;', ''],
  ['a missing repo stops being reported as missing, so it falls through to being measured as if present', 'decide.mjs', "if (!repoExists(repo)) return { repo, state: 'missing' };", ''],
  ['a failed git status stops being reported as unmeasurable, so a git failure reads as clean', 'decide.mjs', "if (!status.ok) return { repo, state: 'unmeasurable', reason: status.stderr || 'git exited non-zero with no stderr' };", ''],
  ['a clean repo is never recognised, so EVERY repo reads as dirty', 'decide.mjs', "if (unownedAhead === 0 && ownPaths.length === 0) return foreign.length === 0 && unexplained.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'noted' };", ''],
  ['another session\'s commits stop being reported, so they pass in silence', 'decide.mjs', "return foreign.length === 0 && unexplained.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'noted' };", "return unexplained.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'noted' };"],
  ['paths no live transcript explains stop being reported, so an unexplained change passes in silence', 'decide.mjs', "return foreign.length === 0 && unexplained.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'noted' };", "return foreign.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'noted' };"],
  ['every dirty path counts as made by this session, so another session\'s work blocks it', 'decide.mjs', "entry.verdict === 'maker').map((entry) => entry.absolute)", "entry.verdict !== 'unexplained').map((entry) => entry.absolute)"],
  ['an unexplained path counts as made by this session, so a change nobody live made blocks every turn', 'decide.mjs', "entry.verdict === 'unexplained'", "entry.verdict === 'maker'"],
  ['the path time is no longer measured, so a shell write is never attributed', 'decide.mjs', 'claimsOn(absolute, mtimeOf(absolute), liveAgents)', 'claimsOn(absolute, undefined, liveAgents)'],
  ['a dirty file is matched by its relative path again, so a write to another worktree\'s copy is blamed on its editor', 'decide.mjs', 'claimsOn(absolute, mtimeOf(absolute), liveAgents)', 'claimsOn(relativePath, mtimeOf(absolute), liveAgents)'],
  ['a written file under a collapsed directory no longer matches by prefix, so a new directory is never attributed', 'attribution.mjs', ' || written.startsWith(`${needle}/`)', ''],
  ['the note stops naming unexplained paths, so the owner is never told', 'decide.mjs', 'if (unexplained.length > 0) parts.push(', 'if (false) parts.push('],
  ['another session\'s main claim blocks this session, so the maker is not told from the others', 'path-ownership.mjs', ' || claim.session === sessionId;', ' || true;'],
  ['a payload with no session id stops counting a main claim as this session\'s', 'path-ownership.mjs', "typeof sessionId !== 'string' || ", ''],
  ['a subagent claim counts as the session\'s own, so a parent session commits its worker\'s working state', 'path-ownership.mjs', '!claim.subagent && ofThisSession(claim)', 'ofThisSession(claim)'],
  ['a path nobody claims counts as someone else\'s, so it is never surfaced', 'path-ownership.mjs', "claims.length === 0 ? 'unexplained' : 'theirs'", "'theirs'"],
  ['written paths stop counting as claims, so a path an actor wrote is never attributed', 'path-ownership.mjs', 'writers.length > 0 ? writers : runners', 'runners'],
  ['shell windows stop counting as claims, so a shell write is never attributed', 'path-ownership.mjs', 'writers.length > 0 ? writers : runners', 'writers'],
  ['windows outrank writes again, so a session that merely ran a command during a worker\'s write is blamed for it', 'path-ownership.mjs', 'writers.length > 0 ? writers : runners', '[...writers, ...runners]'],
  ['the writer\'s kind is lost, so a worker\'s write reads as its parent session\'s own', 'attribution.mjs', 'subagent: agent.subagent, live: agent.live }', 'live: agent.live }'],
  ['a writer\'s liveness is lost, so a live worker\'s write reads as a finished worker\'s', 'attribution.mjs', 'subagent: agent.subagent, live: agent.live }', 'subagent: agent.subagent }'],
  ['a live transcript\'s shell windows are not read, so no shell write is ever attributed', 'attribution.mjs', 'windows: shellWindowsIn(text, live ? now : now - age) }', 'windows: [] }'],
  ['a finished transcript\'s unfinished shell call ends now, so a stopped worker explains every later write', 'attribution.mjs', 'live ? now : now - age', 'now'],
  ['a live transcript\'s kind is not recorded, so a subagent cannot be told from a main session', 'attribution.mjs', 'subagent: record.subagent, live, writes:', 'live, writes:'],
  ['a transcript\'s liveness is not recorded, so a finished worker cannot be told from a live one', 'attribution.mjs', 'subagent: record.subagent, live, writes:', 'subagent: record.subagent, writes:'],
  ['finished subagents are no longer read, so their output is never attributed to their parent', 'attribution.mjs', 'if (!live && !(record.subagent && age < FINISHED_HORIZON_MS)) continue;', 'if (!live) continue;'],
  ['a stopped main transcript is read like a worker\'s, so the horizon is not for workers only', 'attribution.mjs', 'record.subagent && age < FINISHED_HORIZON_MS', 'age < FINISHED_HORIZON_MS'],
  ['the finished-worker horizon is dropped, so every old subagent transcript is read on every turn ending', 'attribution.mjs', 'record.subagent && age < FINISHED_HORIZON_MS', 'record.subagent'],
  ['the finished-worker horizon grows to a day, so the hook reads twice the transcripts', 'attribution.mjs', 'export const FINISHED_HORIZON_MS = 6 * 60 * 60 * 1000;', 'export const FINISHED_HORIZON_MS = 24 * 60 * 60 * 1000;'],
  ['a live worker no longer holds a path, so a finished worker of this session wins over it', 'path-ownership.mjs', 'claim.subagent && claim.live', 'false'],
  ['a finished worker of another session counts as this session\'s, so its output blocks the wrong parent', 'path-ownership.mjs', 'isFinishedWorker(claim) && ofThisSession(claim)', 'isFinishedWorker(claim)'],
  ['a finished worker stops being told from a live one, so a stopped worker\'s output blocks nobody', 'path-ownership.mjs', 'claim.subagent && !claim.live', 'false'],
  ['a live worker is told as finished, so its in-progress state blocks its parent', 'path-ownership.mjs', 'claim.subagent && !claim.live', 'claim.subagent'],
  ['the block names every finished worker that wrote a path, not only this session\'s', 'path-ownership.mjs', 'isFinishedWorker(claim) && claim.session === sessionId', 'isFinishedWorker(claim)'],
  ['a path a live worker holds is listed as worker output, so the block names a path it does not ask for', 'decide.mjs', "entry.verdict === 'maker' && entry.workers.length > 0", 'entry.workers.length > 0'],
  ['a path made by this session itself is listed as a finished worker\'s output', 'decide.mjs', "entry.verdict === 'maker' && entry.workers.length > 0", "entry.verdict === 'maker'"],
  ['the block stops naming the finished worker\'s output, so the parent is not told what it is', 'guard.mjs', 'for (const output of workerOutput) lines.push(', 'for (const output of []) lines.push('],
  ['a session\'s own main transcript is no longer enumerated, so its writes and shell calls explain nothing', 'attribution.mjs', "if (session.endsWith('.jsonl')) {", 'if (false) {'],
  ['a main transcript is recorded as a subagent', 'attribution.mjs', 'subagent: false, transcript: path.join(sessions, session)', 'subagent: true, transcript: path.join(sessions, session)'],
  ['a junction is followed out of an untracked directory, so a time is read from a tree that is not the path\'s own', 'path-mtime.mjs', "import { lstatSync, readdirSync } from 'node:fs';", "import { statSync as lstatSync, readdirSync } from 'node:fs';"],
  ['the walk stops descending into directories, so a new directory takes only its own time', 'path-mtime.mjs', 'if (stat.isDirectory())', 'if (false)'],
  ['the walk limit is ignored, so a huge untracked tree can stall a turn ending', 'path-mtime.mjs', 'visited < limit', 'true'],
  ['an unmeasurable path reads as the epoch instead of having no time', 'path-mtime.mjs', 'return newest;', 'return newest ?? 0;'],
  ['the ledger stops remembering what it recorded, so every turn appends the same path again', 'pending-ledger.mjs', '!known.has(`${entry.repo}|${entry.path}`)', 'true'],
  ['a ledger that cannot be written still reports the paths as recorded', 'pending-ledger.mjs', '    return [];\n  }\n\n  return fresh;', '    return fresh;\n  }\n\n  return fresh;'],
  ['the shim stops recording unexplained paths, so a finding vanishes with the chat', 'guard.mjs', 'recordUnexplained(verdict.unexplained, sessionId, ledgerIo);', ''],
  ['the decision stops listing unexplained paths, so the ledger is never fed', 'decide.mjs', "entry.state === 'noted' ? entry.unexplained.map(", "false ? entry.unexplained.map("],
  ['every commit ahead counts as unowned again, so another session\'s commits block this one', 'decide.mjs', 'const unownedAhead = Math.max(0, aheadCount - foreign.length);', 'const unownedAhead = aheadCount;'],
  ['the session of the turn is no longer read from the payload, so no commit is ever told to be another session\'s', 'decide.mjs', 'sessionId: payload?.session_id,', 'sessionId: undefined,'],
  ['a dirty repo stops producing a block, so real drift silently passes', 'decide.mjs', "if (dirtyRepos.length > 0) return { kind: 'block', dirtyRepos };", "if (dirtyRepos.length > 0) return undefined;"],
  ['the branch-header line is never recognised, so "ahead" is never read from git status output', 'status.mjs', 'if (line.startsWith(BRANCH_HEADER_PREFIX)) {', 'if (false) {'],
  ['the liveness window check is inverted, so a LIVE agent reads as dead and a DEAD one reads as live', 'attribution.mjs', 'return ageOf(record, now) < ACTIVE_WINDOW_MS;', 'return ageOf(record, now) >= ACTIVE_WINDOW_MS;'],
  ['writersOf stops comparing the written paths, so every live agent owns every path', 'attribution.mjs', 'agent.writes.some((written) => writtenMatches(written, needle))', 'true'],
  ['a written path no longer matches when it equals the needle, so a file written by its exact path is never attributed', 'attribution.mjs', 'return written === needle || written.endsWith', 'return written.endsWith'],
  ['a written path no longer matches at a directory boundary, so a longer directory name ending alike owns the path', 'attribution.mjs', 'written.endsWith(`/${needle}`)', 'written.endsWith(needle)'],
  ['the owner\'s session is lost, so this session\'s own agent can no longer be told from another session\'s', 'attribution.mjs', 'id, session: agent.session, subagent', 'id, session: undefined, subagent'],
  ['a live agent\'s session is no longer recorded, so commits cannot be told to be another session\'s', 'attribution.mjs', 'byAgent.set(record.id, { session: record.session,', 'byAgent.set(record.id, {'],
  ['a transcript\'s session is taken from its project directory instead of its session directory', 'attribution.mjs', 'records.push({ id, session, subagent: true,', 'records.push({ id, session: project, subagent: true,'],
  ['a file the agent only reads counts as written, so any live agent that looked at a file owns it', 'transcript-writes.mjs', "if (block?.type !== 'tool_use' || !WRITE_TOOLS.has(block.name)) return undefined;", "if (block?.type !== 'tool_use') return undefined;"],
  ['a notebook edit is no longer seen, so a written notebook is never attributed', 'transcript-writes.mjs', 'block.input?.file_path ?? block.input?.notebook_path', 'block.input?.file_path'],
  ['written paths keep their backslashes, so a Windows path never matches the forward-slash form git reports', 'transcript-writes.mjs', "return String(value).replaceAll('\\\\', '/').toLowerCase();", 'return String(value).toLowerCase();'],
  ['written paths keep their case, so a Windows path differing only by case is never attributed', 'transcript-writes.mjs', "return String(value).replaceAll('\\\\', '/').toLowerCase();", "return String(value).replaceAll('\\\\', '/');"],
  ['a cut-off transcript line aborts the read instead of being skipped, hiding every write before it', 'transcript-writes.mjs', '      continue;\n    }\n\n    const blocks', "      throw new Error('cut off');\n    }\n\n    const blocks"],
  ['a commit no longer needs a known session to count as another session\'s', 'unpushed-commits.mjs', "if (typeof sessionId === 'string' && coveredByLiveAgents", 'if (coveredByLiveAgents'],
  ['a commit changing no path counts as owned, so an empty commit is excused', 'unpushed-commits.mjs', 'commit.paths.length > 0 && writers.every', 'writers.every'],
  ['a commit with a path no live agent wrote counts as owned, so a mixed commit is excused', 'unpushed-commits.mjs', 'writers.every((pathWriters) => pathWriters.length > 0)', 'writers.some((pathWriters) => pathWriters.length > 0)'],
  ['this session\'s own live agent no longer claims a commit, so its commit is excused as another\'s', 'unpushed-commits.mjs', '&& !touchedByThisSession)', ')'],
  ['a failed git log is trusted, so commits parsed from a failed command can be excused', 'unpushed-commits.mjs', 'return log.ok ? parseAheadLog(log.stdout) : [];', 'return parseAheadLog(log.stdout);'],
  ['the block stops naming the unowned commits, so the session cannot tell whose they are', 'guard.mjs', 'for (const commit of unownedCommits) lines.push(', 'for (const commit of []) lines.push('],
  ['the commit advice stages everything again, so the shared index is swept', 'commit-advice.mjs', '${gitPrefix} add -- ${pathspec}', '${gitPrefix} add -A'],
  ['the commit advice commits without a pathspec, so it commits the whole shared index', 'commit-advice.mjs', 'commit -m "type(scope): description" -- ${pathspec}`', 'commit -m "type(scope): description"`'],
  ['the advised pathspec keeps Windows backslashes, so it no longer matches what git reports', 'guard.mjs', ".replaceAll('\\\\', '/')", ''],
  ['repoExists always reports true, so a genuinely missing repo is measured as present instead', 'repos.mjs', 'return existsSync(repo.worktree);', 'return true;'],
  ['the shim stops blocking a decided finding, so the harness lets the turn end anyway', 'guard.mjs', 'if (verdict === undefined) return undefined;', 'if (verdict !== undefined) return undefined;'],
  ['the shim stops journaling its refusals, so no evidence survives the block', 'guard.mjs', 'journal({ at: new Date().toISOString(), session: sessionId, repos: verdict.dirtyRepos.map((entry) => entry.repo.name) });', ''],
  ['the dismissal match stops requiring BOTH repo name and fingerprint, so a dismissal for one repo excuses ANY repo sharing its fingerprint value', 'decide.mjs', "if (record?.repo !== repoName || record?.fingerprint !== fingerprint) continue;", "if (record?.fingerprint !== fingerprint) continue;"],
  ['the dismissal match stops comparing at all, so a dismissal NEVER matches and nothing is ever excused', 'decide.mjs', "if (record?.repo !== repoName || record?.fingerprint !== fingerprint) continue;", "continue;"],
  ['a matched dismissal stops being reported as dismissed, so an excused repo still reads as unresolved-dirty', 'decide.mjs', "if (dismissal !== undefined) return { ...finding, state: 'dismissed', dismissal };", ''],
  ['the temporary index override is dropped, so fingerprinting would write into the repo\'s REAL index instead of a throwaway one', 'fingerprint.mjs', "const env = { ...process.env, GIT_INDEX_FILE: tempIndex };", "const env = { ...process.env };"],
  ['the worktree is no longer added into the temporary index before hashing, so the tree hash is always the EMPTY tree and never discriminates on real content', 'fingerprint.mjs', "runGit(qualified(['add', '-A']), repo.worktree, env);", ''],
  ['a failed git status stops short-circuiting fingerprinting, so a repo whose status could not be measured still gets a fingerprint computed and reported', 'fingerprint.mjs', 'if (!status.ok) return undefined;', ''],
  ['PowerShell calls stop counting as shell windows, so a Windows shell write is never explained', 'shell-windows.mjs', "new Set(['Bash', 'PowerShell'])", "new Set(['Bash'])"],
  ['every tool call counts as a shell window, so a read or an edit explains any file written meanwhile', 'shell-windows.mjs', 'SHELL_TOOLS.has(block.name)', 'true'],
  ['a finished call stays open, so it also reads as interrupted and adds a second window', 'shell-windows.mjs', '        open.delete(block.tool_use_id);\n', ''],
  ['an interrupted call ends now instead of at the last record, so a dead call explains every later write', 'shell-windows.mjs', 'end: start < last ? last : now', 'end: now'],
  ['a call still running ends at the last record instead of now, so a long command explains nothing', 'shell-windows.mjs', 'end: start < last ? last : now', 'end: last'],
  ['the last timestamp is never tracked, so an interrupted call is not told from a running one', 'shell-windows.mjs', 'last = Math.max(last, at);', 'last = Math.min(last, at);'],
  ['a record without a timestamp opens a window at NaN, so it corrupts the windows', 'shell-windows.mjs', 'if (Number.isNaN(at)) continue;', ''],
  ['the clock tolerance is gone, so a write at the very edge of a call is not explained', 'shell-windows.mjs', 'export const CLOCK_TOLERANCE_MS = 1000;', 'export const CLOCK_TOLERANCE_MS = 0;'],
  ['the tolerance before a call is dropped, so a write just before its recorded start is not explained', 'shell-windows.mjs', 'window.start - tolerance', 'window.start'],
  ['the tolerance after a call is dropped, so a write just after its result is not explained', 'shell-windows.mjs', 'window.end + tolerance', 'window.end'],
  ['the window start stops being inclusive, so a write exactly at the edge is not explained', 'shell-windows.mjs', 'mtimeMs >= window.start', 'mtimeMs > window.start'],
  ['the window end stops being inclusive, so a write exactly at the edge is not explained', 'shell-windows.mjs', 'mtimeMs <= window.end', 'mtimeMs < window.end']
];

const survivors = runMutants({
  // The tree above the guard, so the sandbox also holds the state-location module the guard imports.
  // @es El árbol por encima del guard, para que el sandbox tenga también el módulo de ubicaciones que importa.
  fleetRoot: path.dirname(HERE),
  paths: [...['decide.mjs', 'guard.mjs', 'status.mjs', 'attribution.mjs', 'transcript-writes.mjs', 'shell-windows.mjs', 'path-ownership.mjs', 'path-mtime.mjs', 'pending-ledger.mjs', 'unpushed-commits.mjs', 'commit-advice.mjs', 'repos.mjs', 'dismiss.mjs', 'fingerprint.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json'].map((file) => `${SELF}/${file}`), 'hook-state', 'bilingual-output'],
  selftest: `${SELF}/selftest.mjs`,
  mutants: MUTANTS.map(([label, file, original, replacement]) => [label, `${SELF}/${file}`, original, replacement]),
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
