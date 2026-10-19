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
  ['another worker\'s refusals spend this worker\'s budget', G, '.filter((record) => record?.agentId === agentId).length', '.length'],
  ['the journal is read with a bare JSON.parse again', G, 'const records = lastRecords(file, Number.POSITIVE_INFINITY, { onSkip: () => { skipped += 1; } });', "const records = process.getBuiltinModule('node:fs').readFileSync(file, 'utf8').split('\\n').filter((line) => line !== '').map((line) => JSON.parse(line));"],
  ['the reader keeps only the last record', G, 'lastRecords(file, Number.POSITIVE_INFINITY,', 'lastRecords(file, 1,'],
  ['skipped lines are not counted', G, 'skipped += 1;', ''],
  ['the reason never carries the damage note', G, '    ...damageNote(skipped)', '    ...damageNote(0)'],
  ['the damage note is shown over a clean journal', G, 'if (skipped === 0) return [];', 'if (skipped < 0) return [];'],
  ['the damage note has no Spanish half', G, ' @es Nota: el journal de negativas tenía ${skipped} ${sustantivo}; omitidas, sin contar.', ''],
  ['the damage note is always singular', G, "skipped === 1 ? 'line' : 'lines'", "'line'"],
  ['the damage note reports a fixed count', G, 'held ${skipped} unreadable', 'held 1 unreadable'],
  ['the attempt ignores the journal count', G, 'reason(refusal, count + 1, skipped)', 'reason(refusal, 1, skipped)']
]);
