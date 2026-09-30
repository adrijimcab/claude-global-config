#!/usr/bin/env node
/**
 * Lands a verified work branch onto the shared branch, so no unverified state ever sits on it. Closes the
 * incident `unverified-commit-published-by-another-sessions-sync`: another live session's config-sync
 * Stop guard pushes the shared branch whenever the main checkout is ahead of the remote, so ANY commit that
 * reaches the shared branch is published within minutes. The only safe moment for a commit to reach that
 * branch is after it is verified, and that is the only way this tool moves it.
 *
 * The sequence, one process, nothing written before the last step:
 *   1. preconditions (`preconditions.mjs`): two checkouts of one repository, a fully committed worktree,
 *      the main checkout on the shared branch, a HEAD that contains both the local and the remote tip, and
 *      no landed path colliding with the main checkout's uncommitted work or with a differing ignored file;
 *   2. verification (`verification.mjs`): the repository's test command, run in the worktree;
 *   3. the preconditions again, which must name the SAME head and tip: what lands is what was verified;
 *   4. publication (`publication.mjs`): fast-forward, push, and the remote tip read back.
 * Exit 0 landed (or ready, with `--check`), 1 verification red, 2 refused precondition or git failure.
 *
 * Usage: node land.mjs --worktree <dir> --main <dir> --branch <shared branch> --remote <remote> [--check]
 *
 * @es Aterriza una rama de trabajo verificada sobre la rama compartida, para que nunca haya en ella estado
 * sin verificar. Cierra el incidente `unverified-commit-published-by-another-sessions-sync`: la guarda Stop
 * de sincronización de otra sesión viva empuja la rama compartida siempre que el checkout principal va por
 * delante del remoto, así que CUALQUIER commit que llegue a esa rama se publica en minutos. El único momento
 * seguro para que un commit llegue ahí es después de verificarlo, y es la única forma en que esta
 * herramienta lo mueve. Secuencia, un solo proceso, nada escrito antes del último paso: precondiciones;
 * verificación en el worktree; las precondiciones otra vez, que deben dar el MISMO head y punta (lo que
 * aterriza es lo verificado); publicación (fast-forward, push y relectura de la punta remota). Salida 0
 * aterrizado (o listo, con `--check`), 1 verificación en rojo, 2 precondición rechazada o fallo de git.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArguments } from './arguments.mjs';
import { GitFailure } from './git.mjs';
import { EXIT_LANDED, EXIT_REFUSED, EXIT_VERIFICATION_RED, Refusal } from './outcome.mjs';
import { landingRangeOf } from './preconditions.mjs';
import { publish } from './publication.mjs';
import { verifyWorktree } from './verification.mjs';

/** The range must not have moved while the verification ran. @es El rango no debe haberse movido durante la verificación. */
function requireUnmoved(before, after) {
  if (after.head === before.head && after.tip === before.tip) return;
  throw new Refusal('moved-during-verification', [
    `The range moved while the verification ran (head ${before.head} -> ${after.head}, tip ${before.tip} -> ${after.tip}); what would land is not what was verified. @es El rango se movió durante la verificación (head ${before.head} -> ${after.head}, punta ${before.tip} -> ${after.tip}); lo que aterrizaría no es lo verificado.`,
  ]);
}

/** The printed outcome of a refusal or a red verification. @es La salida impresa de un rechazo o una verificación en rojo. */
function stoppedBy(refusal) {
  const label = refusal.exitCode === EXIT_VERIFICATION_RED ? 'RED' : 'REFUSED';
  return { exitCode: refusal.exitCode, lines: [`${label} [${refusal.reason}]`, ...refusal.lines, 'Nothing landed. @es No aterrizó nada.'] };
}

/**
 * @param {{ worktree: string, main: string, branch: string, remote: string, check?: boolean, verifyTimeoutMs?: number }} inputs
 * @returns {{ exitCode: number, lines: string[] }}
 * @es Devuelve el código de salida y las líneas del informe.
 */
export function land({ worktree, main, branch, remote, check = false, verifyTimeoutMs }) {
  const inputs = { worktree, main, branch, remote };
  try {
    const before = landingRangeOf(inputs);
    const summary = verifyWorktree(worktree, { timeoutMs: verifyTimeoutMs });
    const after = landingRangeOf(inputs);
    requireUnmoved(before, after);
    const range = `${after.tip}..${after.head}`;
    if (check) {
      return {
        exitCode: EXIT_LANDED,
        lines: [
          `READY ${range} (${after.landed.length} path(s)); verification: ${summary}. Check mode: nothing was landed. @es LISTO ${range} (${after.landed.length} ruta(s)); verificación: ${summary}. Modo comprobación: no se aterrizó nada.`,
        ],
      };
    }
    const commits = publish({ main, branch, remote, tip: after.tip, head: after.head });
    return {
      exitCode: EXIT_LANDED,
      lines: [
        `LANDED ${range} on ${branch}, confirmed on ${remote} (${commits.length} commit(s)); verification: ${summary}. @es ATERRIZADO ${range} en ${branch}, confirmado en ${remote} (${commits.length} commit(s)); verificación: ${summary}.`,
        ...commits.map((line) => `    ${line}`),
      ],
    };
  } catch (error) {
    if (error instanceof Refusal) return stoppedBy(error);
    if (error instanceof GitFailure) return stoppedBy(new Refusal('git-failure', [error.message]));
    throw error;
  }
}

/**
 * Runs the command line and prints the report; returns the process exit code.
 * @es Ejecuta la línea de órdenes e imprime el informe; devuelve el código de salida del proceso.
 */
function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    return EXIT_REFUSED;
  }
  const { exitCode, lines } = land(parsed);
  const sink = exitCode === EXIT_LANDED ? console.log : console.error;
  sink(lines.join('\n'));
  return exitCode;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = main();
