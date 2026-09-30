#!/usr/bin/env node
/** Mutant campaign of gate-run, its verdict judgement and its lock. @es Campaña de mutantes de gate-run. */

import { runCampaign } from '../testing/campaign.mjs';

const G = 'gate-run/gate-run.mjs';
const V = 'gate-run/verdicts.mjs';
const K = 'gate-run/run-lock.mjs';

runCampaign('gate-run/selftest.mjs', [
  ['a dirty tree earns a verdict', G, 'if (before.length > 0) return', 'if (false) return'],
  ['a run that moves HEAD is trusted', G, 'if (headAfter !== commit) return', 'if (false) return'],
  ['a run that dirties the tree is trusted', G, 'if (entriesAfter.length > 0) return', 'if (false) return'],
  ['a killed suite is trusted', G, "if (exitCode === null) return 'the suite", "if (false) return 'the suite"],
  ['every finished run is green', G, 'return exitCode === 0 ? STATES.GREEN : STATES.RED;', 'return STATES.GREEN;'],
  ['a verdict for another suite is accepted', V, 'if (verdict.suite !== suiteIdentity(unitSuite)) return', 'if (false) return'],
  ['an error verdict at exit 0 is judged green', V, 'if (verdict.state !== STATES.GREEN || verdict.exitCode !== 0) return', 'if (verdict.exitCode !== 0) return'],
  ['a live lock is ignored', K, 'if (holder !== undefined && alive(holder.pid)) return { taken: false, holder };', ''],
  ['a stale lock is never taken over', K, 'if (holder !== undefined && alive(holder.pid))', 'if (holder !== undefined)'],
  ['the lock is never released', K, 'if (holderOf(lockFile)?.runId === runId) rmSync', 'if (false) rmSync']
]);
