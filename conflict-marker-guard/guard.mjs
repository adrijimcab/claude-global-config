#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — conflict-marker-guard. Refuses `git rebase|merge|cherry-pick|am
 * --continue` and `git commit`, for ANY caller (the main session and every delegated agent), while what the
 * step would commit still holds a leftover conflict marker. The decision is in `decide.mjs`, the git questions
 * in `probe.mjs`, the definition of a marker in `markers.mjs`; this file is the thin shim: stdin -> decision ->
 * a bilingual refusal -> stdout, plus the journal. It FAILS OPEN, journaled, whenever git cannot answer.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell: rechaza `git rebase|merge|cherry-pick|am --continue` y
 * `git commit`, para CUALQUIER llamador (la sesión principal y todo agente delegado), mientras lo que ese paso
 * commitearía lleve una marca de conflicto olvidada. La decisión vive en `decide.mjs`, las preguntas a git en
 * `probe.mjs`, la definición de marca en `markers.mjs`; esto es el conducto fino más el journal. Falla ABIERTO,
 * con registro, cuando git no puede responder.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { decideFor } from './decide.mjs';

/** How many conflicts the refusal lists before it counts the rest. @es Cuántos conflictos lista el rechazo antes de contar el resto. */
const LISTED_CONFLICTS = 8;

const describe = ({ path: file, line, kinds, unreadable }) => (unreadable === undefined ? `${file}:${line} (${kinds.join(' ')})` : `${file} (unreadable: ${unreadable}; git lists it as unmerged / ilegible: ${unreadable}; git lo lista sin fusionar)`);

/** The bilingual refusal for one offending step. @es La negativa bilingüe para un paso infractor. */
export function refusalText({ text, directory, conflicts }) {
  const listed = conflicts.slice(0, LISTED_CONFLICTS).map((conflict) => `  - ${describe(conflict)}`);
  const rest = conflicts.length > LISTED_CONFLICTS ? [`  - ... and ${conflicts.length - LISTED_CONFLICTS} more`] : [];
  const resto = conflicts.length > LISTED_CONFLICTS ? [`  - ... y ${conflicts.length - LISTED_CONFLICTS} más`] : [];

  return [
    `CONFLICT-MARKER GUARD REFUSED this command: \`${text}\` would commit a leftover conflict marker in ${directory}:`,
    ...listed,
    ...rest,
    '',
    'WHY. A marker (`<<<<<<<`, `=======`, `>>>>>>>`) in a commit is a conflict nobody resolved. Measured 2026-10-25: a check',
    'chained with `;` before `git add && git rebase --continue` printed its warning and the chain ran anyway; the marker rode',
    'ten commits before anyone saw it. This guard checks at the step that commits, so no chain can skip it.',
    '',
    'USE INSTEAD: open the file at that line, resolve the conflict (keep the intended side, delete all three marker lines),',
    '`git add` the file, then retry. A file git still lists as unmerged counts with ONE marker of any kind, or when it cannot be read.',
    'If a marker is data on purpose, declare its path prefix in conflict-marker-guard/fixture-paths.json (never valid for an unmerged file).',
    '',
    `@es CONFLICT-MARKER GUARD RECHAZÓ este comando: \`${text}\` commitearía una marca de conflicto olvidada en ${directory}:`,
    ...listed,
    ...resto,
    '',
    'POR QUÉ. Una marca (`<<<<<<<`, `=======`, `>>>>>>>`) en un commit es un conflicto que nadie resolvió. Medido el 2026-10-25:',
    'un chequeo encadenado con `;` antes de `git add && git rebase --continue` mostró su aviso y la cadena siguió; la marca',
    'viajó diez commits sin que nadie la viera. Esta guardia comprueba en el paso que commitea, así que ninguna cadena la salta.',
    '',
    'USAR EN SU LUGAR: abrir el fichero en esa línea, resolver el conflicto (quedarse con el lado correcto y borrar las tres',
    'líneas de marca), hacer `git add` del fichero y reintentar. Un fichero que git aún lista sin fusionar cuenta con UNA',
    'marca de cualquier tipo, o si no se puede leer. Si una marca es un dato a propósito, declara su prefijo de ruta en',
    'conflict-marker-guard/fixture-paths.json (nunca vale para un fichero sin fusionar).'
  ].join('\n');
}

/** Appends one line to the journal; the journal is evidence, never a precondition. @es Añade una línea al journal. */
function journal(entry) {
  try {
    const directory = stateDir('conflict-marker-guard');

    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, 'journal.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/**
 * The hook output for a raw payload, or `undefined` to allow. Exported for the dispatcher. Fails open.
 * @param options.run Replaces the git runner (a test seam). @es Sustituye al ejecutor de git.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Falla abierto.
 */
export function evaluate(raw, options = {}) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  let decision;

  try {
    decision = decideFor(payload, options);
  } catch (error) {
    journal({ verdict: 'fail-open', session: payload?.session_id, reason: error instanceof Error ? error.message.split('\n')[0] : String(error) });

    return undefined;
  }

  for (const failure of decision.failures) journal({ verdict: 'fail-open', session: payload?.session_id, directory: failure.directory, reason: failure.reason });

  if (decision.offender === undefined) return undefined;

  journal({ verdict: 'deny', session: payload?.session_id, directory: decision.offender.directory, conflicts: decision.offender.conflicts.length });

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(decision.offender) } };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return;
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
