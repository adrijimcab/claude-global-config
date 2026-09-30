/**
 * Which files a transcript's agent WROTE, read from structured file-writing tool calls only.
 *
 * WHY WRITES AND NOT MENTIONS. Attribution used to excuse a dirty path when any live transcript
 * contained its name as a substring. Measured 2026-10-01: 8 of 8 live transcripts contained
 * `lessons-ledger.md` (the contract text that imports it rides in every context), so the ledger's
 * uncommitted hunks were excused for hours. A name in prose, a tool result or a shell command proves a
 * READ at most. A call to `Edit`/`Write`/`MultiEdit`/`NotebookEdit` names the file it changes, so that
 * is the evidence. THE STATED LIMIT: a file changed by a shell command or a tool process is not seen,
 * so it stays unattributed and blocks — the safe direction for a delivery gate.
 *
 * @es Qué ficheros ESCRIBIÓ el agente de un transcript, leído solo de llamadas estructuradas de
 * escritura. Antes se excusaba una ruta sucia si CUALQUIER transcript vivo la nombraba; medido el
 * 2026-10-01, 8 de 8 transcripts vivos contenían `lessons-ledger.md`, así que sus cambios sin commitear
 * quedaron excusados horas. Un nombre en prosa, en un resultado o en un comando prueba como mucho una
 * LECTURA; `Edit`/`Write`/`MultiEdit`/`NotebookEdit` nombran el fichero que cambian. LÍMITE DECLARADO:
 * un fichero cambiado por un comando de shell o por un proceso no se ve, queda sin atribuir y bloquea.
 */

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const TOOL_CALL_MARKER = '"tool_use"';

/** `value` lowercased with forward slashes: how this module compares paths across Windows spellings. @es `value` en minúsculas y con `/`. */
export function normalizedPath(value) {
  return String(value).replaceAll('\\', '/').toLowerCase();
}

/** The file one `tool_use` block writes, or `undefined` when it is not a file-writing call. @es El fichero que escribe un bloque `tool_use`. */
function writtenBy(block) {
  if (block?.type !== 'tool_use' || !WRITE_TOOLS.has(block.name)) return undefined;

  const target = block.input?.file_path ?? block.input?.notebook_path;

  return typeof target === 'string' && target.length > 0 ? normalizedPath(target) : undefined;
}

/**
 * Every distinct file the JSONL `transcriptText` wrote, normalized, in first-written order. A line that
 * is not JSON is skipped: a half-written last line must not hide what came before.
 * @es Cada fichero distinto que escribió `transcriptText` (JSONL), normalizado. Una línea que no es JSON se salta.
 */
export function writtenPathsIn(transcriptText) {
  const written = new Set();

  for (const line of transcriptText.split('\n')) {
    if (!line.includes(TOOL_CALL_MARKER)) continue;

    let record;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const blocks = Array.isArray(record?.message?.content) ? record.message.content : [];

    for (const block of blocks) {
      const target = writtenBy(block);

      if (target !== undefined) written.add(target);
    }
  }

  return [...written];
}
