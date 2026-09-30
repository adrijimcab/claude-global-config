#!/usr/bin/env node
/**
 * The decisions of committing exactly what is staged (`staged-set.mjs`, `commit-staged.mjs`), each broken
 * once, that `staged.selftest.mjs` must catch. The runner and its rules (green unmutated baseline, each
 * target exactly once, parse check) live in `../mutation-proof/run-mutants.mjs`.
 *
 * Both directions, because both cost: the mutant that makes the tool BLIND (an undeclared staged path, a
 * sweeping flag, a failed listing, the race all pass) and the one that makes it NOISY (a matching index is
 * refused, a spelling of a path stops matching).
 *
 * @es Las decisiones de commitear exactamente lo que está en stage, rotas una a una, que
 * `staged.selftest.mjs` debe cazar. Las dos direcciones: el mutante que lo deja CIEGO y el que lo vuelve RUIDOSO.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const SET = 'commit-pathspec-guard/staged-set.mjs';
const TOOL = 'commit-pathspec-guard/commit-staged.mjs';

const MUTANTS = [
  // --- the comparison: blind ---
  ['an undeclared staged path is ignored', SET, 'if (unexpected.length === 0 && missing.length === 0) return { ok: true };', 'if (missing.length === 0) return { ok: true };'],
  ['a declared path that is not staged is ignored', SET, 'if (unexpected.length === 0 && missing.length === 0) return { ok: true };', 'if (unexpected.length === 0) return { ok: true };'],
  ['an empty index is no longer refused for its own reason', SET, 'if (stagedSet.size === 0) return', 'if (false) return'],
  ['a failed listing is read as an empty index', SET, 'if (staged === undefined) {', 'if (staged === undefined) staged = [];\n\n  if (false) {'],
  // --- the comparison: noisy ---
  ['a backslash spelling no longer equals git\'s name', SET, ".split('\\\\').join('/')", ''],
  ['a leading ./ no longer equals git\'s name', SET, "slashed.startsWith('./') ? slashed.slice(2) : slashed", 'slashed'],
  ['the comparison is order-sensitive and repeat-sensitive', SET, 'const stagedSet = new Set(staged.map(normalizeRepoPath));', 'const stagedSet = new Set(staged.map(normalizeRepoPath));\n  if (staged.join() !== expected.join()) return { ok: false, reason: \'order @es\', unexpected: [], missing: [] };'],
  // --- the forwarded commit arguments ---
  ['any commit flag is forwarded', SET, '    return `\\`${argument}\\` is not forwarded', '    continue;\n    return `\\`${argument}\\` is not forwarded'],
  ['-m is no longer a forwarded message flag', SET, "new Set(['-m', '--message', '-F', '--file'])", "new Set(['--message', '-F', '--file'])"],
  ['-F is no longer a forwarded message flag', SET, "new Set(['-m', '--message', '-F', '--file'])", "new Set(['-m', '--message', '--file'])"],
  ['--message=value is no longer a forwarded spelling', SET, "['--message=', '--file=']", "['--file=']"],
  ['an empty argument list is accepted', SET, 'if (commitArguments.length === 0) return', 'if (false) return'],
  // --- the declaration ---
  ['nothing declared is accepted', SET, 'if (expected.length === 0) {', 'if (false) {'],
  ['no repo name is accepted', SET, 'if (repoName === undefined) return', 'if (false) return'],
  ['an option value that is another option is accepted', SET, "if (value === undefined || value.startsWith('--')) return", 'if (value === undefined) return'],
  ['an unknown option is ignored', SET, "else return { problem: `unknown option ${flag}.", "else if (false) return { problem: `unknown option ${flag}."],
  // --- the sequence ---
  ['the commit arguments are not checked', TOOL, 'if (argumentsProblem !== undefined) return refuse(argumentsProblem);', ''],
  ['the index comparison does not refuse', TOOL, 'if (!comparison.ok) return refuse(comparison.reason);', ''],
  ['a failed git commit does not stop the sequence', TOOL, "if (!commit.ok) return { status: 1, committed: false,", 'if (false) return { status: 1, committed: false,'],
  ['the post-commit verification is skipped', TOOL, 'if (!afterwards.ok) {', 'if (false) {'],
  ['a commit that swept an extra path still exits 0', TOOL, 'status: 1,\n      committed: true,', 'status: 0,\n      committed: true,'],
  ['the tool reports success without the commit existing', TOOL, "return { status: 0, committed: true,", "return { status: 0, committed: false,"],
  // --- the CLI ---
  ['an undeclared repo name is not refused', TOOL, 'if (repo === undefined) {', 'if (false) {'],
  ['the CLI runs on IMPORT', TOOL, "if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {", 'if (true) {'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['commit-pathspec-guard', 'config-sync-guard', 'mutation-proof'],
  selftest: 'commit-pathspec-guard/staged.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
