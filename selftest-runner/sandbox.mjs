/**
 * The private sandbox one selftest runs in: a directory of its own holding a home, a state root and a temp
 * directory, all empty, and the environment that points the child at them. ISOLATION BY CONSTRUCTION: a child
 * that resolves the user's home, the Claude home, the hook state or the temp directory through the environment
 * lands inside its sandbox, so another process writing the real home while the selftest runs is never in what
 * the runner looks at.
 *
 * LAYOUT, under `<tmpdir>/selftest-sandbox-XXXX/`:
 *   - `home/`         is `HOME` and `USERPROFILE` (what `os.homedir()` returns on every platform);
 *   - `home/.claude/` is `HOOK_CLAUDE_HOME`, the Claude home `hook-state/locations.mjs` resolves, created empty;
 *   - `state/`        is `HOOK_STATE_DIR`, the ONE place a mechanism may write its state, outside the home;
 *   - `temp/`         is `TMP`, `TEMP` and `TMPDIR` (what `os.tmpdir()` returns on every platform).
 * `SELFTEST_TREE` carries the top level of the tree under test, absolute: a selftest that has to read the tree
 * (a contract file, a settings file) reads it from there, never from the home, which is now empty.
 * `SELFTEST_FLEET` carries the fleet that holds this runner (`~/.claude`), for a project selftest that imports a
 * shared fleet module; it is read-only by contract.
 * `NODE_DISABLE_COMPILE_CACHE` is set, so no Node process of the child leaves a compile cache in its temp.
 *
 * WHAT IT CANNOT REACH: a path a module builds without the environment (a hard-coded absolute path), and the
 * other per-user directories Windows keeps in `APPDATA`/`LOCALAPPDATA`, which stay the real ones.
 *
 * @es El sandbox privado en el que corre un selftest: un directorio propio con un home, una raíz de estado y un
 * directorio temporal, todos vacíos, y el entorno que apunta al hijo hacia ellos. AISLAMIENTO POR CONSTRUCCIÓN:
 * un hijo que resuelve el home del usuario, el home de Claude, el estado de hooks o el temporal por el entorno
 * cae dentro de su sandbox, así que otro proceso que escriba el home real durante el selftest nunca está en lo
 * que mira el runner. DISPOSICIÓN: `home/` es `HOME` y `USERPROFILE`; `home/.claude/` es `HOOK_CLAUDE_HOME`,
 * creado vacío; `state/` es `HOOK_STATE_DIR`, el ÚNICO sitio donde un mecanismo puede escribir su estado, fuera
 * del home; `temp/` es `TMP`, `TEMP` y `TMPDIR`. `SELFTEST_TREE` lleva el nivel superior del árbol bajo prueba,
 * absoluto: un selftest que necesita leer el árbol lo lee de ahí, nunca del home, que ahora está vacío.
 * `SELFTEST_FLEET` lleva la flota que contiene este runner (`~/.claude`), para un selftest de proyecto que importa
 * un módulo compartido; por contrato es de solo lectura. Se fija
 * `NODE_DISABLE_COMPILE_CACHE`, así ningún proceso Node del hijo deja una caché de compilación en su temporal. NO
 * ALCANZA una ruta que un módulo construye sin el entorno (una ruta absoluta fija) ni los demás directorios por
 * usuario de Windows (`APPDATA`/`LOCALAPPDATA`), que siguen siendo los reales.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE } from '../hook-state/locations.mjs';

/** The variable that names the tree under test. @es La variable que nombra el árbol bajo prueba. */
export const TREE_VARIABLE = 'SELFTEST_TREE';

/**
 * The variable that names the FLEET: the configuration tree that holds this runner (`~/.claude`), derived from
 * where this module lives and never from the home, which in the sandbox is empty. A project's selftest that
 * imports a shared module of the fleet (for example `hook-payloads/payloads.mjs`) resolves it from here. It is
 * for reading shared modules only: anything written under it is the real fleet, outside every sandbox seam.
 * @es La variable que nombra la FLOTA: el árbol de configuración que contiene este runner (`~/.claude`), derivado
 * de dónde vive este módulo y nunca del home, que en el sandbox está vacío. Un selftest de proyecto que importa un
 * módulo compartido de la flota lo resuelve desde aquí. Es solo para leer módulos compartidos: lo que se escriba
 * debajo es la flota real, fuera de toda costura del sandbox.
 */
export const FLEET_VARIABLE = 'SELFTEST_FLEET';

/** The fleet root: the directory above `selftest-runner/`. @es La raíz de la flota: el directorio sobre `selftest-runner/`. */
const FLEET_ROOT = path.resolve(import.meta.dirname, '..');

/** The variables `os.homedir()` reads. @es Las variables que lee `os.homedir()`. */
const HOME_VARIABLES = ['HOME', 'USERPROFILE'];

/** The variables `os.tmpdir()` reads. @es Las variables que lee `os.tmpdir()`. */
const TEMP_VARIABLES = ['TMP', 'TEMP', 'TMPDIR'];

/**
 * The variable that turns Node's module compile cache off. npm 10.9 calls `module.enableCompileCache()` with no
 * directory, which writes `<tmpdir>/node-compile-cache`: every selftest that runs npm would leave that cache in its
 * private temp. A cache is an optimisation, never part of what a selftest proves, so it is off in the sandbox.
 * @es La variable que apaga la caché de compilación de módulos de Node. npm 10.9 llama a
 * `module.enableCompileCache()` sin directorio, que escribe `<tmpdir>/node-compile-cache`: cada selftest que
 * ejecuta npm dejaría esa caché en su temporal privado. Una caché es una optimización, nunca parte de lo que
 * prueba un selftest, así que en el sandbox está apagada.
 */
const COMPILE_CACHE_OFF = 'NODE_DISABLE_COMPILE_CACHE';

/** The Claude home inside a sandbox home. @es El home de Claude dentro del home del sandbox. */
export const CLAUDE_FOLDER = '.claude';

/**
 * Creates a fresh sandbox under `parent`: `{ root, home, claudeHome, state, temp }`, every directory empty.
 * @es Crea un sandbox nuevo bajo `parent`, con cada directorio vacío.
 */
export function createSandbox(parent = tmpdir()) {
  const root = mkdtempSync(path.join(parent, 'selftest-sandbox-'));
  const home = path.join(root, 'home');
  const sandbox = { root, home, claudeHome: path.join(home, CLAUDE_FOLDER), state: path.join(root, 'state-root'), temp: path.join(root, 'temp') };

  for (const directory of [sandbox.claudeHome, sandbox.state, sandbox.temp]) mkdirSync(directory, { recursive: true });

  return sandbox;
}

/**
 * Sets `name` in `env`, first removing any spelling of it that differs only in case: Windows reads its
 * variables case-insensitively, so a stale `Temp` beside a new `TEMP` would leave the child two answers.
 * @es Fija `name` en `env`, quitando antes cualquier grafía que solo difiera en mayúsculas: Windows lee sus
 * variables sin distinguirlas, y un `Temp` viejo junto a un `TEMP` nuevo dejaría al hijo dos respuestas.
 */
function setVariable(env, name, value) {
  for (const key of Object.keys(env)) if (key.toUpperCase() === name) delete env[key];

  env[name] = value;
}

/**
 * The environment of a child that runs in `sandbox`: `base` with every home, state and temp variable pointed
 * into the sandbox, and `SELFTEST_TREE` set to `tree`.
 * @es El entorno de un hijo que corre en `sandbox`: `base` con cada variable de home, estado y temporal
 * apuntando dentro del sandbox, y `SELFTEST_TREE` en `tree`.
 */
export function sandboxEnv(sandbox, { base, tree }) {
  const env = { ...base };

  for (const name of HOME_VARIABLES) setVariable(env, name, sandbox.home);
  for (const name of TEMP_VARIABLES) setVariable(env, name, sandbox.temp);
  setVariable(env, CLAUDE_HOME_VARIABLE, sandbox.claudeHome);
  setVariable(env, STATE_ROOT_VARIABLE, sandbox.state);
  setVariable(env, TREE_VARIABLE, path.resolve(tree));
  setVariable(env, FLEET_VARIABLE, FLEET_ROOT);
  setVariable(env, COMPILE_CACHE_OFF, '1');

  return env;
}

/** Removes a sandbox and everything in it, never through a link. @es Borra un sandbox y todo lo que contiene, sin cruzar enlaces. */
export function removeSandbox(sandbox) {
  rmSync(sandbox.root, { recursive: true, force: true });
}
