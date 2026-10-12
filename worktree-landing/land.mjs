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
 *   1b. the standard review (`../standard-review/review-requirement.mjs`): the worktree's tree must hold a
 *      recorded PASS, else the landing is refused naming the command that reviews it;
 *   2. verification (`verification.mjs`): the worktree's test command, run in the worktree — the unit suite
 *      the project declares in its `.claude/fleet-kit.json` `unitSuite`, else `selftest-runner/run.mjs`
 *      (`test-command.mjs`); with neither, the landing is refused;
 *   3. the preconditions again, which must name the SAME head and tip: what lands is what was verified;
 *   4. publication (`publication.mjs`): fast-forward, then push and the remote tip read back ONLY when the
 *      remote is one of the owner's backups (`remote-policy.mjs`: github.com/adrijimcab/*); any other remote
 *      is never pushed: the local branch is fast-forwarded, the report says "LANDED LOCALLY ... NOT
 *      published" and prints the exact `git -C <main> push <remote> <branch>` for the owner. No flag turns
 *      the push on; `--check` reports which of the two would happen.
 * Two rules decide before anything is written: the requested --branch must be the FIRST integration branch
 * the project declares (`integration-branch.mjs`: `.claude/fleet-kit.json` `integrationBranches`, else
 * `.claude/integrate/integration-branches.mjs`; a repository declaring neither is not governed and the
 * report says the check did not apply), and an unreadable declaration refuses.
 * Exit 0 landed (or ready, with `--check`), 1 verification red, 2 refused precondition or git failure.
 *
 * Usage: node land.mjs --worktree <dir> --main <dir> --branch <shared branch> --remote <remote> [--check] [--reap]
 *
 * @es Aterriza una rama de trabajo verificada sobre la rama compartida, para que nunca haya en ella estado
 * sin verificar. Cierra el incidente `unverified-commit-published-by-another-sessions-sync`: la guarda Stop
 * de sincronización de otra sesión viva empuja la rama compartida siempre que el checkout principal va por
 * delante del remoto, así que CUALQUIER commit que llegue a esa rama se publica en minutos. El único momento
 * seguro para que un commit llegue ahí es después de verificarlo, y es la única forma en que esta
 * herramienta lo mueve. Secuencia, un solo proceso, nada escrito antes del último paso: precondiciones;
 * verificación en el worktree (la suite unitaria que declara el `unitSuite` de `.claude/fleet-kit.json` del
 * proyecto, o si no `selftest-runner/run.mjs`; sin ninguna, se rechaza); antes de ella, la revisión contra el estándar (el árbol debe tener un PASS registrado, si no se rechaza nombrando la orden que lo revisa); las precondiciones otra vez, que deben dar el MISMO head y punta (lo que
 * aterriza es lo verificado); publicación (fast-forward y, SOLO si el remoto es un respaldo del dueño
 * (`remote-policy.mjs`: github.com/adrijimcab/*), push y relectura de la punta remota). Cualquier otro
 * remoto no se empuja jamás: se hace fast-forward de la rama local, el informe dice «ATERRIZADO EN LOCAL ...
 * NO publicado» e imprime el `git -C <main> push <remoto> <rama>` exacto para el dueño. Ninguna bandera
 * activa el push; `--check` informa cuál de los dos ocurriría. Dos reglas deciden antes de escribir nada:
 * la --branch pedida debe ser la PRIMERA rama de integración que declara el proyecto
 * (`integration-branch.mjs`: `integrationBranches` de `.claude/fleet-kit.json`, o si no
 * `.claude/integrate/integration-branches.mjs`; un repositorio sin ninguna declaración no está gobernado y
 * el informe dice que la comprobación no aplicó), y una declaración ilegible rechaza. Salida 0
 * aterrizado (o listo, con `--check`), 1 verificación en rojo, 2 precondición rechazada o fallo de git.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reapAgentProcesses } from '../process-reaper/reaper.mjs';
import { parseArguments } from './arguments.mjs';
import { GitFailure } from './git.mjs';
import { EXIT_LANDED, EXIT_REFUSED, EXIT_VERIFICATION_RED, Refusal } from './outcome.mjs';
import { landingRangeOf } from './preconditions.mjs';
import { publish } from './publication.mjs';
import { mayPublishTo } from './remote-policy.mjs';
import { verifyWorktree } from './verification.mjs';
import { reviewRequirementOf } from '../standard-review/review-requirement.mjs';

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
 * `reviewRequirement` is injected for the selftest; the real one reads the recorded standard-review verdict of the
 * worktree's tree. @es `reviewRequirement` se inyecta en el selftest; el real lee el veredicto registrado de la revisión del árbol.
 * `reap` (off by default) closes the landed worktree's loose ends AFTER a written landing: the processes that name
 * it are killed (`process-reaper/reaper.mjs`) and the report says which. It never changes whether or how the
 * landing happened, and `--check` never reaps. `reaper` is injected for the selftest.
 * @es `reap` (apagado por defecto) cierra los cabos sueltos del worktree aterrizado DESPUÉS de un aterrizaje
 * escrito: se matan los procesos que lo nombran y el informe dice cuáles. Nunca cambia si el aterrizaje ocurrió
 * ni cómo, y `--check` nunca siega.
 * @param {{ worktree: string, main: string, branch: string, remote: string, check?: boolean, reap?: boolean, verifyTimeoutMs?: number, reaper?: typeof reapAgentProcesses, reviewRequirement?: typeof reviewRequirementOf }} inputs
 * @returns {{ exitCode: number, lines: string[] }}
 * @es Devuelve el código de salida y las líneas del informe.
 */
export function land({ worktree, main, branch, remote, check = false, reap = false, verifyTimeoutMs, reaper = reapAgentProcesses, reviewRequirement = reviewRequirementOf }) {
  const inputs = { worktree, main, branch, remote };
  try {
    const before = landingRangeOf(inputs);
    const review = reviewRequirement({ worktree });
    if (!review.ok) throw new Refusal(review.reason, review.lines);
    const summary = verifyWorktree(worktree, { main, timeoutMs: verifyTimeoutMs });
    const after = landingRangeOf(inputs);
    requireUnmoved(before, after);
    const range = `${after.tip}..${after.head}`;
    if (check) {
      return {
        exitCode: EXIT_LANDED,
        lines: [
          `READY ${range} (${after.landed.length} path(s)); verification: ${summary}. Check mode: nothing was landed. @es LISTO ${range} (${after.landed.length} ruta(s)); verificación: ${summary}. Modo comprobación: no se aterrizó nada.`,
          mayPublishTo({ main, remote })
            ? `Publication: would publish to ${remote}. @es Publicación: publicaría en ${remote}.`
            : `Publication: would land locally only, not published (${remote} is not an owner backup remote). @es Publicación: aterrizaría solo en local, sin publicar (${remote} no es un remoto de respaldo del dueño).`,
          after.integration,
        ],
      };
    }
    const { commits, pushCommand } = publish({ main, branch, remote, tip: after.tip, head: after.head });
    const headline =
      pushCommand === undefined
        ? `LANDED ${range} on ${branch}, confirmed on ${remote} (${commits.length} commit(s)); verification: ${summary}. @es ATERRIZADO ${range} en ${branch}, confirmado en ${remote} (${commits.length} commit(s)); verificación: ${summary}.`
        : `LANDED LOCALLY ${range} on ${branch} (${commits.length} commit(s)); verification: ${summary}. NOT published: ${remote} is not an owner backup remote, so nothing was pushed; the owner publishes with: @es ATERRIZADO EN LOCAL ${range} en ${branch} (${commits.length} commit(s)); verificación: ${summary}. NO publicado: ${remote} no es un remoto de respaldo del dueño, así que no se empujó nada; el dueño publica con:`;
    return {
      exitCode: EXIT_LANDED,
      lines: [headline, ...(pushCommand === undefined ? [] : [`    ${pushCommand}`]), ...commits.map((line) => `    ${line}`), after.integration, ...(reap ? reaper({ worktree }).lines : [])],
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
