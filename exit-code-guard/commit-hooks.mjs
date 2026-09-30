/**
 * Which git hooks a commit in a directory would actually run — the premise the harness-kill refusal rests
 * on, measured instead of assumed.
 *
 * WHY THIS EXISTS. The refusal of a hook-running git operation on the default two-minute clock was written
 * inside b100-am-ui, whose `.husky/pre-commit` runs for minutes, and it justified itself with that
 * repository's own arithmetic. Registered globally, it would refuse a `git commit` in a repository that
 * runs NO hook at all — a refusal whose stated premise is false there. So the premise is measured per
 * directory: git's own answer for where hooks live (`git rev-parse --git-path hooks`, which honours
 * `core.hooksPath`), and which commit-time hooks exist in it. `*.sample` files are templates git never
 * runs.
 *
 * A MEASUREMENT THAT DID NOT HAPPEN IS NOT "NO HOOKS". An unknown directory, or git not answering, returns
 * `undefined`, and the caller keeps refusing: the old behaviour, and the safe direction.
 *
 * @es Qué hooks de git correría de verdad un commit en un directorio: la premisa de la negativa por reloj,
 * medida en vez de supuesta. Registrada globalmente, rechazaría `git commit` en un repositorio sin ningún
 * hook, con una premisa falsa. Se mide con `git rev-parse --git-path hooks` (respeta `core.hooksPath`);
 * los `*.sample` no corren nunca. Una medición que no ocurrió NO es «sin hooks»: devuelve `undefined` y
 * la negativa se mantiene.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The hooks a `git commit` (or a `--continue` that commits) runs. @es Los hooks que corre un commit. */
export const COMMIT_HOOKS = Object.freeze(['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit', 'pre-merge-commit', 'post-rewrite']);

/** The real git probe: where the hooks of `directory` live. @es La sonda real: dónde viven los hooks. */
export function gitHooksDirectory(directory) {
  const answer = spawnSync('git', ['-C', directory, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks'], { encoding: 'utf8', windowsHide: true });

  return answer.error === undefined && answer.status === 0 ? answer.stdout.trim() : undefined;
}

/**
 * The commit-time hooks that exist for `directory`, as names, or `undefined` when that could not be measured.
 * @es Los hooks de commit que existen para `directory`, o `undefined` si no se pudo medir.
 */
export function commitHooksOf(directory, { hooksDirectoryOf = gitHooksDirectory } = {}) {
  if (typeof directory !== 'string' || directory.length === 0 || !existsSync(directory)) return undefined;

  const hooks = hooksDirectoryOf(directory);

  if (hooks === undefined) return undefined;
  if (!existsSync(hooks)) return [];

  const present = new Set(readdirSync(hooks));

  return COMMIT_HOOKS.filter((name) => present.has(name));
}

/** The `hooks` folder `directory` resolves to, for the refusal text. @es La carpeta de hooks, para el texto. */
export const hooksFolderOf = (directory) => (typeof directory === 'string' && existsSync(directory) ? gitHooksDirectory(directory) : undefined) ?? path.join('<unknown>', 'hooks');
