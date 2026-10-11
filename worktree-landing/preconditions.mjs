/**
 * Decides whether a landing may start from the current state of the two checkouts, reading only: it
 * returns the exact range that would land, or throws the Refusal that names why nothing may land.
 *
 * The questions, in order: are the two paths two checkouts of ONE repository; is the worktree fully
 * committed; is the main checkout on the shared branch; does the worktree HEAD contain the shared tip and
 * the remote tip (so the result is a fast-forward in both places); and does any landed path collide with
 * something the main checkout already holds.
 *
 * @es Decide si un aterrizaje puede empezar desde el estado actual de los dos checkouts, solo leyendo:
 * devuelve el rango exacto que aterrizaría, o lanza el Refusal que dice por qué no puede aterrizar nada.
 * Las preguntas, en orden: ¿son dos checkouts de UN repositorio?; ¿está el worktree todo commiteado?; ¿está
 * el principal en la rama compartida?; ¿contiene el HEAD del worktree la punta compartida y la remota (para
 * que sea fast-forward en ambos sitios)?; ¿choca alguna ruta aterrizada con algo que el principal ya tiene?
 */

import path from 'node:path';

import { collisionsOf } from './collisions.mjs';
import { git, GitFailure, gitOutput } from './git.mjs';
import { requireIntegrationBranch } from './integration-branch.mjs';
import { Refusal } from './outcome.mjs';
import { uncommittedPaths } from './working-tree.mjs';

const LISTED_PATHS = 20;

/** One spelling of a directory, so the same one always matches itself. @es Una sola grafía de un directorio. */
function canonical(directory) {
  const absolute = path.resolve(directory.trim()).split(path.sep).join('/');
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

/** At most LISTED_PATHS paths, indented, then how many more. @es Como mucho LISTED_PATHS rutas, y cuántas más. */
function listed(paths) {
  const shown = paths.slice(0, LISTED_PATHS).map((relative) => `    ${relative}`);
  const more = paths.length - LISTED_PATHS;
  return more > 0 ? [...shown, `    … and ${more} more @es … y ${more} más`] : shown;
}

/** The current branch name, or undefined when HEAD is detached. @es La rama actual, o undefined si HEAD está suelto. */
function currentBranch(checkout) {
  const result = git(checkout, ['symbolic-ref', '-q', '--short', 'HEAD']);
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/**
 * True when `ancestor` is contained in `descendant`. A commit this repository does not hold is not
 * contained; any other git failure throws.
 * @es Verdadero si `descendant` contiene a `ancestor`. Un commit que el repositorio no tiene no está
 * contenido; cualquier otro fallo de git se lanza.
 */
function contains(checkout, descendant, ancestor) {
  const result = git(checkout, ['merge-base', '--is-ancestor', ancestor, descendant]);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  if (git(checkout, ['cat-file', '-e', `${ancestor}^{commit}`]).status !== 0) return false;
  const why = `exit ${result.status}: ${result.stderr.trim()}`;
  throw new GitFailure(
    `git merge-base --is-ancestor ${ancestor} ${descendant} failed (${why}). @es git merge-base --is-ancestor ${ancestor} ${descendant} falló (salida ${result.status}: ${result.stderr.trim()}).`,
  );
}

/** Both paths are distinct checkouts sharing one repository. @es Ambas rutas son checkouts distintos de un mismo repositorio. */
function requireOneRepositoryTwoCheckouts(worktree, main) {
  const topOf = (checkout) => canonical(gitOutput(checkout, ['rev-parse', '--show-toplevel']));
  const commonOf = (checkout) => canonical(gitOutput(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  if (topOf(worktree) === topOf(main)) {
    throw new Refusal('same-checkout', [
      `The worktree and the main checkout are the same checkout (${main}); a work branch lands from its own worktree. @es El worktree y el checkout principal son el mismo checkout (${main}); una rama de trabajo aterriza desde su propio worktree.`,
    ]);
  }
  if (commonOf(worktree) !== commonOf(main)) {
    throw new Refusal('different-repository', [
      `The worktree ${worktree} is not a worktree of the repository at ${main}; they share no object store. @es El worktree ${worktree} no es un worktree del repositorio de ${main}; no comparten almacén de objetos.`,
    ]);
  }
}

/** The worktree holds nothing uncommitted, so what was verified is exactly what lands. @es El worktree no guarda nada sin commitear. */
function requireCommittedWorktree(worktree) {
  const uncommitted = uncommittedPaths(worktree);
  if (uncommitted.length === 0) return;
  throw new Refusal('worktree-uncommitted', [
    `The worktree ${worktree} has ${uncommitted.length} uncommitted or untracked path(s); only committed work lands, so what is verified is what lands. @es El worktree ${worktree} tiene ${uncommitted.length} ruta(s) sin commitear o sin seguir; solo aterriza trabajo commiteado, para que lo verificado sea lo que aterriza.`,
    ...listed(uncommitted),
  ]);
}

/** The main checkout has the shared branch checked out, so the fast-forward moves that branch. @es El principal tiene la rama compartida. */
function requireMainOnSharedBranch(main, branch) {
  const current = currentBranch(main);
  if (current === branch) return;
  const shown = current ?? '(detached HEAD)';
  throw new Refusal('main-not-on-shared-branch', [
    `The main checkout ${main} is on ${shown}, not on the shared branch ${branch}. @es El checkout principal ${main} está en ${current ?? '(HEAD suelto)'}, no en la rama compartida ${branch}.`,
  ]);
}

/** The exact commands that replay the work branch onto the current shared tip. @es Las órdenes exactas para rehacer la rama sobre la punta actual. */
function replayCommands(worktree, head, tip) {
  const work = currentBranch(worktree) ?? 'work';
  const base = git(worktree, ['merge-base', tip, head]);
  const commands = [`    git -C "${worktree}" switch -c ${work}-onto-${tip.slice(0, 7)} ${tip}`];
  if (base.status === 0) commands.push(`    git -C "${worktree}" cherry-pick ${base.stdout.trim()}..${head}`);
  return commands;
}

/** The worktree HEAD contains the local shared tip. @es El HEAD del worktree contiene la punta compartida local. */
function requireSharedTipContained({ worktree, main, branch, head, tip }) {
  if (contains(main, head, tip)) return;
  throw new Refusal('shared-tip-not-contained', [
    `The worktree HEAD ${head} does not contain the current tip ${tip} of ${branch}; replay the work onto it, verify again, then land: @es El HEAD del worktree ${head} no contiene la punta actual ${tip} de ${branch}; rehaz el trabajo sobre ella, verifica otra vez y aterriza:`,
    ...replayCommands(worktree, head, tip),
  ]);
}

/** The remote holds the shared branch and the worktree HEAD contains its tip. @es El remoto tiene la rama y el HEAD contiene su punta. */
function requireRemoteTipContained({ main, branch, remote, head }) {
  const advertised = gitOutput(main, ['ls-remote', remote, `refs/heads/${branch}`]).trim();
  const remoteTip = advertised.split(/\s+/)[0];
  if (advertised === '') {
    throw new Refusal('remote-branch-absent', [
      `The remote ${remote} has no branch ${branch}; this tool lands onto an existing shared branch only. @es El remoto ${remote} no tiene la rama ${branch}; esta herramienta solo aterriza sobre una rama compartida existente.`,
    ]);
  }
  if (contains(main, head, remoteTip)) return remoteTip;
  throw new Refusal('remote-tip-not-contained', [
    `The remote ${remote} has ${branch} at ${remoteTip}, which the worktree HEAD ${head} does not contain; bring ${branch} up to date with ${remote}, replay the work onto it, verify again, then land. @es El remoto ${remote} tiene ${branch} en ${remoteTip}, que el HEAD del worktree ${head} no contiene; actualiza ${branch} desde ${remote}, rehaz el trabajo encima, verifica otra vez y aterriza.`,
  ]);
}

/** No landed path collides with what the main checkout holds. @es Ninguna ruta aterrizada choca con lo que tiene el principal. */
function requireNoCollision({ main, tip, head }) {
  const { landed, dirty, ignored } = collisionsOf({ main, tip, head });
  if (dirty.length > 0) {
    throw new Refusal('landed-path-dirty-in-main', [
      `${dirty.length} landed path(s) hold uncommitted work in the main checkout ${main}; a fast-forward would collide with another actor's work: @es ${dirty.length} ruta(s) aterrizada(s) tienen trabajo sin commitear en el checkout principal ${main}; un fast-forward chocaría con el trabajo de otro actor:`,
      ...listed(dirty),
    ]);
  }
  if (ignored.length > 0) {
    throw new Refusal('ignored-file-differs-at-landed-path', [
      `${ignored.length} landed path(s) are occupied in the main checkout ${main} by an ignored file with different content; git would overwrite it silently: @es ${ignored.length} ruta(s) aterrizada(s) están ocupadas en el checkout principal ${main} por un fichero ignorado con otro contenido; git lo sobrescribiría en silencio:`,
      ...listed(ignored),
    ]);
  }
  return landed;
}

/**
 * @param {{ worktree: string, main: string, branch: string, remote: string }} inputs
 * @returns {{ head: string, tip: string, remoteTip: string, landed: string[], integration: string }}
 * @es Devuelve el HEAD que aterriza, la punta compartida, la punta remota y las rutas aterrizadas.
 */
export function landingRangeOf({ worktree, main, branch, remote }) {
  requireOneRepositoryTwoCheckouts(worktree, main);
  const integration = requireIntegrationBranch({ main, branch });
  requireCommittedWorktree(worktree);
  requireMainOnSharedBranch(main, branch);
  const head = gitOutput(worktree, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const tip = gitOutput(main, ['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]).trim();
  requireSharedTipContained({ worktree, main, branch, head, tip });
  const remoteTip = requireRemoteTipContained({ main, branch, remote, head });
  const landed = requireNoCollision({ main, tip, head });
  return { head, tip, remoteTip, landed, integration };
}
