#!/usr/bin/env node
/**
 * `Stop` hook — backlog-guard. A turn whose final message ANNOUNCES something pending may not end
 * without that finding reaching the project's master backlog in engram.
 *
 * Owner directive, verbatim: «Apuntar esto y TODO lo que vaya saliendo más adelante directamente en el
 * backlog … y que esto se haga siempre, dejarlo como regla implementada»
 * (`~/.claude/rules/00-owner-mandates.md`, "Backlog maestro — todo hallazgo entra en el momento").
 * That instruction was already given and was still being satisfied by REMEMBERING it — the weakest
 * control this fleet has, and the exact shape `~/.claude/rules/20-lessons.md`'s own history exists to
 * close. This hook is the mechanism.
 *
 * THE DECISION lives in `decide.mjs`, entirely pure and dependency-injected, so the whole state space —
 * pending-phrase-and-no-save, pending-phrase-and-master-save, the near-miss of a save under a DIFFERENT
 * topic_key, a save from an earlier turn only, `stop_hook_active`, a malformed payload — is exercisable
 * without a live session (`selftest.mjs`). This file is the thin shim: stdin -> `decide()` -> stdout,
 * plus a journal so a real refusal is auditable evidence, never only a stdout line nobody kept.
 *
 * BOUNDED the same way every sibling Stop guard in this fleet is bounded:
 *   - `stop_hook_active` makes it fire at most once per turn;
 *   - any malfunction of its own — unreadable stdin, bad JSON, an fs error — exits 0 and lets the turn
 *     end, so this mechanism can never wedge a session on its own failure;
 *   - a DISMISS path (`dismiss.mjs`) records a stated reason, so a false positive from the heuristic
 *     marker set is logged rather than silently escaped.
 *
 * @es Hook `Stop` — backlog-guard. Un turno cuyo mensaje final ANUNCIA algo pendiente no puede terminar
 * sin que ese hallazgo llegue al backlog maestro del proyecto en engram. La decisión vive en
 * `decide.mjs`, pura e inyectable. Este fichero es el conducto fino: stdin -> `decide()` -> stdout, más
 * un journal para que una negativa real sea evidencia auditable. Acotado igual que toda guardia `Stop`
 * hermana: `stop_hook_active` la limita a una vez por turno, cualquier fallo propio sale 0 y deja
 * terminar, y un descarte (`dismiss.mjs`) registra el motivo de un falso positivo.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decide } from './decide.mjs';
import { stateDirectory } from './state.mjs';

const refusalsFile = () => path.join(stateDirectory(), 'refusals.jsonl');
const DISMISS_CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dismiss.mjs');

/** Appends one line, or gives up silently: a journal that cannot be written costs evidence, never a decision. @es Añade una línea o desiste en silencio. */
function journal(record) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(refusalsFile(), `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    /* a journal is evidence, never a precondition */
  }
}

/** The hook output that blocks the turn. @es La salida de hook que bloquea el turno. */
function blockOutput({ marker, sessionId, transcriptPath }) {
  const context = [
    `BACKLOG-GUARD TRIPPED on the phrase: "${marker}".`,
    '',
    'Your final message reads like it announces a finding, a defect, some debt, an owner decision left',
    'pending, or work still queued — and this turn ends with NOTHING saved to the project\'s master',
    'backlog. Owner directive: every such finding is saved to the master backlog IN THE SAME TURN it',
    'appears, never left only in chat, an agent report, or a loose note.',
    '',
    'This hook does NOT claim your finding is real or important. It cannot judge that. It only refuses',
    'to let an announced-pending finding leave the turn unsaved. Do exactly ONE of these, then stop',
    'again:',
    '',
    '  A) SAVE IT (default). Read the CURRENT master backlog first (topic_key ends `-master`, e.g.',
    '     `backlog/1.0.0-master` in b100-am-ui) with `mem_get_observation`, then write the FULL revision',
    '     back with the new finding added, without losing what was already there — either:',
    '',
    '       mem_save({ topic_key: "backlog/<milestone>-master", content: "<everything, old + new>", … })',
    '       mem_update({ id: <the master observation\'s own id>, content: "<everything, old + new>" })',
    '',
    '     `mem_update` is recognised too: this guard asks the engram store whether the updated id holds a',
    '     `-master` topic_key. If the store cannot be read, the turn is let through and the degradation is',
    '     journaled. @es `mem_update` también se reconoce: esta guardia pregunta al almacén de engram si',
    '     el id actualizado tiene un topic_key `-master`; si el almacén no se puede leer, el turno pasa y',
    '     la degradación queda en el journal.',
    '',
    '  B) DISMISS IT, with a reason that gets written down (not a silent escape — the dismissal log is',
    '     the only evidence that could ever justify narrowing the marker set):',
    '',
    `       node "${DISMISS_CLI}" --session ${sessionId} --marker "${marker}" \\`,
    '         --reason "why this phrase is not a real pending finding here"',
    '',
    'This guard fires at most once per turn. It will not fire again after this pass.'
  ].join('\n');

  return {
    decision: 'block',
    reason: `backlog-guard: the turn announces pending work ("${marker}") with nothing saved to the master backlog. Save it or dismiss it with a reason.`,
    hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context }
  };
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el turno puede terminar. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra en su propio proceso. Un fallo propio deja pasar.
 */
export function evaluate(raw) {
  let payload;

  try {
    // PowerShell 5.1 prepends a UTF-8 BOM (U+FEFF) when it pipes a string into a native process, and
    // `JSON.parse` rejects it — the same measured trap `turn-guard.mjs` and `handback-gate.mjs` both
    // document and strip.
    // @es PowerShell 5.1 antepone un BOM UTF-8; `JSON.parse` lo rechaza sin este recorte.
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined; // a malformed payload never blocks a turn
  }

  let finding;

  try {
    finding = decide(payload, {
      reportDegraded: ({ errors }) => journal({ at: new Date().toISOString(), session: payload?.session_id, kind: 'store-unreadable-fail-open', errors, transcript: payload?.transcript_path })
    });
  } catch {
    return undefined; // fail open: a malfunction here must never silence a turn ending
  }

  if (finding === undefined) return undefined;

  journal({ at: new Date().toISOString(), session: finding.sessionId, marker: finding.marker, transcript: finding.transcriptPath });

  return blockOutput(finding);
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));

  process.exit(0);
}

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre:
// leería el stdin del importador y lo cortaría con process.exit(0) a mitad de camino.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
