#!/usr/bin/env node
/** Mutant campaign of orphaned-work detection. @es Campaña de mutantes de la detección de trabajo huérfano. */

import { runCampaign } from '../testing/campaign.mjs';

const G = 'orphan-work/guard.mjs';

runCampaign('orphan-work/selftest.mjs', [
  ['a live agent\'s worktree is parked', G, '.filter((worktree) => activeOwner(worktree.path, records, now) === undefined)', '.filter((worktree) => true)'],
  ['a vanished worktree folder is measured', G, ' && existsSync(worktree.path))', ')'],
  ['uncommitted work is not work', G, 'work.dirty > 0 || ', ''],
  ['unintegrated commits are not work', G, ' || work.unintegrated > 0', ''],
  ['landed commits count as unintegrated', G, ".filter((line) => line.startsWith('+'))", '.filter((line) => line.length > 0)'],
  ['a failed cherry reads as clean', G, 'if (cherry.status !== 0) return { unmeasurable:', 'if (false) return { unmeasurable:'],
  ['worktrees outside the agent root are judged', G, 'isAgentWorktree(governed, worktree.path) && ', ''],
  ['every tool is treated as a delegation', G, '!DELEGATION_TOOLS.has(payload?.tool_name) || ', '']
]);
