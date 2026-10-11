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
function blockOutput({ marker, sessionId }) {
  const context = [
    `BACKLOG-GUARD TRIPPED on the phrase: "${marker}".`,
    `@es BACKLOG-GUARD SALTÓ por la frase: «${marker}».`,
    '',
    'Your final message announces a new pending item ("' + marker + '") and this turn saved nothing to the master backlog.',
    '@es Tu mensaje final anuncia un ítem pendiente nuevo («' + marker + '») y este turno no guardó nada en el backlog maestro.',
    '',
    'Do exactly ONE of these, then stop again:',
    '@es Hacé exactamente UNA de estas, y terminá de nuevo:',
    '',
    '  A) SAVE IT. Read the CURRENT master backlog first, then write the FULL revision back with the item added:',
    '     mem_save with topic_key "backlog/<milestone>-master", or mem_update on the master observation id,',
    '     or commit the versioned document: git commit -- <repo>/checklists/master-backlog.md',
    '     (also via node .../backup-repo.mjs commit … -- checklists/master-backlog.md).',
    '  @es A) GUARDALO. Leé primero el backlog maestro ACTUAL y reescribí la revisión COMPLETA con el ítem sumado:',
    '  @es    mem_save con topic_key "backlog/<hito>-master", o mem_update sobre el id de la observación maestra,',
    '  @es    o commiteá el documento versionado: git commit -- <repo>/checklists/master-backlog.md',
    '  @es    (también con node .../backup-repo.mjs commit … -- checklists/master-backlog.md).',
    '',
    '  B) DISMISS IT, with a reason that is written down:',
    '  @es B) DESCARTALO, con un motivo que queda escrito:',
    `       node "${DISMISS_CLI}" --session ${sessionId} --marker "${marker}" --reason "why this phrase is not a new pending item here"`,
    '',
    'This guard fires at most once per turn. @es Esta guardia salta como mucho una vez por turno.'
  ].join('\n');

  return {
    decision: 'block',
    reason: `backlog-guard: the turn announces a new pending item ("${marker}") with nothing saved to the master backlog. Save it or dismiss it with a reason. @es backlog-guard: el turno anuncia un ítem pendiente nuevo («${marker}») sin nada guardado en el backlog maestro. Guardalo o descartalo con un motivo.`,
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
