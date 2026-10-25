#!/usr/bin/env node
/**
 * `PreToolUse` guard on EVERY tool — commit-cadence-guard. A DELEGATED agent that holds uncommitted work is told to
 * commit at the first window (default 15 minutes) and refused everything but committing and inspecting at the
 * second (default 30); the age resets the moment a commit lands. The orchestrator is never judged.
 *
 * WHY (lesson `worker-work-left-uncommitted-across-a-stop`, 3x). On 2026-10-25 eight delegated writers each held a
 * whole unit uncommitted for 25 to 60+ minutes although every brief told them to commit as they go. A rule in a
 * brief did not prevent it; this mechanism does: the cost of not committing is a refused tool call.
 *
 * HOW. `worktree-locator.mjs` finds the linked worktree the agent works in (the payload `cwd` is NOT it: measured),
 * `measure.mjs` asks git once per window and `holding-age.mjs` turns the answer into the oldest held change; the
 * per-agent state (`agent-state.mjs`) carries the arrival time, the worktree and the last measurement between
 * calls. Between two measurements the age keeps growing from the stored start, so the windows are exact while git
 * is asked at most once per `remeasureSeconds` per agent. A `git commit` the guard lets through drops the stored
 * measurement, so the very next call sees the commit and the refusal lifts at once.
 *
 * FAILS OPEN, JOURNALED, on every malfunction of its own (unreadable state, a git error or timeout, a crash): a
 * guard that can wedge every worker is a larger hazard than the one it names.
 *
 * @es Guardia `PreToolUse` sobre TODA herramienta. A un agente DELEGADO con trabajo sin commitear se le avisa en la
 * primera ventana (15 minutos por defecto) y se le rechaza todo salvo commitear e inspeccionar en la segunda (30);
 * la edad se reinicia en cuanto aterriza un commit. El orquestador nunca es juzgado. POR QUÉ: el 2026-10-25 ocho
 * writers delegados sostuvieron una unidad entera sin commitear de 25 a más de 60 minutos pese a que cada brief
 * decía que commitearan a medida; una regla en el brief no lo evitó, este mecanismo sí. CÓMO: el localizador halla
 * el worktree enlazado (el `cwd` del payload NO lo es: medido), `measure.mjs` consulta a git una vez por ventana y
 * el estado por agente conserva llegada, worktree y última medición. Entre mediciones la edad sigue creciendo desde
 * el inicio guardado; un `git commit` permitido borra la medición y la negativa se levanta al instante. FALLA
 * ABIERTO, con registro, ante cualquier avería propia.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { advise, deny, hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { mechanismStateDir, readAgentState, stateKey, writeAgentState } from './agent-state.mjs';
import { loadConfig } from './config.mjs';
import { measureHeld } from './measure.mjs';
import { noticeText, refusalText } from './messages.mjs';
import { allowedUnderRefusal, commitsIn } from './refusal-allowance.mjs';
import { findLinkedWorktree } from './worktree-locator.mjs';

/** Appends one line of evidence; never a precondition. @es Añade una línea de evidencia; nunca una precondición. */
function journal(entry, now) {
  try {
    const directory = mechanismStateDir();

    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, 'journal.jsonl'), `${JSON.stringify({ at: new Date(now).toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/**
 * The state of this call: the stored one, with the worktree found when it is not known yet. Discovery is itself
 * throttled to one attempt per window, so an agent whose worktree cannot be found costs no git.
 * @es El estado de esta llamada: el guardado, con el worktree hallado si aún no se conoce; el hallazgo se limita
 * a un intento por ventana.
 */
function stateFor(key, payload, { now, config, locate }) {
  const stored = readAgentState(key) ?? { arrivalMs: now };

  if (stored.worktree !== undefined) return stored;
  if (now - (stored.searchedAtMs ?? 0) < config.remeasureMs) return stored;

  const worktree = locate(payload);

  return { ...stored, worktree, searchedAtMs: now };
}

/**
 * The held paths for this call and whether they were measured now: from the stored measurement while it is
 * fresh, else from git. A failed measurement is journaled and stored as "nothing held" so git is not hammered.
 * @es Las rutas sostenidas y si se midieron ahora: de la medición guardada mientras es fresca, si no de git.
 */
function heldFor(state, { now, config, measure }) {
  if (now - (state.measuredAtMs ?? 0) < config.remeasureMs) return { held: state.held ?? [], fresh: false, state };

  const answer = measure(state.worktree, state.arrivalMs);

  if (!answer.ok) {
    journal({ verdict: 'fail-open', worktree: state.worktree, reason: answer.reason }, now);

    // The worktree may be gone: forget it so the next window looks again. @es El worktree puede haber desaparecido: se olvida.
    return { held: [], fresh: false, state: { ...state, worktree: undefined, searchedAtMs: now, measuredAtMs: now, held: [] } };
  }

  return { held: answer.held, fresh: true, state: { ...state, measuredAtMs: now, held: answer.held } };
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow. Exported for the dispatcher. `deps` are
 * the seams a selftest replaces: the clock, the config, the worktree locator and the git measurement.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. `deps` son las costuras de un selftest.
 */
export function evaluate(raw, deps = {}) {
  const payload = tryParsePayload(raw);

  // A delegated agent is a payload that carries an `agent_id` (the orchestrator's never does: measured on a live
  // run on 2026-10-25 and on the 3,040-payload corpus of `hook-caller`). Without a plain id there is nothing to
  // key the state on, so the call is not judged.
  // @es Un agente delegado es un payload con `agent_id` (el del orquestador nunca lo trae: medido). Sin un id
  // simple no hay con qué clavar el estado y la llamada no se juzga.
  const key = stateKey(payload?.agent_id);

  if (key === undefined) return undefined;

  const now = (deps.now ?? Date.now)();

  try {
    const context = { now, config: deps.config ?? loadConfig(), locate: deps.locate ?? findLinkedWorktree, measure: deps.measure ?? measureHeld };
    const state = stateFor(key, payload, context);

    if (state.worktree === undefined) {
      writeAgentState(key, state);

      return undefined;
    }

    const committing = commitsIn(payload);
    const measured = heldFor(state, context);

    // A commit line is judged like any other (it passes the refusal only through its allowance), and then the stored
    // measurement is dropped so the call after the commit sees it. @es Una línea de commit se juzga como cualquier
    // otra y luego se borra la medición guardada para que la llamada siguiente vea el commit.
    writeAgentState(key, committing ? { ...measured.state, measuredAtMs: undefined, held: undefined } : measured.state);

    if (measured.held.length === 0) return undefined;

    const age = now - measured.held[0].sinceMs;

    if (age >= context.config.refuseMs) {
      if (allowedUnderRefusal(payload)) return undefined;

      journal({ verdict: 'deny', tool: payload.tool_name, worktree: state.worktree, ageMs: age }, now);

      return deny(refusalText({ held: measured.held, now, config: context.config, toolName: payload.tool_name }));
    }

    if (age >= context.config.noticeMs && measured.fresh) return advise(noticeText({ held: measured.held, now, config: context.config }));

    return undefined;
  } catch (error) {
    journal({ verdict: 'fail-open', reason: error instanceof Error ? error.message.split('\n')[0] : String(error) }, now);

    return undefined;
  }
}

runWhenMain(import.meta.url, hookMain((raw) => evaluate(raw)));
