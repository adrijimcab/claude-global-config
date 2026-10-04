#!/usr/bin/env node
/**
 * Selftest of gate-run across its decision states: no config, suite disabled, dirty tree, green, red,
 * a run that dirties the tree, a run that moves HEAD, a killed run, a live lock, a stale lock, and the
 * judgement of a verdict recorded for a different suite. Two real `npm run` executions prove the
 * process runner, not only the injected one.
 * @es Selftest de gate-run recorriendo cada estado de su decisión, con dos `npm run` reales.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { baseConfig, cleanup, commitFiles, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { repositoryStateDir } from '../lib/state.mjs';
import { EXIT, gateRun, runNpmScript } from './gate-run.mjs';
import { takeLock } from './run-lock.mjs';
import { judge, readVerdict, STATES, suiteIdentity } from './verdicts.mjs';

const { check, finish } = suite();
const root = tempDir('gate-run');
const stateRoot = path.join(root, 'state');
const passing = () => 0;

try {
  const repository = makeRepository(root);
  const unitSuite = { npmScript: 'test', cwd: '' };

  check('no config: no verdict', gateRun(repository, { runSuite: passing, stateRoot }).exitCode, EXIT.NO_VERDICT);

  writeConfig(repository, baseConfig({ unitSuite: { enabled: false, reason: 'no test runner exists in this repository' }, landingGuard: { enabled: false, reason: 'no unit suite, so no verdict can exist' } }));
  const disabled = gateRun(repository, { runSuite: passing, stateRoot });

  check('suite disabled: no verdict', disabled.exitCode, EXIT.NO_VERDICT);
  check('suite disabled: the reason is printed', disabled.message.includes('no test runner exists'), true);

  writeConfig(repository, baseConfig({ unitSuite }));
  writeFile(repository, 'stray.txt', 'x\n');
  let suiteRuns = 0;
  const dirty = gateRun(repository, { runSuite: () => { suiteRuns += 1; return 0; }, stateRoot });

  check('an untracked file makes the tree dirty: refused BEFORE any run', [dirty.exitCode, dirty.message.startsWith('gate-run: refused'), suiteRuns], [EXIT.NO_VERDICT, true, 0]);
  git(repository, 'add', '-A');
  git(repository, 'commit', '--quiet', '-m', 'chore: stray');

  const tree = git(repository, 'rev-parse', 'HEAD^{tree}');
  const mainCheckout = repository;
  const green = gateRun(repository, { runSuite: passing, stateRoot });

  check('clean tree, suite exits 0: green', [green.exitCode, green.verdict?.state, green.verdict?.tree], [EXIT.GREEN, STATES.GREEN, tree]);
  check('the green verdict is readable by tree and judged green', judge(readVerdict(mainCheckout, tree, stateRoot), unitSuite), { green: true });
  check('a verdict for another suite is not green', judge(readVerdict(mainCheckout, tree, stateRoot), { npmScript: 'test:all', cwd: '' }).green, false);
  check('no verdict for an unseen tree', judge(readVerdict(mainCheckout, '0'.repeat(40), stateRoot), unitSuite), { green: false, why: 'no unit-suite run was ever recorded for this tree' });

  const red = gateRun(repository, { runSuite: () => 1, stateRoot });

  check('suite exits 1: red, and judged not green', [red.exitCode, red.verdict?.state, judge(red.verdict, unitSuite).green], [EXIT.RED, STATES.RED, false]);

  const dirtying = gateRun(repository, { runSuite: () => { writeFile(repository, 'generated.txt', 'x\n'); return 0; }, stateRoot });

  check('a run that dirties the tree is an error even at exit 0', [dirtying.exitCode, dirtying.verdict?.state], [EXIT.NO_VERDICT, STATES.ERROR]);
  check('an error verdict at exit 0 is not judged green', judge(dirtying.verdict, unitSuite).green, false);
  git(repository, 'clean', '-fdq');

  const moving = gateRun(repository, { runSuite: () => { commitFiles(repository, { 'moved.txt': 'x\n' }); return 0; }, stateRoot });

  check('a run that moves HEAD is an error', [moving.exitCode, moving.verdict?.reason?.startsWith('HEAD moved')], [EXIT.NO_VERDICT, true]);

  const killed = gateRun(repository, { runSuite: () => null, stateRoot });

  check('a killed suite is an error, never red or green', [killed.exitCode, killed.verdict?.state], [EXIT.NO_VERDICT, STATES.ERROR]);

  const lockFile = path.join(repositoryStateDir(mainCheckout, stateRoot), 'run.lock');

  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, runId: 'someone-else' }));
  check('a lock held by a live process refuses the run', gateRun(repository, { runSuite: passing, stateRoot }).exitCode, EXIT.NO_VERDICT);
  writeFileSync(lockFile, JSON.stringify({ pid: 999_999_999, runId: 'dead' }));
  check('a lock held by a dead process is taken over', gateRun(repository, { runSuite: passing, stateRoot }).exitCode, EXIT.GREEN);
  check('the lock is released after a run', takeLock(lockFile, 'probe').taken, true);

  commitFiles(repository, { 'package.json': JSON.stringify({ name: 'fixture', private: true, scripts: { pass: 'node -e "process.exit(0)"', fail: 'node -e "process.exit(3)"' } }) }, 'chore: scripts');
  const logFile = path.join(root, 'npm.log');

  check('a real npm run that passes exits 0', runNpmScript({ cwd: repository, script: 'pass', logFile }), 0);
  check('a real npm run that fails exits non-zero', runNpmScript({ cwd: repository, script: 'fail', logFile }) !== 0, true);
  check('the suite identity names script and cwd', suiteIdentity({ npmScript: 'test:all', cwd: 'Discovery-FE' }), 'npm run test:all @ Discovery-FE');
} finally {
  cleanup(root);
}

finish('gate-run');
