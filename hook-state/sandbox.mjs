/**
 * For a selftest that runs a COPY of a guard in a constructed Claude home: `provisionStateModule(home)` copies the
 * state-location module, and the message table and bilingual speaker it imports, into that home, so the copy
 * (which imports `../hook-state/locations.mjs`) resolves its state exactly the way the real guard does; and
 * `sandboxEnv(home)` is the environment under which that resolution lands in the home itself:
 * `<home>/<mechanism>/state`, the copy's own, whatever state root the calling process was isolated to.
 *
 * @es Para un selftest que corre una COPIA de una guardia en un home de Claude construido:
 * `provisionStateModule(home)` copia a ese home el módulo de ubicaciones de estado, y la tabla de mensajes y el
 * speaker bilingüe que importa, así la copia resuelve su estado igual que la guardia real; `sandboxEnv(home)` es
 * el entorno con el que esa resolución cae en el propio home (`<home>/<mecanismo>/state`), sea cual sea la raíz
 * de estado a la que se aisló el proceso llamante.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLAUDE_HOME_VARIABLE, STATE_ROOT_VARIABLE } from './locations.mjs';

/** The tree this module belongs to. @es El árbol al que pertenece este módulo. */
const TREE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * The files a copied guard needs beside it, relative to the tree: the state-location module with what it imports,
 * and the hook-io port every guard reads its payload and answers through.
 * @es Los ficheros que necesita al lado una guardia copiada: el módulo de ubicaciones con lo que importa, y el
 * puerto hook-io por el que toda guardia lee su payload y responde.
 */
export const STATE_MODULE_FILES = Object.freeze(['hook-state/locations.mjs', 'hook-state/message-table.mjs', 'bilingual-output/speaker.mjs', 'bilingual-output/message.mjs', 'hook-io/hook-io.mjs']);

/**
 * Copies the state-location module and what it imports into the constructed Claude home `home`.
 * @es Copia el módulo de ubicaciones y lo que importa al home de Claude construido `home`.
 */
export function provisionStateModule(home) {
  for (const file of STATE_MODULE_FILES) {
    mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    copyFileSync(path.join(TREE, file), path.join(home, file));
  }
}

/**
 * The environment a copy in `home` runs under: `home` is the Claude home and no state root is set.
 * @es El entorno de una copia en `home`: `home` es el home de Claude y no hay raíz de estado.
 */
export const sandboxEnv = (home, base = process.env) => ({ ...base, [CLAUDE_HOME_VARIABLE]: home, [STATE_ROOT_VARIABLE]: '' });
