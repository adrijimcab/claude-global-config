#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — company-commit-guard. Refuses a `git commit` into a COMPANY
 * repository (a remote on a host of `company-config`) when the message, the committed paths or the added
 * lines name a listed AI tool. The decision lives in `decide.mjs`; this file is the thin shim: stdin ->
 * `judgeCommit()` -> a bilingual refusal -> stdout.
 *
 * No caller exemption: the main session and every subagent are judged alike. Owner order 2026-10-11:
 * nothing about AI reaches the company repositories; the control lives only in `~/.claude`.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza un `git commit` en un repositorio de EMPRESA
 * (un remoto en un host de `company-config`) cuando el mensaje, las rutas o las líneas añadidas nombran una
 * herramienta de IA de la lista. Sin exención por quien llama: la sesión principal y cada subagente se
 * juzgan igual. Orden del dueño 2026-10-11: nada de IA llega a los repos de empresa; el control vive solo
 * en `~/.claude`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { missingListRefusal } from '../company-config/config.mjs';
import { renderFindings } from '../company-scan/findings.mjs';
import { judgeCommit } from './decide.mjs';

/** The guard's name in its messages. @es El nombre de la guardia en sus mensajes. */
const GUARD_NAME = 'COMPANY-COMMIT GUARD';

/** The bilingual refusal for a commit that names a tool. @es La negativa bilingüe para un commit que nombra una herramienta. */
function refusalText({ dir, findings }) {
  const list = renderFindings(findings);

  return [
    `${GUARD_NAME} REFUSED this command: it commits into a company repository (${dir}) content that names an AI tool.`,
    '',
    list,
    '',
    'WHY. Nothing about AI tooling may reach a company repository (owner order 2026-10-11); the AI controls live only in the private ~/.claude repository.',
    'Remove the name from the message, the staged file or the added line, then commit again.',
    '',
    `@es ${GUARD_NAME} RECHAZÓ este comando: commitea en un repositorio de empresa (${dir}) contenido que nombra una herramienta de IA.`,
    '',
    list,
    '',
    'POR QUÉ. Nada del tooling de IA puede llegar a un repositorio de empresa (orden del dueño 2026-10-11); los controles de IA viven solo en el repositorio privado ~/.claude.',
    'Quita el nombre del mensaje, del fichero en stage o de la línea añadida y vuelve a commitear.'
  ].join('\n');
}

/**
 * The hook output for a raw payload, or `undefined` when the command may run. Exported so
 * `hook-dispatch/dispatch.mjs` runs it in its own process. Fails open on its own malfunction.
 * @es La salida de hook para un payload crudo, o `undefined`. Falla abierta ante un fallo propio.
 */
export function evaluate(raw) {
  try {
    const verdict = judgeCommit(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));

    if (verdict === undefined) return undefined;

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.problem === undefined ? refusalText(verdict) : missingListRefusal(GUARD_NAME, verdict.problem)
      }
    };
  } catch {
    return undefined;
  }
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

// Only as the main process; imported by the dispatcher or a selftest, main() does not run.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
