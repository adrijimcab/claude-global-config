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

/** Whether a line can carry a shell call or its result: the whole-text reader parses no other. @es Si una línea puede llevar una llamada de shell o su resultado. */
const carriesToolTraffic = (line) => line.includes('"tool_use"') || line.includes('"tool_result"');

/**
 * The fold of a transcript's shell calls, for `transcript-index/index.mjs` `foldTranscript`: `{ open, windows,
 * last }` — calls still waiting for their result (`{ id, start, command, cwd }`, in the order a `Map` keyed by
 * id would keep them: a repeated id replaces its entry in place), closed calls, and the latest timestamp of a
 * tool line. `finishShellCalls(state, now)` turns it into the call list. It is the ONE pairing of a `tool_use`
 * with its `tool_result`: `shellCallsIn` runs the same `absorb` over a whole text.
 * @es El pliegue de las llamadas de shell de un transcript: `{ open, windows, last }` — llamadas sin resultado
 * todavía (en el orden en que las guardaría un `Map` por id: un id repetido reemplaza su entrada en su sitio),
 * llamadas cerradas y la última marca de tiempo de una línea de herramienta. `finishShellCalls(state, now)` da la
 * lista. Es el ÚNICO emparejamiento de `tool_use` con `tool_result`: `shellCallsIn` corre el mismo `absorb`.
 */
export const SHELL_CALLS_FOLD = {
  name: 'shell-calls',
  version: 1,
  initial: () => ({ open: [], windows: [], last: 0 }),
  isState: (state) => Array.isArray(state?.open) && Array.isArray(state?.windows) && typeof state?.last === 'number',
  absorb(state, record, line) {
    if (!carriesToolTraffic(line)) return;

    const at = Date.parse(record?.timestamp);

    if (Number.isNaN(at)) return;

    state.last = Math.max(state.last, at);

    for (const block of blocksOf(record)) {
      if (block?.type === 'tool_use' && SHELL_TOOLS.has(block.name)) {
        const entry = { id: block.id, start: at, command: String(block.input?.command ?? ''), cwd: typeof record.cwd === 'string' ? record.cwd : undefined };
        const known = state.open.findIndex((open) => open.id === block.id);

        if (known === -1) state.open.push(entry);
        else state.open[known] = entry;
      }

      const waiting = block?.type === 'tool_result' ? state.open.findIndex((open) => open.id === block.tool_use_id) : -1;

      if (waiting !== -1) {
        const { start, command, cwd } = state.open[waiting];

        state.windows.push({ start, command, cwd, end: at, failed: block.is_error === true });
        state.open.splice(waiting, 1);
      }
    }
  }
};

/**
 * The call list of a `SHELL_CALLS_FOLD` state: the closed calls, then each call still open, which ends at the
 * last tool timestamp when later tool lines exist (it was interrupted), else at `now` (it is still running).
 * @es La lista de llamadas de un estado del pliegue: las cerradas y luego cada abierta, que termina en la última
 * marca de tiempo si hay líneas posteriores (se interrumpió), si no en `now` (sigue corriendo).
 */
export function finishShellCalls(state, now) {
  return [...state.windows.map(({ start, command, cwd, end, failed }) => ({ start, command, cwd, end, failed })), ...state.open.map(({ start, command, cwd }) => ({ start, command, cwd, failed: false, end: start < state.last ? state.last : now }))];
}

/** Pairs each shell `tool_use` with its `tool_result` over a whole text; see `shellCallsIn`. @es Empareja cada `tool_use` de shell con su `tool_result` sobre un texto entero. */
function pairedShellCalls(transcriptText, now) {
  const state = SHELL_CALLS_FOLD.initial();

  for (const line of transcriptText.split('\n')) {
    if (!carriesToolTraffic(line)) continue;

    let record;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    SHELL_CALLS_FOLD.absorb(state, record, line);
  }

  return finishShellCalls(state, now);
}

/** Whether `mtimeMs` lies inside any of `windows`, widened by `tolerance` on both sides. @es Si `mtimeMs` cae en alguna ventana, ensanchada por `tolerance`. */
export function withinWindow(windows, mtimeMs, tolerance = CLOCK_TOLERANCE_MS) {
  return windows.some((window) => mtimeMs >= window.start - tolerance && mtimeMs <= window.end + tolerance);
}
