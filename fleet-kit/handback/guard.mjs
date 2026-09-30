#!/usr/bin/env node
/**
 * `PreToolUse` hook on `SubagentHandback`. The decision lives in `decision.mjs`; this file speaks the hook
 * protocol and keeps the refusal journal that is also the loop bound's counter. Fails OPEN on its own
 * malfunction, journaled.
 * @es Hook `PreToolUse` sobre `SubagentHandback`. El diario de negativas es también el contador del límite.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { deny, evaluator, hookMain, journal, runWhenMain } from '../lib/hook-io.mjs';
import { kitStateRoot } from '../lib/state.mjs';
import { handbackRefusal, MAXIMUM_REFUSALS } from './decision.mjs';

const GUARD = 'handback';
const REFUSALS = 'refusals.jsonl';

/** How many times `agentId` was already refused. @es Cuántas veces se rechazó ya a `agentId`. */
export function refusalsSoFar(agentId) {
  const file = path.join(kitStateRoot(), GUARD, REFUSALS);

  if (!existsSync(file)) return 0;

  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => JSON.parse(line).agentId === agentId).length;
}

const HEADLINES = {
  uncommitted: 'your worktree still holds UNCOMMITTED work. Commit it before reporting: work that exists in one directory only is invisible to integration and lost to any cleanup.',
  uncovered: 'changed lines or branches on your branch are not exercised by any test. Cover them (a test that asserts each branch\'s observable difference) and commit, then report.',
  ungradable: 'the coverage of your branch could not be graded. Fix what the grader names if it is yours; if it is the environment, say so explicitly in your report.'
};

function reason(refusal, attempt) {
  return [
    `HANDBACK REFUSED (fleet-kit, ${attempt} of ${MAXIMUM_REFUSALS}): ${HEADLINES[refusal.kind]}`,
    `  worktree: ${refusal.worktree}`,
    '',
    refusal.detail,
    '',
    `After ${MAXIMUM_REFUSALS} refusals the handback passes, and this refusal stays on the record.`
  ].join('\n');
}

export const evaluate = evaluator(GUARD, (payload) => {
  const refusal = handbackRefusal(payload, { refusalsSoFar });

  if (refusal === undefined) return undefined;

  const attempt = refusalsSoFar(payload.agent_id) + 1;

  journal(GUARD, REFUSALS, { agentId: payload.agent_id, kind: refusal.kind, worktree: refusal.worktree });

  return deny(reason(refusal, attempt));
});

runWhenMain(import.meta.url, hookMain(evaluate));
