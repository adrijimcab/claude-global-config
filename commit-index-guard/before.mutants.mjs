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
  ['a commit with a pathspec file is read as naming its command-line paths only', BEFORE, 'return paths === undefined ? [] : [{ ...commit, paths }];', 'return paths === undefined ? [] : [{ ...commit }];'],
  ['the pathspec file of a commit is never read', BEFORE, 'if (commit.pathspecFile === undefined) return commit.paths;', ''],
  ['the entries of a pathspec file are ignored', BEFORE, 'if (fromFile.ok) return fromFile.paths;', 'if (false) return fromFile.paths;'],
  ['an unreadable pathspec file is not journaled', BEFORE, "journalError({ step: 'pathspec-file', reason: fromFile.reason });", ''],
  ['a commit whose pathspec file cannot be read is judged as naming nothing', BEFORE, "journalError({ step: 'pathspec-file', reason: fromFile.reason });\n\n  return undefined;", "journalError({ step: 'pathspec-file', reason: fromFile.reason });\n\n  return commit.paths;"],
  ['a commit whose pathspec file cannot be read crashes the judgment', BEFORE, 'return paths === undefined ? [] : [{ ...commit, paths }];', 'return [{ ...commit, paths }];'],
  ['a NUL-separated pathspec file is read as lines', BEFORE, 'nul: commit.pathspecNul', 'nul: false'],
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
  ['the record is never cut to what is still stale', BEFORE, 'retainStale(toplevel, [...still, ...unresolved]);', ''],

  // --- how a moved path is followed.
  ['a path removed from the index is not looked for under another name', BEFORE, "else if (now.code[0] === 'D') moved.push(entry);", ''],
  ['the whole repository is read even when no recorded path moved', BEFORE, 'if (moved.length > 0) {', 'if (true) {'],
  ['a moved path is never followed', BEFORE, 'still.push(...moves.followed);', ''],
  ['an unresolved moved path is forgotten', BEFORE, 'unresolved = moves.unresolved;', ''],
  ['the record is cut to the measured paths, dropping the unresolved ones', BEFORE, 'retainStale(toplevel, [...still, ...unresolved]);', 'retainStale(toplevel, still);'],
  ['a failed whole-repository read is read as an answer', BEFORE, 'if (!everything.ok) {', 'if (false) {'],
  ['a failed whole-repository read empties the record', BEFORE, 'return undefined;\n  }\n\n  const taken', 'return { followed: [], unresolved: [] };\n  }\n\n  const taken'],
  ['a failed whole-repository read goes on to cut the record', BEFORE, 'if (moves === undefined) return still;', 'if (moves === undefined) return [];'],
  ['a failed whole-repository read crashes the judgment', BEFORE, 'if (moves === undefined) return still;', ''],
  ['a path that is already stale can be the new name of a moved one', BEFORE, 'new Set(retained.map((entry) => entry.path))', 'new Set()'],
  ['a path that is already stale is excluded as a new name by its old name too', BEFORE, '!taken.has(entry.path) && ', ''],
  ['a moved path is followed to the first of several holders of its blob', BEFORE, 'if (candidates.length === 1)', 'if (candidates.length >= 1)'],
  ['a moved path with no holder of its blob is followed all the same', BEFORE, 'if (candidates.length === 1)', 'if (candidates.length <= 1)'],
  ['a moved path that cannot be told is dropped', BEFORE, 'else unresolved.push(recorded);', ''],
  ['a moved path is looked for by its old name', BEFORE, 'everything.entries.filter((entry) => !taken.has(entry.path) && isRecordedVariant(entry, recorded))', 'everything.entries.filter((entry) => !taken.has(entry.path) && entry.path === recorded.path)'],
  ['a moved path keeps its old name', BEFORE, 'path: candidates[0].path, code: candidates[0].code', 'path: recorded.path, code: candidates[0].code'],
  ['a moved path keeps its old status', BEFORE, 'path: candidates[0].path, code: candidates[0].code', 'path: candidates[0].path, code: recorded.code'],

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
