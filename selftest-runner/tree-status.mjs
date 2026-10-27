/**
 * The tree under test as git sees it at one instant: every path `git status` lists (a tracked file changed,
 * added or deleted, an untracked file that is not ignored), each with its status and its size and mtime, so a
 * file that was already dirty and is touched again still differs. Renames are not paired (`--no-renames`): a
 * moved file is its old path and its new one, both named. Untracked directories are listed file by file
 * (`--untracked-files=all`), so a file created deep in a new directory is named itself.
 *
 * WHAT IT CANNOT SEE: ignored paths. A module that still joins its own directory with `state` writes an
 * ignored path of the tree; that class is found statically by `hook-state/census.mjs`, never here, because
 * the ignored paths of a live home are written by its live sessions all day.
 *
 * @es El árbol bajo prueba tal como lo ve git en un instante: cada ruta que lista `git status` (un fichero
 * seguido cambiado, añadido o borrado, uno sin seguir que no está ignorado), con su estado, tamaño y mtime, así
 * un fichero que ya estaba sucio y se vuelve a tocar sigue difiriendo. Los renombres no se emparejan; los
 * directorios sin seguir se listan fichero a fichero. NO VE las rutas ignoradas: un módulo que aún une su propio
 * directorio con `state` escribe una ruta ignorada; esa clase la encuentra `hook-state/census.mjs`, nunca aquí,
 * porque las rutas ignoradas de un home vivo las escriben sus sesiones todo el día.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Raised when git cannot list the tree; carries `tree` and git's own `reason`, for the caller to render.
 * @es Se lanza cuando git no puede listar el árbol; lleva `tree` y el `reason` de git, para que lo renderice quien llama.
 */
export class TreeStatusError extends Error {
  constructor(tree, reason) {
    super(reason);
    this.tree = tree;
    this.reason = reason;
  }
}

/** Size and mtime of a path, never through a link; `absent` when it is gone. @es Tamaño y mtime de una ruta, sin cruzar enlaces. */
function signatureOf(file) {
  const stats = lstatSync(file, { throwIfNoEntry: false });

  if (stats === undefined) return 'absent';

  return `${stats.size}:${stats.mtimeMs}`;
}

/**
 * Every path `git status` lists in `tree`, `relative path -> 'XY|size:mtime'`.
 * @es Cada ruta que lista `git status` en `tree`, `ruta relativa -> 'XY|tamaño:mtime'`.
 */
export function treeStatus(tree) {
  const result = spawnSync('git', ['-C', tree, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });

  if (result.error || result.status !== 0) throw new TreeStatusError(tree, (result.error?.message ?? result.stderr ?? '').trim());

  const entries = result.stdout.split('\0').filter((entry) => entry !== '');

  return new Map(entries.map((entry) => [entry.slice(3), `${entry.slice(0, 2)}|${signatureOf(path.join(tree, entry.slice(3)))}`]));
}

/** The prefix git writes before each worktree's path in `worktree list --porcelain`. @es El prefijo que git escribe antes de la ruta de cada worktree. */
const WORKTREE_RECORD = 'worktree ';

/**
 * The MAIN checkout of `tree` when `tree` is a LINKED worktree, else `undefined`. A selftest run in a linked worktree
 * can still write the main checkout (a module that finds "the main checkout" through the shared git dir, a fixture
 * that resolves its repository from there), and that checkout is not the tree under test, so the runner watches its
 * `git status` too. Git names the main worktree first in `git worktree list --porcelain`; a bare repository has no
 * working tree to watch, and the tree that IS the main checkout is already watched as the tree itself.
 * @es El checkout PRINCIPAL de `tree` cuando `tree` es un worktree ENLAZADO; si no, `undefined`. Un selftest que corre
 * en un worktree enlazado aún puede escribir el checkout principal, que no es el árbol bajo prueba, así que el runner
 * vigila también su `git status`. Git nombra primero el worktree principal; un repositorio bare no tiene árbol que
 * vigilar, y el árbol que ES el checkout principal ya se vigila como árbol.
 */
export function mainCheckoutOf(tree) {
  const listed = spawnSync('git', ['-C', tree, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', windowsHide: true });

  if (listed.error || listed.status !== 0) throw new TreeStatusError(tree, (listed.error?.message ?? listed.stderr ?? '').trim());

  const [first = ''] = listed.stdout.split('\n\n');
  const lines = first.split('\n');
  const main = lines[0].startsWith(WORKTREE_RECORD) ? lines[0].slice(WORKTREE_RECORD.length) : undefined;

  if (main === undefined || lines.includes('bare')) return undefined;

  return realpathSync.native(main) === realpathSync.native(tree) ? undefined : main;
}

/**
 * What changed in the tree between two listings: `{ path, change }`, `change` one of `added` (a path git did not
 * list before), `changed` (listed in both, different), `removed` (listed before, no longer), sorted by path.
 * @es Lo que cambió en el árbol entre dos listados: `added`, `changed` o `removed`, ordenado por ruta.
 */
export function treeChanges(before, after) {
  const changes = [];

  for (const [entry, signature] of after) {
    if (!before.has(entry)) changes.push({ path: entry, change: 'added' });
    else if (before.get(entry) !== signature) changes.push({ path: entry, change: 'changed' });
  }

  for (const entry of before.keys()) if (!after.has(entry)) changes.push({ path: entry, change: 'removed' });

  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
