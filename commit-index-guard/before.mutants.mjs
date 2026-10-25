#!/usr/bin/env node
/**
 * The decisions of the BEFORE half of `commit-index-guard` — which commits sweep the index, which paths a commit
 * covers, how a record is measured again and what a refusal does — each broken once, that `selftest.mjs` must
 * catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`; the selftest builds real
 * repositories with a real rewriting hook.
 *
 * @es Las decisiones de la mitad ANTES de `commit-index-guard` (qué commits arrastran el índice, qué rutas
 * cubre un commit, cómo se vuelve a medir un registro y qué hace una negativa), rotas una a una, que
 * `selftest.mjs` debe cazar.
 */

import { runCampaign } from './campaign.mjs';

const BEFORE = 'commit-index-guard/pre-commit.mjs';

const MUTANTS = [
  // --- which commits sweep the index.
  ['a dry run is refused as a sweep', BEFORE, '!commit.dryRun && !commit.all', '!commit.all'],
  ['`-a` is refused as a sweep', BEFORE, '!commit.dryRun && !commit.all', '!commit.dryRun'],
  ['a commit naming paths is refused as a sweep', BEFORE, '(commit.paths.length === 0 || commit.include)', 'true'],
  ['`--include` is not a sweep', BEFORE, '(commit.paths.length === 0 || commit.include)', 'commit.paths.length === 0'],

  // --- which paths a commit covers.
  ['naming the stale file does not settle it', BEFORE, 'entry === given || entry.startsWith', 'entry.startsWith'],
  ['naming a directory does not cover its files', BEFORE, 'entry === given || entry.startsWith(`${given}/`)', 'entry === given'],
  ['a path is compared with its separators as written, so a directory never covers a file', 'commit-index-guard/stale-store.mjs', ".split('\\\\').join('/')", ''],
  ['naming a prefix covers a sibling', BEFORE, 'entry.startsWith(`${given}/`)', 'entry.startsWith(given)'],
  ['a named path is compared by its spelling, not through the file system', BEFORE, 'comparable(canonical(path.resolve(directory, named)))', 'comparable(path.resolve(directory, named))'],
  ['the first carried path is lost', BEFORE, 'return stillStale(top.toplevel, git).filter(', 'return stillStale(top.toplevel, git).slice(1).filter('],

  // --- how a record is measured again.
  ['a repository with no record is measured whole', BEFORE, 'if (recorded.length === 0) return [];', ''],
  ['a settled record is kept', BEFORE, 'if (still.length === 0) clearStale(toplevel);', 'if (still.length === 0) void 0;'],
  ['a record that shrank is not rewritten', BEFORE, '\n  else recordStale(toplevel, still);', ''],
  ['a path stale in one column only is refused', BEFORE, 'measured.entries.filter(indexDisagreesWithBoth)', 'measured.entries'],
  ['a failed status is read as a measurement', BEFORE, 'if (!measured.ok) {', 'if (false) {'],
  ['a cd that cannot be followed is judged against the process directory', BEFORE, 'if (commit.directory === undefined) return [];', ''],
  ['a failed rev-parse is read as a repository', BEFORE, 'if (!top.ok) {', 'if (false) {'],
  ['the check runs even when nothing is recorded', BEFORE, 'if (!anyRecorded()) return undefined;', ''],

  // --- what a refusal does.
  ['a refusal is not journaled', BEFORE, 'journalRefusal({', 'void ({'],
  ['the refusal is an allow', BEFORE, "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['the refusal goes out under the wrong event', BEFORE, "hookEventName: 'PreToolUse'", "hookEventName: 'PostToolUse'"]
];

runCampaign({
  selftest: 'commit-index-guard/selftest.mjs',
  paths: ['commit-index-guard', 'shell-command', 'company-remote', 'cherry-pick-guard', 'hook-state', 'hook-payloads', 'hook-dispatch', 'mutation-proof', 'bilingual-output', 'hook-caller'],
  mutants: MUTANTS
});
