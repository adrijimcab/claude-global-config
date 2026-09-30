/**
 * The pure decision of `backlog-owner-guard` — a `PreToolUse` guard on engram's save-family MCP tools.
 *
 * WHY THIS EXISTS. MEASURED this session: subagent `a7a6a1fc42286edd6` ran
 * `mem_save({ topic_key: "backlog/1.0.0-master", ... })` and overwrote the owner's master backlog
 * (engram observation #972) as revision 50, citing `~/.claude/rules/00-owner-mandates.md`'s "Backlog
 * maestro" section as its own justification — a rule written for the orchestrator, read and obeyed by a
 * worker because that global rules file loads into every subagent too. The owner ruled: a delegated
 * agent must NEVER be able to write, update, or delete a master-backlog record. It reports its finding
 * in its hand-back instead, and the ORCHESTRATOR transcribes it into the backlog the same turn.
 *
 * THE DECISION, entirely pure and dependency-injected (`resolveTopicKey`), so the whole state space is
 * exercisable in `selftest.mjs` without a live engram store or a live subagent session:
 *
 *   main session,  any tool, any topic_key/id            -> ALLOW (the orchestrator must keep writing)
 *   subagent, `mem_save`,   topic_key NOT master-shaped   -> ALLOW
 *   subagent, `mem_save`,   topic_key IS master-shaped    -> DENY
 *   subagent, `mem_update`, new topic_key IS master-shaped-> DENY (retargeting a row INTO the master key)
 *   subagent, `mem_update`, id resolves to a master row   -> DENY (editing the master row in place)
 *   subagent, `mem_update`, id resolves to a non-master   -> ALLOW
 *   subagent, `mem_update`, id UNRESOLVABLE (any reason)  -> DENY, fail CLOSED (see `resolve-topic-key.mjs`)
 *   subagent, `mem_delete`, same `id` rules as `mem_update`
 *
 * "Master-shaped" reuses `isMasterBacklogTopicKey` from `../backlog-guard/master-save.mjs` — the SAME
 * predicate the Stop-side backlog guard already uses to recognise a master-backlog save in a transcript
 * (owner mandate M8: one definition of "master backlog topic_key", not two that could drift apart).
 *
 * @es Decisión pura de `backlog-owner-guard`, guardia `PreToolUse` sobre las herramientas MCP de guardado
 * de engram. Existe porque el subagente `a7a6a1fc42286edd6` sobreescribió el backlog maestro del dueño
 * citando una regla escrita para el orquestador. El dueño ordenó: un agente delegado NUNCA escribe,
 * actualiza ni borra un registro de backlog maestro — reporta su hallazgo en su hand-back y el
 * ORQUESTADOR lo transcribe. La decisión es pura e inyectada por dependencia, y reutiliza el MISMO
 * predicado "con forma de maestro" que ya usa la guardia `Stop` (mandato M8: una sola definición).
 */

import { isMasterBacklogTopicKey } from '../backlog-guard/master-save.mjs';
import { isSubagentCaller } from './identify-caller.mjs';

/** The engram save-family tools this guard covers, both mount points, per tool family. @es Las herramientas de la familia de guardado de engram que cubre esta guardia, ambos montajes, por familia. */
export const SAVE_TOOLS = new Set(['mcp__engram__mem_save', 'mcp__plugin_engram_engram__mem_save']);
export const UPDATE_TOOLS = new Set(['mcp__engram__mem_update', 'mcp__plugin_engram_engram__mem_update']);
// `mem_delete` is NOT exposed by the "agent" MCP tool profile this fleet's subagents run under —
// MEASURED this session via ToolSearch: neither `mcp__engram__mem_delete` nor
// `mcp__plugin_engram_engram__mem_delete` resolved to any tool definition, and `engram mcp --help`
// documents delete as belonging to the 4-tool "admin" profile, not the 18-tool "agent" profile. It is
// still covered here as defence in depth against a future or differently-configured profile — matching
// it costs nothing and closes the vector before it can ever open, never assumed to be currently reachable.
export const DELETE_TOOLS = new Set(['mcp__engram__mem_delete', 'mcp__plugin_engram_engram__mem_delete']);

/** Tools whose `topic_key` argument identifies the target directly, with no id resolution needed. @es Herramientas cuyo `topic_key` identifica el objetivo directamente. */
function isSaveTool(toolName) {
  return SAVE_TOOLS.has(toolName);
}

/** Tools that target an EXISTING observation by numeric `id`. @es Herramientas que apuntan a una observación EXISTENTE por `id` numérico. */
function isIdTargetingTool(toolName) {
  return UPDATE_TOOLS.has(toolName) || DELETE_TOOLS.has(toolName);
}

/**
 * The verdict for one `PreToolUse` payload already split into `toolName`/`toolInput`, plus the full
 * `payload` (needed only to identify the caller) and an injected `resolveTopicKey(id)`.
 *
 * @returns {undefined | { kind: string, toolName: string, topicKey?: string | null, id?: unknown, detail?: string }}
 *   `undefined` means ALLOW. Anything else is a refusal descriptor for `reason.mjs` to render.
 */
export function decide(payload, toolName, toolInput, resolveTopicKey) {
  const isSave = isSaveTool(toolName);
  const isIdTargeting = isIdTargetingTool(toolName);

  if (!isSave && !isIdTargeting) return undefined; // not one of this guard's tools

  if (!isSubagentCaller(payload)) return undefined; // the orchestrator is always allowed to write

  if (toolInput === null || typeof toolInput !== 'object') return undefined; // nothing to judge

  if (isSave) {
    const topicKey = /** @type {{ topic_key?: unknown }} */ (toolInput).topic_key;

    if (typeof topicKey !== 'string' || !isMasterBacklogTopicKey(topicKey)) return undefined;

    return { kind: 'save-master-topic-key', toolName, topicKey };
  }

  // isIdTargeting: mem_update / mem_delete.
  const newTopicKey = /** @type {{ topic_key?: unknown }} */ (toolInput).topic_key;

  if (typeof newTopicKey === 'string' && isMasterBacklogTopicKey(newTopicKey)) {
    return { kind: 'retarget-into-master-topic-key', toolName, topicKey: newTopicKey };
  }

  const id = /** @type {{ id?: unknown }} */ (toolInput).id;
  const resolution = resolveTopicKey(id);

  if ('error' in resolution) {
    return { kind: 'unresolvable-id', toolName, id, detail: resolution.error };
  }

  if (isMasterBacklogTopicKey(resolution.topicKey)) {
    return { kind: 'targets-master-observation', toolName, id, topicKey: resolution.topicKey };
  }

  return undefined;
}
