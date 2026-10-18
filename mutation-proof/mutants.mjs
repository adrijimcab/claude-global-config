#!/usr/bin/env node
/**
 * The runner's own decisions, each reverted once, that `selftest.mjs` must catch — measured BY the runner,
 * on a sandbox copy of itself. The live runner drives the campaign; the selftest inside each sandbox loads
 * the MUTATED copy next to it, so every mutant below is the runner as it would be with one of its refusals
 * gone. The first three revert the three hardening fixes; the rest break the refusals that keep them honest.
 *
 * @es Las decisiones del propio runner, revertidas una a una, que `selftest.mjs` debe cazar; las mide el
 * runner vivo sobre una copia mutada de sí mismo.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from './run-mutants.mjs';

const RUNNER = 'mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // ── the three hardening fixes, each reverted ─────────────────────────────────────────────────────────
  ['a target occurring more than once is mutated at its first occurrence', RUNNER, 'if (count > 1) return', 'if (false) return'],
  ['the selftest is never run unmutated, so a red baseline reads as every mutant killed', RUNNER, '    requireGreenBaseline(sandboxes, selftest, timeoutMs);\n', ''],
  ['a mutated file is never parse-checked, so a syntax error reads as a kill', RUNNER, 'const syntaxError = syntaxErrorOf(path.join(sandbox, file));', 'const syntaxError = undefined;'],

  // ── the refusals that keep those fixes honest ───────────────────────────────────────────────────────
  ['an absent target is run instead of refused', RUNNER, 'if (count === 0) return', 'if (false) return'],
  ['a file with no parse check is run unchecked', RUNNER, 'if (!PARSE_CHECKED.has(path.extname(file))) return', 'if (false) return'],
  ['a path outside the copied paths is not refused, so a mutant can climb out of its sandbox and write a live file', RUNNER, 'if (!copied.some((needed) => isInside(needed, file))) return', 'if (false) return'],
  ['an unparseable original is accepted, so BROKEN no longer means the mutation broke it', RUNNER, '    requireParseableOriginals(plans, snapshot);\n', ''],
  ['the mutation is applied with String.replace, which rewrites $& in the replacement', RUNNER, 'return source.slice(0, at) + replacement + source.slice(at + original.length);', 'return source.replace(original, replacement);'],
  ['a refused mutant is counted as killed', RUNNER, 'runMutant(plan, sandboxes, selftest, timeoutMs) : undefined;', "runMutant(plan, sandboxes, selftest, timeoutMs) : 'assertion';"],
  ['an empty campaign reports 0/0 killed and exits clean', RUNNER, "if (mutants.length === 0) throw new NotMeasured(", "if (false) throw new NotMeasured("],
  ['overlapping occurrences are not counted, so "aa" in "aaa" reads as exactly once', RUNNER, 'text.indexOf(needle, at + 1)', 'text.indexOf(needle, at + needle.length)'],

  // ── the fleet a mutant's selftest imports shared modules from ───────────────────────────────────────
  ["the fleet defaults to the home one, so a campaign in a worktree of the fleet measures the live fleet", RUNNER, "if (process.env.SELFTEST_FLEET !== undefined) return process.env.SELFTEST_FLEET;", "return process.env.SELFTEST_FLEET ?? path.join(process.getBuiltinModule('node:os').homedir(), '.claude');"],
  ["a fleet the caller named is overwritten by the derived one", RUNNER, "if (process.env.SELFTEST_FLEET !== undefined) return process.env.SELFTEST_FLEET;", ""],
  ["only the fleet root is looked at, never a tree above it", RUNNER, "if (path.dirname(directory) === directory) break;", "break;"],
  ["a tree with no runner above it hands the selftest no fleet instead of stopping", RUNNER, "  throw new NotMeasured(\n    `no directory from", "  return undefined;\n  throw new NotMeasured(\n    `no directory from"],
  ["the stop drops its Spanish half", RUNNER, "`@es ningún directorio", "`ningún directorio"],
  ["the derived fleet never reaches the selftest", RUNNER, "env: { ...process.env, SELFTEST_FLEET: fleet } }", "env: process.env }"],

  // ── what is copied: derived from the import closure, plus the explicit paths ────────────────────────
  ['nothing is derived, so the selftest runs without what it imports', RUNNER, 'entries: [selftest, ...mutated] });', 'entries: [] });'],
  ['a mutated file is not walked, so a file only the campaign names is refused', RUNNER, 'entries: [selftest, ...mutated] });', 'entries: [selftest] });'],
  ['a missing mutated file is walked, so one bad mutant stops the whole campaign', RUNNER, ' && existsSync(path.join(fleetRoot, file)));', ');'],
  ['a mutated file beside the fleet is walked and copied', RUNNER, '.filter((file) => isInside(fleetRoot, path.join(fleetRoot, file)) && ', '.filter((file) => '],
  ['an import that cannot be followed is ignored, so the baseline runs short of it', RUNNER, 'if (closure.problems.length > 0) {', 'if (false) {'],
  ['the refusal does not name the import it could not follow', RUNNER, ":\\n${closure.problems.map((problem) => `  - ${problem}`).join('\\n')}`);", '`);'],
  ['the explicit paths are not added to the derived ones', RUNNER, '[...copiedPaths(closure.files), ...paths]', '[...copiedPaths(closure.files)]'],
  ['the closure copies its files, not their folders', RUNNER, '[...copiedPaths(closure.files), ...paths]', '[...closure.files, ...paths]']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'mutation-proof/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
