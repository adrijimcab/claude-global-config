/**
 * What a dirty path means for the session whose turn is ending: whose change is it, and is it this
 * session's to commit?
 *
 * WHY. A dirty path used to block every session unless a live agent had WRITTEN it through an `Edit`
 * call; a path changed by a shell command, or by a tool process, was unattributable, so it blocked EVERY
 * session until someone dismissed it, and each landing changed the fingerprint so it blocked again.
 * Measured 2026-10-01: three consecutive turn endings were blocked on paths the blocked session did not
 * write and could not commit. The owner's rule is that whoever MADE a change commits it the same turn; a
 * session that did not make it has nothing to commit, and a block it cannot discharge is not a rule, it
 * is noise.
 *
 * THE CLAIMS. An actor claims a path when its transcript wrote it through a structured call
 * (`transcript-writes.mjs`) or ran a shell call whose window contains the path's mtime
 * (`shell-windows.mjs`). Three outcomes for session S:
 *   - `maker`: S's own main session claims it, or a FINISHED subagent of S claims it (a worker that has
 *     stopped, by the liveness rule of `attribution.mjs`: its transcript is older than 30 minutes). A
 *     finished worker's output belongs to the session that delegated it, which must review it and commit
 *     it with a pathspec or discard it deliberately the same turn. It blocks S, and only S.
 *   - `theirs`: claimed, but not by S's main session or a finished worker of S: another session's main
 *     session or finished worker, or any LIVE subagent (a worker's working state is never committed by
 *     someone else, and its parent session is its owner only once it stops). It blocks nobody. A path a
 *     live subagent claims stays `theirs` even if a finished worker of S also claimed it.
 *   - `unexplained`: no transcript within reach claims it (a tool process outside any session, a
 *     background job, a finished worker older than `FINISHED_HORIZON_MS`, 6 hours: its parent is long
 *     past that turn). Nobody can be told to commit it, so it blocks nobody; it is surfaced on every turn
 *     and recorded (`pending-ledger.mjs`) until someone commits it with an explicit pathspec.
 * With no session id in the payload, "other" cannot be told from "mine", so a main-session or finished
 * claim counts as `maker`: the safe direction.
 *
 * @es Qué significa una ruta sucia para la sesión cuyo turno termina: de quién es y si le toca commitearla.
 * Antes bloqueaba a TODA sesión salvo que un agente vivo la hubiera ESCRITO con `Edit`; lo cambiado por
 * shell o por un proceso no se atribuía y bloqueaba a todas hasta descartarlo (medido el 2026-10-01: tres
 * cierres de turno seguidos bloqueados por rutas ajenas). Regla del dueño: quien HACE un cambio lo
 * commitea el mismo turno; un bloqueo que no se puede saldar es ruido. RECLAMOS: un actor reclama una ruta
 * si su transcript la escribió con una llamada estructurada o corrió un shell cuya ventana contiene el
 * mtime. `maker` (la sesión principal de S la reclama, o un subagente TERMINADO de S —transcript de más de
 * 30 minutos—: su salida es de la sesión que lo delegó, que debe revisarla y commitearla con pathspec o
 * descartarla a propósito el mismo turno; bloquea solo a S); `theirs` (la reclama otra sesión principal o
 * subagente terminado, o un SUBAGENTE vivo, cuyo trabajo en curso nadie más commitea: no bloquea a nadie);
 * `unexplained` (nadie al alcance, p. ej. un worker terminado hace más de 6 horas: no bloquea; se avisa
 * cada turno y se registra). Sin id de sesión se cuenta como `maker`.
 */

import { writersOf } from './attribution.mjs';
import { withinWindow } from './shell-windows.mjs';

/**
 * Every actor claiming `dirtyPath`, as `[{ id, session, subagent, live }]`: those that wrote it, and those
 * that ran a shell call around `mtimeMs`. `dirtyPath` is the ABSOLUTE path in the checkout: a dirty file
 * in a checkout is changed by a write to THAT file, never by a write to the same relative path in another
 * worktree (which a relative match would blame on whoever edited the copy). WRITES OUTRANK WINDOWS: a
 * structured write names the maker exactly, a shell window only says who happened to be running a command
 * (measured on the real state 2026-10-01: a coordinator's long shell call overlapped the time a worker
 * wrote two files, and would have blamed the coordinator); windows speak only when no write does. A path
 * with no measurable time (`undefined`) is inside no window: every comparison with `undefined` is false.
 * @es Cada actor vivo que reclama `dirtyPath`, ABSOLUTA en el checkout: un fichero sucio lo cambia una
 * escritura a ESE fichero, nunca una a la misma ruta relativa en otro worktree. LAS ESCRITURAS PESAN MÁS
 * QUE LAS VENTANAS: una escritura estructurada nombra al autor; una ventana solo dice quién corría un
 * comando (medido en el estado real: un shell largo del coordinador coincidió con la escritura de un
 * worker y le habría culpado). Sin hora medible no cae en ninguna ventana.
 */
export function claimsOn(dirtyPath, mtimeMs, liveAgents) {
  const writers = writersOf(dirtyPath, liveAgents);
  const runners = [...liveAgents].filter(([, agent]) => withinWindow(agent.windows ?? [], mtimeMs)).map(([id, agent]) => ({ id, ...agent }));

  return (writers.length > 0 ? writers : runners).map(({ id, session, subagent, live }) => ({ id, session, subagent, live }));
}

/** Whether `claim` is a subagent that has stopped (its transcript is past the liveness window). @es Si `claim` es de un subagente que ya paró. */
const isFinishedWorker = (claim) => claim.subagent && !claim.live;

/** `'maker'`, `'theirs'` or `'unexplained'` for `claims` as seen by `sessionId`. @es El desenlace de `claims` visto por `sessionId`. */
export function ownershipVerdict(claims, sessionId) {
  const ofThisSession = (claim) => typeof sessionId !== 'string' || claim.session === sessionId;

  if (claims.some((claim) => !claim.subagent && ofThisSession(claim))) return 'maker';
  if (claims.some((claim) => claim.subagent && claim.live)) return 'theirs';
  if (claims.some((claim) => isFinishedWorker(claim) && ofThisSession(claim))) return 'maker';

  return claims.length === 0 ? 'unexplained' : 'theirs';
}

/** The ids of the finished workers of `sessionId` among `claims`: whose output a block names. @es Los ids de los workers terminados de `sessionId` entre `claims`. */
export function finishedWorkersOf(claims, sessionId) {
  return [...new Set(claims.filter((claim) => isFinishedWorker(claim) && claim.session === sessionId).map((claim) => claim.id))];
}
