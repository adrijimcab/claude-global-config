#!/usr/bin/env node
/**
 * `PreToolUse` guard on Bash AND PowerShell — company-push-guard. Refuses a `git push` to a COMPANY remote
 * (a URL on a host of `company-config`) when the pushed range names a listed AI tool in a commit message,
 * an added path or an added line, and refuses `--no-verify` on a company push outright. The decision lives
 * in `decide.mjs`; this file is the thin shim: stdin -> `judgePush()` -> a bilingual refusal -> stdout.
 *
 * No caller exemption: the main session and every subagent are judged alike. Owner order 2026-10-11:
 * nothing about AI reaches the company repositories; the control lives only in `~/.claude`, never in a hook
 * or a gate inside a company repository.
 *
 * @es Guardia `PreToolUse` sobre Bash y PowerShell. Rechaza un `git push` a un remoto de EMPRESA (una URL
 * en un host de `company-config`) cuando el rango subido nombra una herramienta de IA de la lista en un
 * mensaje, una ruta o una línea añadida, y rechaza `--no-verify` en un push de empresa sin más. Sin
 * exención por quien llama: sesión principal y subagentes se juzgan igual. Orden del dueño 2026-10-11: nada
 * de IA llega a los repos de empresa; el control vive solo en `~/.claude`, nunca en un hook de un repo de
 * empresa.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { missingListRefusal } from '../company-config/config.mjs';
import { renderFindings } from '../company-scan/findings.mjs';
import { judgePush } from './decide.mjs';

/** The guard's name in its messages. @es El nombre de la guardia en sus mensajes. */
const GUARD_NAME = 'COMPANY-PUSH GUARD';

/** The bilingual refusal for a push that names a tool. @es La negativa bilingüe para un push que nombra una herramienta. */
function findingsRefusal({ dir, findings }) {
  const list = renderFindings(findings);

  return [
    `${GUARD_NAME} REFUSED this command: it pushes to a company remote (from ${dir}) commits that name an AI tool.`,
    '',
    list,
    '',
    'WHY. Nothing about AI tooling may reach a company repository (owner order 2026-10-11); the AI controls live only in the private ~/.claude repository.',
    'Rewrite the offending commits (message, path or line) so they carry no such name, then push again.',
    '',
    `@es ${GUARD_NAME} RECHAZÓ este comando: sube a un remoto de empresa (desde ${dir}) commits que nombran una herramienta de IA.`,
    '',
    list,
    '',
    'POR QUÉ. Nada del tooling de IA puede llegar a un repositorio de empresa (orden del dueño 2026-10-11); los controles de IA viven solo en el repositorio privado ~/.claude.',
    'Reescribe los commits infractores (mensaje, ruta o línea) para que no lleven ese nombre y vuelve a subir.'
  ].join('\n');
}

/** The bilingual refusal for `--no-verify` on a company push. @es La negativa bilingüe para `--no-verify` en un push de empresa. */
function noVerifyRefusal({ dir }) {
  return [
    `${GUARD_NAME} REFUSED this command: \`--no-verify\` on a push to a company remote (from ${dir}) is not allowed.`,
    'The pushed range is checked by this guard, and the push hooks of a company repository are part of that repository\'s own process; skipping them is not done on a company push.',
    'Run the push without `--no-verify`.',
    '',
    `@es ${GUARD_NAME} RECHAZÓ este comando: \`--no-verify\` en un push a un remoto de empresa (desde ${dir}) no está permitido.`,
    'El rango subido lo revisa esta guardia, y los hooks de push de un repositorio de empresa son parte del proceso de ese repositorio; no se saltan en un push de empresa.',
    'Haz el push sin `--no-verify`.'
  ].join('\n');
}

/** The reason text for one verdict. @es El texto del motivo para un veredicto. */
function reasonFor(verdict) {
  if (verdict.problem !== undefined) return missingListRefusal(GUARD_NAME, verdict.problem);

  return verdict.noVerify === true ? noVerifyRefusal(verdict) : findingsRefusal(verdict);
}

/**
 * The hook output for a raw payload, or `undefined` when the command may run. Exported so
 * `hook-dispatch/dispatch.mjs` runs it in its own process. Fails open on its own malfunction.
 * @es La salida de hook para un payload crudo, o `undefined`. Falla abierta ante un fallo propio.
 */
export function evaluate(raw) {
  try {
    const verdict = judgePush(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));

    if (verdict === undefined) return undefined;

    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reasonFor(verdict) } };
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
