/**
 * Finds the `.claude/fleet-kit.json` that governs a directory, and the repository facts every guard needs.
 *
 * THE QUESTION: "which repository does a command in this directory act on, and what did that repository
 * declare about itself?" The payload's `cwd` is never trusted to be a repository root. Git is asked for
 * the directory's top level and its COMMON git dir, so a linked worktree maps to its main checkout; the
 * directory is mapped to the same relative path inside the main checkout, and the walk goes up from
 * there to the main checkout's top. The first config found governs. That is how one config covers every
 * worktree of a repository, and how a config in a subfolder (`fuentes/discovery-api/`) governs exactly
 * that subtree of a larger repository.
 *
 * @es Encuentra el `.claude/fleet-kit.json` que gobierna un directorio y los hechos de repositorio que
 * necesita cada guarda. Nunca se fía del `cwd` del payload: le pide a git el nivel superior y el git dir
 * COMÚN (un worktree enlazado se mapea a su checkout principal), mapea el directorio a la misma ruta
 * dentro del checkout principal y sube hasta su raíz. La primera configuración encontrada gobierna.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { gitAsker } from '../lib/git.mjs';
import { configProblems } from './validate.mjs';

/** Where a project keeps its kit config, relative to the project directory. @es Dónde guarda un proyecto su config. */
export const CONFIG_RELATIVE = path.join('.claude', 'fleet-kit.json');

const realpathOf = (directory) => {
  try {
    return realpathSync.native(directory);
  } catch {
    return path.resolve(directory);
  }
};

/**
 * The repository `directory` belongs to, as `{ top, mainCheckout, relative }`, or `undefined` when it is
 * not inside a git work tree. `top` is the work tree holding `directory` (a linked worktree or the main
 * checkout); `relative` is `directory`'s path below `top`.
 * @es El repositorio al que pertenece `directory`, o `undefined` si no está en un árbol de trabajo git.
 */
export function locateRepository(directory, ask = gitAsker(directory)) {
  const top = ask('rev-parse', '--show-toplevel');
  const common = ask('rev-parse', '--path-format=absolute', '--git-common-dir');

  if (top.status !== 0 || common.status !== 0 || top.stdout.length === 0) return undefined;

  const topPath = realpathOf(top.stdout);

  return {
    top: topPath,
    mainCheckout: realpathOf(path.dirname(common.stdout)),
    relative: path.relative(topPath, realpathOf(directory))
  };
}

/**
 * Reads and validates one config file. Throws with every problem named: a broken config is a
 * malfunction the guard journals, never "no config".
 * @es Lee y valida un fichero de config. Lanza nombrando cada problema.
 */
export function readConfigFile(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const problems = configProblems(config);

  if (problems.length > 0) throw new Error(`${configPath} is invalid:\n  - ${problems.join('\n  - ')}`);

  return config;
}

/**
 * The config governing `directory`, as `{ config, configPath, projectDir, repository }`, or `undefined`
 * when no config governs it. `projectDir` is the config's project directory relative to the main
 * checkout (`''` for the top level).
 * @es La config que gobierna `directory`, o `undefined` si ninguna lo gobierna.
 */
export function findConfig(directory, ask = gitAsker(directory)) {
  const repository = locateRepository(directory, ask);

  if (repository === undefined || repository.relative.startsWith('..')) return undefined;

  let candidateDir = path.join(repository.mainCheckout, repository.relative);

  for (;;) {
    const configPath = path.join(candidateDir, CONFIG_RELATIVE);

    if (existsSync(configPath)) {
      return { config: readConfigFile(configPath), configPath, projectDir: path.relative(repository.mainCheckout, candidateDir).split(path.sep).join('/'), repository };
    }
    if (path.relative(repository.mainCheckout, candidateDir) === '') return undefined;

    candidateDir = path.dirname(candidateDir);
  }
}
