#!/usr/bin/env node
/**
 * `Stop` hook — integrated-worktree-guard. The main session may not end a turn while a linked worktree of a
 * repository it worked in is INTEGRATED, holds nothing, and no live actor holds: the turn is refused once
 * with the two commands that remove it. It never removes anything itself.
 *
 * WHY IT EXISTS. The owner's rule (2026-10-01, "Cierre de toda unidad de trabajo terminada", item 2) says a
 * finished unit's worktree and branch are removed once their content is integrated, measured with `git
 * cherry`. Prose did not keep that rule: integrated worktrees accumulate until somebody lists them, and
 * every one keeps a branch, a directory and, on Windows, a junction that a careless delete follows. The turn
 * boundary of the main session is the one place every session passes, so the rule is mechanised there.
 *
 * WHAT IT DECIDES (the verdicts live in `worktree-census.mjs`):
 *   - REFUSE: clean (ignored files included, links apart), every commit of its branch already in its
 *     integration base, not held by a live actor (`agent-liveness/liveness.mjs`, the shared check: a
 *     transcript written in the last 30 minutes), and not the directory this session stands in.
 *   - ALLOW and say nothing: unintegrated; live; the main checkout (never listed).
 *   - ALLOW with a NON-BLOCKING notice: stranded work (a dirty worktree nobody holds) and worktrees it
 *     could not judge, with the reason; both are named in the refusal too when one fires.
 *   - It fires on `Stop` only and never for a subagent: a worker's own turn end is not the moment to
 *     decide what the fleet leaves behind.
 *   - AT MOST ONCE per session and set of worktrees (`noticed-sets.mjs`): cleared by being SEEN.
 *
 * WHICH WORKTREES: the ones THIS session owns, read from its transcript's tool calls
 * (`session-repositories.mjs`): it created them or worked inside them. Visiting the main checkout of a
 * repository owns none of its worktrees. The hook's own `cwd` adds nothing: a worktree it stands in is held.
 *
 * FAILS OPEN on every malfunction of its own and records each in `state/observed.jsonl`: a guard able to
 * wedge a session is a larger hazard than the clutter it removes, and a silent failure is indistinguishable
 * from a clean fleet.
 *
 * @es Hook `Stop`. La sesión principal no puede terminar un turno mientras un worktree enlazado de un repo
 * en que trabajó esté INTEGRADO, sin nada que perder y sin actor vivo: el turno se rechaza una vez con los
 * dos comandos que lo quitan. Nunca quita nada. Existe porque la regla del dueño (cierre de toda unidad
 * terminada, punto 2) no se sostuvo con prosa. Rechaza: limpio, integrado por `git cherry`, sin actor vivo y
 * que no sea el directorio de esta sesión. Permite en silencio: no integrado, vivo, checkout principal.
 * Permite con aviso NO bloqueante: trabajo varado y worktrees que no pudo juzgar. Solo en `Stop`, nunca
 * para un subagente. Como mucho UNA vez por sesión y conjunto. Falla ABIERTO y lo registra.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { activeOwner, agentRecords } from '../agent-liveness/liveness.mjs';
import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { stateDir as stateDirOf } from '../hook-state/locations.mjs';
import { alreadyShown, markShown } from './noticed-sets.mjs';
import { noticeText, refusalText } from './report.mjs';
import { repositoriesWorkedIn } from './session-repositories.mjs';
import { censusOf } from './worktree-census.mjs';

/** Where the guard keeps what each session has been shown and its own evidence. @es Dónde guarda lo que se mostró a cada sesión y su evidencia. */
export const defaultStateDir = () => stateDirOf('integrated-worktree-guard');

/** Countable evidence that the guard ran, and of anything that went wrong inside it. @es Evidencia contable de cada ejecución. */
function note(stateDir, record) {
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(path.join(stateDir, 'observed.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/** Whether `directory` is `parent` or lies inside it. @es Si `directory` es `parent` o está dentro. */
function isInside(parent, directory) {
  const relative = path.relative(path.resolve(parent), path.resolve(directory));

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The liveness question, answered by the shared check, with the agent store read once and only when asked.
 * @es La pregunta de vivacidad, respondida por el check compartido, leyendo el almacén de agentes una sola vez y solo si se pregunta.
 */
export function sharedLiveness(projectsRoot) {
  let records;

  return (worktreePath) => {
    records ??= agentRecords(projectsRoot);

    return activeOwner(worktreePath, records) !== undefined;
  };
}

/** One identity for a set of verdicts, order-independent. @es Una identidad para un conjunto de veredictos. */
const fingerprintOf = (verdicts) => verdicts.map((verdict) => `${verdict.kind}|${verdict.path}|${verdict.branch ?? ''}`).sort().join('\n');

/**
 * Decides one `Stop` event. Returns the hook output, or `undefined` to allow silently.
 * @es Decide un evento `Stop`. Devuelve la salida del hook, o `undefined` para dejar pasar.
 */
export function decide(payload, { stateDir = defaultStateDir(), isLive = sharedLiveness(), now = Date.now() } = {}) {
  if (payload?.stop_hook_active === true) return undefined;
  if (isSubagentCaller(payload) || payload?.hook_event_name === 'SubagentStop') return undefined;

  const standingIn = typeof payload?.cwd === 'string' ? payload.cwd : undefined;
  const { repositories, ownsWorktree, transcriptRead } = repositoriesWorkedIn({ transcriptPath: payload?.transcript_path });

  if (!transcriptRead) note(stateDir, { event: 'transcript-unread', transcript: payload?.transcript_path ?? null });

  const holdsSession = (worktreePath) => (standingIn !== undefined && isInside(worktreePath, standingIn)) || isLive(worktreePath);
  const removable = [];
  const stranded = [];
  const skipped = [];

  for (const main of repositories) {
    const verdicts = censusOf(main, { isLive: holdsSession, owns: ownsWorktree });

    if (verdicts === undefined) {
      note(stateDir, { event: 'unmeasured', repository: main });
      continue;
    }

    for (const verdict of verdicts) {
      if (verdict.kind === 'removable') removable.push({ ...verdict, main });
      else if (verdict.kind === 'stranded') stranded.push(verdict);
      else if (verdict.kind === 'skipped') skipped.push(verdict);
    }
  }

  if (removable.length + stranded.length + skipped.length === 0) {
    note(stateDir, { event: 'clean', repositories: repositories.length });
    return undefined;
  }

  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : 'unknown';
  const fingerprint = fingerprintOf([...removable, ...stranded, ...skipped]);

  if (alreadyShown(stateDir, sessionId, fingerprint)) {
    note(stateDir, { event: 'already-shown', session: sessionId });
    return undefined;
  }

  if (!markShown(stateDir, sessionId, fingerprint, now)) {
    note(stateDir, { event: 'malfunction', stage: 'record-shown' });
    return undefined;
  }

  if (removable.length > 0) {
    note(stateDir, { event: 'block', session: sessionId, worktrees: removable.map((item) => item.path) });

    return { decision: 'block', reason: refusalText(removable, { stranded, skipped }) };
  }

  note(stateDir, { event: 'notice', session: sessionId, stranded: stranded.length, skipped: skipped.length });

  return { systemMessage: noticeText({ stranded, skipped }) };
}

/**
 * The hook output for a raw `Stop` payload, or `undefined` if the turn may end. Exported so the dispatcher
 * can run it in its own process. A failure of its own allows and is recorded.
 * @es La salida de hook para un payload `Stop` crudo, o `undefined` si el turno puede terminar. Un fallo propio deja pasar y queda anotado.
 */
export function evaluate(raw) {
  try {
    return decide(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));
  } catch (error) {
    note(defaultStateDir(), { event: 'malfunction', stage: 'payload', error: error instanceof Error ? error.message : String(error), rawLength: raw.length });

    return undefined;
  }
}

function run() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) process.stdout.write(JSON.stringify(output));
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) run();
