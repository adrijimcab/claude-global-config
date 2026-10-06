#!/usr/bin/env node
/**
 * Selftest of the handback gate: the worker identity from a constructed harness record, the ordering of
 * its two checks, each coverage outcome, the coverage-off configuration, the loop bound, and the whole
 * `evaluate` path counting its own refusals until the cap lets the handback through.
 * @es Selftest de la puerta de handback: identidad del worker, orden de sus dos comprobaciones, cada
 * resultado de cobertura, la config sin cobertura, el límite de bucle y el camino completo de `evaluate`.
 */

import path from 'node:path';

import { journal } from '../lib/hook-io.mjs';
import { baseConfig, cleanup, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { handbackRefusal, registeredWorktree } from './decision.mjs';
import { evaluate } from './guard.mjs';

const { check, finish } = suite();
const root = tempDir('handback');

process.env.HOOK_STATE_DIR = path.join(root, 'state');

try {
  const repository = makeRepository(root);
  const worktree = path.join(repository, '.claude', 'worktrees', 'agent-w1');

  writeConfig(repository, baseConfig());
  git(repository, 'worktree', 'add', '--quiet', '-b', 'w1', worktree);

  const transcript = writeFile(root, 'projects/p/session-1.jsonl', '{}\n');

  writeFile(root, 'projects/p/session-1/subagents/agent-w1.meta.json', JSON.stringify({ worktreePath: worktree }));

  const payload = { tool_name: 'SubagentHandback', tool_input: { message: 'Task complete.' }, transcript_path: transcript, session_id: 'session-1', agent_id: 'w1' };

  check('the worker worktree comes from the harness record', registeredWorktree(payload), worktree);
  check('no record for that agent: no worktree', registeredWorktree({ ...payload, agent_id: 'other' }), undefined);
  check('a payload without session fields: no worktree', registeredWorktree({ tool_name: 'SubagentHandback' }), undefined);

  let coverageCalls = 0;
  const coverage = (exitCode, message = 'graded') => () => {
    coverageCalls += 1;

    return { exitCode, message };
  };
  const refusalOf = (dependencies, overrides = {}) => handbackRefusal({ ...payload, ...overrides }, { worktreeOf: () => worktree, ...dependencies });

  check('another tool is not judged', refusalOf({ runCoverage: coverage(1) }, { tool_name: 'Agent' }), undefined);
  check('a worker without a worktree passes', handbackRefusal(payload, { worktreeOf: () => undefined, runCoverage: coverage(1) }), undefined);
  check('a worktree no config governs passes', handbackRefusal(payload, { worktreeOf: () => root, runCoverage: coverage(1) }), undefined);
  check('clean and covered passes', refusalOf({ runCoverage: coverage(0) }), undefined);
  check('clean with uncovered lines is refused as uncovered', refusalOf({ runCoverage: coverage(1, 'src/a.ts:3 (line)') })?.kind, 'uncovered');
  check('clean but ungradable is refused as ungradable, with the reason', [refusalOf({ runCoverage: coverage(2, 'cannot grade — toolchain missing') })?.kind, refusalOf({ runCoverage: coverage(2, 'cannot grade — toolchain missing') })?.detail], ['ungradable', 'cannot grade — toolchain missing']);

  writeFile(worktree, 'draft.ts', 'x\n');
  coverageCalls = 0;
  check('uncommitted work is refused first', refusalOf({ runCoverage: coverage(0) })?.kind, 'uncommitted');
  check('coverage never runs over uncommitted work', coverageCalls, 0);
  check('the loop bound lets the handback through', refusalOf({ runCoverage: coverage(1), refusalsSoFar: () => 3 }), undefined);

  writeConfig(repository, baseConfig({ handback: { coverage: 'off', reason: 'no test runner exists in this repository' } }));
  git(worktree, 'add', '-A');
  git(worktree, 'commit', '--quiet', '-m', 'feat: draft');
  check('coverage off: a clean worktree passes without grading', refusalOf({ runCoverage: coverage(1) }), undefined);
  writeFile(worktree, 'more.ts', 'x\n');
  check('coverage off: uncommitted work is still refused', refusalOf({ runCoverage: coverage(1) })?.kind, 'uncommitted');

  // Another worker's refusals must not spend this worker's budget.
  for (let other = 0; other < 3; other += 1) journal('handback', 'refusals.jsonl', { agentId: 'someone-else' });

  const decisions = [];

  for (let attempt = 0; attempt < 4; attempt += 1) decisions.push((await evaluate(JSON.stringify(payload)))?.hookSpecificOutput.permissionDecision ?? 'allow');
  check('evaluate refuses three times, then lets the handback through', decisions, ['deny', 'deny', 'deny', 'allow']);
  check('a malformed payload fails open', await evaluate('{'), undefined);
} finally {
  cleanup(root);
}

finish('handback');
