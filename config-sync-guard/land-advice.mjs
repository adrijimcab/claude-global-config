/**
 * The delivery advice for a repo whose `master` is reached ONLY through a landing (`~/.claude`): never a
 * `git commit` on the shared checkout, always the `worktree-landing/land.mjs` route.
 *
 * WHY. A session that followed a plain "commit and push" line for `~/.claude` committed straight onto its
 * `master`, bypassing the landing every other session coordinates through. The owner's rule: that master is
 * reached only through `land.mjs`, from a `land/checkpoint-N` worktree, by the session that orchestrates it.
 *
 * @es El consejo de entrega para un repo cuyo `master` solo se alcanza por un aterrizaje (`~/.claude`):
 * nunca un `git commit` en el checkout compartido, siempre la ruta `worktree-landing/land.mjs`. Una sesión
 * que siguió un «commit y push» directo commiteó sobre ese `master` saltándose el aterrizaje. Regla del
 * dueño: ese master se alcanza solo por `land.mjs`, desde un worktree `land/checkpoint-N`, por la sesión
 * que orquesta ese repo.
 */

import path from 'node:path';

/** The delivery routes a declared repo can have. @es Las rutas de entrega que puede tener un repo declarado. */
export const LANDING_ROUTE = 'landing';

/** Whether `repo`'s master is reached only through a landing. @es Si el master de `repo` solo se alcanza por un aterrizaje. */
export const isLandingRepo = (repo) => repo.deliveryRoute === LANDING_ROUTE;

/** The `land.mjs` invocation for `repo`, with the checkpoint worktree left as a placeholder. @es La invocación de `land.mjs` para `repo`. */
function landCommand(repo) {
  const landScript = path.posix.join(repo.worktree.split(path.sep).join('/'), 'worktree-landing', 'land.mjs');
  const main = repo.worktree.split(path.sep).join('/');

  return `node ${landScript} --worktree <land/checkpoint-N worktree> --main ${main} --branch master --remote origin`;
}

/**
 * The LAND line for `relativePaths`: the paths, the route and who walks it. Contains no `git commit`.
 * @es La línea LAND para `relativePaths`: las rutas, el camino y quién lo recorre. No contiene `git commit`.
 */
export function landAdvice(repo, relativePaths) {
  const pathspec = relativePaths.map((relativePath) => `"${relativePath}"`).join(' ');

  return `LAND: ${pathspec} — ${repo.name}'s master is reached only through a landing. Carry these paths into a land/checkpoint-N worktree of the repo, commit them there with an explicit pathspec, then land: ${landCommand(repo)}. Only the session that orchestrates ${repo.name} does this; any other session hands these paths to it and dismisses (option B) with that as the reason.`;
}

/** The note for commits already ahead of a landing repo's remote. @es La nota para commits ya adelantados en un repo de aterrizaje. */
export function landAheadAdvice(repo) {
  return `LAND, do not push: ${repo.name}'s master is reached only through a landing — ${landCommand(repo)} — by the session that orchestrates it; any other session dismisses (option B) with that as the reason.`;
}
