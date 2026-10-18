/**
 * The time windows during which a transcript's agent was running a shell command, and the test of
 * whether a file's modification time falls inside one.
 *
 * WHY WINDOWS. A file written by a shell command (a script, a redirect, a tool process) names no path in
 * any structured call, so `transcript-writes.mjs` cannot attribute it. A shell tool call does have a
 * START (its `tool_use` record's timestamp) and an END (its `tool_result` record's timestamp), and the
 * file's modification time of a path that call wrote lies between them.
 *
 * THE TOLERANCE, MEASURED 2026-10-01 on this machine (3 probes: a script run through the shell tool
 * writes a file, then the file's mtime is compared to the transcript): the mtime fell 12-17 ms BEFORE
 * the `tool_result` timestamp and 1.2-2.6 s AFTER the `tool_use` timestamp (the call is recorded when
 * the model emits it, and runs a moment later). The window therefore already contains the write by a
 * wide margin; `CLOCK_TOLERANCE_MS` (1 s) only absorbs timestamp rounding and flush order, ~60 times the
 * measured edge gap yet far below any window it could be mistaken for. A wider tolerance would only
 * widen windows and blame more sessions. THE STATED LIMIT: a command that keeps writing after its
 * result (a background job) falls outside the window and stays unexplained.
 *
 * @es Las ventanas de tiempo en que el agente de un transcript corrió un comando de shell, y la prueba de
 * si el mtime de un fichero cae dentro de una. Una escritura por shell no nombra ruta en ninguna llamada
 * estructurada; sí tiene INICIO (timestamp del `tool_use`) y FIN (timestamp del `tool_result`). TOLERANCIA
 * MEDIDA el 2026-10-01 (3 sondas): el mtime cayó 12-17 ms ANTES del `tool_result` y 1,2-2,6 s DESPUÉS del
 * `tool_use`; 1 s solo absorbe redondeo y orden de volcado (~60 veces el margen medido). Una tolerancia
 * mayor solo ensancharía ventanas y culparía a más sesiones. LÍMITE DECLARADO: un comando que sigue
 * escribiendo tras su resultado (un trabajo en segundo plano) queda fuera y sigue sin explicar.
 */

export const CLOCK_TOLERANCE_MS = 1000;

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

/** The content blocks of one transcript record. @es Los bloques de contenido de un registro. */
function blocksOf(record) {
  return Array.isArray(record?.message?.content) ? record.message.content : [];
}

/**
 * Every shell call of the JSONL `transcriptText` as `{ start, end, command, cwd, failed }`: the windows below
 * plus the call's `input.command`, the working directory its `tool_use` record carries (`cwd`, undefined
 * when the record has none) and whether its result was an error (a call with no result has
 * `failed: false`). The ONE place a shell call's `tool_use` is paired with its `tool_result`; the windows are
 * this list without the extra fields. Timing rules as `shellWindowsIn`. The command and the cwd are what
 * `window-reach.mjs` reads to tell WHERE a call could have written.
 * @es Cada llamada de shell de `transcriptText` como `{ start, end, command, cwd, failed }`: las ventanas de
 * abajo más el `input.command`, el directorio de trabajo que lleva su registro `tool_use` (`cwd`, undefined si
 * no lo trae) y si el resultado fue un error (sin resultado, `failed: false`). El ÚNICO sitio que
 * empareja `tool_use` con `tool_result`; las ventanas son esta lista sin los campos extra. El comando y el cwd
 * son lo que lee `window-reach.mjs` para saber DÓNDE pudo escribir una llamada.
 */
export function shellCallsIn(transcriptText, now = Date.now()) {
  return pairedShellCalls(transcriptText, now);
}

/**
 * Every shell call of the JSONL `transcriptText` as `{ start, end }` in epoch ms. A call that never got a
 * result ends at the transcript's last timestamp when later records exist (it was interrupted), else at
 * `now` (it is still running). Lines that are not JSON or carry no timestamp are skipped.
 * @es Cada llamada de shell de `transcriptText` como `{ start, end }` en ms. Sin resultado: termina en el
 * último timestamp si hay registros posteriores (interrumpida), si no en `now` (sigue corriendo).
 */
export function shellWindowsIn(transcriptText, now = Date.now()) {
  return pairedShellCalls(transcriptText, now).map(({ start, end }) => ({ start, end }));
}

/** Pairs each shell `tool_use` with its `tool_result`; see `shellCallsIn`. @es Empareja cada `tool_use` de shell con su `tool_result`; ver `shellCallsIn`. */
function pairedShellCalls(transcriptText, now) {
  const open = new Map();
  const windows = [];
  let last = 0;

  for (const line of transcriptText.split('\n')) {
    if (!line.includes('"tool_use"') && !line.includes('"tool_result"')) continue;

    let record;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const at = Date.parse(record?.timestamp);

    if (Number.isNaN(at)) continue;

    last = Math.max(last, at);

    for (const block of blocksOf(record)) {
      if (block?.type === 'tool_use' && SHELL_TOOLS.has(block.name)) open.set(block.id, { start: at, command: String(block.input?.command ?? ''), cwd: typeof record.cwd === 'string' ? record.cwd : undefined });

      if (block?.type === 'tool_result' && open.has(block.tool_use_id)) {
        windows.push({ ...open.get(block.tool_use_id), end: at, failed: block.is_error === true });
        open.delete(block.tool_use_id);
      }
    }
  }

  for (const { start, command, cwd } of open.values()) windows.push({ start, command, cwd, failed: false, end: start < last ? last : now });

  return windows;
}

/** Whether `mtimeMs` lies inside any of `windows`, widened by `tolerance` on both sides. @es Si `mtimeMs` cae en alguna ventana, ensanchada por `tolerance`. */
export function withinWindow(windows, mtimeMs, tolerance = CLOCK_TOLERANCE_MS) {
  return windows.some((window) => mtimeMs >= window.start - tolerance && mtimeMs <= window.end + tolerance);
}
