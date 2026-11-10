/**
 * The fixtures the runner's selftests share: a counter of checks, git repositories CONSTRUCTED in a temp
 * directory (never the live tree, `guard-that-cannot-go-red`), each proved to be its own top level, and the
 * real runner invoked as a process. Every directory made here is removed by `cleanup`.
 *
 * @es Los fixtures que comparten los selftests del runner: un contador de checks, repositorios git
 * CONSTRUIDOS en un directorio temporal (nunca el árbol vivo), cada uno probado como su propio nivel
 * superior, y el runner real invocado como proceso. `cleanup` borra cada directorio creado aquí.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fileLockAdapter } from '../full-chain-lock/file-lock-adapter.mjs';
import { LOCK_TOKEN_VARIABLE } from '../full-chain-lock/lock-token.mjs';
import { stateDir } from '../hook-state/locations.mjs';

/** The real runner. @es El runner real. */
export const RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs');

/** Runs git inside a fixture. @es Ejecuta git dentro de un fixture. */
export function git(cwd, ...args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

/** Writes a fixture file, creating its directories. @es Escribe un fichero del fixture, creando sus directorios. */
export function put(root, relative, content) {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), content);
}

/** Runs the real runner as a process. @es Ejecuta el runner real como proceso. */
export function cli(cwd, ...args) {
  return spawnSync(process.execPath, [RUN, ...args], { cwd, encoding: 'utf8' });
}

/**
 * Runs the real runner as a process with `environment` laid over this process's own (a variable set to `undefined`
 * is removed), so a proof chooses the token the runner is given.
 * @es Ejecuta el runner real como proceso con `environment` sobre el entorno de este proceso (una variable en
 * `undefined` se quita), para que una prueba elija el token que recibe el runner.
 */
export function cliWith(environment, cwd, ...args) {
  const env = { ...process.env, ...environment };

  for (const name of Object.keys(env)) if (env[name] === undefined) delete env[name];

  return spawnSync(process.execPath, [RUN, ...args], { cwd, encoding: 'utf8', env });
}

/**
 * Makes this process hold the REAL full-chain lock in its (isolated) state directory, the way `full-chain-lock/run.mjs`
 * does for a chain, and gives the runner's children the matching token through the environment: from here on every
 * runner this selftest starts is started under a lock that exists. It is released when the process exits. Returns the
 * token. The state directory must be isolated first (`isolateState`), so the live lock is never touched.
 * @es Hace que este proceso tenga el lock de cadenas completas REAL en su directorio de estado (aislado), como hace
 * `full-chain-lock/run.mjs` con una cadena, y da a los hijos el token correspondiente por el entorno: desde aquí cada
 * runner que este selftest inicia se inicia bajo un lock que existe. Se suelta al salir el proceso. Devuelve el token.
 * El directorio de estado debe estar aislado antes (`isolateState`), para no tocar nunca el lock vivo.
 */
export function holdLockForRunner() {
  const lock = fileLockAdapter(stateDir('full-chain-lock'));
  const record = { session: 'selftest', project: 'selftest-runner', chain: 'selftest-runner', tree: process.cwd(), pid: process.pid, startedAt: new Date().toISOString(), command: 'selftest' };

  if (!lock.tryTake(record)) throw new Error('the isolated state already holds a full-chain lock. @es el estado aislado ya tiene un lock de cadenas completas.');

  process.once('exit', () => lock.release());
  process.env[LOCK_TOKEN_VARIABLE] = lock.readToken();

  return lock.readToken();
}

/**
 * A fixture kit: `check` counts assertions and prints a failed one, `bareDir` makes a directory outside every
 * repository, `repo` builds one (`tracked` files enter the index, `loose` ones are written afterwards, untracked
 * or ignored by `ignore`), `finish` removes everything and exits with the verdict.
 * @es Un kit de fixtures: `check` cuenta aserciones e imprime las fallidas, `bareDir` crea un directorio fuera de
 * todo repo, `repo` construye uno, `finish` lo borra todo y sale con el veredicto.
 */
export function fixtureKit(name) {
  const made = [];
  const tally = { assertions: 0, failures: 0 };

  const check = (ok, label) => {
    tally.assertions += 1;
    if (ok) return;
    tally.failures += 1;
    console.error(`FAIL ${label} @es FALLO ${label}`);
  };

  const bareDir = () => {
    const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'selftest-runner-')));

    made.push(dir);

    return dir;
  };

  const repo = ({ tracked = {}, loose = {}, ignore = '', commit = false }) => {
    const root = bareDir();

    git(root, 'init', '-q');
    put(root, '.gitignore', ignore);
    for (const [file, content] of Object.entries(tracked)) put(root, file, content);
    git(root, 'add', '-A');
    if (commit) git(root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-q', '-m', 'fixture');
    for (const [file, content] of Object.entries(loose)) put(root, file, content);
    const top = git(root, 'rev-parse', '--show-toplevel').stdout.trim();

    check(realpathSync.native(top) === root, `fixture is its own repository top level: ${root}`);

    return root;
  };

  const finish = () => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
    console.log(`${name}: ${tally.assertions - tally.failures}/${tally.assertions} assertions passed @es aserciones superadas`);
    process.exit(tally.failures === 0 ? 0 : 1);
  };

  return { check, bareDir, repo, finish };
}
