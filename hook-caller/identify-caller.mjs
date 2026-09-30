/**
 * Whether a `PreToolUse` payload was fired by a DELEGATED SUBAGENT, never by the main orchestrator
 * session. Shared by every guard that treats the two differently (`backlog-owner-guard`,
 * `worker-delegation-guard`), so there is one definition of "the caller is a worker", not one per guard.
 *
 * MEASURED, not assumed. A real replay corpus of 3,979 `PreToolUse` payloads (captured in the b100-am-ui
 * project, 2026-09-30), filtered to the 3,040 that carry a `tool_name`:
 *
 *   agent_id present AND transcript_path under a "subagents" directory -> every subagent payload, 100%
 *   agent_id absent  AND transcript_path not under one               -> every main-session payload, 100%
 *   either signal without the other                                  -> 0 occurrences
 *
 * One OLDER captured fixture (`hook-payloads/mcp__plugin_engram_engram__mem_save.pretooluse.json`,
 * 2026-09-14) is a subagent carrying `agent_id` with the main session's transcript path. So the signals
 * are joined with OR: neither one drifting alone can read a worker as the orchestrator.
 *
 * The transcript signal is a whole PATH SEGMENT equal to `subagents` (a subagent's transcript lives at
 * `.../<session>/subagents/agent-<id>.jsonl`), never a substring. A main-session transcript sits at
 * `.../projects/<slug>/<session>.jsonl`, where the slug dashes every separator of the working directory,
 * so a directory named like `subagents-archive` could make a substring match refuse the orchestrator.
 *
 * @es Si un payload de `PreToolUse` lo disparó un SUBAGENTE delegado, nunca la sesión orquestadora. Lo
 * comparten todos los guards que tratan distinto a ambos, para que haya una sola definición. Medido sobre
 * 3.040 payloads reales: `agent_id` y una ruta de transcript bajo un directorio `subagents` coinciden al
 * 100%; cero payloads reales traen una señal sin la otra. Una fixture ANTERIOR es un subagente con
 * `agent_id` y la ruta de la sesión principal, así que las señales se unen con OR. La señal de transcript
 * es un SEGMENTO de ruta igual a `subagents`, nunca una subcadena: la ruta de la sesión principal lleva un
 * slug con los separadores convertidos en guiones, y una subcadena podría rechazar al orquestador.
 */

/** The directory name that holds every subagent transcript. @es El nombre del directorio que guarda todo transcript de subagente. */
const SUBAGENT_TRANSCRIPT_DIRECTORY = 'subagents';

/** Whether `transcriptPath` has a whole segment naming the subagent directory. @es Si la ruta tiene un segmento entero con el directorio de subagentes. */
function isUnderSubagentDirectory(transcriptPath) {
  return transcriptPath.split('\\').join('/').split('/').includes(SUBAGENT_TRANSCRIPT_DIRECTORY);
}

/**
 * @param {unknown} payload the parsed `PreToolUse` hook payload
 * @returns {boolean} `true` when the payload was fired by a delegated subagent
 * @es `true` cuando el payload lo disparó un subagente delegado.
 */
export function isSubagentCaller(payload) {
  if (payload === null || typeof payload !== 'object') return false;

  const agentId = /** @type {{ agent_id?: unknown }} */ (payload).agent_id;
  const hasAgentId = typeof agentId === 'string' && agentId.length > 0;

  const transcriptPath = /** @type {{ transcript_path?: unknown }} */ (payload).transcript_path;
  const hasSubagentTranscript = typeof transcriptPath === 'string' && isUnderSubagentDirectory(transcriptPath);

  return hasAgentId || hasSubagentTranscript;
}
