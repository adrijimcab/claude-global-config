/**
 * THE DECISION — does gentle-ai's review stop hook run for this hook payload? It runs where a review can happen:
 * a LINKED worktree. In a repository's main checkout it stays silent.
 *
 * WHY. gentle-ai's hook compares the repository's unreviewed candidate with the session's baseline and, on Stop,
 * demands the selectorless STATUS preflight for any candidate the session did not start with. In this setup the main
 * checkout's candidate is the accumulated integration branch, so every landing creates a "new" candidate there and
 * blocks the turn of every session working in that checkout, while a unit is reviewed in its own worktree (ODD: the
 * candidate is a work-unit commit, never the accumulated branch). The rule that fixes this is the same one that
 * `review-cwd-guard` applies to the review commands: a review site is a linked worktree, never a main checkout; the
 * question itself belongs to `git-worktree/linked-worktree.mjs`.
 *
 * It never drops a review by accident: a payload it cannot read, and a directory git cannot classify, RUN the
 * original hook (`fail-open`). Only a directory git positively says is a main checkout is skipped.
 *
 * @es LA DECISIÓN: ¿corre el hook de parada de revisión de gentle-ai para este payload? Corre donde una revisión
 * puede ocurrir: un worktree ENLAZADO. En el checkout principal de un repositorio calla. POR QUÉ: el hook compara
 * el candidato sin revisar con la línea base de la sesión y, al parar, exige el STATUS previo para todo candidato
 * con el que la sesión no empezó. Aquí el candidato del checkout principal es la rama de integración acumulada, así
 * que cada aterrizaje crea uno «nuevo» y bloquea el turno de toda sesión de ese checkout, mientras una unidad se
 * revisa en su propio worktree. La regla es la que `review-cwd-guard` aplica a los comandos de revisión; la
 * pregunta es de `git-worktree/linked-worktree.mjs`. Nunca descarta una revisión por accidente: un payload ilegible
 * y un directorio que git no sabe clasificar CORREN el hook original (`fail-open`).
 */

import { isLinkedWorktree } from '../git-worktree/linked-worktree.mjs';
import { tryParsePayload } from '../hook-io/hook-io.mjs';

/** The payload as an object, or `undefined` when it is not a JSON object. @es El payload como objeto, o `undefined` si no es un objeto JSON. */
function parsePayload(raw) {
  const parsed = tryParsePayload(raw.toString('utf8'));

  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
}

/**
 * What to do with a raw hook payload: `{ run, reason, cwd?, event?, session?, detail? }`. `run` is whether gentle-ai's
 * hook must run. `isLinked` and `fallbackCwd` are seams for proofs.
 * @es Qué hacer con un payload crudo: `run` indica si el hook de gentle-ai debe correr.
 */
export function decide(raw, { isLinked = isLinkedWorktree, fallbackCwd = process.cwd() } = {}) {
  const payload = parsePayload(raw);

  if (payload === undefined) return { run: true, reason: 'unreadable-payload' };

  const identity = { event: payload.hook_event_name, session: payload.session_id };

  if (payload.cwd !== undefined && (typeof payload.cwd !== 'string' || payload.cwd === '')) return { run: true, reason: 'unreadable-payload', ...identity };

  const cwd = payload.cwd ?? fallbackCwd;

  try {
    return isLinked(cwd) ? { run: true, reason: 'linked-worktree', cwd, ...identity } : { run: false, reason: 'main-checkout', cwd, ...identity };
  } catch (error) {
    return { run: true, reason: 'fail-open', cwd, ...identity, detail: error instanceof Error ? error.message.split('\n')[0] : String(error) };
  }
}
