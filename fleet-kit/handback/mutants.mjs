#!/usr/bin/env node
/** Mutant campaign of the handback gate. @es Campaña de mutantes de la puerta de handback. */

import { runCampaign } from '../testing/campaign.mjs';

const D = 'handback/decision.mjs';
const G = 'handback/guard.mjs';

runCampaign('handback/selftest.mjs', [
  ['uncommitted work is not refused', D, "if (entries.length > 0) return { kind: 'uncommitted'", "if (false) return { kind: 'uncommitted'"],
  ['coverage off still grades', D, "  if (governed.config.handback.coverage !== 'refuse') return undefined;\n", ''],
  ['the loop bound is off by one', D, 'refusalsSoFar(payload.agent_id) >= MAXIMUM_REFUSALS', 'refusalsSoFar(payload.agent_id) > MAXIMUM_REFUSALS'],
  ['an ungradable result reads as uncovered', D, "kind: coverage.exitCode === 1 ? 'uncovered' : 'ungradable'", "kind: 'uncovered'"],
  ['a covered branch is refused', D, 'return coverage.exitCode === 0 ? undefined :', 'return false ? undefined :'],
  ['any agent is read as this worker', D, '`agent-${agentId}.meta.json`', '`agent-w1.meta.json`'],
  ['another worker\'s refusals spend this worker\'s budget', G, '.filter((line) => JSON.parse(line).agentId === agentId).length', '.length']
]);
