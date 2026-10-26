#!/usr/bin/env node
/**
 * `Stop` hook — a stash on this clone's stack cannot go unnoticed: the first time a session tries to end
 * a turn while the stack holds entries it has not been shown, the turn is refused once with a report of
 * what every stash holds.
 *
 * WHAT HAPPENED, three times. Task #40 triaged four stashes and closed. Two more accumulated, and one
 * outlived the worktree that made it (task #129). While #129 was being settled a THIRD appeared —
 * `279cf467`, a counter and deck resync parked on 2026-09-09 — and sat on the stack for eighteen days
 * until a reconciliation happened to list it. Every one of them was found by somebody looking, never by
 * a mechanism, and a one-off triage does not hold a class closed.
 *
 * WHY A STASH IS INVISIBLE BY CONSTRUCTION. It is not in `git status`, not in `git log`, not in any
 * branch listing, and it belongs to no worktree: `refs/stash` lives in the common git directory, so a
 * stash made in an agent's worktree survives that worktree's removal with nothing pointing at it. It is
 * also local, per-clone state that never reaches CI, so no repository gate can see one either. That
 * makes this fleet hygiene, and the orchestrator's turn boundary is the one place every session passes.
 *
 * WHAT IT DECIDES, and what it deliberately does not.
 *   - It fires on `Stop` only — the orchestrator's turn — never on `SubagentStop`: a worker may stash
 *     for a moment mid-task, and the actor who can decide what a parked stash is worth is the one who
 *     sees the whole fleet.
 *   - It refuses ONCE per session for a given set of stashes. Once shown, that set counts as noticed
 *     and later turns pass; a NEW stash changes the set and is shown again; a NEW session has seen
 *     nothing and is shown again. So the refusal is cleared by being SEEN, not by an action. That is
 *     the honest scope: noticing is mechanised, triage is not, because whether a stash is worth keeping
 *     is a judgement about its content that no script can make.
 *   - It ignores a stash younger than `SETTLE_WINDOW_MS`, by the stash's own commit time and never by its
 *     message: a commit hook parks one for the length of a commit. A young stash is not marked as shown, so
 *     a later `Stop` reports it if it is still there. @es Ignora un stash más joven que la ventana, por su
 *     propia fecha y nunca por su mensaje; no lo marca como mostrado.
 *   - The tradeoff, stated: a stash somebody chose to keep is re-reported at the start of every
 *     session. That is intended — the stack is supposed to be empty, and a stash that is kept on
 *     purpose should be kept as a `reaped/` tag or a branch, where it is visible and cannot be dropped
 *     by accident.
 *
 * FAILS OPEN on every malfunction of its own — an unreadable payload, a git failure, a state file it
 * cannot write — and records each in `state/observed.jsonl`: a guard able to wedge a session is a larger
 * hazard than the one it closes, and a guard that fails silently is indistinguishable from a clean stack.
 *
 * @es Hook `Stop`: un stash en la pila del clon no puede pasar desapercibido. La primera vez que una
 * sesión intenta terminar un turno con entradas que no se le han mostrado, el turno se rechaza UNA vez
 * con lo que contiene cada stash. #40 trió cuatro y cerró; aparecieron dos más (#129) y luego un tercero,
 * `279cf467`, que pasó dieciocho días en la pila. Todos los encontró alguien mirando, ninguno un
 * mecanismo. Un stash es invisible por construcción: no sale en `git status`, ni en `git log`, ni en
 * ramas, y no pertenece a ningún worktree (`refs/stash` vive en el directorio git común). Sólo en `Stop`
 * (el orquestador), nunca en `SubagentStop`. Rechaza una vez por sesión y conjunto de stashes: se despeja
 * al VERLO, no con una acción, porque decidir si un stash vale algo es un juicio sobre su contenido.
 * FALLA ABIERTO ante cualquier avería propia, y la registra.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { blockStop, hookMain, parseFailureMessage, parsePayload, runWhenMain } from '../hook-io/hook-io.mjs';
import { stateDir as stateDirOf } from '../hook-state/locations.mjs';
import { describeStashes } from './report.mjs';
import { stashInventory } from './stashes.mjs';

/**
 * Where the guard keeps what each session has been shown, and its own evidence, resolved at each call through
 * the one state-location module (a selftest redirects it with `HOOK_STATE_DIR`).
 * @es Estado y evidencia del guard, resueltos en cada llamada por el único módulo de ubicaciones (un selftest
 * lo redirige con `HOOK_STATE_DIR`).
 */
export const defaultStateDir = () => stateDirOf('stash-watch');

const noticedPath = (stateDir) => path.join(stateDir, 'noticed.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Countable evidence that the guard ran, and of anything that went wrong inside it. @es Evidencia contable de cada ejecución. */
function note(stateDir, record) {
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(path.join(stateDir, 'observed.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/** One identity for a set of stashes: their commits, order-independent. @es Una identidad para un conjunto de stashes. */
export const fingerprint = (stashes) => stashes.map((stash) => stash.sha).sort().join(',');

/** The repository whose stack is read: the project the harness names, else the session's cwd. @es El repo cuya pila se lee. */
function repositoryOf(payload) {
  return process.env.CLAUDE_PROJECT_DIR ?? (typeof payload?.cwd === 'string' ? payload.cwd : process.cwd());
}

/**
 * How old a stash must be, measured from its own commit time, before the guard reports it: 10 minutes. A
 * commit hook (lint-staged) parks a stash for the length of one commit, which on this machine is minutes at
 * most (pre-commit typecheck plus lint-staged), then drops it. Younger stashes are neither reported nor marked
 * as shown, so a later `Stop` reports one that survives. The message is never consulted: a stash is judged by
 * what it holds.
 * @es Antigüedad mínima de un stash, medida desde su propio commit, para que el guard lo informe: 10 minutos.
 * Un hook de commit (lint-staged) aparca un stash lo que dura un commit (minutos como mucho) y lo descarta.
 * Los más jóvenes no se informan ni se marcan como mostrados; un `Stop` posterior informa el que sobreviva.
 * Nunca se mira el mensaje: un stash se juzga por lo que contiene.
 */
export const SETTLE_WINDOW_MS = 10 * 60 * 1000;

/** Sessions remembered at most; older ones are forgotten so the state file stays bounded. @es Sesiones recordadas como máximo. */
const REMEMBERED_SESSIONS = 100;

/** `noticed` plus this session's set, keeping only the most recent sessions. @es `noticed` más esta sesión, acotado. */
function remember(noticed, sessionId, seen, now) {
  const entries = Object.entries({ ...noticed, [sessionId]: { seen, at: now } })
    .filter(([, entry]) => typeof entry?.seen === 'string')
    .sort(([, a], [, b]) => Number(b.at ?? 0) - Number(a.at ?? 0))
    .slice(0, REMEMBERED_SESSIONS);

  return Object.fromEntries(entries);
}

export function reason(stashes, now = Date.now()) {
  return [
    `STASH-WATCH: this clone's stash stack holds ${stashes.length} entr${stashes.length === 1 ? 'y' : 'ies'} this session has not been shown.`,
    '',
    ...describeStashes(stashes, now),
    '',
    'A stash is invisible by construction: it is in no `git status`, no `git log`, no branch, and it',
    'belongs to no worktree, so it outlives the one that made it. Three stashes sat in limbo this way',
    '(#40, #129, and `279cf467` for eighteen days), each found by somebody looking.',
    '',
    'Judge it by what it HOLDS, never by its message — `ac84-baseline-probe` read like a throwaway and',
    'held 257 insertions across two hooks. For each entry:',
    '  - read it:                  git stash show -p --include-untracked <ref>',
    '  - already in the tree?      git stash show -p <ref> | git apply -R --check -   (exit 0 = yes)',
    '  - made on `worktree-agent-*`? that agent may still be using it: check it is stopped first.',
    '  - keep it:   git stash branch <new-branch> <ref>   (own branch, then cherry-pick as usual)',
    '  - retire it: git tag reaped/stash-<name> <sha>  THEN  git stash drop <ref>   (never drop bare)',
    '',
    'Say in your reply which stashes exist and what you decided. This refusal fires once per session',
    'for this set of stashes; a new stash is shown again.',
  ].join('\n');
}

/**
 * Decides one `Stop` event. Returns the hook output object, or `undefined` to allow silently.
 * @es Decide un evento `Stop`. Devuelve la salida del hook, o `undefined` para dejar pasar.
 */
export function decide(payload, { repoRoot = repositoryOf(payload), stateDir = defaultStateDir(), now = Date.now() } = {}) {
  // Already refused once in this stop sequence: never twice.
  if (payload?.stop_hook_active === true) return undefined;

  const inventory = stashInventory(repoRoot);

  if (!inventory.measured) {
    note(stateDir, { event: 'unmeasured', repoRoot, reason: inventory.reason });
    return undefined;
  }

  if (inventory.stashes.length === 0) {
    note(stateDir, { event: 'clean', repoRoot });
    return undefined;
  }

  // Only stashes past the settle window are judged; a young one is neither reported nor part of what is
  // recorded as shown, so it is still unshown at a later Stop.
  // @es Sólo se juzgan los stashes que pasaron la ventana; uno joven ni se informa ni entra en lo que se
  // registra como mostrado, así que sigue sin mostrarse en un `Stop` posterior.
  const settled = inventory.stashes.filter((stash) => now - stash.createdAt.getTime() >= SETTLE_WINDOW_MS);

  if (settled.length === 0) {
    note(stateDir, { event: 'settling', repoRoot, stashes: inventory.stashes.length });
    return undefined;
  }

  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : 'unknown';
  const seen = fingerprint(settled);
  const file = noticedPath(stateDir);
  const noticed = readJson(file, {});

  if (noticed[sessionId]?.seen === seen) {
    note(stateDir, { event: 'already-noticed', session: sessionId, stashes: inventory.stashes.length });
    return undefined;
  }

  // Recorded BEFORE refusing, and a failure to record allows: without the record this refusal could
  // not stay at once-per-session, and a refusal that repeats every turn wedges the session.
  // @es Se registra ANTES de rechazar; si no se puede registrar, deja pasar: sin registro el rechazo no
  // podría quedarse en una vez por sesión, y uno que se repite cada turno atasca la sesión.
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(file, JSON.stringify(remember(noticed, sessionId, seen, now)), 'utf8');
  } catch (error) {
    note(stateDir, { event: 'malfunction', stage: 'record-noticed', error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }

  note(stateDir, { event: 'block', session: sessionId, stashes: settled.map((stash) => stash.sha) });

  return blockStop(reason(settled, now));
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un fallo propio deja pasar y
 * queda anotado.
 */
export function evaluate(raw) {
  try {
    return decide(parsePayload(raw), { stateDir: defaultStateDir() });
  } catch (error) {
    note(defaultStateDir(), { event: 'malfunction', stage: 'payload', error: parseFailureMessage(error), rawLength: raw.length });

    return undefined;
  }
}

runWhenMain(import.meta.url, hookMain(evaluate));
