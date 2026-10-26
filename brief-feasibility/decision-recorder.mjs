/**
 * A module-loader hook that RECORDS every call to worker-git-guard's decision while that guard's own selftest
 * runs, so the parity selftest (`worker-git.selftest.mjs`) reads the guard's fixtures from the guard's own run, never
 * from a copied list. Registered with `node --import <this file>` (through `NODE_OPTIONS`, so the guard processes the
 * selftest spawns record too); it changes no answer: the wrapper returns exactly what the decision returned, and
 * each refusal is replayed as a brief (`parity-replay.mjs`) while the guard's sandbox still exists.
 *
 * Imported as the `--import` entry it registers itself; imported by the loader as the hooks module it serves `load`.
 * The record goes to the file named by `WORKER_GIT_DECISION_LOG`, one JSON line per call.
 *
 * @es Un hook del cargador de módulos que REGISTRA cada llamada a la decisión de worker-git-guard mientras corre el
 * selftest de ese guard, para que el selftest de paridad lea los fixtures del guard de su propia corrida, nunca de una
 * lista copiada. No cambia ninguna respuesta. El registro va al fichero de `WORKER_GIT_DECISION_LOG`, una línea JSON por llamada.
 */

import { register } from 'node:module';

/** The environment variable naming the record file. @es La variable de entorno que nombra el fichero del registro. */
export const DECISION_LOG_VARIABLE = 'WORKER_GIT_DECISION_LOG';

/** The decision module this hook wraps, and the query that reaches the real one. @es El módulo de decisión que envuelve y la query que llega al real. */
const DECISION_MODULE = '/worker-git-guard/forbidden-invocations.mjs';
const REAL = '?decision-recorder=real';

/** Where the replay of a refused command as a brief lives. @es Dónde vive la repetición de un comando rechazado como brief. */
const REPLAY = new URL('./parity-replay.mjs', import.meta.url).href;

/**
 * The wrapper served in place of the decision module. A refused command is replayed as a brief AT THE MOMENT the
 * guard refused it: the decision reads the repository the command runs in (a pathspec, an index file), and the
 * selftest's sandbox repositories are gone once it ends, so a replay afterwards would judge another state.
 * @es El envoltorio servido en lugar del módulo de decisión. Un comando rechazado se repite como brief EN EL MOMENTO
 * en que el guard lo rechazó: la decisión lee el repositorio donde corre el comando, y los repositorios de prueba del
 * selftest desaparecen al terminar, así que repetirlo después juzgaría otro estado.
 */
function wrapperSource(url) {
  const real = JSON.stringify(`${url}${REAL}`);

  return [
    "import { appendFileSync } from 'node:fs';",
    `import { forbiddenInvocations as decide } from ${real};`,
    `import { replayInBrief } from ${JSON.stringify(REPLAY)};`,
    `export * from ${real};`,
    'let replaying = false;',
    'export function forbiddenInvocations(script, dialect, cwd) {',
    '  const refused = decide(script, dialect, cwd);',
    '  if (replaying) return refused;',
    '  replaying = true;',
    '  try {',
    '    const brief = refused.length > 0 ? replayInBrief(script, cwd) : undefined;',
    `    appendFileSync(process.env.${DECISION_LOG_VARIABLE}, JSON.stringify({ script, dialect, cwd, families: refused.map((one) => one.family), brief }) + '\\n');`,
    '  } finally {',
    '    replaying = false;',
    '  }',
    '  return refused;',
    '}'
  ].join('\n');
}

/** The loader's `load` hook. @es El hook `load` del cargador. */
export async function load(url, context, nextLoad) {
  if (url.endsWith(DECISION_MODULE)) return { format: 'module', source: wrapperSource(url), shortCircuit: true };

  return nextLoad(url, context);
}

// As the `--import` entry, register this same file as the hooks module, marked by a query: the loader thread imports
// it under that URL, and that import must not register a second time.
// @es Como entrada de `--import`, registra este mismo fichero como módulo de hooks, marcado con una query: el hilo del
// cargador lo importa con esa URL, y esa importación no debe registrarse otra vez.
const AS_HOOKS = '?decision-recorder=hooks';

if (!import.meta.url.endsWith(AS_HOOKS)) register(`${import.meta.url}${AS_HOOKS}`);
