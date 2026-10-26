#!/usr/bin/env node
/**
 * The decisions of `worker-delegation-guard`, each broken once, that `selftest.mjs` must catch, in both
 * directions: a worker let through, and the orchestrator or a non-delegating call refused. The runner
 * lives in `../mutation-proof/run-mutants.mjs`; caller identity is mutated by `../hook-caller/mutants.mjs`.
 * @es Las decisiones del guard, rotas una a una, en ambas direcciones: un worker que pasa, y el
 * orquestador o una llamada que no delega rechazados. La identidad del llamante la muta `hook-caller`.
 */

import path from 'node:path';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DECIDE = 'worker-delegation-guard/decide.mjs';
const GUARD = 'worker-delegation-guard/guard.mjs';

const MUTANTS = [
  ['Task is no longer a delegation tool', DECIDE, "new Set(['Agent', 'Task'])", "new Set(['Agent'])"],
  ['Agent is no longer a delegation tool', DECIDE, "new Set(['Agent', 'Task'])", "new Set(['Task'])"],
  ['every tool is judged as a delegation', DECIDE, 'if (!DELEGATION_TOOLS.has(toolName)) return undefined;', 'if (false) return undefined;'],
  ['the caller gate is inverted: the orchestrator is refused, workers pass', DECIDE, 'if (!isSubagentCaller(payload)) return undefined;', 'if (isSubagentCaller(payload)) return undefined;'],
  ['the caller gate is dropped: the orchestrator is refused too', DECIDE, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['the refusal names the wrong subagent', DECIDE, "agentId: payload.agent_id ?? '(unknown)'", "agentId: '(unknown)'"],
  ['the allow/refuse branch is inverted', GUARD, 'if (refusal === undefined) return undefined;', 'if (refusal !== undefined) return undefined;'],
  ['the hook decision is flipped from deny to allow', GUARD, 'return deny(reason(refusal));', "return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: reason(refusal) } };"]
  // The BOM strip lives in `hook-io`, pinned there by its mutant 'the BOM is not stripped'.
  // @es El BOM lo quita `hook-io`, que lo fija con su mutante 'the BOM is not stripped'.
];

const survivors = runMutants({
  fleetRoot: path.join(import.meta.dirname, '..'),
  paths: ['worker-delegation-guard', 'hook-caller', 'hook-payloads', 'hook-dispatch', 'hook-state', 'bilingual-output', 'settings.json'],
  selftest: 'worker-delegation-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
