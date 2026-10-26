/**
 * What a run can pollute, read at one instant: the real state directories, the main checkout's `git status`,
 * and the entries of the temp root. The state population is DERIVED from git's own listing of the home's
 * ignored directories (the home repository is an allowlist, so every state directory is ignored): a guard
 * directory that appears tomorrow is watched tomorrow, with no list to forget to extend. Only `state`
 * directories are watched; other ignored directories (transcripts, caches) are written by live sessions
 * all day and would turn every verdict RED for a reason unrelated to the run.
 *
 * @es Lo que una corrida puede contaminar, leído en un instante: los directorios de estado reales, el `git
 * status` del checkout principal y las entradas de la raíz temporal. La población de estado se DERIVA del
 * listado de directorios ignorados del home que da git (el repo es una lista de permitidos, así que cada
 * directorio de estado está ignorado): un guard nuevo se vigila desde mañana sin lista que extender. Solo se
 * vigilan directorios `state`; los demás ignorados (transcripts, cachés) los escriben las sesiones vivas todo
 * el día y volverían ROJO cada veredicto por algo ajeno a la corrida.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { render } from '../bilingual-output/message.mjs';
import { MESSAGES } from './pollution-messages.mjs';

const STATE = 'state';
const IGNORED_PREFIX = '!! ';
const TRAILING_SLASH = /\/$/;
const REPOSITORY_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR'];

/** Raised when the state cannot be measured. @es Se lanza cuando no se puede medir el estado. */
export class SnapshotError extends Error {}

/** Git run in `root` and its NUL-separated output; a hook's repository selectors are dropped. @es Git en `root`; se descartan los selectores de repositorio de un hook. */
function gitEntries(root, args, env) {
  const clean = { ...env };

  for (const name of REPOSITORY_SELECTORS) delete clean[name];

  const result = spawnSync('git', ['-C', root, ...args], { env: clean, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });

  if (result.error || result.status !== 0) throw new SnapshotError(render(MESSAGES['cannot-list'], { root, reason: (result.error?.message ?? result.stderr ?? '').trim() }));

  return result.stdout.split('\0').filter((entry) => entry !== '');
}

/** True when `directory` exists and is a real directory. @es Verdadero si `directory` existe y es un directorio real. */
const isDirectory = (directory) => lstatSync(directory, { throwIfNoEntry: false })?.isDirectory() === true;

/**
 * The state directories of the home, relative to it: for each ignored directory git lists, the directory
 * itself when it is named `state`, else its `state` child when it has one.
 * @es Los directorios de estado del home, relativos a él: por cada directorio ignorado que lista git, el
 * mismo si se llama `state`, si no su hijo `state` cuando lo tiene.
 */
export function stateDirsOf({ home, env = process.env }) {
  const ignored = gitEntries(home, ['status', '--ignored', '--porcelain', '-z'], env)
    .filter((entry) => entry.startsWith(IGNORED_PREFIX))
    .map((entry) => entry.slice(IGNORED_PREFIX.length).replace(TRAILING_SLASH, ''));
  const states = ignored.map((entry) => (path.posix.basename(entry) === STATE ? entry : `${entry}/${STATE}`));

  return states.filter((relative) => isDirectory(path.join(home, ...relative.split('/'))));
}

/**
 * Size and mtime of a path, never following a link; a directory is marked, or carries its mtime when asked.
 * @es Tamaño y mtime de una ruta, sin seguir enlaces; un directorio se marca, o lleva su mtime si se pide.
 */
function signatureOf(file, directoryTime = false) {
  const stat = lstatSync(file, { throwIfNoEntry: false });

  if (stat === undefined) return 'absent';
  if (stat.isDirectory()) return directoryTime ? `dir:${stat.mtimeMs}` : 'dir';

  return `${stat.size}:${stat.mtimeMs}`;
}

/** Records every path under `directory` (links are not entered). @es Registra cada ruta bajo `directory`. */
function walk(directory, relative, into) {
  into.set(relative, signatureOf(directory));

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;

    if (entry.isDirectory()) walk(path.join(directory, entry.name), child, into);
    else into.set(child, signatureOf(path.join(directory, entry.name)));
  }
}

/**
 * `git status` entries of `checkout`: path to status plus signature, so re-touching a dirty file shows. Renames
 * are not paired (`--no-renames`): a moved file is its old path removed and its new one added, both named.
 * @es Entradas de `git status`: ruta a estado más firma. Los renombres no se emparejan: un fichero movido es su ruta vieja quitada y la nueva agregada, las dos nombradas.
 */
function checkoutOf(checkout, env) {
  const entries = gitEntries(checkout, ['status', '--porcelain=v1', '-z', '--no-renames'], env);

  return new Map(entries.map((entry) => [entry.slice(3), `${entry.slice(0, 2)}|${signatureOf(path.join(checkout, entry.slice(3)), true)}`]));
}

/**
 * @param options.home The Claude home repository. @es El repositorio home de Claude.
 * @param options.checkout The main checkout (the home by default). @es El checkout principal (el home por defecto).
 * @param options.tempDir The temp root to watch for leftovers. @es La raíz temporal a vigilar.
 * @param options.env The environment git runs with. @es El entorno con el que corre git.
 * @returns `{ stateDirs, state, checkout, temp }`: the watched directories and three maps of path to signature.
 * @es Los directorios vigilados y tres mapas de ruta a firma.
 */
export function snapshotOf({ home, checkout = home, tempDir = tmpdir(), env = process.env }) {
  const stateDirs = stateDirsOf({ home, env });
  const state = new Map();

  for (const relative of stateDirs) walk(path.join(home, ...relative.split('/')), relative, state);

  const temp = new Map(readdirSync(tempDir).map((name) => [name, signatureOf(path.join(tempDir, name))]));

  return { stateDirs, state, checkout: checkoutOf(checkout, env), temp };
}
