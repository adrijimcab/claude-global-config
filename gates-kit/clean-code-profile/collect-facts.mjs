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
import { readJson, readLanding } from './landing-path.mjs';
import { depcruiseConfig, detectStack, eslintConfig, jscpdConfig, knipConfig } from './tool-configs.mjs';
import { runInstalledTsc } from './tsc-facts.mjs';

/** The facts of the project at `root`. @es Los hechos del proyecto en `root`. */
export async function collectFacts(root, { stack: forcedStack, printConfig = runInstalledEslint, showConfig = runInstalledTsc } = {}) {
  const resolved = path.resolve(root);
  const stack = forcedStack ?? detectStack(resolved);
  const pkg = readJson(path.join(resolved, 'package.json'));
  const config = eslintConfig(resolved);

  return {
    root: resolved,
    stack,
    dependencies: Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies }),
    landing: readLanding(resolved),
    eslintConfig: config,
    eslint: config.file === undefined ? { samples: {} } : measureEslint(resolved, stack, printConfig),
    tsc: stack === 'angular' ? showConfig(resolved) : { missing: true },
    depcruise: await depcruiseConfig(resolved),
    jscpd: jscpdConfig(resolved),
    knip: knipConfig(resolved),
  };
}
