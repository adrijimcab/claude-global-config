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
  ['a path outside the copied paths is not refused, so a mutant can climb out of its sandbox and write a live file', RUNNER, 'if (!paths.some((needed) => isInside(needed, file))) return', 'if (false) return'],
  ['an unparseable original is accepted, so BROKEN no longer means the mutation broke it', RUNNER, '    requireParseableOriginals(plans, snapshot);\n', ''],
  ['the mutation is applied with String.replace, which rewrites $& in the replacement', RUNNER, 'return source.slice(0, at) + replacement + source.slice(at + original.length);', 'return source.replace(original, replacement);'],
  ['a refused mutant is counted as killed', RUNNER, 'runMutant(plan, sandboxes, selftest, timeoutMs) : undefined;', "runMutant(plan, sandboxes, selftest, timeoutMs) : 'assertion';"],
  ['an empty campaign reports 0/0 killed and exits clean', RUNNER, "if (mutants.length === 0) throw new NotMeasured(", "if (false) throw new NotMeasured("],
  ['overlapping occurrences are not counted, so "aa" in "aaa" reads as exactly once', RUNNER, 'text.indexOf(needle, at + 1)', 'text.indexOf(needle, at + needle.length)']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['mutation-proof'],
  selftest: 'mutation-proof/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
