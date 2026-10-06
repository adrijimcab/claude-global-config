#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `worker-delegation-guard`, over real-shaped payloads from `../hook-payloads/`.
 *
 * The state space the decision ranges over, each state exercised: the tool (Agent, its older name Task,
 * a non-delegation tool), the caller (main session, subagent with both signals, and the two near misses
 * carrying only ONE signal), and the guard's own malfunctions (bad JSON), which must allow. The chain is
 * proved end to end too: settings.json routes Agent and Task to the delegation manifest, and the
 * dispatcher, run as a process the way settings.json runs it, denies a subagent's Agent call.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `worker-delegation-guard` con payloads de forma real. Espacio de
 * estados: la herramienta (Agent, su nombre antiguo Task, una herramienta que no delega), el llamante
 * (sesión principal, subagente con ambas señales, y los dos casi-aciertos con UNA sola señal) y los
 * fallos propios del guard (JSON inválido), que deben permitir. También se prueba la cadena completa:
 * settings.json enruta Agent y Task al manifiesto de delegación, y el dispatcher, ejecutado como proceso
 * igual que lo ejecuta settings.json, rechaza la llamada Agent de un subagente.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { payloadFor } from '../hook-payloads/payloads.mjs';
import { alternativesOf } from '../hook-dispatch/manifest.mjs';
import { evaluate as evaluateGuard } from './guard.mjs';
import { REFUSAL_HEADLINE, reason } from './reason.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('worker-delegation-guard');

const ROOT = path.join(import.meta.dirname, '..');
const SESSION = 'worker-delegation-guard-selftest';
const AGENT_ID = 'a9fcd54b98e5f304a';
const SUBAGENT_TRANSCRIPT = `C:\\Users\\u\\.claude\\projects\\C--repo\\${SESSION}\\subagents\\agent-${AGENT_ID}.jsonl`;
const MAIN_TRANSCRIPT = `C:\\Users\\u\\.claude\\projects\\C--repo\\${SESSION}.jsonl`;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * The guard's entry point. A throw is a verdict about the guard: it is recorded as a FAILED check and
 * answered with a marker that is neither an allow (`undefined`) nor a deny, so no case reads it as either.
 * @es El punto de entrada de la guardia. Un throw es un veredicto: se registra como check FALLIDO y se
 * responde con un marcador que no es ni allow (`undefined`) ni deny.
 */
function evaluate(raw) {
  try {
    return evaluateGuard(raw);
  } catch (error) {
    failures.push(`evaluate() THREW ${error.message} @es evaluate() LANZÓ`);

    return { threw: error.message };
  }
}

/** A recorded Agent payload re-addressed to `tool`, carrying `caller` fields. @es Un payload Agent grabado con los campos de `caller`. */
function delegation(caller, tool = 'Agent') {
  const recorded = payloadFor('Agent', 'Split this errand among helpers.', { toolName: tool, sessionId: SESSION });

  return JSON.stringify({ ...recorded, ...caller });
}

const subagent = { agent_id: AGENT_ID, agent_type: 'general-purpose', transcript_path: SUBAGENT_TRANSCRIPT };
const decisionOf = (raw) => evaluate(raw)?.hookSpecificOutput?.permissionDecision;

// ── the decision, state by state ────────────────────────────────────────────────────────────────────
check('main-session Agent call is allowed', evaluate(delegation({ transcript_path: MAIN_TRANSCRIPT })), undefined);
check('subagent Agent call is denied', decisionOf(delegation(subagent)), 'deny');
check('subagent Task call (older name of Agent) is denied', decisionOf(delegation(subagent, 'Task')), 'deny');
check(
  'the deny carries the exact bilingual reason',
  evaluate(delegation(subagent))?.hookSpecificOutput?.permissionDecisionReason,
  reason({ agentId: AGENT_ID, toolName: 'Agent' })
);

// Near miss: a subagent calling a tool that does not delegate. The recorded Bash payload is a subagent's.
check('subagent Bash call is allowed', evaluate(JSON.stringify(payloadFor('Bash', 'npm test', { sessionId: SESSION }))), undefined);

// Near misses: ONE signal only. Both fail CLOSED (see decide.mjs for why).
check('agent_id alone, main-session transcript path: denied', decisionOf(delegation({ agent_id: AGENT_ID, transcript_path: MAIN_TRANSCRIPT })), 'deny');
check('subagent transcript path alone, no agent_id: denied', decisionOf(delegation({ transcript_path: SUBAGENT_TRANSCRIPT })), 'deny');

check('malformed JSON is allowed (a malfunction of the guard fails open)', evaluate('{not json'), undefined);
check('a UTF-8 BOM still parses', decisionOf(`\uFEFF${delegation(subagent)}`), 'deny');

// ── the registration chain: settings.json -> manifest -> dispatcher process -> this guard ─────────────
const settings = JSON.parse(readFileSync(path.join(ROOT, 'settings.json'), 'utf8'));
const route = settings.hooks.PreToolUse.find((entry) => entry.hooks.some((hook) => hook.command.includes('pretooluse-delegation.json')));
const routed = alternativesOf(route?.matcher);

check('settings.json routes Agent to the delegation manifest', routed.includes('Agent'), true);
check('settings.json routes Task to the delegation manifest', routed.includes('Task'), true);

/** The dispatcher's merged reason for `raw`, run as settings.json runs it. @es La razón fusionada del dispatcher. */
function dispatched(raw) {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'hook-dispatch', 'dispatch.mjs'), path.join(ROOT, 'hook-dispatch', 'manifests', 'pretooluse-delegation.json')], { input: raw, encoding: 'utf8' });
  const output = run.stdout.trim() === '' ? undefined : JSON.parse(run.stdout);

  return { status: run.status, decision: output?.hookSpecificOutput?.permissionDecision, reason: output?.hookSpecificOutput?.permissionDecisionReason ?? '' };
}

const viaDispatcher = dispatched(delegation(subagent));

check('dispatcher exits 0', viaDispatcher.status, 0);
check('dispatcher denies a subagent Agent call', viaDispatcher.decision, 'deny');
check('the dispatcher deny carries this guard reason', viaDispatcher.reason.includes(REFUSAL_HEADLINE), true);
check('dispatcher denies a subagent Task call with this guard reason', dispatched(delegation(subagent, 'Task')).reason.includes(REFUSAL_HEADLINE), true);
check('dispatcher never gives this guard reason to the main session', dispatched(delegation({ transcript_path: MAIN_TRANSCRIPT })).reason.includes(REFUSAL_HEADLINE), false);

if (failures.length > 0) {
  console.error(`worker-delegation-guard selftest: ${failures.length} FAILURE(S) of ${passed + failures.length}`);

  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`worker-delegation-guard selftest: ${passed}/${passed} passed`);
