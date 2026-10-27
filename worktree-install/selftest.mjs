#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `worktree-install/`. Every case runs on a project CONSTRUCTED in a temp folder
 * (`fixtures/fake-project.mjs`: real git worktrees, a fake runner that mirrors Vite's measured refusal, a fake
 * npm), never on a real checkout and never on the network.
 *
 * THE STATE SPACE: the strategy decision (no lockfile, unproven, the worktree locking another tree, lockfile
 * changed, runner changed, each verdict); the probe classification (red passing, a spawn error, a signal, a
 * timeout, green failing, green passing); the probe plan from the profile (Angular Karma and unit-test, an
 * unmeasured builder, no TypeScript, no test target, Vitest, Jest, Karma beside Jasmine, ambiguous runners, none);
 * the verdict store (nearest lockfile, manager preference, a corrupt store, replacement); the probe run against
 * the INCIDENT (a junctioned worktree whose runner serves through Vite: refused), the near miss (a runner that
 * never runs the probe: not a pass), a hang, a missing runner, an occupied probe path, and its cleanup; the link
 * farm (built, workspace-local repointed, an existing tree refused, removal that never follows a link); the own
 * install (verified tree and receipt, a failing install, an exit 0 that left a foreign tree, an unmeasured
 * manager); the whole provisioning (junction refused then own install; junction proven and kept; the cached
 * verdict reused; a lockfile change re-probing) and the CLI.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `worktree-install/`: cada caso corre sobre un proyecto CONSTRUIDO (worktrees
 * git reales, un runner falso que reproduce el rechazo medido de Vite, un npm falso), nunca sobre un checkout
 * real ni la red. Recorre la decisión, la clasificación de la sonda, el plan según el perfil, el almacén de
 * veredictos, la corrida contra el INCIDENTE y sus casi-aciertos, la granja de enlaces, la instalación propia, el
 * aprovisionamiento completo y la CLI.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { buildFakeProject } from './fixtures/fake-project.mjs';
import { linkFarm, unlinkFarm } from './link-farm.mjs';
import { npmCli, ownInstall, RECEIPT } from './own-install.mjs';
import { planKeyOf, probePlanFor, probeSource, runnerOf } from './probe-plan.mjs';
import { binOf, runProbe } from './probe-run.mjs';
import { classifyProbe, decideStrategy, INSTALL_STRATEGY, ownInstallFor, PROBE_VERDICT } from './strategy.mjs';
import { directoryKey, hashFile, identityOf, lockfileOf, readRecorded, recordVerdict } from './verdict-store.mjs';
import { probeAndRecord, provision, runCli, situationOf } from './worktree-install.mjs';

isolateState('worktree-install');

const HERE = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

/** `given`, or what calling it returns; a throw becomes a checked value. @es `given`, o lo que devuelve. */
function settle(given) {
  if (typeof given !== 'function') return given;

  try {
    return given();
  } catch (error) {
    return `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Compares a value (or a thunk's result) with the expected one. @es Compara un valor con el esperado. */
function check(name, given, expected) {
  const actual = settle(given);

  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'worktree-install-selftest-')));

/**
 * Every REAL npm this selftest starts gets a cache inside its scratch: the npm cache is a seam, so a run here never
 * writes the user's `~/.npm`, and it is OFFLINE, so the fixture's lockfile never reaches the registry. Production
 * passes no `env` and keeps the user's cache.
 * @es Todo npm REAL que arranca este selftest usa una caché dentro de su scratch; producción conserva la del usuario.
 */
const OWN_NPM = { ...process.env, npm_config_cache: path.join(scratch, 'npm-cache'), npm_config_offline: 'true', npm_config_update_notifier: 'false' };

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/** A fresh empty folder. @es Una carpeta nueva y vacía. */
function fresh(name) {
  counter += 1;

  const dir = path.join(scratch, `${name}-${counter}`);

  mkdirSync(dir, { recursive: true });

  return dir;
}

// ── strategy: the decision ─────────────────────────────────────────────────────────────────────────────────
const identity = { projectKey: '/p', lockfileHash: 'h1', planKey: 'k1' };
const recordOf = (verdict, over = {}) => ({ ...identity, verdict, ...over });

check('decide: no lockfile -> own, no probe', decideStrategy(undefined, undefined), { strategy: 'own-install', reason: 'no-lockfile', needsProbe: false });
check('decide: no verdict -> own, probe', decideStrategy(identity, undefined), { strategy: 'own-install', reason: 'unproven', needsProbe: true });
check('decide: another project\'s record -> own, probe', decideStrategy(identity, recordOf('pass', { projectKey: '/q' })), { strategy: 'own-install', reason: 'unproven', needsProbe: true });
check('decide: lockfile changed -> own, probe (invalidated)', decideStrategy(identity, recordOf('pass', { lockfileHash: 'h0' })), { strategy: 'own-install', reason: 'lockfile-changed', needsProbe: true });
check('decide: runner changed -> own, probe', decideStrategy(identity, recordOf('pass', { planKey: 'k0' })), { strategy: 'own-install', reason: 'runner-changed', needsProbe: true });
check('decide: pass -> junction', decideStrategy(identity, recordOf('pass')), { strategy: 'junction', reason: 'proven', needsProbe: false });
check('decide: pass, worktree on the same lockfile -> junction', decideStrategy(identity, recordOf('pass'), 'h1').strategy, 'junction');
check('decide: pass, worktree locks another tree -> own', decideStrategy(identity, recordOf('pass'), 'h2'), { strategy: 'own-install', reason: 'worktree-lockfile-differs', needsProbe: false });
check('decide: unproven, worktree locks another tree -> own, no probe', decideStrategy(identity, undefined, 'h2').needsProbe, false);

for (const verdict of ['fail', 'could-not-run', 'timeout', 'no-probe']) {
  check(`decide: ${verdict} -> own, not re-probed`, decideStrategy(identity, recordOf(verdict)), { strategy: 'own-install', reason: `probe-${verdict}`, needsProbe: false });
}

// ── strategy: the probe classification ─────────────────────────────────────────────────────────────────────
const run = (status, extra = {}) => ({ status, signal: null, error: undefined, timedOut: false, ...extra });

check('classify: red fails, green passes -> pass', classifyProbe(run(1), run(0)), 'pass');
check('classify: red fails, green fails -> fail', classifyProbe(run(1), run(1)), 'fail');
check('classify: NEAR MISS red passes (probe never ran) -> could-not-run', classifyProbe(run(0), run(0)), 'could-not-run');
check('classify: a spawn error -> could-not-run', classifyProbe(run(1), run(null, { error: 'ENOENT' })), 'could-not-run');
check('classify: a red spawn error -> could-not-run', classifyProbe(run(null, { error: 'ENOENT' }), run(0)), 'could-not-run');
check('classify: a timeout -> timeout', classifyProbe(run(1), run(null, { timedOut: true })), 'timeout');
check('classify: a red timeout -> timeout', classifyProbe(run(null, { timedOut: true }), run(0)), 'timeout');
check('classify: a signal -> could-not-run', classifyProbe(run(1), run(null, { signal: 'SIGKILL' })), 'could-not-run');
check('classify: a red killed by a signal -> could-not-run', classifyProbe(run(null, { signal: 'SIGTERM' }), run(0)), 'could-not-run');
check('classify: a red with no status -> could-not-run', classifyProbe(run(undefined), run(0)), 'could-not-run');
check('classify: a missing run -> could-not-run', classifyProbe(undefined, run(0)), 'could-not-run');

check('own install: npm is ci', ownInstallFor({ packageManager: 'npm' }), { ok: true, manager: 'npm', args: ['ci', '--no-audit', '--no-fund'] });
check('own install: pnpm is advice only', ownInstallFor({ packageManager: 'pnpm' }), { ok: false, reason: 'unmeasured-manager', manager: 'pnpm', advice: 'pnpm install --frozen-lockfile' });
check('own install: yarn is advice only', ownInstallFor({ packageManager: 'yarn' }).advice, 'yarn install --immutable');
check('own install: bun is advice only', ownInstallFor({ packageManager: 'bun' }).advice, 'bun install --frozen-lockfile');
check('own install: no manager', ownInstallFor({}), { ok: false, reason: 'no-package-manager', manager: undefined });

// ── probe plan: derived from the profile, never guessed ────────────────────────────────────────────────────
const ts = { major: 5, minor: 8 };
const angular = (test) => ({ framework: 'angular', typescript: ts, testRunners: ['karma', 'jasmine'], angular: { test } });

check('plan: Angular Karma -> ng test with code coverage', probePlanFor(angular('@angular-devkit/build-angular:karma')), { ok: true, runner: 'ng', package: '@angular/cli', bin: 'ng', args: ['test', '--watch=false', '--code-coverage', '--include=src/worktree-install-probe.spec.ts'], file: 'src/worktree-install-probe.spec.ts', style: 'globals' });
check('plan: Angular unit-test (Vitest through the builder) -> ng test with coverage', probePlanFor(angular('@angular/build:unit-test')).args, ['test', '--watch=false', '--coverage', '--include=src/worktree-install-probe.spec.ts']);
check('plan: Angular, an unmeasured builder -> none', probePlanFor(angular('@angular-builders/jest:run')), { ok: false, reason: 'unmeasured-builder', detail: '@angular-builders/jest:run' });
check('plan: Angular with no test target -> none', probePlanFor(angular(undefined)), { ok: false, reason: 'no-test-target' });
check('plan: Angular with no TypeScript -> none', probePlanFor({ ...angular('@angular/build:karma'), typescript: undefined }).reason, 'no-typescript');
check('plan: Angular never falls back to the Vitest package', probePlanFor({ ...angular('@angular/build:unit-test'), testRunners: ['vitest'] }).runner, 'ng');
check('plan: Vitest, JavaScript', probePlanFor({ framework: 'node', testRunners: ['vitest'] }), { ok: true, runner: 'vitest', package: 'vitest', bin: 'vitest', args: ['run', '--coverage.enabled=true', 'worktree-install-probe.spec.mjs'], file: 'worktree-install-probe.spec.mjs', style: 'vitest-import' });
check('plan: Vitest, TypeScript', probePlanFor({ framework: 'react', typescript: ts, testRunners: ['vitest'] }).file, 'worktree-install-probe.spec.ts');
check('plan: Jest', probePlanFor({ framework: 'nest', typescript: ts, testRunners: ['jest'] }).args, ['--coverage', '--runTestsByPath', 'worktree-install-probe.spec.ts']);
check('plan: Karma outside Angular -> unmeasured', probePlanFor({ framework: 'node', testRunners: ['karma', 'jasmine'] }), { ok: false, reason: 'unmeasured-runner', detail: 'karma' });
check('plan: two runners -> ambiguous, never picked', probePlanFor({ framework: 'node', testRunners: ['vitest', 'jest'] }), { ok: false, reason: 'ambiguous-test-runner', detail: 'vitest+jest' });
check('plan: no runner', probePlanFor({ framework: 'node', testRunners: [] }), { ok: false, reason: 'no-test-runner' });
check('plan: no project', probePlanFor(undefined), { ok: false, reason: 'no-project' });
check('runner: Jasmine alone is a runner', runnerOf(['jasmine']), { ok: true, runner: 'jasmine' });
check('runner: junk entries are ignored', runnerOf(['', 7, 'jest']), { ok: true, runner: 'jest' });
check('plan key: names runner and command', planKeyOf(probePlanFor({ framework: 'node', testRunners: ['jest'] })), 'jest jest jest --coverage --runTestsByPath worktree-install-probe.spec.mjs');
check('plan key: no probe carries its reason', planKeyOf({ ok: false, reason: 'no-test-runner' }), 'no-probe:no-test-runner');
check('source: green expects the truth', probeSource({ style: 'globals' }, 'green').includes('toBe(2)'), true);
check('source: red expects a falsehood', probeSource({ style: 'globals' }, 'red').includes('toBe(3)'), true);
check('source: Vitest imports its API', probeSource({ style: 'vitest-import' }, 'green').startsWith("import { describe, expect, it } from 'vitest';"), true);
check('source: globals import nothing', probeSource({ style: 'globals' }, 'green').startsWith('describe('), true);
check('source: an unknown kind throws, bilingual', () => probeSource({ style: 'globals' }, 'blue'), 'threw: unknown probe kind blue @es tipo de sonda desconocido blue');

// ── verdict store ─────────────────────────────────────────────────────────────────────────────────────────
{
  const repo = fresh('store');
  const app = path.join(repo, 'app');

  mkdirSync(path.join(repo, '.git'));
  mkdirSync(app);
  writeFileSync(path.join(repo, 'package-lock.json'), '{"a":1}');
  writeFileSync(path.join(app, 'yarn.lock'), 'x');

  check('lockfile: the nearest of the manager, up to the top', lockfileOf(app, 'npm'), path.join(repo, 'package-lock.json'));
  check('lockfile: the manager\'s own file wins at the same level', lockfileOf(app, 'yarn'), path.join(app, 'yarn.lock'));
  check('lockfile: unknown manager takes any lockfile', lockfileOf(app, undefined), path.join(app, 'yarn.lock'));
  writeFileSync(path.join(repo, 'npm-shrinkwrap.json'), '{}');
  check('lockfile: npm prefers the shrinkwrap', lockfileOf(app, 'npm'), path.join(repo, 'npm-shrinkwrap.json'));
  check('lockfile: none for pnpm', lockfileOf(app, 'pnpm'), undefined);
  check('identity: no lockfile -> undefined', identityOf({ root: app, packageManager: 'pnpm' }, 'k'), undefined);
  check('identity: hash of the governing lockfile', identityOf({ root: app, packageManager: 'yarn' }, 'k').lockfileHash, hashFile(path.join(app, 'yarn.lock')));
  check('identity: carries the plan key', identityOf({ root: app, packageManager: 'yarn' }, 'k').planKey, 'k');
  check('hash: unreadable -> undefined', hashFile(path.join(repo, 'absent')), undefined);
  check('key: resolved and slashed', directoryKey(app), app.split(path.sep).join('/'));
  check('key: lowercased on Windows', directoryKey('/A/B', 'win32'), '/a/b');
  check('key: not lowercased elsewhere', directoryKey('/A/B', 'linux'), '/A/B');

  const store = path.join(repo, 'state', 'verdicts.json');

  check('store: absent -> no record', readRecorded(store, '/p'), undefined);
  recordVerdict(store, { projectKey: '/p', verdict: 'fail' });
  recordVerdict(store, { projectKey: '/q', verdict: 'pass' });
  check('store: a record reads back', () => readRecorded(store, '/p').verdict, 'fail');
  recordVerdict(store, { projectKey: '/p', verdict: 'pass' });
  check('store: recording again replaces', () => readRecorded(store, '/p').verdict, 'pass');
  check('store: other projects survive', () => readRecorded(store, '/q').verdict, 'pass');
  check('store: no staging file left', readdirSync(path.dirname(store)), ['verdicts.json']);
  writeFileSync(store, '{not json');
  check('store: corrupt -> no record (own install), never a throw', readRecorded(store, '/p'), undefined);
  writeFileSync(store, '[]');
  check('store: an array -> no record', readRecorded(store, '/p'), undefined);
  writeFileSync(store, JSON.stringify({ projects: { '/p': 'pass' } }));
  check('store: a non-object record -> no record', readRecorded(store, '/p'), undefined);
}

// ── link farm ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const root = fresh('farm');
  const main = path.join(root, 'main');
  const worktree = path.join(root, 'wt');

  mkdirSync(path.join(main, 'node_modules', 'left-pad'), { recursive: true });
  writeFileSync(path.join(main, 'node_modules', 'left-pad', 'witness'), 'keep');
  mkdirSync(path.join(main, 'tools', 'plugin'), { recursive: true });
  mkdirSync(path.join(worktree, 'tools', 'plugin'), { recursive: true });
  symlinkSync(path.join(main, 'tools', 'plugin'), path.join(main, 'node_modules', 'plugin'), 'junction');

  const built = linkFarm({ mainTop: main, mainProject: main, worktreeTop: worktree, worktreeProject: worktree });

  check('farm: one link per entry', built, { created: 2, local: ['plugin'], refused: undefined });
  check('farm: node_modules is a real directory', lstatSync(path.join(worktree, 'node_modules')).isSymbolicLink(), false);
  check('farm: a third-party entry resolves into main', realpathSync(path.join(worktree, 'node_modules', 'left-pad')), path.join(main, 'node_modules', 'left-pad'));
  check('farm: a workspace-local entry resolves to the worktree copy', realpathSync(path.join(worktree, 'node_modules', 'plugin')), path.join(worktree, 'tools', 'plugin'));
  check('farm: an existing tree is never replaced', () => linkFarm({ mainTop: main, mainProject: main, worktreeTop: worktree, worktreeProject: worktree }).refused, 'the worktree already has a node_modules');
  check('farm: no main tree', linkFarm({ mainTop: root, mainProject: path.join(root, 'none'), worktreeTop: root, worktreeProject: fresh('farm-empty') }).refused, 'the main checkout has no node_modules');

  mkdirSync(path.join(worktree, 'node_modules', '.vite'));
  check('unfarm: a real directory is kept, links removed', unlinkFarm(worktree), { removed: false, kept: ['.vite'] });
  check('unfarm: the target is never followed (witness survives)', readFileSync(path.join(main, 'node_modules', 'left-pad', 'witness'), 'utf8'), 'keep');
  rmSync(path.join(worktree, 'node_modules', '.vite'), { recursive: true });
  check('unfarm: an emptied farm is removed', [unlinkFarm(worktree), existsSync(path.join(worktree, 'node_modules'))], [{ removed: true, kept: [] }, false]);
  check('unfarm: nothing there', unlinkFarm(worktree), { removed: true, kept: [] });

  rmSync(path.join(worktree, 'node_modules'), { recursive: true, force: true });
  symlinkSync(path.join(main, 'node_modules'), path.join(worktree, 'node_modules'), 'junction');
  check('unfarm: a wholesale link is unlinked', unlinkFarm(worktree), { removed: true, kept: [] });
  check('unfarm: wholesale target survives', existsSync(path.join(main, 'node_modules', 'left-pad', 'witness')), true);
}

// ── probe run: the incident and its near misses ───────────────────────────────────────────────────────────
const vitestPlan = probePlanFor({ framework: 'node', testRunners: ['vitest'] });

{
  const project = buildFakeProject(fresh('probe'));
  const junctioned = project.worktree('wt-junction');

  linkFarm({ mainTop: project.main, mainProject: project.main, worktreeTop: junctioned, worktreeProject: junctioned });

  const incident = runProbe({ projectRoot: junctioned, plan: vitestPlan, timeoutMs: 60_000 });

  check('INCIDENT: a junctioned worktree whose runner serves through Vite -> fail', incident.verdict, 'fail');
  check('INCIDENT: the red probe failed, so the runner did run', () => incident.red.status, 1);
  check('INCIDENT: the evidence names the refused module', () => incident.green.tail.some((line) => line.includes('Failed to fetch dynamically imported module')), true);
  check('cleanup: the probe file is gone', existsSync(path.join(junctioned, vitestPlan.file)), false);
  check('cleanup: the coverage report the run created is gone', existsSync(path.join(junctioned, 'coverage')), false);
  check('cleanup: the worktree is clean apart from node_modules', spawnSync('git', ['status', '--porcelain'], { cwd: junctioned, encoding: 'utf8' }).stdout, '');
  check('cleanup: the farm is untouched', () => readdirSync(path.join(junctioned, 'node_modules')).sort(), ['@vitest', 'vitest']);

  writeFileSync(path.join(junctioned, 'keep.txt'), 'mine');
  runProbe({ projectRoot: junctioned, plan: vitestPlan, timeoutMs: 60_000 });
  check('cleanup: an entry that was there before is never removed', readFileSync(path.join(junctioned, 'keep.txt'), 'utf8'), 'mine');
  rmSync(path.join(junctioned, 'keep.txt'));

  writeFileSync(path.join(junctioned, vitestPlan.file), 'mine');
  check('occupied probe path -> could-not-run, the file kept', () => [runProbe({ projectRoot: junctioned, plan: vitestPlan, timeoutMs: 60_000 }).verdict, readFileSync(path.join(junctioned, vitestPlan.file), 'utf8')], ['could-not-run', 'mine']);
  rmSync(path.join(junctioned, vitestPlan.file), { force: true });

  writeFileSync(path.join(junctioned, 'fake-runner.json'), JSON.stringify({ servesThroughVite: false }));
  check('a runner that does not serve through Vite passes through the junction', runProbe({ projectRoot: junctioned, plan: vitestPlan, timeoutMs: 60_000 }).verdict, 'pass');

  writeFileSync(path.join(junctioned, 'fake-runner.json'), JSON.stringify({ passWithNoTests: true }));
  check('NEAR MISS: a runner that never runs the probe exits 0 -> could-not-run, not pass', runProbe({ projectRoot: junctioned, plan: vitestPlan, timeoutMs: 60_000 }).verdict, 'could-not-run');

  writeFileSync(path.join(junctioned, 'fake-runner.json'), JSON.stringify({ hang: true }));
  check('a hang -> timeout, not pass', runProbe({ projectRoot: junctioned, plan: vitestPlan, timeoutMs: 1_500 }).verdict, 'timeout');

  // A probe file in a folder that already existed (Angular's `src/`) is removed by name, not as a new entry.
  mkdirSync(path.join(junctioned, 'src'), { recursive: true });
  writeFileSync(path.join(junctioned, 'src', 'keep.mjs'), 'mine');

  const nested = { ...vitestPlan, file: 'src/worktree-install-probe.spec.mjs', args: ['run', '--coverage.enabled=true', 'src/worktree-install-probe.spec.mjs'] };

  writeFileSync(path.join(junctioned, 'fake-runner.json'), JSON.stringify({ servesThroughVite: false }));
  check('a nested probe runs', runProbe({ projectRoot: junctioned, plan: nested, timeoutMs: 60_000 }).verdict, 'pass');
  check('cleanup: a nested probe file is removed, its folder kept', () => readdirSync(path.join(junctioned, 'src')), ['keep.mjs']);
  rmSync(path.join(junctioned, 'src'), { recursive: true });
  writeFileSync(path.join(junctioned, 'fake-runner.json'), '{}');

  check('no plan -> no-probe, nothing run', runProbe({ projectRoot: junctioned, plan: { ok: false, reason: 'no-test-runner' } }), { verdict: 'no-probe', reason: 'no-test-runner' });

  const empty = project.worktree('wt-empty');

  check('no runner in the tree -> could-not-run', runProbe({ projectRoot: empty, plan: vitestPlan, timeoutMs: 60_000 }).verdict, 'could-not-run');
  check('bin: string form', () => (() => {
    const dir = fresh('bin');

    mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
    writeFileSync(path.join(dir, 'node_modules', 'x', 'package.json'), JSON.stringify({ bin: 'cli.js' }));

    return binOf(dir, 'x', 'x');
  })().endsWith(path.join('node_modules', 'x', 'cli.js')), true);
  {
    const broken = fresh('broken-bin');

    mkdirSync(path.join(broken, 'node_modules', 'vitest'), { recursive: true });
    writeFileSync(path.join(broken, 'node_modules', 'vitest', 'package.json'), JSON.stringify({ bin: { vitest: 'gone.mjs' } }));
    check('a bin entry naming a missing file -> could-not-run, never spawned', runProbe({ projectRoot: broken, plan: vitestPlan, timeoutMs: 60_000 }).verdict, 'could-not-run');
  }
  check('bin: missing entry', binOf(project.main, 'vitest', 'other'), undefined);
  check('bin: scoped packages resolve', binOf(project.main, '@vitest/coverage-v8', 'x'), undefined);
}

// ── own install ───────────────────────────────────────────────────────────────────────────────────────────
{
  const project = buildFakeProject(fresh('own'));
  const worktree = project.worktree('wt-own');
  const lockfile = path.join(worktree, 'package-lock.json');
  const command = ownInstallFor({ packageManager: 'npm' });

  process.env.FAKE_NPM_TEMPLATES = project.templates;

  const installed = ownInstall({ installDir: worktree, lockfile, command, cli: project.npmCli });

  check('own: installs and verifies', installed.ok, true);
  check('own: the receipt names the lockfile and its hash', installed.receipt === undefined ? undefined : [installed.receipt.lockfile, installed.receipt.lockfileHash], ['package-lock.json', hashFile(lockfile)]);
  check('own: the receipt is on disk', () => JSON.parse(readFileSync(path.join(worktree, 'node_modules', RECEIPT), 'utf8')).lockfileHash, hashFile(lockfile));
  check('own: the runner passes in its own tree', runProbe({ projectRoot: worktree, plan: vitestPlan, timeoutMs: 60_000 }).verdict, 'pass');

  const failing = project.worktree('wt-fail');

  process.env.FAKE_NPM_FAIL = '1';
  check('own: a failing install is reported with its exit', ownInstall({ installDir: failing, lockfile: path.join(failing, 'package-lock.json'), command, cli: project.npmCli }).reason, '`npm ci --no-audit --no-fund` exited 1');
  delete process.env.FAKE_NPM_FAIL;

  const foreign = project.worktree('wt-foreign');
  const lying = path.join(fresh('lying'), 'npm-cli.mjs');

  // An install that exits 0 having left the worktree linked into the main tree.
  writeFileSync(lying, `import { symlinkSync } from 'node:fs';\nsymlinkSync(${JSON.stringify(path.join(project.main, 'node_modules'))}, 'node_modules', 'junction');\n`);
  check('own: exit 0 into a foreign tree is NOT an install', ownInstall({ installDir: foreign, lockfile: path.join(foreign, 'package-lock.json'), command, cli: lying }).reason, 'the install exited 0 but node_modules is linked, not this checkout\'s own tree');
  check('own: no receipt into a foreign tree', existsSync(path.join(project.main, 'node_modules', RECEIPT)), false);
  check('own: unmeasured manager -> advice', ownInstall({ installDir: foreign, lockfile, command: ownInstallFor({ packageManager: 'pnpm' }), cli: lying }).reason, `run \`pnpm install --frozen-lockfile\` in ${foreign} (only npm is automated)`);
  check('own: no manager', ownInstall({ installDir: foreign, lockfile, command: ownInstallFor({}), cli: lying }).reason, 'no own install for package manager undefined');
  check('own: no npm CLI', ownInstall({ installDir: foreign, lockfile, command, cli: null }).reason, 'npm-cli.js not found next to this node');
  check('own: unreadable lockfile', ownInstall({ installDir: foreign, lockfile: path.join(foreign, 'absent'), command, cli: lying }).reason, `the lockfile ${path.join(foreign, 'absent')} cannot be read`);
  check('own: the install runs in the environment it is given (the npm cache seam)', (() => {
    let seen;

    ownInstall({ installDir: foreign, lockfile, command, cli: lying, env: { npm_config_cache: '/seam' }, spawn: (_, __, options) => { seen = options.env; return { status: 1 }; } });

    return seen?.npm_config_cache;
  })(), '/seam');
  check('own: a spawn error', ownInstall({ installDir: foreign, lockfile, command, cli: lying, spawn: () => ({ error: { code: 'ENOENT' } }) }).reason, 'the install could not start: ENOENT');
  check('npm cli: npm_execpath first', npmCli({ env: { npm_execpath: '/x/npm-cli.js' }, execPath: '/n/node', exists: () => true }), '/x/npm-cli.js');
  check('npm cli: a non-npm execpath is skipped', npmCli({ env: { npm_execpath: '/x/yarn.js' }, execPath: '/n/bin/node', exists: (p) => p === '/x/yarn.js' || p.endsWith(path.join('lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')) }), path.join('/n/bin', '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  check('npm cli: the Windows layout', npmCli({ env: {}, execPath: '/n/node.exe', exists: (p) => p === path.join('/n', 'node_modules', 'npm', 'bin', 'npm-cli.js') }), path.join('/n', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  check('npm cli: none', npmCli({ env: {}, execPath: '/n/node', exists: () => false }), undefined);
}

// ── the whole provisioning, with the verdict cache ─────────────────────────────────────────────────────────
{
  const project = buildFakeProject(fresh('provision'));
  const storeFile = path.join(fresh('provision-store'), 'verdicts.json');
  const first = project.worktree('wt-1');

  process.env.FAKE_NPM_TEMPLATES = project.templates;

  check('situation: unproven at first', () => situationOf(project.main, { storeFile }).decision, { strategy: 'own-install', reason: 'unproven', needsProbe: true });

  const refused = provision({ mainTop: project.main, worktreeTop: first, storeFile, timeoutMs: 60_000, cli: project.npmCli });

  check('provision: the INCIDENT project gets its own install', () => [refused.ok, refused.strategy, refused.decision.reason], [true, 'own-install', 'probe-fail']);
  check('provision: the steps are reported', () => refused.steps, ['junction form: 2 entries linked', 'probe: fail', 'junction form removed']);
  check('provision: the worktree tree is its own', () => lstatSync(path.join(first, 'node_modules', 'vitest')).isSymbolicLink(), false);
  check('provision: the verdict is recorded', () => readRecorded(storeFile, directoryKey(project.main)).verdict, 'fail');

  const second = project.worktree('wt-2');
  const cached = provision({ mainTop: project.main, worktreeTop: second, storeFile, timeoutMs: 60_000, cli: project.npmCli });

  check('provision: the cached verdict is reused, no probe re-run', () => cached.steps, []);
  check('provision: cached -> own install', () => cached.strategy, 'own-install');

  // A lockfile change invalidates the verdict; the new tree's runner no longer serves through Vite.
  writeFileSync(path.join(project.main, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages: {} }));
  writeFileSync(path.join(project.main, 'fake-runner.json'), JSON.stringify({ servesThroughVite: false }));
  project.commit('lockfile change');
  check('situation: a lockfile change invalidates the verdict', () => situationOf(project.main, { storeFile }).decision.reason, 'lockfile-changed');

  const third = project.worktree('wt-3');

  check('situation: the main checkout is asked for its worktree', () => situationOf(project.main, { storeFile, worktreeTop: third }).decision.needsProbe, true);
  const proven = provision({ mainTop: project.main, worktreeTop: third, storeFile, timeoutMs: 60_000, cli: project.npmCli });

  check('provision: a proven junction is kept', () => [proven.strategy, proven.steps], ['junction', ['junction form: 2 entries linked', 'probe: pass']]);
  check('provision: the kept junction resolves into main', () => realpathSync(path.join(third, 'node_modules', 'vitest')), path.join(project.main, 'node_modules', 'vitest'));

  const fourth = project.worktree('wt-4');

  check('provision: a proven verdict is reused as a junction, no probe', () => provision({ mainTop: project.main, worktreeTop: fourth, storeFile, timeoutMs: 60_000, cli: project.npmCli }).steps, ['junction form: 2 entries linked']);

  // A worktree whose lockfile differs from the main checkout's never gets the main tree.
  const fifth = project.worktree('wt-5');

  writeFileSync(path.join(fifth, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages: { other: {} } }));
  const differs = provision({ mainTop: project.main, worktreeTop: fifth, storeFile, timeoutMs: 60_000, cli: project.npmCli });

  check('provision: a worktree locking another tree gets its own install', () => [differs.strategy, differs.decision.reason], ['own-install', 'worktree-lockfile-differs']);
  check('probe: never measured from a worktree locking another tree', () => probeAndRecord({ mainTop: project.main, worktreeTop: fifth, storeFile }).probe, undefined);
  check('provision: a worktree with a node_modules already is refused', () => provision({ mainTop: project.main, worktreeTop: fourth, storeFile: path.join(fresh('s'), 'v.json'), cli: project.npmCli }).reason, 'the worktree already has a node_modules');
  check('provision: no project', () => provision({ mainTop: fresh('nothing'), worktreeTop: fresh('nothing-wt'), storeFile }).reason, 'no JS/TS project');

  // ── CLI ──
  const lines = [];
  const write = (line) => lines.push(line);

  check('cli: decide exits 0 with JSON', () => [runCli(['decide', '--main', project.main], { write, storeFile, env: OWN_NPM }), JSON.parse(lines.at(-1)).decision.strategy], [0, 'junction']);
  check('cli: unknown step -> 2, bilingual usage', () => [runCli(['explode', '--main', project.main], { write, storeFile, env: OWN_NPM }), lines.at(-1).includes(' @es ')], [2, true]);
  check('cli: probe without a worktree -> 2', () => runCli(['probe', '--main', project.main], { write, storeFile, env: OWN_NPM }), 2);
  check('cli: an unknown option -> 2', () => runCli(['decide', '--main', project.main, '--yes', 'y'], { write, storeFile, env: OWN_NPM }), 2);
  check('cli: a dangling option -> 2', () => runCli(['decide', '--main'], { write, storeFile, env: OWN_NPM }), 2);
  check('cli: a bad timeout -> 2', () => runCli(['probe', '--main', project.main, '--worktree', fourth, '--timeout-ms', '0'], { write, storeFile, env: OWN_NPM }), 2);
  check('cli: probe exits 0 and prints the decision', () => [runCli(['probe', '--main', project.main, '--worktree', fourth], { write, storeFile, env: OWN_NPM }), JSON.parse(lines.at(-1)).probe.verdict], [0, 'pass']);
  check('cli: probe with nothing to probe -> 1', () => runCli(['probe', '--main', fresh('none'), '--worktree', fourth], { write, storeFile, env: OWN_NPM }), 1);
  check('cli: install of a non-project -> 1', () => runCli(['install', '--main', fresh('none'), '--worktree', fourth], { write, storeFile, env: OWN_NPM }), 1);
  check('cli: provision of a non-project -> 1', () => runCli(['provision', '--main', fresh('none'), '--worktree', fourth], { write, storeFile, env: OWN_NPM }), 1);

  const sixth = project.worktree('wt-6');

  // The CLI runs the REAL npm, which cannot install the fixture's fake lockfile: a failed install is exit 1, no receipt.
  check('cli: a failing install exits 1, no receipt', () => [runCli(['install', '--main', project.main, '--worktree', sixth], { write, storeFile, env: OWN_NPM }), existsSync(path.join(sixth, 'node_modules', RECEIPT)), JSON.parse(lines.at(-1)).ok], [1, false, false]);

  const seventh = project.worktree('wt-7');

  check('cli: provision exits 0', () => runCli(['provision', '--main', project.main, '--worktree', seventh], { write, storeFile, env: OWN_NPM }), 0);

  const program = spawnSync(process.execPath, [path.join(HERE, 'worktree-install.mjs'), 'decide', '--main', project.main], { encoding: 'utf8', env: OWN_NPM });

  check('cli process: runs as a program', () => [program.status, JSON.parse(program.stdout || '{}').decision?.strategy !== undefined], [0, true]);
  check('cli process: importing it runs nothing', () => spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(HERE, 'worktree-install.mjs')).href)});`], { encoding: 'utf8' }).stdout, '');
}

check('strategy names', Object.values(INSTALL_STRATEGY), ['own-install', 'junction']);
check('verdict names', Object.values(PROBE_VERDICT), ['pass', 'fail', 'could-not-run', 'timeout', 'no-probe']);

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
