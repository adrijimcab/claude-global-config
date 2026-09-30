#!/usr/bin/env node
/**
 * Selftest of the config loader and validator, across the states its decisions range over: valid,
 * each class of invalid (unknown key, bad path, disabled without reason, cross-section contradiction),
 * and discovery from the main checkout, a subfolder, a linked worktree, a sibling folder the config does
 * NOT cover, and a directory outside every repository.
 * @es Selftest del cargador y validador de config, recorriendo cada estado de sus decisiones.
 */

import path from 'node:path';

import { baseConfig, cleanup, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { findConfig } from './load-config.mjs';
import { configProblems } from './validate.mjs';

const { check, finish } = suite();
const disabled = (reason = 'no test runner exists in this repository') => ({ enabled: false, reason });

// --- validation ----------------------------------------------------------------------------------
check('a complete config is valid', configProblems(baseConfig()), []);
check('an unknown top-level key is refused', configProblems(baseConfig({ landingGaurd: {} })), ['config: unknown key "landingGaurd"']);
check('a wrong schema version is refused', configProblems(baseConfig({ schemaVersion: 2 })), ['schemaVersion: must be 1']);
check('an empty integration branch list is refused', configProblems(baseConfig({ integrationBranches: [] })), ['integrationBranches: must be a non-empty list of branch names']);
check('a backslash path is refused', configProblems(baseConfig({ worktreeRoot: '.claude\\worktrees' })), ['worktreeRoot: use forward slashes']);
check('an absolute path is refused', configProblems(baseConfig({ worktreeRoot: 'C:/x' })), ['worktreeRoot: must be relative to the git top level']);
check('a parent segment is refused', configProblems(baseConfig({ worktreeRoot: 'a/../b' })), ['worktreeRoot: must not contain ".."']);
check('a disabled section without a reason is refused', configProblems(baseConfig({ coverage: { enabled: false }, handback: { coverage: 'off', reason: 'coverage is disabled here too' } })), ['coverage: a disabled section needs a "reason" of at least 20 characters']);
check('a disabled section with a short reason is refused', configProblems(baseConfig({ unitSuite: disabled('none'), landingGuard: disabled() })), ['unitSuite: a disabled section needs a "reason" of at least 20 characters']);
check('a disabled section with a reason is valid', configProblems(baseConfig({ unitSuite: disabled(), coverage: disabled(), landingGuard: disabled(), handback: { coverage: 'off', reason: 'no test runner exists in this repository' } })), []);
check('a landing guard without a unit suite is a contradiction', configProblems(baseConfig({ unitSuite: disabled() })), ['landingGuard: enabled while unitSuite is disabled — no verdict could ever exist, so every landing would be refused']);
check('handback refuse without coverage is a contradiction', configProblems(baseConfig({ coverage: disabled() })), ['handback.coverage: "refuse" while coverage is disabled — nothing could grade a handback']);
check('handback off without a reason is refused', configProblems(baseConfig({ handback: { coverage: 'off' } })), ['handback: coverage "off" needs a "reason" of at least 20 characters']);
check('an unknown runner is refused', configProblems(baseConfig({ coverage: { runner: 'jest', projects: baseConfig().coverage.projects } })), ['coverage.runner: must be one of karma']);
check('a source root without a trailing slash is refused', configProblems(baseConfig({ coverage: { runner: 'karma', projects: [{ ...baseConfig().coverage.projects[0], sourceRoot: 'src' }] } })), ['coverage.projects[0].sourceRoot: must end with "/" so it cannot match a sibling folder by prefix']);
check('an unknown landing mode is refused', configProblems(baseConfig({ landingGuard: { mode: 'block' } })), ['landingGuard.mode: must be one of enforce, advise']);
check('an unknown project key is refused', configProblems(baseConfig({ coverage: { runner: 'karma', projects: [{ ...baseConfig().coverage.projects[0], include: [] }] } })), ['coverage.projects[0]: unknown key "include"']);

// --- discovery -----------------------------------------------------------------------------------
const root = tempDir('config');

try {
  const repository = makeRepository(root);

  writeFile(repository, 'sub/project/deep/file.txt', 'x\n');
  writeFile(repository, 'other/file.txt', 'x\n');
  git(repository, 'add', '-A');
  git(repository, 'commit', '--quiet', '-m', 'chore: folders');
  writeConfig(path.join(repository, 'sub', 'project'), baseConfig());

  const worktree = path.join(repository, '.claude', 'worktrees', 'agent-x');

  git(repository, 'worktree', 'add', '--quiet', '-b', 'work', worktree);

  const fromProject = findConfig(path.join(repository, 'sub', 'project'));

  check('a subfolder config governs its own folder', fromProject?.projectDir, 'sub/project');
  check('a subfolder config governs a deeper folder', findConfig(path.join(repository, 'sub', 'project', 'deep'))?.projectDir, 'sub/project');
  check('a subfolder config does not govern a sibling folder', findConfig(path.join(repository, 'other')), undefined);
  check('a subfolder config does not govern the top level', findConfig(repository), undefined);
  check('the same subfolder of a linked worktree maps to the main checkout config', findConfig(path.join(worktree, 'sub', 'project'))?.projectDir, 'sub/project');
  check('the linked worktree is reported as the top, the main checkout as main', [path.basename(findConfig(path.join(worktree, 'sub', 'project'))?.repository.top ?? ''), path.basename(findConfig(path.join(worktree, 'sub', 'project'))?.repository.mainCheckout ?? '')], ['agent-x', 'repo']);
  check('a directory outside every repository has no config', findConfig(root), undefined);

  writeConfig(repository, baseConfig({ integrationBranches: ['main'] }));
  check('a top-level config governs the top level', findConfig(repository)?.config.integrationBranches, ['main']);
  check('the nearest config wins over the top-level one', findConfig(path.join(repository, 'sub', 'project'))?.config.integrationBranches, ['develop']);
  check('a top-level config governs a linked worktree root', findConfig(worktree)?.projectDir, '');

  writeConfig(repository, { schemaVersion: 1 });
  let thrown = '';

  try {
    findConfig(repository);
  } catch (error) {
    thrown = String(error.message).split('\n')[0];
  }
  check('an invalid config throws rather than reading as absent', thrown.endsWith('is invalid:'), true);
} finally {
  cleanup(root);
}

finish('config');
