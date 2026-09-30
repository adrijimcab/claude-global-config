#!/usr/bin/env node
/**
 * `PreToolUse` hook on Bash and PowerShell: the landing guard. The decision lives in `decision.mjs`; this
 * file speaks the hook protocol and journals every notice verbatim. It fails OPEN on its own malfunction,
 * journaled under `~/.claude/fleet-kit/state/landing-guard/`.
 * @es Hook `PreToolUse` sobre Bash y PowerShell: la guarda de aterrizaje. Falla ABIERTA ante su propia
 * avería, y la registra.
 */

import { advise, deny, evaluator, hookMain, journal, runWhenMain } from '../lib/hook-io.mjs';
import { decide } from './decision.mjs';

const GUARD = 'landing-guard';

export const evaluate = evaluator(GUARD, (payload) => {
  const decision = decide(payload);

  if (decision === undefined) return undefined;

  journal(GUARD, 'notices.jsonl', { kind: decision.deny === undefined ? 'advise' : 'deny', command: payload?.tool_input?.command, cwd: payload?.cwd });

  return decision.deny === undefined ? advise(decision.advise) : deny(decision.deny);
});

runWhenMain(import.meta.url, hookMain(evaluate));
