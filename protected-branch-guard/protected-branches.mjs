/**
 * The branches that are never deleted, and the one exact test of whether a ref names one of them.
 *
 * WHERE THE NAMES COME FROM, decided. The owner's rule is literal and global: «main y develop NUNCA se borran». It
 * names two branches, in every repository, so the source is that pair, here, once. The integration-branch
 * declaration (`integration-branch/declaration.mjs`) answers a different question (where work LANDS, per project)
 * and most repositories declare nothing, so reading it would protect nothing in exactly the repositories that never
 * declared; b100-am-ui declares `develop` and `main`, the same pair. What would make this wrong: a repository whose
 * own integration branch has another name (this configuration repository's `master`) is not protected by this guard;
 * widening the rule to it is the owner's decision, and the server-side branch protection covers it meanwhile.
 *
 * EXACT MATCH. A ref names a protected branch when it IS `main`/`develop`, or `refs/heads/main`/`refs/heads/develop`:
 * `feature/main`, `main-fix`, `develop2`, `refs/heads/feature/main` and the remote-tracking `origin/main` do not.
 *
 * @es Las ramas que nunca se borran y la única prueba exacta de si una referencia nombra una de ellas. DE DÓNDE SALEN
 * LOS NOMBRES: la regla del dueño es literal y global, «main y develop NUNCA se borran»; nombra dos ramas en todo
 * repositorio, así que la fuente es ese par, aquí, una vez. La declaración de ramas de integración responde otra
 * pregunta (dónde ATERRIZA el trabajo) y la mayoría de repositorios no declara nada. Lo que haría esto incorrecto: un
 * repositorio cuya rama de integración se llama distinto (el `master` de este repositorio de configuración) no queda
 * protegido por esta guardia; ampliarla es decisión del dueño. COINCIDENCIA EXACTA: `feature/main`, `main-fix`,
 * `develop2` y `origin/main` no son ramas protegidas.
 */

/** The protected branch names. @es Los nombres de rama protegidos. */
export const PROTECTED_BRANCHES = Object.freeze(['main', 'develop']);

/** The prefix of a full local branch ref. @es El prefijo de una referencia completa de rama local. */
const HEADS = 'refs/heads/';

/**
 * The protected branch `ref` names, or `undefined`.
 * @param {string} ref A branch name or a full `refs/heads/` ref.
 * @es La rama protegida que nombra `ref`, o `undefined`.
 */
export function protectedBranchOf(ref) {
  const name = ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref;

  return PROTECTED_BRANCHES.includes(name) ? name : undefined;
}
