/**
 * Which files a transcript's agent WROTE, read from structured file-writing tool calls only.
 *
 * WHY WRITES AND NOT MENTIONS. Attribution used to excuse a dirty path when any live transcript
 * contained its name as a substring. Measured 2026-10-01: 8 of 8 live transcripts contained
 * `lessons-ledger.md` (the contract text that imports it rides in every context), so the ledger's
 * uncommitted hunks were excused for hours. A name in prose, a tool result or a shell command proves a
 * READ at most. A call to `Edit`/`Write`/`MultiEdit`/`NotebookEdit` names the file it changes, so that
 * is the evidence. A file changed by a shell command is attributed by time instead (`shell-windows.mjs`).
 *
 * @es Qué ficheros ESCRIBIÓ el agente de un transcript, leído solo de llamadas estructuradas de
 * escritura. Antes se excusaba una ruta sucia si CUALQUIER transcript vivo la nombraba; medido el
 * 2026-10-01, 8 de 8 transcripts vivos contenían `lessons-ledger.md`, así que sus cambios sin commitear
 * quedaron excusados horas. Un nombre en prosa, en un resultado o en un comando prueba como mucho una
 * LECTURA; `Edit`/`Write`/`MultiEdit`/`NotebookEdit` nombran el fichero que cambian. Lo cambiado por un
 * comando de shell se atribuye por hora (`shell-windows.mjs`).
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

/** The content blocks of one record. @es Los bloques de contenido de un registro. */
const blocksOf = (record) => (Array.isArray(record?.message?.content) ? record.message.content : []);

/**
 * The fold of the files a transcript wrote, for `transcript-index/index.mjs` `foldTranscript`: `{ written }`, each
 * distinct normalized target in first-written order. It is the ONE reading of a record: `writtenPathsIn` runs
 * the same `absorb` over a whole text, so the incremental answer and the whole-text answer cannot drift apart.
 * A line without a `tool_use` marker contributes nothing, exactly as the whole-text reader skips it.
 * @es El pliegue de los ficheros que escribió un transcript: `{ written }`, cada destino distinto normalizado en
 * orden de primera escritura. Es la ÚNICA lectura de un registro: `writtenPathsIn` corre el mismo `absorb` sobre
 * un texto entero, así que la respuesta incremental y la del texto entero no pueden divergir.
 */
export const WRITTEN_PATHS_FOLD = {
  name: 'written-paths',
  version: 1,
  initial: () => ({ written: [] }),
  isState: (state) => Array.isArray(state?.written) && state.written.every((entry) => typeof entry === 'string'),
  absorb(state, record, line) {
    if (!line.includes(TOOL_CALL_MARKER)) return;

    for (const block of blocksOf(record)) {
      const target = writtenBy(block);

      if (target !== undefined && !state.written.includes(target)) state.written.push(target);
    }
  }
};

/**
 * Every distinct file the JSONL `transcriptText` wrote, normalized, in first-written order. A line that
 * is not JSON is skipped: a half-written last line must not hide what came before.
 * @es Cada fichero distinto que escribió `transcriptText` (JSONL), normalizado. Una línea que no es JSON se salta.
 */
export function writtenPathsIn(transcriptText) {
  const state = WRITTEN_PATHS_FOLD.initial();

  for (const line of transcriptText.split('\n')) {
    if (!line.includes(TOOL_CALL_MARKER)) continue;

    let record;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    WRITTEN_PATHS_FOLD.absorb(state, record, line);
  }

  return [...state.written];
}
