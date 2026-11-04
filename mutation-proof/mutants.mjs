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
const ENVIRONMENT = 'mutation-proof/mutant-environment.mjs';
const REMOVAL = 'mutation-proof/sandbox-removal.mjs';

// Not attacked here, on purpose: the pool's width (Math.min(concurrency, plans)) is a speed property that no verdict
// shows, measured by timing instead; and a parse check failing without a SyntaxError has no fixture on either path.
// @es No se atacan aquí, a propósito: el ancho del pool es una propiedad de velocidad que ningún veredicto muestra (se
// mide con tiempos), y un parse check que falla sin SyntaxError no tiene fixture en ninguno de los dos caminos.
// Also not attacked: the pool resolving a run only after its `killTree` promise settled (`killed.then`). The removal
// retries for two seconds, so a tree still dying is outlasted and no verdict shows the difference; the wait is a
// determinism choice, and the hung-selftest case of `selftest.mjs` proves the outcome (folders removed) either way.
// @es Tampoco se ataca que el pool resuelva una corrida solo tras cumplirse la promesa de `killTree`: el borrado
// reintenta dos segundos, así que un árbol que aún muere se supera y ningún veredicto muestra la diferencia.
const MUTANTS = [
  // ── parallel mutants (concurrencyOf, mutant-pool.mjs) ────────────────────────────────────────────────────
  [
    'the pool is never used, so every campaign stays sequential',
    RUNNER,
    'parallel > 1\n        ? pooledOutcomes(',
    'false\n        ? pooledOutcomes('
  ],
  [
    'a concurrency of 1 still starts a pool',
    RUNNER,
    'parallel > 1\n        ?',
    'parallel >= 1\n        ?'
  ],
  ['the default ignores the cap of 8', RUNNER, 'Math.min(8, cores - 2)', '(cores - 2)'],
  ['the default takes every core', RUNNER, 'cores - 2)', 'cores)'],
  ['a concurrency below 1 is kept', RUNNER, 'return Math.max(1, value);', 'return value;'],
  [
    'a concurrency that is not a whole number is accepted',
    RUNNER,
    'if (!Number.isInteger(value))\n    throw',
    'if (false)\n    throw'
  ],
  [
    'the environment wins over the campaign value',
    RUNNER,
    'const value =\n    requested ??',
    'const value =\n    undefined ??'
  ],
  [
    'the pool never applies the mutation',
    POOL,
    'await writeFile(target, source.slice(0, at) + replacement + source.slice(at + original.length));',
    ''
  ],
  [
    'the pool never parse-checks, so a broken mutant runs and reads as a crash',
    POOL,
    'if (check.status !== 0) {',
    'if (false) {'
  ],
  [
    'parallel mutants share the system temp folder',
    POOL,
    'mutantEnvironment(process.env, job.fleet, temp)',
    'mutantEnvironment(process.env, job.fleet, process.env.TEMP)'
  ],
  [
    'outcomes land in completion order, not plan order',
    POOL,
    'results[index] = await measureOne(job.plans[index]);',
    'results[done] = await measureOne(job.plans[index]);'
  ],
  [
    'the pool does not hand the fleet to the selftest',
    POOL,
    'mutantEnvironment(process.env, job.fleet, temp)',
    'mutantEnvironment(process.env, undefined, temp)'
  ],
  // ── stop at the first failed check ───────────────────────────────────────────────────────────────────────
  ['the pool never stops at a failed check', POOL, 'if (failureLine.test(line)) {', 'if (false) {'],
  [
    'a run stopped at a failed check reads as a survivor',
    POOL,
    'resolve({ status: 1, signal: null, stdout: out.stdout, stderr: out.stderr, stoppedAt });',
    'resolve({ status: 0, signal: null, stdout: out.stdout, stderr: out.stderr, stoppedAt });'
  ],
  [
    'the calibration is skipped, so a failure-looking green baseline still cuts and invents a kill',
    RUNNER,
    'if (FAILURE_LINE.test(`${baseline.stdout',
    'if (false && FAILURE_LINE.test(`${baseline.stdout'
  ],
  [
    'MUTATION_FAIL_FAST=0 is ignored',
    RUNNER,
    "if (env.MUTATION_FAIL_FAST === '0') return",
    'if (false) return'
  ],
  ['the pool is always told the stop is off', RUNNER, 'failFast: failFast.on,', 'failFast: false,'],
  ['the failure line forgets the RED form', RUNNER, 'FAIL\\w*|RED|not ok', 'FAIL\\w*|not ok'],
  // ── the three hardening fixes, each reverted ─────────────────────────────────────────────────────────
  [
    'a target occurring more than once is mutated at its first occurrence',
    RUNNER,
    'if (count > 1)\n    return',
    'if (false)\n    return'
  ],
  [
    'the selftest is never run unmutated, so a red baseline reads as every mutant killed',
    RUNNER,
    '    const baseline = requireGreenBaseline(sandboxes, selftest, timeoutMs);\n',
    "    const baseline = { stdout: '', stderr: '' };\n"
  ],
  [
    'a mutated file is never parse-checked, so a syntax error reads as a kill',
    RUNNER,
    'const syntaxError = syntaxErrorOf(path.join(sandbox, file));',
    'const syntaxError = undefined;'
  ],

  // ── the refusals that keep those fixes honest ───────────────────────────────────────────────────────
  [
    'an absent target is run instead of refused',
    RUNNER,
    'if (count === 0) return',
    'if (false) return'
  ],
  [
    'a file with no parse check is run unchecked',
    RUNNER,
    'if (!PARSE_CHECKED.has(path.extname(file)))\n    return',
    'if (false)\n    return'
  ],
  [
    'a path outside the copied paths is not refused, so a mutant can climb out of its sandbox and write a live file',
    RUNNER,
    'if (!copied.some((needed) => isInside(needed, file)))\n    return',
    'if (false)\n    return'
  ],
  [
    'an unparseable original is accepted, so BROKEN no longer means the mutation broke it',
    RUNNER,
    '    requireParseableOriginals(plans, snapshot);\n',
    ''
  ],
  [
    'the mutation is applied with String.replace, which rewrites $& in the replacement',
    RUNNER,
    'return source.slice(0, at) + replacement + source.slice(at + original.length);',
    'return source.replace(original, replacement);'
  ],
  [
    'a refused mutant no longer stops the run, so a stale campaign runs its whole baseline first',
    RUNNER,
    '    requireNoRefusal(plans);\n',
    ''
  ],
  [
    'a refusal stops the run only after the baseline',
    RUNNER,
    '    requireNoRefusal(plans);\n    requireParseableOriginals(plans, snapshot);\n    const baseline = requireGreenBaseline(sandboxes, selftest, timeoutMs);\n',
    '    requireParseableOriginals(plans, snapshot);\n    const baseline = requireGreenBaseline(sandboxes, selftest, timeoutMs);\n    requireNoRefusal(plans);\n'
  ],
  [
    'a refused mutant is not printed with its reason',
    RUNNER,
    '  for (const { label, refusal } of refused) console.log(`REFUSED  ${label} — ${refusal}`);\n',
    ''
  ],
  [
    'every plan counts as refused',
    RUNNER,
    'plans.filter(({ refusal }) => refusal !== undefined);',
    'plans.filter(() => true);'
  ],
  ['the stop does not count the refused mutants', RUNNER, '`${refused.length} planned', '`planned'],
  [
    'the stop drops the Spanish half of its count',
    RUNNER,
    '@es ${refused.length} mutante(s)',
    'mutante(s)'
  ],
  [
    'the stop does not name the refused mutants',
    RUNNER,
    'no se corre la línea base:\\n${labels}`',
    'no se corre la línea base`'
  ],
  [
    'an empty campaign reports 0/0 killed and exits clean',
    RUNNER,
    'if (mutants.length === 0)\n    throw new NotMeasured(',
    'if (false)\n    throw new NotMeasured('
  ],
  [
    'overlapping occurrences are not counted, so "aa" in "aaa" reads as exactly once',
    RUNNER,
    'text.indexOf(needle, at + 1)',
    'text.indexOf(needle, at + needle.length)'
  ],

  // ── the fleet a mutant's selftest imports shared modules from ───────────────────────────────────────
  [
    'the fleet defaults to the home one, so a campaign in a worktree of the fleet measures the live fleet',
    RUNNER,
    'if (process.env.SELFTEST_FLEET !== undefined) return process.env.SELFTEST_FLEET;',
    "return process.env.SELFTEST_FLEET ?? path.join(process.getBuiltinModule('node:os').homedir(), '.claude');"
  ],
  [
    'a fleet the caller named is overwritten by the derived one',
    RUNNER,
    'if (process.env.SELFTEST_FLEET !== undefined) return process.env.SELFTEST_FLEET;',
    ''
  ],
  [
    'only the fleet root is looked at, never a tree above it',
    RUNNER,
    'if (path.dirname(directory) === directory) break;',
    'break;'
  ],
  [
    'a tree with no runner above it hands the selftest no fleet instead of stopping',
    RUNNER,
    '  throw new NotMeasured(\n    `no directory from',
    '  return undefined;\n  throw new NotMeasured(\n    `no directory from'
  ],
  ['the stop drops its Spanish half', RUNNER, '`@es ningún directorio', '`ningún directorio'],
  [
    'the derived fleet never reaches the selftest',
    RUNNER,
    'env: mutantEnvironment(process.env, fleet, temp)',
    'env: mutantEnvironment(process.env, undefined, temp)'
  ],

  // ── what is copied: derived from the import closure, plus the explicit paths ────────────────────────
  [
    'nothing is derived, so the selftest runs without what it imports',
    RUNNER,
    'entries: [selftest, ...mutated] });',
    'entries: [] });'
  ],
  [
    'a mutated file is not walked, so a file only the campaign names is refused',
    RUNNER,
    'entries: [selftest, ...mutated] });',
    'entries: [selftest] });'
  ],
  [
    'a missing mutated file is walked, so one bad mutant stops the whole campaign',
    RUNNER,
    ' && existsSync(path.join(fleetRoot, file))',
    ''
  ],
  [
    'a mutated file beside the fleet is walked and copied',
    RUNNER,
    'isInside(fleetRoot, path.join(fleetRoot, file)) && ',
    ''
  ],
  [
    'an import that cannot be followed is ignored, so the baseline runs short of it',
    RUNNER,
    'if (closure.problems.length > 0) {',
    'if (false) {'
  ],
  [
    'the refusal does not name the import it could not follow',
    RUNNER,
    ":\\n${closure.problems.map((problem) => `  - ${problem}`).join('\\n')}`",
    '`'
  ],
  [
    'the explicit paths are not added to the derived ones',
    RUNNER,
    '[...copiedPaths(closure.files), ...paths]',
    '[...copiedPaths(closure.files)]'
  ],
  [
    'the closure copies its files, not their folders',
    RUNNER,
    '[...copiedPaths(closure.files), ...paths]',
    '[...closure.files, ...paths]'
  ],

  // ── the temp folder and the folders of a campaign (mutant-environment.mjs, sandbox-removal.mjs) ─────
  [
    'a pooled mutant gets its temp inside its sandbox, inside the repository',
    POOL,
    'const temp = createMutantTemp();',
    'const temp = sandbox;'
  ],
  [
    'the baseline gets its temp inside its sandbox, inside the repository',
    RUNNER,
    'const temp = createMutantTemp();',
    'const temp = sandbox;'
  ],
  ['a pooled mutant never removes its temp folder', POOL, 'await removeTreeAsync(temp);', ''],
  [
    'the baseline and the sequential mutants never remove their temp folder',
    RUNNER,
    'removeTree(temp);',
    ''
  ],
  ['a pooled mutant never removes its sandbox', POOL, 'await removeTreeAsync(sandbox);', ''],
  [
    'the pool removes its sandbox synchronously and blocks its event loop',
    POOL,
    'await removeTreeAsync(sandbox);',
    "process.getBuiltinModule('node:fs').rmSync(sandbox, { recursive: true, force: true });"
  ],
  [
    'the pool names its folders for the campaign instead of for itself',
    POOL,
    "ownedPrefix('mutant')",
    "ownedPrefix('mutant', process.ppid)"
  ],
  [
    'the baseline and sequential sandboxes name no creator pid',
    RUNNER,
    "ownedPrefix('mutant')",
    "ownedPrefix('mutant', 1)"
  ],
  [
    'a temp folder names no creator pid, so no sweep can tell a live run from a dead one',
    ENVIRONMENT,
    "ownedPrefix('mutant-temp')",
    "'mutant-temp-'"
  ],
  [
    'a system temp folder inside a git repository is accepted',
    RUNNER,
    '  requireTempOutsideRepository();\n',
    ''
  ],
  [
    'the repository probe reads every temp folder as inside a repository',
    ENVIRONMENT,
    'probe.status === 0',
    'probe.status !== 0'
  ],
  ['a campaign never sweeps the system temp folder', RUNNER, '  sweepOrphans(tmpdir());\n', ''],
  [
    'the sweep forgets the temp folders of a dead creator',
    REMOVAL,
    '(?:mutant-temp|mutant|snapshot|pool)',
    '(?:mutant|snapshot|pool)'
  ],
  ['the sequential path never removes its sandbox', RUNNER, 'removeTree(sandbox);', ''],
  [
    'the temp folder is made under the working directory instead of os.tmpdir()',
    ENVIRONMENT,
    'path.join(tmpdir(), ownedPrefix',
    'path.join(process.cwd(), ownedPrefix'
  ],
  [
    'the mutant environment keeps the caller temp',
    ENVIRONMENT,
    'TEMP: temp, TMP',
    'TEMP: base.TEMP, TMP'
  ],
  [
    'the baseline and the mutants no longer share one environment builder',
    ENVIRONMENT,
    'SELFTEST_FLEET: fleet,',
    'SELFTEST_FLEET: base.SELFTEST_FLEET,'
  ],
  [
    'a campaign never sweeps the folders of a dead campaign',
    RUNNER,
    'sweepOrphans(sandboxRoot);',
    ''
  ],
  [
    'the sweep removes the folders of a live owner too',
    REMOVAL,
    'owner === undefined || isAlive(Number(owner))',
    'owner === undefined'
  ],
  [
    'the sweep removes folders that name no owner',
    REMOVAL,
    'owner === undefined || isAlive(Number(owner))',
    "owner === undefined && !name.startsWith('mutant-') || isAlive(Number(owner))"
  ],
  [
    'the sweep keeps the folders of a dead owner',
    REMOVAL,
    'owner === undefined || isAlive(Number(owner))',
    'true'
  ]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'mutation-proof/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
