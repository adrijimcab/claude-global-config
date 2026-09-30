/**
 * The commit command a block message recommends: stage, then commit, only the named paths.
 *
 * WHY NOT `add -A`. A backup repo's index is a SHARED resource: a bare `commit` after `add -A` commits
 * whatever any other actor staged there too (the `commit-pathspec-guard` incident, 63 foreign deletions).
 * `add -- <paths>` stages only the named paths and `commit -- <paths>` commits only them, so the command
 * can never sweep another actor's work.
 *
 * @es El comando de commit que recomienda un mensaje de bloqueo: añade y commitea SOLO las rutas
 * nombradas. Nunca `add -A`: el índice de un repo de respaldo es compartido y un `commit` sin pathspec
 * se lleva lo que otro actor haya dejado en stage (incidente de `commit-pathspec-guard`, 63 borrados ajenos).
 */

/** `gitPrefix` (the repo's own git invocation) staging then committing exactly `relativePaths`. @es Añade y commitea exactamente `relativePaths`. */
export function pathspecCommitCommand(gitPrefix, relativePaths) {
  const pathspec = relativePaths.map((relativePath) => `"${relativePath}"`).join(' ');

  return `${gitPrefix} add -- ${pathspec} && ${gitPrefix} commit -m "type(scope): description" -- ${pathspec}`;
}
