/**
 * Whether a `PreToolUse` payload was fired by a DELEGATED SUBAGENT, never by the main orchestrator
 * session — the one distinction this whole guard exists to make correctly.
 *
 * MEASURED, not assumed (owner mandate: verify before asserting). Read the real replay corpus captured
 * by another worker this session — 3,979 real `PreToolUse` payloads at
 * `.claude/fleet-env/scratch/a9051dc022c78b59e/payloads.jsonl` in the b100-am-ui project — filtered to
 * the 3,040 that carry a `tool_name`:
 *
 *   agent_id present AND transcript_path contains "subagents"   -> every subagent payload, 100%
 *   agent_id absent  AND transcript_path has no "subagents"     -> every main-session payload, 100%
 *   agent_id present but transcript_path WITHOUT "subagents"    -> 0 occurrences
 *   agent_id absent  but transcript_path WITH    "subagents"    -> 0 occurrences
 *
 * The two signals agreed on all 3,040 real payloads with zero exceptions. One OLDER captured fixture
 * (`.claude/hook-payloads/mcp__plugin_engram_engram__mem_save.pretooluse.json`, dated 2026-09-14) shows
 * `agent_id` set on a payload whose `transcript_path` is NOT under `subagents/` — a single disagreeing
 * sample against a 3,040-payload corpus is the stale-artifact-vs-live-measurement shape this project's
 * own ledger already names (`stale-artifact-read-as-this-runs-result`), so it is not trusted alone. Both
 * signals are still checked, joined with OR, so neither one drifting alone can misclassify a subagent as
 * the main session — the failure mode this guard exists to close is under-blocking, never over-blocking.
 *
 * @es Si un payload de `PreToolUse` lo disparó un SUBAGENTE delegado, nunca la sesión orquestadora. Se
 * midió contra 3.040 payloads reales: `agent_id` presente y `transcript_path` bajo `subagents/`
 * coinciden al 100% para identificar un subagente; ausentes ambos, 100% sesión principal; cero payloads
 * reales discrepan entre las dos señales. Una ÚNICA fixture más antigua discrepa, y no se confía en ella
 * sola (misma clase que `stale-artifact-read-as-this-runs-result`). Se comprueban ambas señales con OR
 * para que ninguna, si deriva sola, pueda leer un subagente como sesión principal.
 */

/** The literal substring a subagent's own transcript path always contains. @es El literal que siempre lleva la ruta de transcript de un subagente. */
const SUBAGENT_TRANSCRIPT_MARKER = 'subagents';

/**
 * @param {unknown} payload the parsed `PreToolUse` hook payload
 * @returns {boolean} `true` when the payload was fired by a delegated subagent
 */
export function isSubagentCaller(payload) {
  if (payload === null || typeof payload !== 'object') return false;

  const agentId = /** @type {{ agent_id?: unknown }} */ (payload).agent_id;
  const hasAgentId = typeof agentId === 'string' && agentId.length > 0;

  const transcriptPath = /** @type {{ transcript_path?: unknown }} */ (payload).transcript_path;
  const hasSubagentTranscript = typeof transcriptPath === 'string' && transcriptPath.includes(SUBAGENT_TRANSCRIPT_MARKER);

  return hasAgentId || hasSubagentTranscript;
}
