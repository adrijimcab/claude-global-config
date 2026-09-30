/**
 * The pure decision of `worker-delegation-guard`: whether one `PreToolUse` payload is a delegated
 * worker trying to start an agent of its own.
 *
 *   main session, any tool                 -> ALLOW (the orchestrator is the one who delegates)
 *   subagent, a tool that does not delegate -> ALLOW
 *   subagent, Agent or Task                 -> DENY
 *
 * `Task` is covered with `Agent` because it is the older name of the same tool (`hook-payloads/payloads.mjs`),
 * and `settings.json` already routes both to the delegation manifest.
 *
 * FAIL-CLOSED ON ONE SIGNAL. The caller decision is `../hook-caller/identify-caller.mjs`, which marks a
 * subagent on EITHER signal. The only real payload where the two signals disagree
 * (`hook-payloads/mcp__plugin_engram_engram__mem_save.pretooluse.json`, captured 2026-09-14) is a
 * subagent carrying `agent_id` with the main session's transcript path: requiring both signals would have
 * let that worker delegate. The cost of the other direction is bounded: the transcript signal matches a
 * whole `subagents` path segment, which a main-session transcript path cannot contain.
 *
 * @es Decisión pura de `worker-delegation-guard`: si un payload `PreToolUse` es un worker delegado
 * intentando lanzar un agente propio. Sesión principal: permite; subagente con una herramienta que no
 * delega: permite; subagente con Agent o Task: rechaza. `Task` es el nombre antiguo de `Agent`. FALLA
 * CERRADO con una sola señal: el único payload real donde las señales discrepan es un subagente con
 * `agent_id` y la ruta de transcript de la sesión principal, y exigir ambas lo habría dejado delegar. La
 * señal de transcript casa un segmento `subagents` entero, que la ruta de la sesión principal no puede
 * contener.
 */

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';

/** The tools that start an agent. @es Las herramientas que lanzan un agente. */
export const DELEGATION_TOOLS = new Set(['Agent', 'Task']);

/**
 * @param {unknown} payload the parsed `PreToolUse` payload
 * @returns {undefined | { toolName: string, agentId: unknown, sessionId: unknown }} `undefined` means ALLOW
 * @es `undefined` significa PERMITIR; cualquier otra cosa describe el rechazo.
 */
export function decide(payload) {
  const toolName = payload?.tool_name;

  if (!DELEGATION_TOOLS.has(toolName)) return undefined;
  if (!isSubagentCaller(payload)) return undefined;

  return { toolName, agentId: payload.agent_id ?? '(unknown)', sessionId: payload.session_id };
}
