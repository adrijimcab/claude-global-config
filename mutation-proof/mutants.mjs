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
const POOL = 'mutation-proof/mutant-pool.mjs';

// Not attacked here, on purpose: the pool's width (Math.min(concurrency, plans)) is a speed property that no verdict
// shows, measured by timing instead; and a parse check failing without a SyntaxError has no fixture on either path.
// @es No se atacan aquí, a propósito: el ancho del pool es una propiedad de velocidad que ningún veredicto muestra (se
// mide con tiempos), y un parse check que falla sin SyntaxError no tiene fixture en ninguno de los dos caminos.
const MUTANTS = [
  // ── parallel mutants (concurrencyOf, mutant-pool.mjs) ────────────────────────────────────────────────────
  ['the pool is never used, so every campaign stays sequential', RUNNER, 'const outcomes = parallel > 1 ? pooledOutcomes(', 'const outcomes = false ? pooledOutcomes('],
  ['a concurrency of 1 still starts a pool', RUNNER, 'parallel > 1 ?', 'parallel >= 1 ?'],
  ['the default ignores the cap of 8', RUNNER, 'Math.min(8, cores - 2)', '(cores - 2)'],
  ['the default takes every core', RUNNER, 'cores - 2)', 'cores)'],
  ['a concurrency below 1 is kept', RUNNER, 'return Math.max(1, value);', 'return value;'],
  ['a concurrency that is not a whole number is accepted', RUNNER, 'if (!Number.isInteger(value)) throw', 'if (false) throw'],
  ['the environment wins over the campaign value', RUNNER, 'const value = requested ??', 'const value = undefined ??'],
  ['the pool never applies the mutation', POOL, 'await writeFile(target, source.slice(0, at) + replacement + source.slice(at + original.length));', ''],
  ['the pool never parse-checks, so a broken mutant runs and reads as a crash', POOL, 'if (check.status !== 0) {', 'if (false) {'],
  ['parallel mutants share the system temp folder', POOL, '{ ...process.env, SELFTEST_FLEET: job.fleet, TEMP: temp, TMP: temp, TMPDIR: temp }', '{ ...process.env, SELFTEST_FLEET: job.fleet }'],
  ['outcomes land in completion order, not plan order', POOL, 'results[index] = await measureOne(job.plans[index]);', 'results[done] = await measureOne(job.plans[index]);'],
  ['the pool does not hand the fleet to the selftest', POOL, 'SELFTEST_FLEET: job.fleet, TEMP', 'TEMP'],
  // ── stop at the first failed check ───────────────────────────────────────────────────────────────────────
  ['the pool never stops at a failed check', POOL, 'if (failureLine.test(line)) {', 'if (false) {'],
  ['a run stopped at a failed check reads as a survivor', POOL, "resolve({ status: 1, signal: null, stdout: out.stdout, stderr: out.stderr, stoppedAt });", "resolve({ status: 0, signal: null, stdout: out.stdout, stderr: out.stderr, stoppedAt });"],
  ['the calibration is skipped, so a failure-looking green baseline still cuts and invents a kill', RUNNER, 'if (FAILURE_LINE.test(`${baseline.stdout', 'if (false && FAILURE_LINE.test(`${baseline.stdout'],
  ['MUTATION_FAIL_FAST=0 is ignored', RUNNER, "if (env.MUTATION_FAIL_FAST === '0') return", 'if (false) return'],
  ['the pool is always told the stop is off', RUNNER, 'failFast: failFast.on,', 'failFast: false,'],
  ['the failure line forgets the RED form', RUNNER, 'FAIL\\w*|RED|not ok', 'FAIL\\w*|not ok'],
  // ── the three hardening fixes, each reverted ─────────────────────────────────────────────────────────
  ['a target occurring more than once is mutated at its first occurrence', RUNNER, 'if (count > 1) return', 'if (false) return'],
  ['the selftest is never run unmutated, so a red baseline reads as every mutant killed', RUNNER, '    const baseline = requireGreenBaseline(sandboxes, selftest, timeoutMs);\n', "    const baseline = { stdout: '', stderr: '' };\n"],
  ['a mutated file is never parse-checked, so a syntax error reads as a kill', RUNNER, 'const syntaxError = syntaxErrorOf(path.join(sandbox, file));', 'const syntaxError = undefined;'],

  // ── the refusals that keep those fixes honest ───────────────────────────────────────────────────────
  ['an absent target is run instead of refused', RUNNER, 'if (count === 0) return', 'if (false) return'],
  ['a file with no parse check is run unchecked', RUNNER, 'if (!PARSE_CHECKED.has(path.extname(file))) return', 'if (false) return'],
  ['a path outside the copied paths is not refused, so a mutant can climb out of its sandbox and write a live file', RUNNER, 'if (!copied.some((needed) => isInside(needed, file))) return', 'if (false) return'],
  ['an unparseable original is accepted, so BROKEN no longer means the mutation broke it', RUNNER, '    requireParseableOriginals(plans, snapshot);\n', ''],
  ['the mutation is applied with String.replace, which rewrites $& in the replacement', RUNNER, 'return source.slice(0, at) + replacement + source.slice(at + original.length);', 'return source.replace(original, replacement);'],
  ['a refused mutant no longer stops the run, so a stale campaign runs its whole baseline first', RUNNER, '    requireNoRefusal(plans);\n', ''],
  ['a refusal stops the run only after the baseline', RUNNER, '    requireNoRefusal(plans);\n    requireParseableOriginals(plans, snapshot);\n    const baseline = requireGreenBaseline(sandboxes, selftest, timeoutMs);\n', '    requireParseableOriginals(plans, snapshot);\n    const baseline = requireGreenBaseline(sandboxes, selftest, timeoutMs);\n    requireNoRefusal(plans);\n'],
  ['a refused mutant is not printed with its reason', RUNNER, "  for (const { label, refusal } of refused) console.log(`REFUSED  ${label} — ${refusal}`);\n", ''],
  ['every plan counts as refused', RUNNER, "plans.filter(({ refusal }) => refusal !== undefined);", "plans.filter(() => true);"],
  ['the stop does not count the refused mutants', RUNNER, 'throw new NotMeasured(`${refused.length} planned', 'throw new NotMeasured(`planned'],
  ['the stop drops the Spanish half of its count', RUNNER, '@es ${refused.length} mutante(s)', 'mutante(s)'],
  ['the stop does not name the refused mutants', RUNNER, 'no se corre la línea base:\\n${labels}`);', 'no se corre la línea base`);'],
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
