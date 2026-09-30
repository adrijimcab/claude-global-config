/**
 * The delegation attempts of the turn that is ENDING, read out of the transcript as receipts.
 *
 * WHAT THIS OWNS. One question, and only this one: within the segment of the transcript that belongs
 * to the turn now ending, which delegation tools were CALLED and what did each call come back with.
 * It reads structure — `tool_use` blocks paired to their `tool_result` by id — and never prose. The
 * decision built on top of it lives in `unlaunched.mjs`; the hook wiring lives in `guard.mjs`.
 *
 * WHY STRUCTURE AND NOT PROSE. The hazard being closed is a delegation that was REFUSED and never
 * re-issued, while the turn's final message said the work was delegated. The tempting signal is that
 * sentence. It is the wrong one: a claim is natural language, a control that reads it would refuse
 * honest turns, and a control that refuses honest turns is switched off within the day. The receipt is
 * mechanical — a call, and a result that either carries an agent or carries an error — so that is what
 * is read. A turn that merely MENTIONS a delegation, or quotes a refusal verbatim, produces no
 * `tool_use` block and is therefore invisible here, which is the correct answer.
 *
 * MEASURED, on the real recorded transcripts of this project (2026-09-21, 38 session files plus their
 * subagent files): a refusal is a `tool_result` carrying `is_error: true`, paired by `tool_use_id` to a
 * `tool_use` named `Agent`, `Task` or `SendMessage`. 69 such results exist; 67 on `Agent` and 2 on
 * `SendMessage`, so the two tools DO look alike and one rule covers both. Their text came from five
 * different guards (`BRIEF-PROVENANCE`, the worktree-tenancy `BLOCKED`, `RESUME-BEFORE-FRESH`,
 * `ORPHAN-WORK GUARD`, plus a `WorktreeCreate hook failed` and an early API termination) — which is
 * exactly why the classification is `is_error`, never the wording: the wording belongs to whichever
 * guard refused, and a new guard would be invisible to a text match.
 *
 * WHY A BYTE WINDOW. A transcript here reaches 85 MB. The turn that is ending sits at its tail, so only
 * the tail is read, and the cut is made on BYTES with `Buffer.subarray` — never by slicing a decoded
 * string with a byte offset. That exact confusion refused two correct turns in this fleet on 2026-09-14:
 * a 459,662-byte transcript of accented Spanish and box-drawing made every character-cut tail land past
 * the end and come back empty. A byte cut may split one UTF-8 character; it garbles at most the first
 * line of the window, which is a partial JSON line that is discarded anyway.
 *
 * @es Los intentos de delegación del turno que TERMINA, leídos del transcript como recibos. Lee
 * ESTRUCTURA (`tool_use` emparejado con su `tool_result` por id), nunca prosa: la frase «va delegado» es
 * lenguaje natural y un control que la leyera rechazaría turnos honestos, y un control que rechaza
 * trabajo legítimo se desactiva en un día. MEDIDO sobre los transcripts reales: un rechazo es un
 * `tool_result` con `is_error: true`; hay 69, de cinco guards distintos, por eso se clasifica por
 * `is_error` y jamás por el texto. La cola se corta en BYTES con `Buffer.subarray`: cortar la cadena
 * decodificada con un offset en bytes dejó dos turnos correctos rechazados el 2026-09-14.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

/**
 * The tools by which this session hands work to another agent. `Agent`/`Task` start one; `SendMessage`
 * resumes one that already exists. All three count, because `resume-before-fresh` actively redirects a
 * fresh `Agent` call into a `SendMessage`, so a rule that recognised only `Agent` as a retry would
 * refuse precisely the behaviour another guard demands.
 * @es Herramientas con las que se delega. `SendMessage` cuenta porque `resume-before-fresh` reconduce
 * un `Agent` fresco a un `SendMessage`: no contarlo rechazaría lo que otro guard exige.
 */
export const DELEGATION_TOOLS = new Set(['Agent', 'Task', 'SendMessage']);

/**
 * Tail sizes tried in order. The small one covers an ordinary turn in a few milliseconds; the large one
 * is reached only when the turn's own tool output is enormous, and a turn larger than the last is read
 * as unknowable rather than guessed at.
 * @es Ventanas de cola por orden: la pequeña cubre un turno normal; la grande solo si el turno es
 * enorme. Más grande que la última: no se adivina, se declara desconocido.
 */
const WINDOWS = [2 * 1024 * 1024, 32 * 1024 * 1024];

/**
 * The last `bytes` bytes of a file, decoded, or `undefined` when the file cannot be read at all.
 *
 * It returns rather than throws because the only caller feeds a guard that must fail OPEN, and a reader
 * that throws makes every caller responsible for remembering that. This is the ONE place that decides
 * whether a transcript is readable — an unreadable path, a path that is not a path, a vanished file all
 * answer here — so no caller re-asks the question and none of them can drift apart. The distinction it
 * preserves is the one that matters: "no tail" is never "an empty tail".
 * @es Los últimos `bytes` bytes, o `undefined` si no se puede leer. Devuelve en vez de lanzar porque
 * alimenta un guard que debe fallar ABRIENDO, y es el ÚNICO sitio que decide si un transcript es
 * legible, para que nadie lo vuelva a preguntar. «Sin cola» jamás es «cola vacía».
 */
function tail(path, bytes) {
  let fd;

  try {
    fd = openSync(path, 'r');

    const size = fstatSync(fd).size;
    const from = size > bytes ? size - bytes : 0;
    const buffer = Buffer.allocUnsafe(size - from);
    const read = readSync(fd, buffer, 0, buffer.length, from);

    return buffer.subarray(0, read).toString('utf8');
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Does this entry OPEN a new turn? A turn begins at a message addressed to the assistant: the owner's
 * prompt, and equally a task notification, a stop-hook feedback line or a message relayed from another
 * session, all of which the harness delivers as `user` entries and each of which is answered and then
 * stopped. What is NOT a turn boundary is the delivery of a tool's result, which the harness also
 * records as a `user` entry — telling the two apart structurally, by whether the content carries a
 * `tool_result` block, is what keeps a turn's own tool traffic inside the turn.
 * @es ¿Abre este registro un turno nuevo? Un turno empieza en un mensaje dirigido al asistente; NO lo
 * abre la entrega del resultado de una herramienta, que el harness también graba como `user`. Se
 * distinguen por estructura: si el contenido lleva un bloque `tool_result`, no es frontera.
 */
function opensTurn(entry) {
  if (entry.type !== 'user') return false;

  const content = entry.message?.content;

  if (!Array.isArray(content)) return true;

  return !content.some((block) => block?.type === 'tool_result');
}

/** What to call an attempt in a refusal message: what the author wrote, never a paraphrase. @es Cómo nombrar un intento: lo que escribió el autor. */
function labelOf(name, input) {
  const from = (value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined);
  const named = from(input?.description) ?? from(input?.to) ?? from(input?.recipient) ?? from(input?.summary);
  const kind = from(input?.subagent_type);

  if (named === undefined) return kind === undefined ? name : `${name} (${kind})`;

  return kind === undefined ? named : `${named} (${kind})`;
}

/** The first line of a refusal, which is the part that says WHICH guard refused. @es Primera línea del rechazo: dice QUÉ guard rechazó. */
function firstLine(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  const end = text.indexOf('\n');
  const line = end === -1 ? text : text.slice(0, end);

  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

/**
 * The delegation attempts of the final turn, in the order they were made.
 *
 * Returns `undefined` when the turn's own boundary is not inside the widest window — there is then no
 * honest way to say what belongs to this turn, and a guard that guesses at its own scope is worse than
 * one that stands aside.
 *
 * @es Los intentos de delegación del turno final, en orden. Devuelve `undefined` si la frontera del
 * turno no cabe en la ventana: sin alcance honesto, el guard se aparta.
 */
export function delegationsInFinalTurn(transcriptPath) {
  for (const window of WINDOWS) {
    const text = tail(transcriptPath, window);

    if (text === undefined) return undefined;

    const lines = text.split('\n');
    const turn = [];
    let found = false;

    // Backwards from the end: an ordinary turn is a few dozen entries, so only those get parsed. The
    // walk stops at the boundary, which is why a 41,877-line transcript costs the same as a short one.
    // @es Hacia atrás desde el final: solo se parsea el turno, así que un transcript largo no cuesta más.
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];

      if (line.length === 0) continue;

      let entry;

      try {
        entry = JSON.parse(line);
      } catch {
        continue; // a partial first line of the window, or an entry this reader has no business in
      }

      if (entry?.isSidechain === true) continue; // a sub-agent's own traffic, not this turn's

      turn.push(entry);

      if (opensTurn(entry)) {
        found = true;
        break;
      }
    }

    if (!found) continue; // widen and look again; exhausting the windows means no honest scope exists

    turn.reverse();

    return attemptsOf(turn);
  }

  return undefined;
}

/**
 * Pairs each delegation call in a turn to its result. An attempt whose result never arrived is reported
 * as `unknown`: the turn was interrupted mid-flight, which is not evidence of a refusal.
 * @es Empareja cada llamada con su resultado. Sin resultado, `unknown`: no es prueba de rechazo.
 */
function attemptsOf(turn) {
  const attempts = [];
  const byId = new Map();

  for (const entry of turn) {
    const content = entry?.message?.content;

    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block?.type === 'tool_use' && DELEGATION_TOOLS.has(block.name)) {
        const attempt = { tool: block.name, id: block.id, label: labelOf(block.name, block.input), at: entry.timestamp, outcome: 'unknown', reason: undefined };

        attempts.push(attempt);
        byId.set(block.id, attempt);
        continue;
      }

      if (block?.type !== 'tool_result') continue;

      const attempt = byId.get(block.tool_use_id);

      if (attempt === undefined) continue;

      // THE CLASSIFICATION, and it is the whole mechanism: a delegation either came back with an agent
      // or came back with an error. `is_error` is set by the harness for a hook denial, a permission
      // refusal and an early termination alike — every one of which leaves the errand unstarted or
      // unfinished, and every one of which the turn can still describe as "delegated".
      // @es LA CLASIFICACIÓN: o volvió con un agente, o volvió con error. `is_error` cubre por igual la
      // denegación de un hook, el rechazo de permisos y una terminación temprana.
      attempt.outcome = block.is_error === true ? 'refused' : 'launched';
      attempt.reason = block.is_error === true ? firstLine(block.content) : undefined;
    }
  }

  return attempts;
}
