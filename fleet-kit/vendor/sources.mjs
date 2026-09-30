/**
 * The single list of modules the kit vendors byte-identical from the b100-am-ui reference fleet, and
 * where each lands. Both `sync.mjs` (which copies) and `provenance.mjs` (which checks) read this list,
 * so what is vendored and what is verified can never disagree.
 *
 * Each target keeps the SAME relative position its source has under `b100-am-ui/.claude/`, so the
 * modules' own relative imports (`../shell-command/...`, `../brief-tenancy/...`) resolve unchanged and
 * the copies stay byte-identical.
 *
 * @es La lista única de módulos que el kit vendoriza idénticos byte a byte desde la flota de referencia
 * de b100-am-ui, y dónde cae cada uno. `sync.mjs` (que copia) y `provenance.mjs` (que comprueba) leen
 * esta lista, así que lo vendorizado y lo verificado no pueden divergir. Cada destino conserva la misma
 * posición relativa que su fuente, para que sus imports relativos resuelvan sin cambios.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The reference fleet directory the vendored modules come from. @es El directorio de la flota de referencia. */
export const SOURCE_ROOT = path.join(os.homedir(), 'Desktop', 'Projects', 'b100-am-ui', '.claude');

/** Where the vendored copies live. @es Dónde viven las copias vendorizadas. */
export const VENDOR_ROOT = path.dirname(fileURLToPath(import.meta.url));

/** The recorded hashes, written by `sync.mjs`, read by `provenance.mjs`. @es Los hashes registrados. */
export const PROVENANCE_FILE = path.join(VENDOR_ROOT, 'PROVENANCE.json');

/** Relative paths under both roots, forward slashes. @es Rutas relativas bajo ambas raíces. */
export const VENDORED = Object.freeze([
  'shell-command/shell-command.mjs',
  'shell-command/git-invocations.mjs',
  'cherry-pick-guard/working-directory.mjs',
  'diff-coverage/lib/diff-parse.mjs',
  'diff-coverage/lib/lcov-parse.mjs',
  'diff-coverage/lib/grade.mjs',
  'agent-liveness/liveness.mjs',
  'brief-tenancy/tenancy-declaration.mjs',
  'mutation-proof/run-mutants.mjs'
]);
