#!/usr/bin/env node
/** Mutant campaign of worktree tenancy. @es Campaña de mutantes de la tenencia de worktrees. */

import { runCampaign } from '../testing/campaign.mjs';

const G = 'worktree-tenancy/guard.mjs';
const W = 'lib/agent-worktrees.mjs';

runCampaign('worktree-tenancy/selftest.mjs', [
  ['the owning agent is refused its own tree', G, 'return owner === undefined || owner.id === self ? [] :', 'return owner === undefined ? [] :'],
  ['any worktree with a live name match is guarded', G, 'if (governed === undefined || !isAgentWorktree(governed, governed.repository.top)) return [];', 'if (governed === undefined) return [];'],
  ['reads are refused', G, 'return MUTATING.has(invocation.subcommand) ? directory : undefined;', 'return directory;'],
  ['worktree remove is not seen', G, "if (invocation.subcommand === 'worktree' && invocation.args[0] === 'remove') {", 'if (false) {'],
  ['the agent root is ignored', W, 'export const isAgentWorktree = (governed, top) => isStrictlyInside(agentWorktreeRoot(governed), top);', 'export const isAgentWorktree = (governed, top) => true;']
]);
