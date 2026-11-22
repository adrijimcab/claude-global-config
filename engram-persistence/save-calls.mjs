/**
 * Whether a stretch of transcript holds a SUCCESSFUL engram save: a tool call, never prose. A save is an MCP call to
 * `mem_save`, `mem_session_summary` or `mem_update` (either server name), or a shell call whose command runs
 * `engram save` (the CLI route a resumed session must take when engram refuses its MCP writes, promoted rule
 * engram-writes-refused-after-session-resume). The call counts only when its tool_result came back without error: a
 * write the engram hook refused is not a save.
 *
 *   savedIn(tail) -> boolean
 *
 * The tail is raw JSONL cut at a byte offset, so its first line may be a fragment; a line that does not parse is
 * skipped.
 *
 * @es Si un tramo del transcript contiene un guardado de engram EXITOSO: una llamada de herramienta, nunca prosa. Es
 * guardado una llamada MCP a `mem_save`, `mem_session_summary` o `mem_update` (con cualquiera de los dos nombres de
 * servidor), o una llamada de shell cuyo comando ejecuta `engram save` (la vía CLI que debe usar una sesión reanudada
 * cuando engram rechaza sus escrituras MCP). Cuenta solo si su tool_result volvió sin error: una escritura que el hook
 * de engram rechazó no es un guardado. La cola es JSONL cortado en un offset de bytes; una línea que no se puede
 * analizar se salta.
 */

const MCP_SAVE = /^mcp__(?:plugin_engram_)?engram__mem_(?:save|session_summary|update)$/;
const SHELLS = new Set(['Bash', 'PowerShell']);
const CLI_SAVE = /(?:^|[\s;&|(/\\"'])engram(?:\.exe)?["']?\s+save(?:\s|$)/;

/** The content items of one transcript line, or none. @es Los elementos de contenido de una línea del transcript. */
function itemsOf(line) {
  try {
    const content = JSON.parse(line)?.message?.content;

    return Array.isArray(content) ? content : [];
  } catch {
    return [];
  }
}

/** Whether a tool_use item is an engram save. @es Si un elemento tool_use es un guardado de engram. */
function isSave(item) {
  if (MCP_SAVE.test(item?.name ?? '')) return true;

  return SHELLS.has(item?.name) && typeof item.input?.command === 'string' && CLI_SAVE.test(item.input.command);
}

/** @param {string} tail @returns {boolean} */
export function savedIn(tail) {
  const saves = new Set();

  for (const line of tail.split('\n')) {
    for (const item of itemsOf(line)) {
      // Only a tool call carries a tool name, so a text item never passes isSave and needs no type check.
      // @es Solo una llamada de herramienta lleva nombre de herramienta: un elemento de texto nunca pasa isSave.
      if (isSave(item)) saves.add(item.id);
      if (item?.type === 'tool_result' && saves.has(item.tool_use_id) && item.is_error !== true) return true;
    }
  }

  return false;
}
