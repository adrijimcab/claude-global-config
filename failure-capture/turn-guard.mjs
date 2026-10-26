#!/usr/bin/env node
/**
 * `Stop` / `SubagentStop` hook — the OBLIGATION half of the failure-capture loop.
 *
 * THE DEFECT IT CLOSES. Across one session the fleet got a series of things wrong — a stale exit-code
 * file read as a gate result (twice, by two workers independently), 184 non-worktree directories
 * "measured" by a command that failed so `wc -l` returned 0 and every one was reported clean, a gate
 * called RED before running the build its golden derives from, a lint rule cited as enforcement while
 * configured to permit exactly the violations at issue, 490 `mem_save` calls missing a required field.
 * Every one was caught by a human or by luck. The common root is not carelessness: a FAILED
 * MEASUREMENT IS INDISTINGUISHABLE FROM A CLEAN RESULT, and nothing forced the difference to be seen.
 *
 * THE HONEST SPLIT. A command hook cannot classify a mistake, and this one does not pretend to.
 *   - HEURISTIC : locating a candidate correction, by literal markers (`markers.mjs`). A hit is a
 *                 candidate, never a verdict — `grep localiza, NO dictamina`.
 *   - DETERMINISTIC : that the turn is ending; and whether a lesson was RECORDED before it ends.
 * So the hook never decides what was wrong. It decides that a turn which looks like it contained a
 * correction cannot END with that correction unrecorded — record it, or dismiss it with a stated
 * reason that is itself written down.
 *
 * BLOCKING IS THE POINT, AND IS BOUNDED. Sibling hooks here exit 0 on any trouble by design; this one
 * blocks, so the bound is explicit and belt-and-braces:
 *   - it blocks ONLY on its intended positive condition (marker present AND nothing recorded);
 *   - any malfunction — unreadable stdin, bad JSON, missing state, fs error — exits 0 and lets the
 *     turn end, so the mechanism can never wedge the fleet on its own failure;
 *   - `stop_hook_active` makes it fire at most once per turn, and a recorded per-session cooldown
 *     backs that up independently, so even a harness that never set that flag could not loop.
 *
 * RESUME-SAFE, WHICH THE INJECTOR IS NOT. `SendMessage` does not fire the `Task|Agent` matcher, so a
 * resumed worker gets no fresh contract injection. This mechanism does not ride on delegation-time
 * injection: `SubagentStop` fires every time a worker stops, resumed or not, so the obligation
 * survives exactly the path the injector misses.
 *
 * @es Hook `Stop`/`SubagentStop` — la mitad de OBLIGACIÓN del lazo. CIERRA: una MEDICIÓN FALLIDA es
 * INDISTINGUIBLE de un resultado limpio y nada obligaba a notar la diferencia. REPARTO HONESTO:
 * heurístico localizar el candidato (marcadores literales); determinista que el turno acaba y que se
 * registró o no la lección. No decide qué estuvo mal: decide que un turno que PARECE contener una
 * corrección no puede TERMINAR con ella sin registrar — registrar, o descartar con un motivo que
 * también queda escrito. BLOQUEA solo en su condición positiva; cualquier fallo propio sale 0 y deja
 * terminar. `SubagentStop` dispara aunque el worker se reanudara con `SendMessage`, que es justo el
 * camino que el inyector de delegación no cubre.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { findMarker } from './markers.mjs';
import { GLOBAL_SCOPE, projectOf } from './project.mjs';
import { cooldownFile, readJson, stampFile, writeJson } from './session-state.mjs';

/**
 * The project scope of `cwd`, as a list. A broken project config names no scope rather than failing the
 * turn: the capture CLI will name the broken file when it is run.
 * @es El alcance de proyecto de `cwd`; una config rota no nombra alcance en vez de romper el turno.
 */
function safeProjectScopes(cwd) {
  try {
    const project = projectOf(cwd);

    return project === undefined ? [] : [project.scope];
  } catch {
    return [];
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('failure-capture');
const CAPTURE_CLI = path.join(HERE, 'capture.mjs');

/** Independent anti-loop bound, in case `stop_hook_active` is ever absent. @es Cota antibucle independiente por si faltara `stop_hook_active`. */
const COOLDOWN_MS = 120_000;

/** Every failure is written where it can be counted; a guard error never blocks a turn. @es Todo fallo propio queda contado; nunca bloquea un turno. */
function recordError(error, raw) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(
      path.join(stateDirectory(), 'guard-errors.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error), rawLength: raw.length, firstCharCode: raw.length > 0 ? raw.charCodeAt(0) : undefined })}\n`,
      'utf8',
    );
  } catch {
    /* if even the error log cannot be written, allowing the turn is still the only safe move */
  }
}

/** Persists the cooldown of one scope in its own file; nothing else reads or writes it. @es Guarda el cooldown de un alcance en su propio fichero; nadie más lo lee ni lo escribe. */
function saveCooldown(scopeKey, value) {
  try {
    writeJson(cooldownFile(stateDirectory(), scopeKey), value);
  } catch {
    /* state is an optimisation; failing to persist it must never block a turn */
  }
}

/** The lesson keys already in use, so the block message can offer them without a second round-trip. @es Claves ya en uso, para ofrecerlas en el propio mensaje de bloqueo. */
function existingKeys(cwd) {
  try {
    return execFileSync(process.execPath, [CAPTURE_CLI, 'keys'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '(could not list existing keys)';
  }
}

/** The hook output that blocks the turn. @es La salida de hook que bloquea el turno. */
function blockOutput(marker, actor, sessionId, cwd) {
  // The capture CLI resolves the project from its own working directory, so the command is run there.
  // @es El CLI resuelve el proyecto desde su directorio de trabajo: el comando se corre allí.
  const scopes = [GLOBAL_SCOPE, ...safeProjectScopes(cwd)].join('|');

  const context = [
    `FAILURE-CAPTURE TRIPPED on the phrase: "${marker}".`,
    '',
    'Your final message reads like it contains a correction, a refutation, or a measurement that did',
    'not measure — and this turn ends with NOTHING recorded. That is the exact shape of the failures',
    'this loop exists for: they were each caught by a human or by luck, never by a mechanism, because',
    'a failed measurement is indistinguishable from a clean result unless someone is forced to look.',
    '',
    'This hook does NOT claim you made a mistake. It cannot judge that. It only refuses to let a',
    'candidate correction leave the turn unrecorded. Do exactly ONE of these, then stop again:',
    '',
    '  A) RECORD IT (default). One line, in the ledger format, keyed so recurrence is countable:',
    '',
    // A subshell, so the suggested command never moves the session's own directory (cwd-change-guard refuses a
    // bare `cd` in the main session). @es Un subshell, para que la orden sugerida no mueva el directorio de la sesión.
    `     ( cd "${cwd}" && node "${CAPTURE_CLI}" capture \\`,
    `       --key <lowercase-kebab-key> --scope <${scopes}> \\`,
    `       --actor ${actor} --session ${sessionId} \\`,
    '       --lesson "What went wrong -> root cause -> RULE to not repeat." )',
    '',
    '     REUSE an existing key when this is the SAME lesson as before — that is what makes the loop',
    '     able to see recurrence, and a recurrence is what promotes an incident into binding contract.',
    '',
    existingKeys(cwd),
    '',
    '  B) DISMISS IT, with a reason that gets written down (this is not a silent escape hatch — the',
    '     dismissal log is the only evidence that could ever justify tuning the markers):',
    '',
    `     node "${CAPTURE_CLI}" dismiss --session ${sessionId} --marker "${marker}" \\`,
    '       --reason "why this phrase is not a correction here"',
    '',
    'This guard fires at most once per turn. It will not fire again after this pass.',
  ].join('\n');

  return {
    decision: 'block',
    reason: `failure-capture: the turn contains a candidate correction ("${marker}") with nothing recorded. Record it or dismiss it with a reason.`,
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context },
  };
}

/** The decision over a parsed payload: the blocking output, or `undefined` to let the turn end. @es La decisión sobre un payload ya parseado. */
function decide(payload) {
  // Already blocked once this turn: the obligation has been raised. Never raise it twice.
  if (payload.stop_hook_active === true) return undefined;

  const message = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';

  if (message.trim().length === 0) return undefined;

  const marker = findMarker(message);

  if (marker === undefined) return undefined;

  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : 'unknown';
  const agentId = typeof payload.agent_id === 'string' ? payload.agent_id : undefined;
  const agentType = typeof payload.agent_type === 'string' ? payload.agent_type : undefined;
  const scopeKey = `${sessionId}|${agentId ?? 'orchestrator'}`;
  const now = Date.now();

  // Recorded already? The capture CLI stamps every capture and every dismissal. This is the
  // deterministic half of the decision: not "was there a mistake", but "was something written down".
  // @es ¿Ya registrado? El CLI sella cada captura y cada descarte. Esta es la mitad determinista.
  // Each session reads its OWN stamp and keeps its OWN cooldown, so no other live session can overwrite them.
  // @es Cada sesión lee SU sello y guarda SU cooldown, así que ninguna otra sesión viva puede pisarlos.
  const previous = readJson(cooldownFile(stateDirectory(), scopeKey), { blockedAt: 0, seenAt: 0 });
  const stamped = readJson(stampFile(stateDirectory(), sessionId), undefined);

  if (stamped !== undefined && Number(stamped.at) > Number(previous.seenAt)) {
    saveCooldown(scopeKey, { ...previous, seenAt: now });
    return undefined;
  }

  if (now - Number(previous.blockedAt) < COOLDOWN_MS) {
    saveCooldown(scopeKey, { ...previous, seenAt: now });
    return undefined;
  }

  saveCooldown(scopeKey, { blockedAt: now, seenAt: now });

  return blockOutput(marker, agentType === undefined ? 'orchestrator' : `worker:${agentType}`, sessionId, typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un fallo propio deja terminar el
 * turno, pero queda registrado en `guard-errors.jsonl`: fallar abierto, nunca fallar invisible.
 */
export function evaluate(raw) {
  try {
    // PowerShell 5.1 prepends a UTF-8 BOM (U+FEFF) when it pipes a string into a native process, and
    // `JSON.parse` rejects it. Measured, not assumed: piping this exact payload from PowerShell gave
    // `first char code: 65279` and `Unexpected token`. Without this the guard parsed nothing, fell into
    // the catch, and ALLOWED — a failed parse reading exactly like a clean turn, which is the very
    // defect this mechanism exists to close.
    // @es PowerShell 5.1 antepone un BOM UTF-8 y `JSON.parse` lo rechaza (medido: `first char code:
    // 65279`); sin esto el guard caía al catch y DEJABA PASAR en silencio.
    return decide(JSON.parse(raw.charCodeAt(0) === 0xfe_ff ? raw.slice(1) : raw));
  } catch (error) {
    recordError(error, raw);

    return undefined;
  }
}

function main() {
  let raw = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    const output = evaluate(raw);

    if (output !== undefined) process.stdout.write(JSON.stringify(output));
    process.exit(0);
  });
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
