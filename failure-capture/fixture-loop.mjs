/**
 * Provisions a fixture's copy of the failure-capture loop for a selftest: the loop's own modules plus the
 * shared `bilingual-output` modules that `capture.mjs` imports from its sibling directory, so a sandboxed
 * `capture.mjs` resolves the same imports it has in the real tree.
 *
 * @es Aprovisiona la copia del lazo failure-capture de un fixture para un selftest: los módulos del propio
 * lazo más los módulos compartidos de `bilingual-output` que `capture.mjs` importa de su directorio hermano,
 * de modo que un `capture.mjs` en sandbox resuelve los mismos imports que en el árbol real.
 */

import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(HERE, '..', 'bilingual-output');

/** Copies every `.mjs` of `from` that `accept` keeps into `to`. @es Copia a `to` cada `.mjs` de `from` que `accept` conserva. */
function copyModules(from, to, accept) {
  mkdirSync(to, { recursive: true });

  for (const file of readdirSync(from)) if (file.endsWith('.mjs') && accept(file)) copyFileSync(path.join(from, file), path.join(to, file));
}

/**
 * Fills `loop` (a fixture's `failure-capture` directory) with this directory's modules that `accept` keeps,
 * and its sibling `bilingual-output` with the shared message and speaker modules.
 * @es Rellena `loop` (el directorio `failure-capture` de un fixture) con los módulos de este directorio que `accept` conserva, y su hermano `bilingual-output` con los módulos compartidos de mensaje y speaker.
 */
export function provisionLoop(loop, accept = () => true) {
  copyModules(HERE, loop, accept);
  copyModules(SHARED, path.join(loop, '..', 'bilingual-output'), (file) => !file.includes('selftest') && !file.includes('mutants'));
}
