#!/usr/bin/env node
/**
 * `PreToolUse` hook on `SubagentHandback`. The decision lives in `decision.mjs`; this file speaks the hook
 * protocol and keeps the refusal journal that is also the loop bound's counter. Fails OPEN on its own
 * malfunction, journaled.
 * @es Hook `PreToolUse` sobre `SubagentHandback`. El diario de negativas es también el contador del límite.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { lastRecords } from '../../hook-state/jsonl-tail.mjs';
import { deny, evaluator, hookMain, journal, runWhenMain } from '../lib/hook-io.mjs';
import { kitStateRoot } from '../lib/state.mjs';
import { handbackRefusal, MAXIMUM_REFUSALS } from './decision.mjs';

const GUARD = 'handback';
const REFUSALS = 'refusals.jsonl';

/**
 * How many times `agentId` was already refused, and how many unreadable lines the journal held. The journal is
 * read through the tolerant reader, which skips a torn line instead of throwing: one line cut mid-write must
 * not turn the guard off for everyone, and the skipped count lets the refusal say the journal is damaged.
 * @es Cuántas veces se rechazó ya a `agentId`, y cuántas líneas ilegibles tenía el journal. El journal se lee
 * con el lector tolerante, que omite una línea rota en vez de lanzar: una línea cortada a mitad de escritura no
 * debe apagar la guardia para todos, y el recuento de omitidas permite que la negativa avise del daño.
 */
function readRefusals(agentId) {
  const file = path.join(kitStateRoot(), GUARD, REFUSALS);

  if (!existsSync(file)) return { count: 0, skipped: 0 };

  let skipped = 0;
  const records = lastRecords(file, Number.POSITIVE_INFINITY, { onSkip: () => { skipped += 1; } });

  return { count: records.filter((record) => record?.agentId === agentId).length, skipped };
}

/** How many times `agentId` was already refused. @es Cuántas veces se rechazó ya a `agentId`. */
export const refusalsSoFar = (agentId) => readRefusals(agentId).count;

/** The informational line for a damaged journal, empty when nothing was skipped. @es La línea informativa de un journal dañado, vacía si no se omitió nada. */
function damageNote(skipped) {
  if (skipped === 0) return [];

  const noun = skipped === 1 ? 'line' : 'lines';
  const sustantivo = skipped === 1 ? 'línea ilegible' : 'líneas ilegibles';

  return ['', `Note: the refusal journal held ${skipped} unreadable ${noun}; skipped, not counted. @es Nota: el journal de negativas tenía ${skipped} ${sustantivo}; omitidas, sin contar.`];
}

const HEADLINES = {
  uncommitted: 'your worktree still holds UNCOMMITTED work. Commit it before reporting: work that exists in one directory only is invisible to integration and lost to any cleanup.',
  uncovered: 'changed lines or branches on your branch are not exercised by any test. Cover them (a test that asserts each branch\'s observable difference) and commit, then report.',
  ungradable: 'the coverage of your branch could not be graded. Fix what the grader names if it is yours; if it is the environment, say so explicitly in your report.'
};

function reason(refusal, attempt, skipped) {
  return [
    `HANDBACK REFUSED (fleet-kit, ${attempt} of ${MAXIMUM_REFUSALS}): ${HEADLINES[refusal.kind]}`,
    `  worktree: ${refusal.worktree}`,
    '',
    refusal.detail,
    '',
    `After ${MAXIMUM_REFUSALS} refusals the handback passes, and this refusal stays on the record.`,
    ...damageNote(skipped)
  ].join('\n');
}

export const evaluate = evaluator(GUARD, (payload) => {
  const refusal = handbackRefusal(payload, { refusalsSoFar });

  if (refusal === undefined) return undefined;

  const { count, skipped } = readRefusals(payload.agent_id);

  journal(GUARD, REFUSALS, { agentId: payload.agent_id, kind: refusal.kind, worktree: refusal.worktree });

  return deny(reason(refusal, count + 1, skipped));
});

runWhenMain(import.meta.url, hookMain(evaluate));
