#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — commit-pathspec-guard. Refuses a `git commit` (plain, or
 * through the `backup-repo.mjs` wrapper) into a declared backup repo (`config-sync-guard/repos.mjs`)
 * that names NO explicit pathspec, because that repo's index is a SHARED resource: a bare `commit`
 * sweeps up whatever ANY actor — including one this session never launched — has already staged in it.
 *
 * MEASURED INCIDENT, 2026-09-30 (`acted-on-a-live-actors-working-state`, its 2nd occurrence — the 1st
 * was committing a still-running actor's own worktree; this one is committing a FROZEN actor's already-
 * staged index). `node .claude/backup-repo.mjs add AGENT-LEDGER.md` then `... commit -m "..."` in the
 * `b100-am-ui-claude-tooling` backup repo produced `89b9dad` with 64 files: 1 the caller intended, 63
 * deletions a different, frozen agent (`a9051dc022c78b59e`, a guard-migration run) had already staged in
 * that same index. It was pushed before anyone read the diff — no content was lost this time, but only
 * because the 63 deletions happened to be correct ones. `git add <path>` only ADDS; it never NARROWS what
 * a bare `commit` then sweeps up, so the fix is not "add more carefully" — it is "commit never sweeps the
 * whole index in a shared repo".
 *
 * THE DECISION lives in `decide.mjs`, pure: it names the offending invocation, never the message. This
 * file is the thin shim — stdin -> `offendingInvocationFor()` -> a bilingual refusal -> stdout — plus the
 * message templates, mirroring the split `exit-code-guard` and `config-sync-guard` already use.
 *
 * FAILS OPEN on every malfunction of its own: a guard that cannot decide must never silence a commit that
 * was actually safe.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza un `git commit` (llano, o por el envoltorio
 * `backup-repo.mjs`) en un repo de respaldo declarado que NO nombra pathspec explícito, porque ese índice
 * es un recurso COMPARTIDO: un `commit` a secas arrastra lo que cualquier actor —incluso uno que esta
 * sesión nunca lanzó— ya tenga en stage. INCIDENTE MEDIDO el 2026-09-30 (`acted-on-a-live-actors-working-
 * state`, 2.ª ocurrencia): un commit sin pathspec en el repo de respaldo de b100-am-ui se llevó 63
 * borrados de OTRO agente, congelado, y se subió sin que nadie lo notara. La decisión vive en `decide.mjs`,
 * pura; este fichero es el conducto fino más las plantillas de mensaje. Falla ABIERTO ante cualquier
 * fallo propio.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { offendingInvocationFor } from './decide.mjs';

/** The bilingual refusal for one offending invocation. @es La negativa bilingüe para una invocación infractora. */
function refusalText({ text, repo }) {
  const rewritten = `${text} -- <paths>`;

  return [
    `COMMIT-PATHSPEC GUARD REFUSED this command: it commits into ${repo.name}, a declared backup`,
    'repository, with NO explicit pathspec after `--`.',
    '',
    'WHY THIS IS REFUSED. `git commit` with no pathspec commits the WHOLE staged index, and that index',
    'is a SHARED resource — another actor (including one this session never launched) may already have',
    'its own files staged in it. Measured 2026-09-30: a bare commit in this exact repo produced 89b9dad',
    "with 64 files — 1 intended, 63 deletions a DIFFERENT, frozen actor's guard migration had already",
    'staged. It was pushed before anyone read the diff. `git add <path>` only ADDS; it never NARROWS',
    'what a bare `commit` then sweeps up.',
    '',
    'USE INSTEAD, naming exactly the paths you mean to commit:',
    '',
    `  ${rewritten}`,
    '',
    'and BEFORE committing, compare the staged set with what you actually intended:',
    '',
    '  git diff --cached --name-only',
    '',
    '`commit --only <paths>` (git\'s own "these paths only" form) is accepted too.',
    '',
    `@es COMMIT-PATHSPEC GUARD RECHAZÓ este comando: commitea en ${repo.name}, un repositorio de respaldo`,
    'declarado, SIN un pathspec explícito tras `--`.',
    '',
    'POR QUÉ SE RECHAZA. `git commit` sin pathspec commitea TODO el índice en stage, y ese índice es un',
    'recurso COMPARTIDO — otro actor (incluso uno que esta sesión nunca lanzó) puede tener ya sus propios',
    'ficheros en stage. Medido el 2026-09-30: un commit a secas en este mismo repo produjo 89b9dad con 64',
    'ficheros — 1 propio, 63 borrados que OTRO actor, congelado, ya tenía en stage por su propia',
    'migración de guardias. Se subió sin que nadie leyera el diff. `git add <ruta>` solo AÑADE; nunca',
    'ACOTA lo que un `commit` a secas arrastra después.',
    '',
    'USAR EN SU LUGAR, nombrando exactamente las rutas a commitear:',
    '',
    `  ${rewritten}`,
    '',
    'y ANTES de commitear, comparar lo que está en stage con lo que realmente se pretendía:',
    '',
    '  git diff --cached --name-only',
    '',
    'También se acepta `commit --only <rutas>` (la forma propia de git «solo estas rutas»).'
  ].join('\n');
}

/**
 * La salida de hook para un payload crudo, o `undefined` si el comando puede correr. Exportada para que
 * `~/.claude/hook-dispatch/dispatch.mjs` la corra dentro de su propio proceso. Falla abierta.
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
  } catch {
    return undefined; // fail open: a malfunction of the decision must never block a command
  }

  if (offender === undefined) return undefined;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: refusalText(offender)
    }
  };
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

// Solo como proceso principal. Si otro módulo la importa (el dispatcher, un selftest), main() no corre.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
