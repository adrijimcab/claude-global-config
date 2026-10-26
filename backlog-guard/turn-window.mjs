/**
 * THE TURN WINDOW — which transcript bytes belong to the current turn of a session, moved on EVERY Stop.
 *
 * The state of a session is `{ turnStart, offset }`: `offset` is the transcript size at the session's last stop,
 * and `turnStart` is where its current turn began. A first stop (`stop_hook_active` not true) opens a new turn at
 * the previous stop's end; a continued stop (the rewrite after a block) keeps the turn start. Every stop moves
 * `offset` to the transcript's end. So `decide.mjs`, which reads from `turnStart`, sees the WHOLE current turn on
 * every stop of it, a save made after a block counts for that turn, and the next turn starts after the last stop
 * of this one, so that save never satisfies a later turn.
 *
 * WHY ON EVERY STOP. The pending judge's gate runs this before any of its early returns (a nested run, a capped
 * continued stop, a stop with no message, a malfunction): a window moved only when the prefilter is reached would
 * be left behind by those stops, and the next turn would read bytes this one already owned.
 *
 * @es LA VENTANA DEL TURNO — qué bytes del transcript son del turno actual de una sesión, movida en TODA parada.
 * El estado es `{ turnStart, offset }`: `offset` es el tamaño del transcript en la última parada y `turnStart` es
 * donde empezó el turno actual. Una primera parada abre un turno en el final de la parada anterior; una
 * continuada conserva el inicio. Toda parada lleva `offset` al final. Así `decide.mjs` ve el turno ENTERO, un
 * guardado posterior a un bloqueo cuenta para ese turno y nunca satisface uno posterior. POR QUÉ EN TODA PARADA:
 * la compuerta la corre antes de cualquier salida temprana, que de otro modo dejaría la ventana atrás.
 */

import { readOffsetState, transcriptSize, writeOffsetState } from './state.mjs';

/** A stored position, or `fallback` when it is not a number. @es Una posición guardada, o `fallback` si no es un número. */
const positionOr = (value, fallback) => (typeof value === 'number' ? value : fallback);

/**
 * Moves the window of the session of the Stop `payload`. Every dependency is injectable.
 * @es Mueve la ventana de la sesión de la parada `payload`. Toda dependencia es inyectable.
 */
export function advanceTurnWindow(payload, { readState = readOffsetState, writeState = writeOffsetState, sizeOf = transcriptSize } = {}) {
  const sessionId = typeof payload?.session_id === 'string' && payload.session_id.length > 0 ? payload.session_id : 'unknown';
  const state = readState(sessionId);
  const previousEnd = positionOr(state?.offset, 0);
  const turnStart = payload?.stop_hook_active === true ? positionOr(state?.turnStart, previousEnd) : previousEnd;

  writeState(sessionId, { turnStart, offset: sizeOf(payload?.transcript_path) ?? previousEnd });
}
