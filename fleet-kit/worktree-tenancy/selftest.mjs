#!/usr/bin/env node
/**
 * Selftest of worktree tenancy on a constructed repository with three linked worktrees (a live agent's, a
 * stale agent's, and one outside the agent root) and constructed agent records whose transcript mtimes
 * decide liveness.
 * @es Selftest de la tenencia de worktrees con tres worktrees enlazados y registros de agente construidos.
 */

import { utimesSync } from 'node:fs';
import path from 'node:path';

import { baseConfig, cleanup, git, makeRepository, suite, tempDir, writeConfig, writeFile } from '../testing/fixtures.mjs';
import { evaluate, tenancyRefusals } from './guard.mjs';

const { check, finish } = suite();
const root = tempDir('tenancy');

process.env.HOOK_STATE_DIR = path.join(root, 'state');

try {
  const repository = makeRepository(root);
  const elsewhere = makeRepository(root, 'elsewhere');

  writeConfig(repository, baseConfig());

  const live = path.join(repository, '.claude', 'worktrees', 'agent-live');
  const stale = path.join(repository, '.claude', 'worktrees', 'agent-stale');
  const outside = path.join(root, 'outside-root');

  git(repository, 'worktree', 'add', '--quiet', '-b', 'live', live);
  git(repository, 'worktree', 'add', '--quiet', '-b', 'stale', stale);
  git(repository, 'worktree', 'add', '--quiet', '-b', 'outside', outside);

  const liveTranscript = writeFile(root, 'transcripts/live.jsonl', '{}\n');
  const staleTranscript = writeFile(root, 'transcripts/stale.jsonl', '{}\n');
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  utimesSync(staleTranscript, anHourAgo, anHourAgo);

  const records = [
    { id: 'agent-live1', worktree: 'agent-live', worktreePath: live, transcript: liveTranscript },
    { id: 'agent-stale1', worktree: 'agent-stale', worktreePath: stale, transcript: staleTranscript },
    { id: 'agent-outside1', worktree: 'outside-root', worktreePath: outside, transcript: liveTranscript }
  ];
  const refused = (command, cwd, extra = {}) => tenancyRefusals({ tool_name: 'Bash', tool_input: { command }, cwd, ...extra }, { records }).length > 0;

  check('the orchestrator committing a live agent\'s tree through -C is refused', refused(`git -C "${live}" commit -m x`, repository), true);
  check('the same through cd is refused', refused(`cd "${live}" && git add -A`, repository), true);
  check('the same from PowerShell is refused', tenancyRefusals({ tool_name: 'PowerShell', tool_input: { command: `git -C "${live}" reset --hard` }, cwd: repository }, { records }).length, 1);
  check('the owning agent committing its own tree is allowed', refused('git commit -m x', live, { agent_id: 'live1' }), false);
  check('a different agent committing that tree is refused', refused('git commit -m x', live, { agent_id: 'someone-else' }), true);
  check('a read of the live tree is never refused', refused(`git -C "${live}" status`, repository), false);
  check('removing the live worktree is refused', refused(`git worktree remove --force "${live}"`, repository), true);
  check('a stale agent\'s tree is not guarded', refused(`git -C "${stale}" commit -m x`, repository), false);
  check('the main checkout is never an agent worktree', refused('git commit -m x', repository), false);
  check('a linked worktree outside the agent root is not guarded, even with a live owner', refused('git commit -m x', outside), false);
  check('a mention is not a command', refused(`echo git -C "${live}" commit`, repository), false);
  check('an ungoverned repository is not guarded', refused('git commit -m x', elsewhere), false);
  check('a malformed payload fails open', await evaluate('{'), undefined);
  check('evaluate with the real agent records does not refuse an unknown worktree', await evaluate(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: stale })), undefined);
} finally {
  cleanup(root);
}

finish('worktree-tenancy');
