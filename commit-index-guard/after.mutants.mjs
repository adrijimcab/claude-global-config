#!/usr/bin/env node
/**
 * The decisions of the AFTER half of `commit-index-guard` — which commits are judged, how git is asked and what
 * is recorded — each broken once, that `selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`; the selftest builds real repositories with a real rewriting hook.
 *
 * @es Las decisiones de la mitad DESPUÉS de `commit-index-guard` (qué commits se juzgan, cómo se pregunta a git
 * y qué se registra), rotas una a una, que `selftest.mjs` debe cazar.
 */

import { runCampaign } from './campaign.mjs';

const AFTER = 'commit-index-guard/guard.mjs';
const COMMITS = 'commit-index-guard/commits.mjs';
const STATUS = 'commit-index-guard/index-state.mjs';

const MUTANTS = [
  // --- which commits are judged.
  ['a dry run is judged as a commit', AFTER, 'if (commit.dryRun || commit.paths.length === 0) continue;', 'if (commit.paths.length === 0) continue;'],
  ['a commit naming no path is judged', AFTER, 'if (commit.dryRun || commit.paths.length === 0) continue;', 'if (commit.dryRun) continue;'],
  ['a cd that cannot be followed is guessed', AFTER, 'if (commit.directory === undefined) {', 'if (false) {'],
  ["the second commit of a line forgets the first one's paths", AFTER, '[...(byDirectory.get(commit.directory) ?? []), ...commit.paths]', 'commit.paths'],
  ['a payload with a byte-order mark is no longer read', COMMITS, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a mention inside echo or a non-commit is judged as a commit', COMMITS, "invocation.subcommand === 'commit'", "invocation.subcommand !== 'push'"],
  ['a tool that runs no shell is judged', COMMITS, 'if (dialect === undefined || typeof command', 'if (typeof command'],

  // --- how git is asked.
  ['a timeout is reported like any other git failure', STATUS, "error?.code === 'ETIMEDOUT'", 'false'],
  ['git is given a time limit no call can meet', STATUS, 'export const GIT_TIMEOUT_MS = 5000;', 'export const GIT_TIMEOUT_MS = 1;'],
  ['git status is not asked for NUL-separated output', STATUS, "'--porcelain=v1', '-z', ", "'--porcelain=v1', "],
  ['a failed status is read as an answer', STATUS, 'if (!status.ok) return status;', ''],

  // --- what is recorded and said.
  ['a git answer that failed is read as stale paths', AFTER, 'if (!measured.ok) {', 'if (false) {'],
  ['a clean answer still records the repository', AFTER, 'if (measured.entries.length === 0) return [];', ''],
  ['a stale answer is not recorded for the next commit', AFTER, 'else recordStale(top.toplevel, measured.entries);', ''],
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
