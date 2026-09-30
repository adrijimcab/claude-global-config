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

const MUTANTS = [
  ['the loop bound is gone: a retry is judged again instead of passing through', 'decide.mjs', 'if (payload?.stop_hook_active === true) return undefined;', ''],
  ['a missing repo stops being reported as missing, so it falls through to being measured as if present', 'decide.mjs', "if (!repoExists(repo)) return { repo, state: 'missing' };", ''],
  ['a failed git status stops being reported as unmeasurable, so a git failure reads as clean', 'decide.mjs', "if (!status.ok) return { repo, state: 'unmeasurable', reason: status.stderr || 'git exited non-zero with no stderr' };", ''],
  ['a clean repo is never recognised, so EVERY repo reads as dirty', 'decide.mjs', "if (unownedAhead === 0 && unattributed.length === 0) return foreign.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'foreign' };", ''],
  ['another session\'s commits stop being reported, so they pass in silence', 'decide.mjs', "return foreign.length === 0 ? { repo, state: 'clean' } : { ...finding, state: 'foreign' };", "return { repo, state: 'clean' };"],
  ['every commit ahead counts as unowned again, so another session\'s commits block this one', 'decide.mjs', 'const unownedAhead = Math.max(0, aheadCount - foreign.length);', 'const unownedAhead = aheadCount;'],
  ['the session of the turn is no longer read from the payload, so no commit is ever told to be another session\'s', 'decide.mjs', 'sessionId: payload?.session_id,', 'sessionId: undefined,'],
  ['a dirty repo stops producing a block, so real drift silently passes', 'decide.mjs', "if (dirtyRepos.length > 0) return { kind: 'block', dirtyRepos };", "if (dirtyRepos.length > 0) return undefined;"],
  ['the branch-header line is never recognised, so "ahead" is never read from git status output', 'status.mjs', 'if (line.startsWith(BRANCH_HEADER_PREFIX)) {', 'if (false) {'],
  ['the liveness window check is inverted, so a LIVE agent reads as dead and a DEAD one reads as live', 'attribution.mjs', 'return now - statSync(record.transcript).mtimeMs < ACTIVE_WINDOW_MS;', 'return now - statSync(record.transcript).mtimeMs >= ACTIVE_WINDOW_MS;'],
  ['writersOf stops comparing the written paths, so every live agent owns every path', 'attribution.mjs', 'agent.writes.some((written) => writtenMatches(written, needle))', 'true'],
  ['a written path no longer matches when it equals the needle, so a file written by its exact path is never attributed', 'attribution.mjs', 'return written === needle || written.endsWith', 'return written.endsWith'],
  ['a written path no longer matches at a directory boundary, so a longer directory name ending alike owns the path', 'attribution.mjs', 'written.endsWith(`/${needle}`)', 'written.endsWith(needle)'],
  ['a collapsed directory is no longer matched by the files written under it, so a new directory is never attributed', 'attribution.mjs', ' || written.includes(`/${needle}/`)', ''],
  ['the owner\'s session is lost, so this session\'s own agent can no longer be told from another session\'s', 'attribution.mjs', '.map(([id, agent]) => ({ id, session: agent.session }))', '.map(([id]) => ({ id, session: undefined }))'],
  ['a live agent\'s session is no longer recorded, so commits cannot be told to be another session\'s', 'attribution.mjs', 'byAgent.set(record.id, { session: record.session, writes:', 'byAgent.set(record.id, { writes:'],
  ['a transcript\'s session is taken from its project directory instead of its session directory', 'attribution.mjs', 'records.push({ id, session, transcript:', 'records.push({ id, session: project, transcript:'],
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
  ['a failed git status stops short-circuiting fingerprinting, so a repo whose status could not be measured still gets a fingerprint computed and reported', 'fingerprint.mjs', 'if (!status.ok) return undefined;', '']
];

const survivors = runMutants({
  fleetRoot: HERE,
  paths: ['decide.mjs', 'guard.mjs', 'status.mjs', 'attribution.mjs', 'transcript-writes.mjs', 'unpushed-commits.mjs', 'commit-advice.mjs', 'repos.mjs', 'dismiss.mjs', 'fingerprint.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json'],
  selftest: 'selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
