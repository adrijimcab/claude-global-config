/**
 * The worktree's OWN install, the default strategy: the project's package manager reproduces the lockfile
 * inside the worktree, then the result is VERIFIED, then a receipt says which lockfile produced the tree.
 *
 * VERIFIED BY THE TREE, never by the exit code. After the install, `toolchain-guard/tree-tenancy.mjs` must call
 * the worktree's `node_modules` OWN (a real directory with no link out of the checkout): an install that
 * exited 0 into a tree still linked into another checkout would be the junction under a new name.
 *
 * THE RECEIPT, `node_modules/.worktree-install.json`, records the lockfile's name and sha256. It is what lets a
 * removal guard tell this tree apart from work (`integrated-worktree-guard/declared-run-output.mjs`): a tree
 * the receipt matches is reproducible from the tracked lockfile, so deleting it loses nothing. A tree with no
 * receipt, or one whose lockfile moved on since, stays work.
 *
 * ONLY npm RUNS, being the one manager measured (`strategy.mjs` `ownInstallFor`); its CLI is run as
 * `node npm-cli.js`, never through the `npm.cmd` shim, which Windows will not spawn without a shell.
 *
 * @es La instalación PROPIA del worktree, la estrategia por defecto: el gestor reproduce el lockfile dentro
 * del worktree, se VERIFICA el resultado y un recibo dice qué lockfile produjo el árbol. Se verifica por el
 * árbol, nunca por el exit code: `tree-tenancy.mjs` debe llamarlo OWN. El recibo permite a una guarda de
 * borrado distinguir este árbol del trabajo: si el recibo casa, es reproducible desde el lockfile versionado.
 * Solo corre npm, el único gestor medido, como `node npm-cli.js` y nunca por el shim `npm.cmd`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { TENANCY, tenancyOf } from '../toolchain-guard/tree-tenancy.mjs';
import { hashFile } from './verdict-store.mjs';

/** The receipt's file name inside `node_modules`. @es El nombre del recibo dentro de `node_modules`. */
export const RECEIPT = '.worktree-install.json';

/** How many trailing output lines a failure keeps. @es Cuántas líneas finales guarda un fallo. */
const TAIL_LINES = 12;

/**
 * Where npm's CLI script is for the node running this, or `undefined`. The candidates are the layouts node
 * itself ships: `npm_execpath` when run under npm, then the Windows and the POSIX install trees.
 * @es Dónde está el script de la CLI de npm para este node, o `undefined`.
 */
export function npmCli({ env = process.env, execPath = process.execPath, exists = existsSync } = {}) {
  const fromEnv = typeof env.npm_execpath === 'string' && env.npm_execpath.endsWith('npm-cli.js') ? [env.npm_execpath] : [];
  const home = path.dirname(execPath);
  const candidates = [...fromEnv, path.join(home, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(home, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];

  return candidates.find((candidate) => exists(candidate));
}

/**
 * Runs the own install in `installDir` (the directory holding `lockfile`) and verifies it.
 *
 * @param options.installDir The worktree directory that holds the lockfile.
 * @param options.lockfile The lockfile's absolute path in that directory.
 * @param options.command `ownInstallFor(profile)`.
 * @param options.spawn Injectable `spawnSync`; options.cli injectable npm CLI path.
 * @param options.env The install's environment: the user's own by default, so production keeps the user's npm
 *   cache; a selftest names a cache of its own here (`npm_config_cache`) and never writes the real one.
 * @returns `{ ok: true, receipt }` or `{ ok: false, reason, tail? }`.
 * @es Corre la instalación propia en `installDir` y la verifica.
 */
export function ownInstall({ installDir, lockfile, command, spawn = spawnSync, cli = npmCli(), env = process.env }) {
  if (command?.ok !== true) {
    return { ok: false, reason: command?.advice === undefined ? `no own install for package manager ${String(command?.manager)}` : `run \`${command.advice}\` in ${installDir} (only npm is automated)` };
  }

  if (cli === undefined || cli === null) return { ok: false, reason: 'npm-cli.js not found next to this node' };

  const lockfileHash = hashFile(lockfile);

  if (lockfileHash === undefined) return { ok: false, reason: `the lockfile ${lockfile} cannot be read` };

  const result = spawn(process.execPath, [cli, ...command.args], { cwd: installDir, encoding: 'utf8', windowsHide: true, env });
  const tail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.split('\n').filter((line) => line.trim() !== '').slice(-TAIL_LINES);

  if (result.error !== undefined) return { ok: false, reason: `the install could not start: ${String(result.error.code ?? result.error.message)}`, tail };
  if (result.status !== 0) return { ok: false, reason: `\`${command.manager} ${command.args.join(' ')}\` exited ${String(result.status ?? result.signal)}`, tail };

  const tenancy = tenancyOf(installDir);

  if (tenancy.state !== TENANCY.OWN) return { ok: false, reason: `the install exited 0 but node_modules is ${tenancy.state}, not this checkout's own tree`, tail };

  const receipt = { version: 1, lockfile: path.basename(lockfile), lockfileHash, manager: command.manager, installedAt: new Date().toISOString() };

  writeFileSync(path.join(installDir, 'node_modules', RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  return { ok: true, receipt };
}
