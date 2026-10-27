/**
 * The branches that are never deleted, and the one exact test of whether a ref names one of them.
 *
 * WHERE THE NAMES COME FROM, decided (coordinator decision 2026-10-27). The owner's rule is literal and global:
 * «main y develop NUNCA se borran», so that pair is protected in every repository, here, once. To it is added the
 * repository's DEFAULT branch as git records it (`default-branch.mjs`: `refs/remotes/<remote>/HEAD`), so a repository
 * that integrates on another name (this configuration repository's `master`) is protected with no hand-kept list.
 * When the default branch cannot be read the pair still holds. What would make this wrong: a repository with no
 * `<remote>/HEAD` set (a clone made without it, or `git remote set-head -d`) protects only the pair.
 *
 * EXACT MATCH. A ref names a protected branch when it IS `main`/`develop`, or `refs/heads/main`/`refs/heads/develop`:
 * `feature/main`, `main-fix`, `develop2`, `refs/heads/feature/main` and the remote-tracking `origin/main` do not.
 *
 * @es Las ramas que nunca se borran y la única prueba exacta de si una referencia nombra una de ellas. DE DÓNDE SALEN
 * LOS NOMBRES: la regla del dueño, «main y develop NUNCA se borran», protege ese par en todo repositorio; se le suma la
 * rama POR DEFECTO del repositorio tal como la registra git (`refs/remotes/<remoto>/HEAD`), así el `master` de este
 * repositorio de configuración queda protegido sin lista a mano. Si no se puede leer, el par sigue valiendo. Lo que
 * haría esto incorrecto: un repositorio sin `<remoto>/HEAD` solo protege el par. COINCIDENCIA EXACTA: `feature/main`, `main-fix`,
 * `develop2` y `origin/main` no son ramas protegidas.
 */

/** The protected branch names. @es Los nombres de rama protegidos. */
export const PROTECTED_BRANCHES = Object.freeze(['main', 'develop']);

/** The prefix of a full local branch ref. @es El prefijo de una referencia completa de rama local. */
const HEADS = 'refs/heads/';

/**
 * The protected branch `ref` names, or `undefined`. Protected are the constant pair and the repository's default
 * branch; `defaultBranch` is asked only when the name is not in the pair (it may spawn git).
 * @param {string} ref A branch name or a full `refs/heads/` ref.
 * @param {() => (string|undefined)} [defaultBranch] The repository's default branch, asked lazily.
 * @es La rama protegida que nombra `ref`, o `undefined`: el par constante y la rama por defecto del repositorio, que
 * solo se pregunta si el nombre no está en el par.
 */
export function protectedBranchOf(ref, defaultBranch = () => undefined) {
  const name = ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref;

  if (PROTECTED_BRANCHES.includes(name)) return name;

  return name === defaultBranch() ? name : undefined;
}
