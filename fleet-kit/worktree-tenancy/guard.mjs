#!/usr/bin/env node
/**
 * `PreToolUse` hook on Bash and PowerShell: refuses a MUTATING git command aimed at an agent worktree
 * whose agent is still writing — unless the command comes from that agent itself.
 *
 * THE LESSON (`acted-on-a-live-actors-working-state`, b100, 2026-09-09): a live agent's working tree was
 * committed mid-run and a pre-correction state landed. Committing answers "is this state FINISHED"; the
 * question asked was "does it hold content the trunk lacks" — true and irrelevant.
 *
 * WHAT CHANGED FROM THE REFERENCE. The reference split the line on whitespace and saw only `git -C <path>`.
 * This guard reads the line with the vendored shell tokenizer, so `cd <worktree> && git commit`, quoted
 * paths and PowerShell spellings are seen, and mentions are not. It exempts the owning agent (the payload's
 * `agent_id`), because a worker committing its own tree is the job, not an intrusion. Liveness is the
 * vendored `agent-liveness` answer; reads are never refused.
 *
 * FAILS OPEN on every malfunction of its own, journaled.
 *
 * @es Hook `PreToolUse` sobre Bash y PowerShell: rechaza un git MUTANTE dirigido a un worktree de agente
 * cuyo agente sigue escribiendo, salvo que venga de ese mismo agente. Lee la línea con el tokenizador
 * vendorizado (ve `cd` y rutas entrecomilladas, no ve menciones). Falla ABIERTA ante su propia avería.
 */

import path from 'node:path';

import { findConfig } from '../config/load-config.mjs';
import { isAgentWorktree } from '../lib/agent-worktrees.mjs';
import { deny, evaluator, hookMain, runWhenMain } from '../lib/hook-io.mjs';
import { effectiveDirectory } from '../lib/invocation-directory.mjs';
import { activeOwner, agentRecords } from '../../agent-liveness/active-owner.mjs';
import { gitInvocations } from '../../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../../shell-command/shell-command.mjs';

export const MUTATING = new Set(['commit', 'add', 'stash', 'reset', 'clean', 'rebase', 'merge', 'cherry-pick', 'revert', 'am', 'apply', 'restore', 'checkout', 'switch', 'mv', 'rm', 'pull']);

/** The directory a mutating invocation changes: its own, or the path `git worktree remove` names. @es El directorio que cambia una invocación mutante. */
export function mutatedDirectory(invocation) {
  const directory = effectiveDirectory(invocation);

  if (directory === undefined) return undefined;
  if (invocation.subcommand === 'worktree' && invocation.args[0] === 'remove') {
    const target = invocation.args.slice(1).find((word) => !word.startsWith('-'));

    return target === undefined ? undefined : path.resolve(directory, target);
  }

  return MUTATING.has(invocation.subcommand) ? directory : undefined;
}

/**
 * The refusals for a payload, as `[{ top, owner, invocation }]`.
 * @param options.records The harness's agent records (injectable). @param options.now The clock.
 * @es Las negativas para un payload.
 */
export function tenancyRefusals(payload, { records = agentRecords(), now = Date.now() } = {}) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || typeof payload?.cwd !== 'string') return [];

  const self = typeof payload.agent_id === 'string' ? `agent-${payload.agent_id}` : undefined;

  return gitInvocations(command, dialect, payload.cwd).flatMap((invocation) => {
    const directory = mutatedDirectory(invocation);
    const governed = directory === undefined ? undefined : findConfig(directory);

    if (governed === undefined || !isAgentWorktree(governed, governed.repository.top)) return [];

    const owner = activeOwner(governed.repository.top, records, now);

    return owner === undefined || owner.id === self ? [] : [{ top: governed.repository.top, owner, invocation }];
  });
}

function reason(refusals) {
  return [
    'WORKTREE TENANCY (fleet-kit): a mutating git command is aimed at a worktree whose agent is still working.',
    '',
    ...refusals.map(({ top, owner, invocation }) => `  - \`git ${invocation.subcommand}\` in ${top}\n    agent ${owner.id}, last wrote ${Math.round(owner.quietForMs / 1000)}s ago`),
    '',
    'A dirty tree mid-run is normal work, not a deliverable waiting to be collected. Committing decides',
    '"is this FINISHED", and only its agent knows.',
    'DO INSTEAD: ask the agent for the work, or wait until it stops (confirm from the agent records, not',
    'from how finished the diff looks). Reading the tree is never refused.'
  ].join('\n');
}

export const evaluate = evaluator('worktree-tenancy', (payload) => {
  const refusals = tenancyRefusals(payload);

  return refusals.length === 0 ? undefined : deny(reason(refusals));
});

runWhenMain(import.meta.url, hookMain(evaluate));
