/**
 * Where a hook mechanism keeps its state. `HOOK_STATE_DIR` (when set and non-empty) is the root of every
 * mechanism's state directory; otherwise each mechanism uses `<claudeHome()>/<mechanism>/state`, and
 * `claudeHome()` is `HOOK_CLAUDE_HOME` or `<homedir>/.claude`. Both variables are read at EACH call, never
 * cached at import, so a test that sets them after importing the module still redirects every write
 * (H1-d).
 *
 * @es Dónde guarda su estado un mecanismo de hooks. `HOOK_STATE_DIR` (fijada y no vacía) es la raíz del
 * directorio de estado de cada mecanismo; si no, cada uno usa `<claudeHome()>/<mecanismo>/state`, y
 * `claudeHome()` es `HOOK_CLAUDE_HOME` o `<homedir>/.claude`. Las dos variables se leen en CADA llamada,
 * nunca al importar, así que un test que las fija después de importar el módulo redirige igualmente cada
 * escritura (H1-d).
 */

import { homedir } from 'node:os';
import path from 'node:path';

import { bilingual } from './message-table.mjs';

/** One environment variable, read now. @es Una variable de entorno, leída ahora. */
const readEnv = (name) => process.env[name];

/** A plain name: it can never climb out of its parent directory. @es Un nombre simple: no puede salir de su directorio padre. */
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The Claude home: `HOOK_CLAUDE_HOME`, else `<homedir>/.claude`. @es El home de Claude. */
export function claudeHome() {
  const override = readEnv('HOOK_CLAUDE_HOME');

  return override ? path.resolve(override) : path.join(homedir(), '.claude');
}

/** Refuses a mechanism name that is not a plain name. @es Rechaza un nombre de mecanismo que no es simple. */
export function assertMechanism(mechanism) {
  if (typeof mechanism !== 'string' || !PLAIN_NAME.test(mechanism)) throw new Error(bilingual('bad-mechanism', { value: JSON.stringify(mechanism) }));
}

/** The state directory of `mechanism`. @es El directorio de estado de `mechanism`. */
export function stateDir(mechanism) {
  assertMechanism(mechanism);

  const root = readEnv('HOOK_STATE_DIR');

  return root ? path.join(path.resolve(root), mechanism) : path.join(claudeHome(), mechanism, 'state');
}
