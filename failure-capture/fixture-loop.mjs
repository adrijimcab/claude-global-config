/**
 * Provisions a fixture's copy of the failure-capture loop for a selftest: the loop's own modules plus the
 * shared `bilingual-output` modules that `capture.mjs` imports from its sibling directory, so a sandboxed
 * `capture.mjs` resolves the same imports it has in the real tree. A shared module the copied code imports
 * but the sandbox lacks is reported by name, here, instead of surfacing as a crash inside a child process.
 * The state-location module (`hook-state/locations.mjs`), the state lock the ledger lock adapts
 * (`hook-state/file-lock.mjs`) and the message table both speak through are copied
 * beside them, and so are the modules of the shared contract-parity engine (`agent-contract-parity/`) that
 * `promote-parity.mjs` imports, so the copy resolves its state the way the real loop does; `worldEnv` is the environment a
 * process of the world runs under, so that resolution lands in the world's own home.
 *
 * @es Aprovisiona la copia del lazo failure-capture de un fixture para un selftest: los módulos del propio
 * lazo más los módulos compartidos de `bilingual-output` que `capture.mjs` importa de su directorio hermano,
 * de modo que un `capture.mjs` en sandbox resuelve los mismos imports que en el árbol real. Un módulo
 * compartido que el código copiado importa pero el sandbox no tiene se informa por su nombre, aquí, en vez de
 * aparecer como un fallo dentro de un proceso hijo. Junto a ellos se copian los módulos del motor compartido de
 * paridad de contratos (`agent-contract-parity/`) que importa `promote-parity.mjs`. El módulo de ubicaciones de estado (`hook-state/locations.mjs`),
 * el lock de estado que adapta el lock del ledger (`hook-state/file-lock.mjs`) y la tabla de mensajes de ambos se
 * copian al lado, así la copia resuelve su estado como el lazo real; `worldEnv` es el
 * entorno de un proceso del mundo, para que esa resolución caiga en el home del propio mundo.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE } from '../hook-state/locations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED_DIRECTORY = 'bilingual-output';
/** The shared contract-parity engine the promotion reads. @es El motor compartido de paridad de contratos que lee la promoción. */
const ENGINE_DIRECTORY = 'agent-contract-parity';
/** A product module: never a selftest or a mutant campaign. @es Un módulo de producto: nunca un selftest ni una campaña de mutantes. */
const isProduct = (file) => !file.includes('selftest') && !file.includes('mutants');
/** The journal of authored writes the loop records into, and what it imports, by name. @es El journal de escrituras con autor en que registra el lazo, y lo que importa. */
const GUARD_DIRECTORY = 'config-sync-guard';
const GUARD_MODULES = new Set(['authored-writes.mjs', 'touched-paths.mjs', 'transcript-writes.mjs']);
/** The state-location module, the state lock the ledger lock adapts, and the message table both import, by name. @es El módulo de ubicaciones, el lock de estado que adapta el lock del ledger y la tabla que importan. */
const STATE_DIRECTORY = 'hook-state';
const STATE_MODULES = new Set(['locations.mjs', 'file-lock.mjs', 'message-table.mjs']);
/** An import statement (a line that starts with `import`), never a string that merely mentions one. @es Una sentencia import (línea que empieza por `import`), nunca una cadena que solo la menciona. */
const SHARED_IMPORT = /^import [^\n]*from '\.\.\/bilingual-output\/([A-Za-z0-9._-]+\.mjs)'/gm;

/** The real tree's source directories. @es Los directorios de origen del árbol real. */
const REAL_SOURCES = { guard: path.join(HERE, '..', GUARD_DIRECTORY), loop: HERE, shared: path.join(HERE, '..', SHARED_DIRECTORY), engine: path.join(HERE, '..', ENGINE_DIRECTORY), state: path.join(HERE, '..', STATE_DIRECTORY) };

/**
 * The environment a process of a constructed world runs under: `home` is the user's home, the Claude home is
 * the directory that holds the copied `loop` (`<home>/.claude` unless the world put the loop elsewhere) and no
 * state root is set, so the copy keeps its state in `<loop>/state`, the world's own, whatever the calling
 * process was isolated to. `base` is the environment it starts from.
 * @es El entorno de un proceso de un mundo construido: `home` es el home del usuario, el home de Claude es el
 * directorio que contiene el `loop` copiado y no hay raíz de estado, así la copia guarda su estado en
 * `<loop>/state`, el del mundo, sea cual sea el aislamiento del proceso llamante.
 */
export const worldEnv = (home, { loop = path.join(home, '.claude', 'failure-capture'), base = process.env } = {}) => ({ ...base, HOME: home, USERPROFILE: home, [CLAUDE_HOME_VARIABLE]: path.dirname(loop), [STATE_ROOT_VARIABLE]: '' });

/** Copies every `.mjs` of `from` that `accept` keeps into `to`. @es Copia a `to` cada `.mjs` de `from` que `accept` conserva. */
function copyModules(from, to, accept) {
  mkdirSync(to, { recursive: true });

  for (const file of readdirSync(from)) if (file.endsWith('.mjs') && accept(file)) copyFileSync(path.join(from, file), path.join(to, file));
}

/**
 * The shared modules the modules in `loop` import and `shared` does not hold, by name.
 * @es Los módulos compartidos que importan los módulos de `loop` y `shared` no tiene, por nombre.
 */
function missingSharedModules(loop, shared) {
  const wanted = new Set();

  for (const file of readdirSync(loop)) {
    if (file.endsWith('.mjs')) for (const found of readFileSync(path.join(loop, file), 'utf8').matchAll(SHARED_IMPORT)) wanted.add(found[1]);
  }

  return [...wanted].filter((name) => !existsSync(path.join(shared, name))).sort();
}

/**
 * Fills `loop` (a fixture's `failure-capture` directory) with the loop modules that `accept` keeps, and its
 * sibling `bilingual-output` with the shared message and speaker modules. `sources` names where each comes
 * from (the real tree by default). Throws, naming them, when a shared module the loop imports is missing.
 * @es Rellena `loop` (el directorio `failure-capture` de un fixture) con los módulos del lazo que `accept` conserva, y su hermano `bilingual-output` con los módulos compartidos de mensaje y speaker. `sources` dice de dónde sale cada uno (el árbol real por defecto). Lanza, nombrándolos, si falta un módulo compartido que el lazo importa.
 */
export function provisionLoop(loop, accept = () => true, sources = REAL_SOURCES) {
  const shared = path.join(loop, '..', SHARED_DIRECTORY);

  copyModules(sources.loop, loop, accept);
  copyModules(sources.shared, shared, isProduct);
  copyModules(sources.engine ?? REAL_SOURCES.engine, path.join(loop, '..', ENGINE_DIRECTORY), isProduct);
  copyModules(sources.guard ?? REAL_SOURCES.guard, path.join(loop, '..', GUARD_DIRECTORY), (file) => GUARD_MODULES.has(file));
  copyModules(sources.state ?? REAL_SOURCES.state, path.join(loop, '..', STATE_DIRECTORY), (file) => STATE_MODULES.has(file));

  const missing = missingSharedModules(loop, shared);

  if (missing.length > 0) throw new Error(`shared module(s) the loop imports are missing from the sandbox: ${missing.join(', ')}. @es faltan en el sandbox módulos compartidos que importa el lazo: ${missing.join(', ')}.`);
}
