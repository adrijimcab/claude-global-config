#!/usr/bin/env node
/**
 * The decisions of the AFTER half of `commit-index-guard` — which commits are judged, which paths they named,
 * how git is asked and what is recorded — each broken once, that `selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`; the selftest builds real repositories with a real
 * rewriting hook.
 *
 * @es Las decisiones de la mitad DESPUÉS de `commit-index-guard` (qué commits se juzgan, qué rutas nombraron,
 * cómo se pregunta a git y qué se registra), rotas una a una, que `selftest.mjs` debe cazar.
 */

import { runCampaign } from './campaign.mjs';

const AFTER = 'commit-index-guard/guard.mjs';
const COMMITS = 'commit-index-guard/commits.mjs';
const STATUS = 'commit-index-guard/index-state.mjs';

const MUTANTS = [
  // --- which commits are judged, and which paths they named.
  ['a dry run is judged as a commit', AFTER, 'if (commit.dryRun) continue;', ''],
  ['a cd that cannot be followed is guessed', AFTER, 'if (commit.directory === undefined) {', 'if (false) {'],
  ['a commit naming no path is measured as the whole repository', AFTER, 'if (paths.length > 0) byDirectory.set(', 'if (true) byDirectory.set('],
  ["the second commit of a line forgets the first one's paths", AFTER, '[...(byDirectory.get(commit.directory) ?? []), ...paths]', 'paths'],
  ['the pathspec file is never read', AFTER, 'if (commit.pathspecFile === undefined) return commit.paths;', ''],
  ['the entries of a pathspec file are ignored', AFTER, 'if (fromFile.ok) return fromFile.paths;', 'if (false) return fromFile.paths;'],
  ['an unreadable pathspec file is not journaled', AFTER, "journalError({ step: 'pathspec-file', reason: fromFile.reason });", ''],
  ['a payload with a byte-order mark is no longer read', COMMITS, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a mention inside echo or a non-commit is judged as a commit', COMMITS, "invocation.subcommand === 'commit'", "invocation.subcommand !== 'push'"],
  ['a tool that runs no shell is judged', COMMITS, 'if (dialect === undefined || typeof command', 'if (typeof command'],

  // --- how git is asked.
  ['a timeout is reported like any other git failure', STATUS, "error?.code === 'ETIMEDOUT'", 'false'],
  ['git is given a time limit no call can meet', STATUS, 'export const GIT_TIMEOUT_MS = 5000;', 'export const GIT_TIMEOUT_MS = 1;'],
  ['git status is not asked for the v2 records', STATUS, "'status', '--porcelain=v2', '-z', '--find-renames', ", "'status', '--porcelain', '-z', '--find-renames', "],
  ['git status is not asked for NUL-separated output', STATUS, "'--porcelain=v2', '-z', ", "'--porcelain=v2', "],
  ['git status is not asked to find renames', STATUS, "'-z', '--find-renames', ", "'-z', "],
  ['git status is asked for untracked files', STATUS, "'--find-renames', '--untracked-files=no', ", "'--find-renames', "],
  ['git status is not given the end of its options before the paths', STATUS, "'--untracked-files=no', '--', ...paths", "'--untracked-files=no', ...paths"],
  ['a failed status is read as an answer', STATUS, 'if (!status.ok) return status;', ''],

  // --- what is recorded and said.
  ['a git answer that failed is read as stale paths', AFTER, 'if (!measured.ok) {', 'if (false) {'],
  ['every changed path is recorded, not only the MM ones', AFTER, 'else recordStale(top.toplevel, sweepHazards);', 'else recordStale(top.toplevel, measured.entries);'],
  ['nothing is recorded', AFTER, 'else recordStale(top.toplevel, sweepHazards);', ''],
  ['every changed path counts as a sweep hazard', AFTER, 'const sweepHazards = measured.entries.filter(indexDisagreesWithBoth);', 'const sweepHazards = measured.entries;'],
  ['the root of the repository is asked even when nothing is to be recorded', AFTER, 'if (sweepHazards.length === 0) return measured.entries;', ''],
  ['a failed rev-parse is read as a repository', AFTER, 'if (!top.ok) journalError', 'if (false) journalError'],
  ['a clean commit still produces a notice', AFTER, 'if (stale.length === 0) return undefined;', ''],
  ['the notice goes out under the wrong event', AFTER, "hookEventName: 'PostToolUse'", "hookEventName: 'PreToolUse'"],
  ['the notice is not given as context', AFTER, 'additionalContext: noticeText(stale)', 'systemMessage: noticeText(stale)']
];

runCampaign({
  selftest: 'commit-index-guard/selftest.mjs',
  paths: ['commit-index-guard', 'shell-command', 'company-remote', 'cherry-pick-guard', 'hook-state', 'hook-payloads', 'hook-dispatch', 'mutation-proof', 'bilingual-output', 'hook-caller'],
  mutants: MUTANTS
});
