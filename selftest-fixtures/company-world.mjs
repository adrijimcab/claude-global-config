/**
 * A constructed "company world" for the company-guard selftests: a throwaway repository whose `origin` has
 * a fetch URL on a SIMULATED company host and a push URL that is a real bare repository, with `main`
 * already pushed once (so the remote-tracking ref exists), and a configuration file naming the simulated
 * host. The simulation is a host NAME in the configuration; nothing here touches a network.
 * Creating a world points `CLAUDE_COMPANY_CONFIG` at its configuration file for this process (and so for
 * every child process the selftest spawns).
 *
 * @es Un "mundo de empresa" construido para los selftests de las guardias: un repositorio desechable cuyo
 * `origin` tiene una URL de fetch en un host de empresa SIMULADO y una URL de push que es un repositorio
 * bare real, con `main` ya subido una vez (para que exista la ref de seguimiento) y un fichero de
 * configuración que nombra ese host. La simulación es un NOMBRE de host en la configuración; no hay red.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createGitSandbox } from './git-sandbox.mjs';

/** The simulated company host. @es El host de empresa simulado. */
export const COMPANY_HOST = 'gitlab.company.test';

/** The company URL given to `origin`. @es La URL de empresa de `origin`. */
export const COMPANY_URL = `http://${COMPANY_HOST}/internal/project.git`;

/** A personal URL, for the "never judged" side. @es Una URL personal. */
export const PERSONAL_URL = 'https://github.com/adrijimcab/project.git';

/** The tool names the simulated configuration lists. @es Los nombres que lista la configuración simulada. */
export const NAMES = ['claude', 'anthropic', 'engram', 'openspec', 'gentle-ai', 'copilot', 'chatgpt', 'openai'];

/**
 * @returns `{ repo, bare, configFile, git, write, commit, cleanup }`; `git(...args)` returns a spawn result,
 *   `write(rel, text)` writes a file in the repo, `commit(message)` stages everything and commits it.
 * @es El mundo: `repo`, `bare`, `configFile` y las ayudas `git`, `write`, `commit`, `cleanup`.
 */
export function createCompanyWorld({ url = COMPANY_URL, seed = true } = {}) {
  const sandbox = createGitSandbox();
  const bare = path.join(sandbox.root, 'remote.git');
  const configFile = path.join(sandbox.root, 'company-config.json');
  const git = (...args) => sandbox.git(args);

  git('init', '--bare', '-q', '-b', 'main', bare);
  writeFileSync(configFile, JSON.stringify({ names: NAMES, hosts: [COMPANY_HOST] }));
  process.env.CLAUDE_COMPANY_CONFIG = configFile;

  const write = (relative, text) => {
    const file = path.join(sandbox.repoDir, relative);

    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const commit = (message) => {
    git('add', '-A');

    return git('commit', '-q', '-m', message);
  };

  git('remote', 'add', 'origin', url);
  git('remote', 'set-url', '--push', 'origin', bare);

  if (seed) {
    write('README.md', 'hello\n');
    commit('chore: initial commit');
    git('push', '-q', 'origin', 'main');
  }

  return { repo: sandbox.repoDir, bare, configFile, git, write, commit, cleanup: sandbox.cleanup };
}
