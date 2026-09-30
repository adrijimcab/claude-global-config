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
  ['a clean repo is never recognised, so EVERY repo reads as dirty', 'decide.mjs', "if (aheadCount === 0 && unattributed.length === 0) return { repo, state: 'clean' };", ''],
  ['a dirty repo stops producing a block, so real drift silently passes', 'decide.mjs', "if (dirtyRepos.length > 0) return { kind: 'block', dirtyRepos };", "if (dirtyRepos.length > 0) return undefined;"],
  ['the branch-header line is never recognised, so "ahead" is never read from git status output', 'status.mjs', 'if (line.startsWith(BRANCH_HEADER_PREFIX)) {', 'if (false) {'],
  ['the liveness window check is inverted, so a LIVE agent reads as dead and a DEAD one reads as live', 'attribution.mjs', 'return now - statSync(record.transcript).mtimeMs < ACTIVE_WINDOW_MS;', 'return now - statSync(record.transcript).mtimeMs >= ACTIVE_WINDOW_MS;'],
  ['liveOwnerOf stops checking the substring match, so it reports an owner for a path NO live agent\'s transcript ever mentions', 'attribution.mjs', 'if (needles.some((needle) => haystack.includes(needle))) return agentId;', 'return agentId;'],
  ['an empty needle (an unparseable dirty path) stops being refused, so it would match ANY agent\'s transcript by accident', 'attribution.mjs', 'if (forward.length === 0) return undefined;', ''],
  ['the double-backslash (JSON-escaped) separator form is dropped, so a real Edit/Write file_path\'s own raw shape is never matched', 'attribution.mjs', "  const needles = [forward, withSeparator(forward, '\\\\'), withSeparator(forward, '\\\\\\\\')];", '  const needles = [forward];'],
  ['repoExists always reports true, so a genuinely missing repo is measured as present instead', 'repos.mjs', 'return existsSync(repo.worktree);', 'return true;'],
  ['the shim stops blocking a decided finding, so the harness lets the turn end anyway', 'guard.mjs', 'if (verdict === undefined) return undefined;', 'if (verdict !== undefined) return undefined;'],
  ['the shim stops journaling its refusals, so no evidence survives the block', 'guard.mjs', 'journal({ at: new Date().toISOString(), session: sessionId, repos: verdict.dirtyRepos.map((entry) => entry.repo.name) });', ''],
  ['the dismissal match stops requiring BOTH repo name and fingerprint, so a dismissal for one repo excuses ANY repo sharing its fingerprint value', 'decide.mjs', "if (record?.repo !== repoName || record?.fingerprint !== fingerprint) continue;", "if (record?.fingerprint !== fingerprint) continue;"],
  ['the dismissal match stops comparing at all, so a dismissal NEVER matches and nothing is ever excused', 'decide.mjs', "if (record?.repo !== repoName || record?.fingerprint !== fingerprint) continue;", "continue;"],
  ['a matched dismissal stops being reported as dismissed, so an excused repo still reads as unresolved-dirty', 'decide.mjs', "if (dismissal !== undefined) return { repo, state: 'dismissed', aheadCount, unattributed, dismissal };", ''],
  ['the temporary index override is dropped, so fingerprinting would write into the repo\'s REAL index instead of a throwaway one', 'fingerprint.mjs', "const env = { ...process.env, GIT_INDEX_FILE: tempIndex };", "const env = { ...process.env };"],
  ['the worktree is no longer added into the temporary index before hashing, so the tree hash is always the EMPTY tree and never discriminates on real content', 'fingerprint.mjs', "runGit(qualified(['add', '-A']), repo.worktree, env);", ''],
  ['a failed git status stops short-circuiting fingerprinting, so a repo whose status could not be measured still gets a fingerprint computed and reported', 'fingerprint.mjs', 'if (!status.ok) return undefined;', '']
];

const survivors = runMutants({
  fleetRoot: HERE,
  paths: ['decide.mjs', 'guard.mjs', 'status.mjs', 'attribution.mjs', 'repos.mjs', 'dismiss.mjs', 'fingerprint.mjs', 'selftest.mjs', 'guard.mjs.hook-registration.json'],
  selftest: 'selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
