/**
 * Where a hook mechanism keeps its state: the ONE resolution every module goes through. `HOOK_STATE_DIR`
 * (when set and non-empty) is the root of every mechanism's state directory, and a mechanism's own is
 * `<root>/<mechanism>`; otherwise each mechanism uses `<claudeHome()>/<mechanism>/state`, and `claudeHome()`
 * is `HOOK_CLAUDE_HOME` or `<homedir>/.claude`. Both variables are read at EACH call, never cached at import,
 * so a test that sets them after importing the module still redirects every write (H1-d).
 *
 * WHY ONE MODULE. Every guard used to join `<its own directory>/state` itself, and every selftest that
 * spawned the real guard then read or wrote that live directory: a selftest run grew the live journals and
 * registries with test data, and a stale line there could pass a check that never ran. With one resolution
 * there is one place to redirect (`isolateState`, and the selftest runner's fresh state home per selftest)
 * and one place `census.mjs` can look for a module that resolved its own.
 *
 * `stateDirIn(home, mechanism)` is the same layout for a Claude home given as a parameter (a backup or a
 * rotation of a home that is not this process's); `stateDirsUnder(home)` lists the ones that exist.
 *
 * @es Dónde guarda su estado un mecanismo de hooks: la ÚNICA resolución por la que pasa todo módulo.
 * `HOOK_STATE_DIR` (fijada y no vacía) es la raíz del estado de cada mecanismo, y el de uno es
 * `<raíz>/<mecanismo>`; si no, cada uno usa `<claudeHome()>/<mecanismo>/state`, y `claudeHome()` es
 * `HOOK_CLAUDE_HOME` o `<homedir>/.claude`. Las dos variables se leen en CADA llamada, nunca al importar
 * (H1-d). POR QUÉ UN MÓDULO: antes cada guardia unía su `state` por su cuenta y cada selftest que lanzaba la
 * guardia real escribía en ese directorio vivo, haciendo crecer journals y registros con datos de prueba.
 * Con una resolución hay un sitio que redirigir (`isolateState`, y el home de estado nuevo que el runner da a
 * cada selftest) y uno donde `census.mjs` busca a quien resolvió el suyo. `stateDirIn(home, mecanismo)` es la
 * misma disposición para un home dado como parámetro; `stateDirsUnder(home)` lista los que existen.
 */

import { lstatSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { bilingual } from './message-table.mjs';

/** The variable that relocates every mechanism's state. @es La variable que reubica el estado de cada mecanismo. */
export const STATE_ROOT_VARIABLE = 'HOOK_STATE_DIR';

/** The variable that relocates the Claude home. @es La variable que reubica el home de Claude. */
export const CLAUDE_HOME_VARIABLE = 'HOOK_CLAUDE_HOME';

/** The folder of a mechanism that holds its state, in the default layout. @es La carpeta de un mecanismo con su estado. */
const STATE_FOLDER = 'state';

/** One environment variable, read now. @es Una variable de entorno, leída ahora. */
const readEnv = (name) => process.env[name];

/** A plain name: it can never climb out of its parent directory. @es Un nombre simple: no puede salir de su directorio padre. */
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The Claude home: `HOOK_CLAUDE_HOME`, else `<homedir>/.claude`. @es El home de Claude. */
export function claudeHome() {
  const override = readEnv(CLAUDE_HOME_VARIABLE);

  return override ? path.resolve(override) : path.join(homedir(), '.claude');
}

/** Refuses a mechanism name that is not a plain name. @es Rechaza un nombre de mecanismo que no es simple. */
export function assertMechanism(mechanism) {
  if (typeof mechanism !== 'string' || !PLAIN_NAME.test(mechanism)) throw new Error(bilingual('bad-mechanism', { value: JSON.stringify(mechanism) }));
}

/** Whether `name` is a plain mechanism name. @es Si `name` es un nombre de mecanismo simple. */
export const isMechanismName = (name) => typeof name === 'string' && PLAIN_NAME.test(name);

/**
 * The state directory of `mechanism` under the Claude home `home`, in the default layout.
 * @es El directorio de estado de `mechanism` bajo el home de Claude `home`.
 */
export function stateDirIn(home, mechanism) {
  assertMechanism(mechanism);

  return path.join(path.resolve(home), mechanism, STATE_FOLDER);
}

/** The state directory of `mechanism`. @es El directorio de estado de `mechanism`. */
export function stateDir(mechanism) {
  assertMechanism(mechanism);

  const root = readEnv(STATE_ROOT_VARIABLE);

  return root ? path.join(path.resolve(root), mechanism) : stateDirIn(claudeHome(), mechanism);
}

/**
 * The directory every mechanism's state hangs from: `HOOK_STATE_DIR` when set, else the Claude home.
 * @es El directorio del que cuelga el estado de cada mecanismo: `HOOK_STATE_DIR` si está fijada, si no el home.
 */
export function stateRoot() {
  const root = readEnv(STATE_ROOT_VARIABLE);

  return root ? path.resolve(root) : claudeHome();
}

/** Whether `candidate` is a real directory, never through a link. @es Si `candidate` es un directorio real, sin cruzar enlaces. */
const isRealDirectory = (candidate) => lstatSync(candidate, { throwIfNoEntry: false })?.isDirectory() === true;

/**
 * The plain-named directories directly in `directory`, sorted; none when it is absent. A `directory` that exists
 * but cannot be listed (a file, no permission) throws: an unreadable root is an error, never an empty one. The
 * root itself may be a link (a Claude home often is); the children it holds are never followed.
 * @es Los directorios de nombre simple de `directory`, ordenados; ninguno si no existe. Uno que existe y no se
 * puede listar lanza: una raíz ilegible es un error, nunca una vacía. La raíz puede ser un enlace; sus hijos no se siguen.
 */
function plainChildren(directory, readDirectory) {
  if (lstatSync(directory, { throwIfNoEntry: false }) === undefined) return [];

  return readDirectory(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isMechanismName(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * The mechanisms whose state directory exists now, as `stateDir` resolves it, sorted.
 * @es Los mecanismos cuyo directorio de estado existe ahora, tal como lo resuelve `stateDir`, ordenados.
 */
export function mechanismsWithState(readDirectory = readdirSync) {
  return plainChildren(stateRoot(), readDirectory).filter((name) => isRealDirectory(stateDir(name)));
}

/**
 * Every `{ mechanism, directory }` whose default-layout state directory exists under the Claude home `home`,
 * never through a link, sorted by mechanism.
 * @es Cada `{ mechanism, directory }` cuyo directorio de estado existe bajo el home `home`, sin cruzar enlaces.
 */
export function stateDirsUnder(home, readDirectory = readdirSync) {
  return plainChildren(path.resolve(home), readDirectory)
    .map((mechanism) => ({ mechanism, directory: stateDirIn(home, mechanism) }))
    .filter(({ directory }) => isRealDirectory(directory));
}

/**
 * Points this process, and every child it spawns, at a fresh temp directory for state, removed when the
 * process exits. Returns the directory. For a selftest to call before it runs anything.
 * @es Apunta este proceso, y cada hijo que lance, a un directorio temporal nuevo para el estado, que se
 * borra al salir. Devuelve el directorio. Para que un selftest lo llame antes de ejecutar nada.
 */
export function isolateState(label = 'selftest') {
  assertMechanism(label);

  const root = mkdtempSync(path.join(tmpdir(), `hook-state-${label}-`));

  process.env[STATE_ROOT_VARIABLE] = root;
  process.once('exit', () => rmSync(root, { recursive: true, force: true }));

  return root;
}
