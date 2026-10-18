/**
 * Gathers everything the verdicts read from one project root, once: the stack, the dependency names, the landing
 * path, the ESLint config file and what ESLint enforces on the sample files, what the compiler resolves, and the
 * dependency-cruiser, jscpd and knip configs. The two processes it can start (ESLint, the compiler) are functions
 * the caller may replace, so a proof builds its facts from committed fixtures with no tool installed. ESLint is
 * only asked when the project has an ESLint config, and the compiler only for a stack that grades strict TS.
 *
 * @es Reúne, una vez, todo lo que leen los veredictos de la raíz de un proyecto: el stack, los nombres de
 * dependencias, el camino de aterrizaje, el fichero de config de ESLint y lo que ESLint aplica a los ficheros de
 * muestra, lo que resuelve el compilador y las configs de dependency-cruiser, jscpd y knip. Los dos procesos que
 * puede lanzar (ESLint, el compilador) son funciones que quien llama puede reemplazar, así que una prueba arma sus
 * hechos desde fixtures versionados sin ninguna herramienta instalada. A ESLint solo se le pregunta si el
 * proyecto tiene config de ESLint, y al compilador solo en un stack que califica TS estricto.
 */

import path from 'node:path';

import { measureEslint, runInstalledEslint } from './eslint-facts.mjs';
import { runInstalledKnip } from './knip-facts.mjs';
import { readJson, readLanding, UnreadableJsonError } from './landing-path.mjs';
import { depcruiseConfig, detectStack, eslintConfig, jscpdConfig, knipConfig } from './tool-configs.mjs';
import { runInstalledTsc } from './tsc-facts.mjs';

const UNKNOWN_STACK = 'unknown';

/**
 * The inputs every verdict depends on: the stack, the dependency names and the landing path. They all come from
 * `package.json` and `fleet-kit.json`, so one that is present but unreadable leaves the project unmeasured
 * (`unreadable` names the file) instead of throwing out of the whole run.
 * @es Las entradas de las que depende todo veredicto: el stack, los nombres de dependencias y el camino de
 * aterrizaje. Salen de `package.json` y `fleet-kit.json`; si uno está presente pero ilegible, el proyecto queda sin
 * medir (`unreadable` nombra el fichero) en vez de lanzar fuera de toda la ejecución.
 */
function readInputs(resolved, forcedStack) {
  try {
    const stack = forcedStack ?? detectStack(resolved);
    const pkg = readJson(path.join(resolved, 'package.json'));

    return { stack, dependencies: Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies }), landing: readLanding(resolved) };
  } catch (error) {
    if (!(error instanceof UnreadableJsonError)) throw error;

    return { stack: forcedStack ?? UNKNOWN_STACK, dependencies: [], landing: { records: [], roots: [], scripts: {} }, unreadable: { file: path.relative(resolved, error.file).split(path.sep).join('/') } };
  }
}

/** The facts of the project at `root`. @es Los hechos del proyecto en `root`. */
export async function collectFacts(root, { stack: forcedStack, printConfig = runInstalledEslint, showConfig = runInstalledTsc, askKnip = runInstalledKnip } = {}) {
  const resolved = path.resolve(root);
  const { stack, dependencies, landing, unreadable } = readInputs(resolved, forcedStack);
  const config = eslintConfig(resolved);

  if (unreadable !== undefined) return { root: resolved, stack, dependencies, landing, unreadable, eslintConfig: config, eslint: { samples: {} }, tsc: { missing: true } };

  return {
    root: resolved,
    stack,
    dependencies,
    landing,
    eslintConfig: config,
    eslint: config.file === undefined ? { samples: {} } : measureEslint(resolved, stack, printConfig),
    tsc: stack === 'angular' ? showConfig(resolved) : { missing: true },
    depcruise: await depcruiseConfig(resolved),
    jscpd: jscpdConfig(resolved),
    knip: knipConfig(resolved, askKnip),
  };
}
