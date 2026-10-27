#!/usr/bin/env node
/**
 * The decisions of `worktree-install/` (the strategy, the probe classification, the probe plan, the verdict
 * cache and its invalidation, the probe run and its cleanup, the link farm, the own install's verification and
 * the provisioning that composes them), each broken once, that `selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only crashes the
 * selftest count as a survivor.
 *
 * @es Las decisiones de `worktree-install/`, rotas una a una, que `selftest.mjs` debe detectar. Un mutante que
 * solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const S = 'worktree-install/strategy.mjs';
const P = 'worktree-install/probe-plan.mjs';
const V = 'worktree-install/verdict-store.mjs';
const R = 'worktree-install/probe-run.mjs';
const F = 'worktree-install/link-farm.mjs';
const O = 'worktree-install/own-install.mjs';
const W = 'worktree-install/worktree-install.mjs';

const MUTANTS = [
  // --- the strategy ---
  ['no lockfile is probed', S, "reason: 'no-lockfile', needsProbe: false", "reason: 'no-lockfile', needsProbe: true"],
  ['a worktree locking another tree may take the junction', S, "  if (worktreeLockfileHash !== undefined && worktreeLockfileHash !== identity.lockfileHash) {\n    return", "  if (false) {\n    return"],
  ['another project\'s record counts', S, 'if (recorded === undefined || recorded.projectKey !== identity.projectKey) {', 'if (recorded === undefined) {'],
  ['a lockfile change does not invalidate', S, "if (recorded.lockfileHash !== identity.lockfileHash) return", 'if (false) return'],
  ['a runner change does not invalidate', S, "if (recorded.planKey !== identity.planKey) return", 'if (false) return'],
  ['a failed probe is accepted', S, "if (recorded.verdict === PROBE_VERDICT.PASS) return", "if (recorded.verdict !== undefined) return"],
  ['an unproven project skips the probe', S, "reason: 'unproven', needsProbe: true", "reason: 'unproven', needsProbe: false"],
  ['an invalidated verdict is not re-probed', S, "reason: 'lockfile-changed', needsProbe: true", "reason: 'lockfile-changed', needsProbe: false"],
  ['a refused probe is re-run on every spawn', S, "reason: `probe-${String(recorded.verdict)}`, needsProbe: false", "reason: `probe-${String(recorded.verdict)}`, needsProbe: true"],
  // --- the probe classification ---
  ['a red probe that passed is a pass', S, '  if (red.status === 0) return PROBE_VERDICT.COULD_NOT_RUN;\n', ''],
  ['a timeout is a pass', S, 'if (runs.some((run) => run.timedOut === true)) return PROBE_VERDICT.TIMEOUT;', ''],
  ['only the green timeout counts', S, 'runs.some((run) => run.timedOut === true)', 'green.timedOut === true'],
  ['a spawn error is ignored', S, "runs.some((run) => run === undefined || run.error !== undefined)", 'runs.some((run) => run === undefined)'],
  ['a signal is ignored', S, 'if (runs.some((run) => run.signal !== null && run.signal !== undefined)) return PROBE_VERDICT.COULD_NOT_RUN;', ''],
  ['a red with no status is a measurement', S, "  if (typeof red.status !== 'number') return PROBE_VERDICT.COULD_NOT_RUN;\n", ''],
  ['a failing green is a pass', S, 'return green.status === 0 ? PROBE_VERDICT.PASS : PROBE_VERDICT.FAIL;', 'return PROBE_VERDICT.PASS;'],
  ['the own install rewrites the lockfile', S, "args: ['ci', '--no-audit', '--no-fund']", "args: ['install', '--no-audit', '--no-fund']"],
  ['an unmeasured manager runs', S, "if (manager === 'npm') return", 'if (manager !== undefined) return'],
  // --- the probe plan ---
  ['Karma runs without coverage', P, "if (builder.endsWith(':karma')) return ngPlan('--code-coverage', file);", "if (builder.endsWith(':karma')) return ngPlan('--watch=false', file);"],
  ['the unit-test builder runs without coverage', P, "return ngPlan('--coverage', file);", "return ngPlan('--watch=false', file);"],
  ['an unmeasured builder is guessed as Karma', P, "  return { ok: false, reason: 'unmeasured-builder', detail: builder };\n}", "  return ngPlan('--code-coverage', file);\n}"],
  ['Angular is probed with the Vitest package', P, "if (profile.framework === 'angular') return angularPlan", "if (false) return angularPlan"],
  ['an Angular project without TypeScript is probed', P, "  if (typescript === undefined) return { ok: false, reason: 'no-typescript', detail: builder };\n", ''],
  ['Jasmine beside Karma is a second runner', P, "list.includes('karma') ? list.filter((id) => id !== 'jasmine') : list", 'list'],
  ['ambiguous runners pick the first', P, "if (real.length > 1) return { ok: false, reason: 'ambiguous-test-runner', detail: real.join('+') };", ''],
  ['Vitest runs without coverage', P, "args: ['run', '--coverage.enabled=true', file]", "args: ['run', file]"],
  ['Jest runs without coverage', P, "args: ['--coverage', '--runTestsByPath', file]", "args: ['--runTestsByPath', file]"],
  ['an unknown runner is guessed as Vitest', P, "  return { ok: false, reason: 'unmeasured-runner', detail: chosen.runner };", "  return probePlanFor({ ...profile, testRunners: ['vitest'] });"],
  ['the plan key forgets the arguments', P, '[plan.runner, plan.package, plan.bin, ...plan.args].join', '[plan.runner, plan.package, plan.bin].join'],
  ['the red probe holds', P, "const expected = kind === 'green' ? 2 : 3;", 'const expected = 2;'],
  ['the green probe fails', P, "const expected = kind === 'green' ? 2 : 3;", 'const expected = 3;'],
  ['Vitest specs import nothing', P, "plan.style === 'vitest-import' ? \"import { describe, expect, it } from 'vitest';\\n\\n\" : ''", "''"],
  // --- the verdict store ---
  ['the farthest lockfile governs', V, 'for (const dir of ancestry(projectRoot)) {', 'for (const dir of [...ancestry(projectRoot)].reverse()) {'],
  ['npm prefers package-lock over the shrinkwrap', V, "npm: ['npm-shrinkwrap.json', 'package-lock.json']", "npm: ['package-lock.json', 'npm-shrinkwrap.json']"],
  ['an unknown manager finds no lockfile', V, '?? Object.values(LOCKFILES_OF).flat()', '?? []'],
  ['the identity hashes nothing', V, 'const lockfileHash = lockfile === undefined ? undefined : hashFile(lockfile);', "const lockfileHash = lockfile === undefined ? undefined : 'constant';"],
  ['a record replaces every other project', V, 'const projects = { ...readStore(storeFile), [record.projectKey]: record };', 'const projects = { [record.projectKey]: record };'],
  ['a non-object record reads as a record', V, "return record !== null && typeof record === 'object' ? record : undefined;", 'return record;'],
  ['Windows keys keep their case', V, "return platform === 'win32' ? slashed.toLowerCase() : slashed;", 'return slashed;'],
  // --- the probe run ---
  ['the red probe is not run', R, 'for (const kind of PROBE_KINDS) runs[kind] =', "for (const kind of ['green']) runs[kind] ="],
  ['a timeout reads as a spawn error', R, "const timedOut = result.error?.code === 'ETIMEDOUT';", 'const timedOut = false;'],
  ['an occupied probe path is overwritten', R, "  if (existsSync(probeFile)) return { status: null, signal: null, error: 'probe-path-occupied', timedOut: false, tail: [probeFile] };\n", ''],
  ['the probe file is left behind', R, '    removeCreated(probeFile);\n', ''],
  ['a run\'s output is left behind', R, 'for (const name of entriesOf(directory)) if (!before[at].has(name)) removeCreated', 'for (const name of []) if (!before[at].has(name)) removeCreated'],
  ['entries that were there are removed', R, 'if (!before[at].has(name)) removeCreated', 'removeCreated'],
  ['a missing runner is spawned anyway', R, "if (bin === undefined || !existsSync(bin)) {", 'if (bin === undefined) {'],
  ['the probe never sees the runner bin', R, "const relative = typeof bin === 'string' ? bin : bin?.[name];", 'const relative = bin?.[name];'],
  // --- the link farm ---
  ['workspace-local entries point at main', F, 'target = path.join(worktreeTop, path.relative(mainTop, pointed));', 'target = entry;'],
  ['an existing tree is replaced', F, "if (existsSync(farm) || lstatOrUndefined(farm) !== undefined) return", 'if (false) return'],
  ['an emptied farm directory is left behind', F, '  if (kept.length === 0) rmdirSync(farm);\n', ''],
  ['a farm with leftovers reads as removed', F, 'return { removed: kept.length === 0, kept };', 'return { removed: true, kept };'],
  // --- the own install ---
  ['the tree is not verified', O, "  if (tenancy.state !== TENANCY.OWN) return", '  if (false) return'],
  ['a failing install is a success', O, 'if (result.status !== 0) return', 'if (false) return'],
  ['no receipt is written', O, "  writeFileSync(path.join(installDir, 'node_modules', RECEIPT), `${JSON.stringify(receipt, null, 2)}\\n`, 'utf8');\n", ''],
  ['the install ignores its environment, so a selftest writes the user\'s npm cache', O, "windowsHide: true, env });", 'windowsHide: true });'],
  ['the command line drops the environment of its install', W, '    const installed = installOwn({ mainTop, worktreeTop, situation: situationOf(mainTop, { storeFile, worktreeTop }), env });', '    const installed = installOwn({ mainTop, worktreeTop, situation: situationOf(mainTop, { storeFile, worktreeTop }) });'],
  ['npm_execpath of another tool is used', O, "env.npm_execpath.endsWith('npm-cli.js')", 'true'],
  // --- the provisioning ---
  ['a refused junction is kept', W, '    const removed = unlinkFarm(worktreeProject);\n', '    return { ok: true, strategy: INSTALL_STRATEGY.JUNCTION, decision: situation.decision, steps };\n    const removed = unlinkFarm(worktreeProject);\n'],
  ['the cached verdict is ignored', W, '    if (situation.decision.needsProbe) {', '    if (true) {'],
  ['a mismatched worktree is measured', W, " || before.decision.reason === 'worktree-lockfile-differs') return", ') return'],
  ['the worktree lockfile is not compared', W, "hashFile(mapped(identity.lockfile, mainTop, worktreeTop)) ?? 'absent'", 'undefined'],
  ['the verdict is not recorded', W, '  recordVerdict(storeFile, {', '  ({'],
  ['importing the CLI runs it', W, 'runWhenMain(import.meta.url, () => {', '(() => {'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worktree-install', 'project-profile', 'fleet-kit/lib', 'gates-kit', 'hook-io', 'hook-state', 'toolchain-guard'],
  selftest: 'worktree-install/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000,
});

process.exit(survivors === 0 ? 0 : 1);
