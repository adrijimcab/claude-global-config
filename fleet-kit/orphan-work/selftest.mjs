#!/usr/bin/env node
/**
 * Selftest of orphaned-work detection on a constructed repository: a stopped agent's dirty worktree, a
 * stopped agent's unintegrated commit, the same work under a live agent, an integrated worktree, a clean
 * one, a worktree outside the agent root, a registered worktree whose folder is gone, an unmeasurable
 * worktree, a non-delegation tool, and an ungoverned repository.
 * @es Selftest de la detección de trabajo huérfano sobre un repositorio construido, recorriendo cada estado.
 */

import { rmSync, utimesSync } from 'node:fs';
import path from 'node:path';

import { baseConfig, cleanup, commitFiles, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { evaluate, parkedWork } from './guard.mjs';

const { check, finish } = suite();
const root = tempDir('orphan');

process.env.FLEET_KIT_STATE = path.join(root, 'state');

try {
  const repository = makeRepository(root);
  const worktreeOf = (name) => path.join(repository, '.claude', 'worktrees', name);
  const add = (name) => git(repository, 'worktree', 'add', '--quiet', '-b', name, worktreeOf(name));
  const parkedNames = (records = [], cwd = repository, tool = 'Agent') => parkedWork({ tool_name: tool, cwd }, { records }).map(({ worktree }) => path.basename(worktree.path)).sort();

  writeConfig(repository, baseConfig());
  check('no agent worktree: nothing parked', parkedNames(), []);

  add('agent-clean');
  add('agent-dirty');
  writeFile(worktreeOf('agent-dirty'), 'draft.txt', 'x\n');
  add('agent-committed');
  commitFiles(worktreeOf('agent-committed'), { 'done.txt': 'x\n' });
  add('agent-landed');
  commitFiles(worktreeOf('agent-landed'), { 'landed.txt': 'x\n' });
  // develop moves first, so the pick is a NEW commit with the same patch: `git cherry` marks it `-`.
  commitFiles(repository, { 'develop-only.txt': 'x\n' }, 'chore: develop moves on');
  git(repository, 'cherry-pick', 'agent-landed');
  git(repository, 'worktree', 'add', '--quiet', '-b', 'outside', path.join(root, 'outside'));
  writeFile(path.join(root, 'outside'), 'draft.txt', 'x\n');

  check('dirty and unintegrated stopped worktrees are parked; clean, landed and outside ones are not', parkedNames(), ['agent-committed', 'agent-dirty']);
  check('a Task delegation sees the same', parkedNames([], repository, 'Task'), ['agent-committed', 'agent-dirty']);
  check('a non-delegation tool is not judged', parkedNames([], repository, 'Bash'), []);
  check('the counts are named', parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [] }).find(({ worktree }) => worktree.branch === 'agent-committed')?.work, { dirty: 0, unintegrated: 1 });

  const transcript = writeFile(root, 't/live.jsonl', '{}\n');

  check('a live agent\'s dirty worktree is not parked', parkedNames([{ id: 'agent-x', worktree: 'agent-dirty', worktreePath: worktreeOf('agent-dirty'), transcript }]), ['agent-committed']);

  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);

  utimesSync(transcript, old, old);
  check('a stopped agent (stale transcript) is parked again', parkedNames([{ id: 'agent-x', worktree: 'agent-dirty', worktreePath: worktreeOf('agent-dirty'), transcript }]), ['agent-committed', 'agent-dirty']);

  rmSync(worktreeOf('agent-dirty'), { recursive: true, force: true });
  check('a registered worktree whose folder is gone holds nothing on disk', parkedNames(), ['agent-committed']);

  writeConfig(repository, baseConfig({ integrationBranches: ['no-such-branch'] }));
  check('every unmeasurable worktree is refused, never read as clean', parkedWork({ tool_name: 'Agent', cwd: repository }, { records: [] }).filter(({ work }) => work.unmeasurable !== undefined).length, 3);
  writeConfig(repository, baseConfig());

  const output = await evaluate(JSON.stringify({ tool_name: 'Agent', cwd: repository, tool_input: {} }));

  check('evaluate refuses the delegation and names the worktree', [output?.hookSpecificOutput.permissionDecision, output?.hookSpecificOutput.permissionDecisionReason.includes('agent-committed')], ['deny', true]);
  check('an ungoverned repository is not judged', parkedNames([], root), []);
  check('a malformed payload fails open', await evaluate('nope'), undefined);
} finally {
  cleanup(root);
}

finish('orphan-work');
