/**
 * Provisions a fixture's copy of the failure-capture loop for a selftest: the loop's own modules plus the
 * shared `bilingual-output` modules that `capture.mjs` imports from its sibling directory, so a sandboxed
 * `capture.mjs` resolves the same imports it has in the real tree. A shared module the copied code imports
 * but the sandbox lacks is reported by name, here, instead of surfacing as a crash inside a child process.
 *
 * @es Aprovisiona la copia del lazo failure-capture de un fixture para un selftest: los módulos del propio
 * lazo más los módulos compartidos de `bilingual-output` que `capture.mjs` importa de su directorio hermano,
 * de modo que un `capture.mjs` en sandbox resuelve los mismos imports que en el árbol real. Un módulo
 * compartido que el código copiado importa pero el sandbox no tiene se informa por su nombre, aquí, en vez de
 * aparecer como un fallo dentro de un proceso hijo.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED_DIRECTORY = 'bilingual-output';
/** An import statement (a line that starts with `import`), never a string that merely mentions one. @es Una sentencia import (línea que empieza por `import`), nunca una cadena que solo la menciona. */
const SHARED_IMPORT = /^import [^\n]*from '\.\.\/bilingual-output\/([A-Za-z0-9._-]+\.mjs)'/gm;

/** The real tree's two source directories. @es Los dos directorios de origen del árbol real. */
const REAL_SOURCES = { loop: HERE, shared: path.join(HERE, '..', SHARED_DIRECTORY) };

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
  copyModules(sources.shared, shared, (file) => !file.includes('selftest') && !file.includes('mutants'));

  const missing = missingSharedModules(loop, shared);

  if (missing.length > 0) throw new Error(`shared module(s) the loop imports are missing from the sandbox: ${missing.join(', ')}. @es faltan en el sandbox módulos compartidos que importa el lazo: ${missing.join(', ')}.`);
}
