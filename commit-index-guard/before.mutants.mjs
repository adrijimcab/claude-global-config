#!/usr/bin/env node
/**
 * The decisions of the BEFORE half of `commit-index-guard` — which commits sweep the index, which paths a commit
 * covers, when a recorded path is still stale, how a moved path is followed and what a refusal does — each
 * broken once, that `selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`; the selftest builds real repositories with a real rewriting hook.
 *
 * @es Las decisiones de la mitad ANTES de `commit-index-guard` (qué commits arrastran el índice, qué rutas
 * cubre un commit, cuándo una ruta registrada sigue desactualizada, cómo se sigue una ruta movida y qué hace una
 * negativa), rotas una a una, que `selftest.mjs` debe cazar.
 */

import { runCampaign } from './campaign.mjs';

const BEFORE = 'commit-index-guard/pre-commit.mjs';
const STORE = 'commit-index-guard/stale-store.mjs';

const MUTANTS = [
  // --- which commits sweep the index.
  ['a dry run is refused as a sweep', BEFORE, '!commit.dryRun && ', ''],
  ['`-a` is refused as a sweep', BEFORE, '!commit.all && ', ''],
  ['`-o` is refused as a sweep', BEFORE, '!commit.only && ', ''],
  ['a pathspec file is refused as a sweep', BEFORE, 'commit.pathspecFile === undefined && ', ''],
  ['a commit naming paths is refused as a sweep', BEFORE, '(commit.paths.length === 0 || commit.include)', 'true'],
  ['`--include` is not a sweep', BEFORE, '(commit.paths.length === 0 || commit.include)', 'commit.paths.length === 0'],

  // --- which paths a commit covers.
  ['naming the stale file does not settle it', BEFORE, 'entry === given || entry.startsWith', 'entry.startsWith'],
  ['naming a directory does not cover its files', BEFORE, 'entry === given || entry.startsWith(`${given}/`)', 'entry === given'],
  ['naming a prefix covers a sibling', BEFORE, 'entry.startsWith(`${given}/`)', 'entry.startsWith(given)'],
  ['a path is compared with its separators as written, so a directory never covers a file', STORE, ".split('\\\\').join('/')", ''],
  ['a named path is compared by its spelling, not through the file system', BEFORE, 'comparable(canonical(path.resolve(directory, named)))', 'comparable(path.resolve(directory, named))'],
  ['the first carried path is lost', BEFORE, 'return stillStale(top.toplevel, git).filter(', 'return stillStale(top.toplevel, git).slice(1).filter('],

  // --- when a recorded path is still stale.
  ['a repository with no record is measured whole', BEFORE, 'if (recorded.length === 0) return [];', ''],
  ['a path that is clean now is read as stale', BEFORE, 'if (now === undefined) continue;', ''],
  ['a path is stale whatever blob the index holds now', BEFORE, 'live.blob === recorded.blob && ', ''],
  ['a path is stale whatever its status columns', BEFORE, ' && indexDisagreesWithBoth(live)', ''],
  ['the still-stale path shows its recorded status instead of the current one', BEFORE, 'still.push({ ...entry, code: now.code });', 'still.push({ ...entry });'],
  ['a failed status is read as a measurement', BEFORE, 'if (!measured.ok) {', 'if (false) {'],
  ['the record is not cut to what is still stale', BEFORE, 'retainStale(toplevel, still);', ''],

  // --- how a moved path is followed.
  ['a path removed from the index is not looked for under another name', BEFORE, "else if (now.code[0] === 'D') moved.push(entry);", ''],
  ['the whole repository is read even when no recorded path moved', BEFORE, 'if (moved.length > 0) still.push(', 'if (true) still.push('],
  ['a moved path is never followed', BEFORE, 'if (moved.length > 0) still.push(...followedMoves(moved, toplevel, git));', ''],
  ['a failed whole-repository read is read as an answer', BEFORE, 'if (!everything.ok) {', 'if (false) {'],
  ['a moved path is looked for by its old name', BEFORE, 'everything.entries.find((entry) => isRecordedVariant(entry, recorded))', 'everything.entries.find((entry) => entry.path === recorded.path)'],
  ['a moved path keeps its old name', BEFORE, 'path: target.path, code: target.code', 'path: recorded.path, code: target.code'],
  ['a moved path keeps its old status', BEFORE, 'path: target.path, code: target.code', 'path: target.path, code: recorded.code'],
  ['a path with no new name is followed all the same', BEFORE, 'return target === undefined ? [] : [', 'return false ? [] : ['],

  // --- the repository and the answer.
  ['a cd that cannot be followed is judged against the process directory', BEFORE, 'if (commit.directory === undefined) return [];', ''],
  ['a failed rev-parse is read as a repository', BEFORE, 'if (!top.ok) {', 'if (false) {'],
  ['the check runs even when nothing is recorded', BEFORE, 'if (!anyRecorded()) return undefined;', ''],
  ['a refusal is not journaled', BEFORE, 'journalRefusal({', 'void ({'],
  ['the refusal is an allow', BEFORE, "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['the refusal goes out under the wrong event', BEFORE, "hookEventName: 'PreToolUse'", "hookEventName: 'PostToolUse'"]
];

runCampaign({
  selftest: 'commit-index-guard/selftest.mjs',
  paths: ['commit-index-guard', 'shell-command', 'company-remote', 'cherry-pick-guard', 'hook-state', 'hook-payloads', 'hook-dispatch', 'mutation-proof', 'bilingual-output', 'hook-caller'],
  mutants: MUTANTS
});
