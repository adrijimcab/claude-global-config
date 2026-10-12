#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — refuses `gentle-ai review <assess|start|status>` (gentle-ai v4;
 * `--cwd` defaults to the shell directory) run against a repository's main checkout and, as legacy, the retired
 * `gentle-ai sdd-attempt <acquire|settle|begin|record|finish> --cwd <main checkout>` (2.9.1), while a linked
 * worktree of that repository carries work. The decision is in `decide.mjs`; this file is the thin shim:
 * stdin -> decision -> a bilingual refusal -> stdout, plus a journal. It FAILS OPEN, journaled, on every
 * malfunction of its own (unreadable payload or repository).
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell: rechaza `gentle-ai review <assess|start|status>` (gentle-ai
 * v4; `--cwd` vale el directorio del shell por omisión) contra el checkout principal de un repositorio y, como
 * legado, el retirado `gentle-ai sdd-attempt ... --cwd <checkout principal>` (2.9.1), mientras un worktree
 * enlazado lleva trabajo. La decisión vive en `decide.mjs`; esto es el conducto fino. Falla ABIERTO, con
 * registro, ante cualquier fallo propio.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { offendingInvocationFor } from './decide.mjs';

const describe = ({ path: where, ahead, dirty }) => `${where} (${ahead} commit(s) ahead${dirty ? ', uncommitted changes' : ''})`;

/** The bilingual refusal for one offending invocation. @es La negativa bilingüe para una invocación infractora. */
export function refusalText({ text, cwd, worktrees }) {
  const list = worktrees.map((worktree) => `  - ${describe(worktree)}`);

  return [
    `REVIEW-CWD GUARD REFUSED this call: \`${text}\` measures its range in ${cwd}, a repository's main checkout,`,
    'while these linked worktrees carry work the main checkout does not have:',
    ...list,
    '',
    'WHY. A review command (`gentle-ai review assess|start|status`) measures the tree it is given, and `--cwd` defaults to the',
    'shell directory. Legacy: the retired 2.9.1 `gentle-ai sdd-attempt acquire|settle|begin|record|finish` did the same; on',
    '2026-10-11, twice, `acquire --cwd <main checkout>` ran while the unit lived in a linked worktree, and settle charged',
    "everything integrated meanwhile (9,300 changed lines vs a real 1,287) and blocked. Pass `--cwd <the unit's own worktree>` instead.",
    '',
    `@es REVIEW-CWD GUARD RECHAZÓ esta llamada: \`${text}\` mide su rango en ${cwd}, el checkout principal de un`,
    'repositorio, mientras estos worktrees enlazados llevan trabajo que el checkout principal no tiene:',
    ...list,
    '',
    'POR QUÉ. Un comando de revisión (`gentle-ai review assess|start|status`) mide el árbol que se le da, y `--cwd` vale el',
    'directorio del shell por omisión. Legado: el retirado `gentle-ai sdd-attempt acquire|settle|begin|record|finish` hacía lo',
    'mismo; el 2026-10-11, dos veces, se corrió `acquire --cwd <checkout principal>` con la unidad en un worktree enlazado, y',
    'settle cobró todo lo integrado entretanto (9.300 líneas cambiadas frente a las 1.287 reales) y se bloqueó.',
    "Pasa `--cwd <el worktree propio de la unidad>`."
  ].join('\n');
}

function journal(entry) {
  try {
    const directory = stateDir('review-cwd-guard');

    mkdirSync(directory, { recursive: true });
    appendFileSync(path.join(directory, 'journal.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  } catch {
    /* evidence, never a precondition */
  }
}

/**
 * The hook output for a raw payload, or `undefined` to allow. Exported for the dispatcher. Fails open.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. Falla abierto.
 */
export function evaluate(raw) {
  let payload;

  try {
    payload = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }

  let offender;

  try {
    offender = offendingInvocationFor(payload);
  } catch (error) {
    journal({ verdict: 'fail-open', session: payload?.session_id, reason: error instanceof Error ? error.message.split('\n')[0] : String(error) });

    return undefined;
  }

  if (offender === undefined) return undefined;

  journal({ verdict: 'deny', session: payload?.session_id, cwd: offender.cwd });

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusalText(offender) } };
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
