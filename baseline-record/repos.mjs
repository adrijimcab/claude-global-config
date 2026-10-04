/**
 * The git before-image of a machine: the tip and branch of each in-scope repo, the product repos under a
 * projects root, their `git status --porcelain`, and an inventory of a directory that git does not track.
 * Everything here only READS: `status` runs with `--no-optional-locks`, so reading a repository we do not
 * own never refreshes (writes) its index; the inventory never follows a link.
 *
 * A product repo is any immediate child of the root that has a `.git` entry (a directory, or the file a
 * linked worktree has), decided by the tree, never by a list of names.
 *
 * @es La imagen previa de git de una máquina: punta y rama de cada repo en alcance, los repos de producto
 * bajo una raíz, su `git status --porcelain` y el inventario de un directorio que git no rastrea. Todo SOLO
 * LEE: `status` corre con `--no-optional-locks`, así que leer un repo ajeno nunca refresca (escribe) su
 * índice; el inventario nunca sigue un enlace. Un repo de producto es todo hijo directo de la raíz con una
 * entrada `.git`, decidido por el árbol y no por una lista de nombres.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** One git run: stdout, exit code and the verbatim command line. @es Una corrida de git: salida, código y línea de comandos literal. */
function runGit(args) {
  const run = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });

  return { stdout: run.stdout ?? '', exitCode: run.status, command: `git ${args.join(' ')}` };
}

/** The commit and branch of a repo through its explicit git dir and work tree. @es La punta y la rama de un repo por su git dir y árbol explícitos. */
export function gitTip({ name, worktree, gitDir }) {
  const base = [`--git-dir=${gitDir}`, `--work-tree=${worktree}`];
  const tip = runGit([...base, 'rev-parse', 'HEAD']);
  const branch = runGit([...base, 'symbolic-ref', '--short', '-q', 'HEAD']);

  return { name, worktree, gitDir, tip: tip.exitCode === 0 ? tip.stdout.trim() : undefined, tipExit: tip.exitCode, branch: branch.exitCode === 0 ? branch.stdout.trim() : undefined, branchExit: branch.exitCode, commands: [tip.command, branch.command] };
}

/** Every immediate child of `root` that has a `.git` entry. @es Cada hijo directo de `root` con una entrada `.git`. */
export function productRepos(root) {
  if (!existsSync(root)) return [];

  return readdirSync(root)
    .filter((name) => existsSync(path.join(root, name, '.git')))
    .map((name) => ({ name, dir: path.join(root, name) }));
}

/** The raw `git status --porcelain` lines of `dir` (optionally limited to `pathspec`), read-only. @es Las líneas de `git status --porcelain` de `dir`, solo lectura. */
export function porcelainOf({ name, dir, pathspec }) {
  const run = runGit(['-C', dir, '--no-optional-locks', 'status', '--porcelain', ...(pathspec === undefined ? [] : ['--', pathspec])]);

  return { name, command: run.command, exitCode: run.exitCode, measured: run.exitCode === 0, lines: run.exitCode === 0 ? run.stdout.split('\n').filter((line) => line !== '') : [] };
}

/** Files and bytes below `dir`, never following a link. @es Ficheros y bytes bajo `dir`, sin seguir enlaces. */
function treeSize(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const inner = treeSize(full);

      return { files: total.files + inner.files, bytes: total.bytes + inner.bytes };
    }

    return entry.isFile() ? { files: total.files + 1, bytes: total.bytes + lstatSync(full).size } : total;
  }, { files: 0, bytes: 0 });
}

/** Each top-level entry of `dir` with its kind, file count and bytes, plus the totals. @es Cada entrada de primer nivel de `dir` con su tipo, ficheros y bytes, y los totales. */
export function dirInventory(dir) {
  if (!existsSync(dir)) return { exists: false };

  const entries = readdirSync(dir, { withFileTypes: true }).map((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) return { name: entry.name, kind: 'dir', ...treeSize(full) };
    if (entry.isFile()) return { name: entry.name, kind: 'file', files: 1, bytes: lstatSync(full).size };

    return { name: entry.name, kind: 'link', files: 0, bytes: 0 };
  });

  return { exists: true, entries, totalFiles: entries.reduce((sum, entry) => sum + entry.files, 0), totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}
