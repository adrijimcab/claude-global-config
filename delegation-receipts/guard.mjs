#!/usr/bin/env node
/**
 * `Stop` guard — a turn may not END with a delegation it reached for and never launched.
 *
 * THE INCIDENT, measured, mine, 2026-09-21. I called `Agent` to investigate the single gate blocking a
 * 64-commit release stack. The orphan-work guard REFUSED it — a `PreToolUse` denial, not a crash. I
 * then cleared the blocker legitimately, and went straight to composing my reply without re-issuing the
 * launch. I told the owner the investigation «va delegado». No launch receipt existed. The gate had
 * nobody working it for roughly an hour, and the owner's next question is what surfaced it; no control
 * did. It is in the transcript twice — `Agent` at 03:48:23 and 03:49:53, both refused, the owner's
 * question at 12:58:37, the real launch at 12:59:48.
 *
 * WHY A MECHANISM RATHER THAN A RULE. This is the seventh recurrence of the lesson keyed
 * worker-claim-about-unreachable-file-committed-as-fact. Its FOURTH FACE already says, in binding
 * contract text, that «a statement of what is running is assembled from receipts, never recited from
 * the plan». That text was in force during this incident and prevented nothing, which is the whole
 * finding: a contract is a warning, a mechanism is prevention.
 *
 * THE DECISION IT OWNS, in one sentence: **did every delegation this turn reached for actually get
 * launched?** Not "did the final message overclaim" — that is a heuristic over natural language and
 * would refuse honest turns. The receipts answer it, and they are mechanical (`turn-delegations.mjs`);
 * the ledger over them is arithmetic (`unlaunched.mjs`).
 *
 * BLOCKING IS THE POINT, AND IS BOUNDED, the same way the failure-capture turn guard is bounded:
 *   - it blocks ONLY on its positive condition — a refused delegation with nothing accounting for it;
 *   - every malfunction of its own (no transcript, unreadable payload, a throw anywhere) ALLOWS, so it
 *     can never wedge a session on its own failure, and the malfunction is written where it is
 *     countable rather than swallowed;
 *   - `stop_hook_active` bounds it to once per turn, and an independent per-session cooldown backs
 *     that up, so even a harness that never set that flag could not loop.
 *
 * THE RESIDUAL GAP, stated rather than hidden. Because it fires at most once per turn, an answer that
 * ignores the refusal and stops again will be allowed through on the second pass. The obligation is
 * raised, loudly and once; it is not a cage.
 *
 * @es Guard de `Stop`: un turno no puede TERMINAR con una delegación que intentó y nunca lanzó. EL
 * INCIDENTE (mío, 2026-09-21): el orphan-work guard rechazó un `Agent`, despejé el bloqueo y pasé a
 * redactar la respuesta sin reemitir el lanzamiento; le dije al propietario que «va delegado» sin que
 * existiera ningún recibo. Séptima recurrencia: el contrato YA lo decía y no lo evitó — un contrato
 * avisa, un mecanismo previene. DECIDE: ¿se lanzó de verdad cada delegación que el turno intentó?
 * BLOQUEA solo en su condición positiva; cualquier fallo propio DEJA PASAR (y queda registrado);
 * `stop_hook_active` más un enfriamiento por sesión lo acotan a una vez por turno.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { blockStop, parsePayload, readStdin, runWhenMain } from '../hook-io/hook-io.mjs';
import { abandonmentsFor, defaultStateDir } from './abandon.mjs';
import { delegationsInFinalTurn } from './turn-delegations.mjs';
import { unlaunchedDelegations } from './unlaunched.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ABANDON_CLI = path.join(HERE, 'abandon.mjs');

/** Independent anti-loop bound, in case `stop_hook_active` is ever absent. @es Cota antibucle independiente. */
const COOLDOWN_MS = 120_000;

const statePath = (stateDir) => path.join(stateDir, 'guard-state.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value), 'utf8');
  } catch {
    /* state is an optimisation; failing to persist it must never block a turn */
  }
}

/** Countable evidence that this guard ran, and of anything that went wrong inside it. @es Evidencia contable de que el guard corrió y de lo que falló dentro. */
function note(stateDir, record) {
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(path.join(stateDir, 'observed.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/**
 * The delegations this turn owes, or `undefined` when the question cannot be answered honestly.
 * `undefined` is not "none": the caller must allow on it, never treat it as a clean turn — a failed
 * measurement that reads like a clean result is the defect this fleet has mechanised against most.
 * @es Las delegaciones que el turno debe, o `undefined` si la pregunta no tiene respuesta honesta.
 * `undefined` NO es «ninguna»: quien llama debe dejar pasar, nunca leerlo como turno limpio.
 */
export function owedBy(payload, stateDir = defaultStateDir()) {
  // No second opinion on whether the transcript is readable: `delegationsInFinalTurn` owns that
  // question and answers `undefined` for a missing path, an unreadable file and a path that is not a
  // path alike. Re-asking it here would be a second answer that can drift from the first.
  // @es Sin segunda opinión sobre si el transcript es legible: esa pregunta la posee
  // `delegationsInFinalTurn`. Repetirla aquí sería una segunda respuesta que puede divergir.
  const attempts = delegationsInFinalTurn(payload?.transcript_path);

  if (attempts === undefined) return undefined;

  return unlaunchedDelegations(attempts, abandonmentsFor(payload?.session_id, stateDir));
}

function reason(owed, sessionId) {
  const listed = owed.map((attempt) => `  - ${attempt.tool}: ${attempt.label}\n      refused with: ${attempt.reason ?? '(no reason recorded)'}`);

  return [
    'DELEGATION-RECEIPTS: this turn reached for a delegation that never launched.',
    '',
    ...listed,
    '',
    'Each of those came back as an ERROR — a guard refusing it, a permission denied, an agent dying',
    'early — so no agent holds that errand, and nothing later in this turn accounts for it. The turn is',
    'about to end anyway.',
    '',
    'This is the shape of the incident that built this guard: a refusal was cleared legitimately, the',
    'reply was composed without re-issuing the launch, and the owner was told the work "va delegado".',
    'No launch receipt existed. The single gate blocking a 64-commit stack had nobody on it for an hour,',
    'and the owner\'s next question is what surfaced it. A refusal is silent by construction — it looks',
    'exactly like a step you already took.',
    '',
    'Do exactly ONE of these, then stop again:',
    '',
    '  A) LAUNCH IT (default). Re-issue the delegation now that the blocker is cleared — a fresh `Agent`,',
    '     or a `SendMessage` to the agent that already holds the errand. Either counts.',
    '',
    '  B) ABANDON IT DELIBERATELY, with a reason that gets written down. Sometimes the refusal was right',
    '     and the work should not happen; this is how you say so, and it is not a silent escape:',
    '',
    `     node "${ABANDON_CLI}" --session ${sessionId} \\`,
    '       --reason "why this delegation is not being re-issued"',
    '',
    'And then say what is TRUE in your reply. A statement of what is running is assembled from receipts,',
    'never recited from the plan.',
    '',
    'This guard reads receipts, never your prose: it pairs each delegation call to its result by id and',
    'counts. It never looks at what you wrote. Pairing a retry to its refusal is by COUNT and ORDER, so',
    'if you re-issued a different one of several, abandon the rest explicitly rather than by silence.',
    'It fires at most once per turn.',
  ].join('\n');
}

export function main(payload, stateDir = defaultStateDir(), now = Date.now()) {
  // Already raised once this turn: never raise it twice.
  if (payload?.stop_hook_active === true) return;

  const owed = owedBy(payload, stateDir);

  if (owed === undefined) {
    note(stateDir, { event: 'unknowable', session: payload?.session_id, keys: Object.keys(payload ?? {}) });
    return;
  }

  if (owed.length === 0) {
    note(stateDir, { event: 'allow', session: payload?.session_id });
    return;
  }

  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : 'unknown';
  const file = statePath(stateDir);
  const state = readJson(file, {});
  const previous = Number(state[sessionId]?.blockedAt ?? 0);

  if (now - previous < COOLDOWN_MS) {
    note(stateDir, { event: 'cooldown', session: sessionId, owed: owed.length });
    return;
  }

  writeJson(file, { ...state, [sessionId]: { blockedAt: now } });
  note(stateDir, { event: 'block', session: sessionId, owed: owed.map((attempt) => attempt.label) });

  return blockStop(reason(owed, sessionId));
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un fallo propio deja pasar, pero
 * queda anotado: nunca atasca la sesión, nunca calla.
 */
export function evaluate(raw) {
  try {
    // The port strips the UTF-8 BOM PowerShell 5.1 prepends when it pipes a string into a native process; without
    // it the guard would parse nothing, fall into the catch and ALLOW — a failed parse reading exactly like a
    // clean turn.
    // @es El puerto quita el BOM que antepone PowerShell 5.1; sin él el parseo falla y DEJA PASAR, que es
    // indistinguible de un turno limpio.
    return main(parsePayload(raw));
  } catch (error) {
    // A guard that throws must never wedge a session — but it must not do so invisibly either. A parse failure
    // is recorded with the parser's own message (the port keeps it as the error's cause).
    // @es Un guard que peta jamás debe atascar la sesión, pero tampoco callar. Un fallo de parseo se anota con el
    // mensaje propio del parser (el puerto lo guarda como causa del error).
    note(defaultStateDir(), { event: 'malfunction', error: error instanceof Error ? (error.cause ?? error).message : String(error), rawLength: raw.length });

    return undefined;
  }
}

async function run() {
  const output = evaluate(await readStdin());

  if (output !== undefined) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

runWhenMain(import.meta.url, run);
