/**
 * Runs one Angular project's Karma suite with coverage, for real, and returns what the grader needs:
 * the captured output, the exit code, and where `lcov.info` should be.
 *
 * `ng` is spawned as `process.execPath <workspace>/node_modules/@angular/cli/bin/ng.js` — never a `.cmd`
 * shim (Node on Windows refuses to spawn one without a shell). The run's Karma config, coverage and logs
 * all live in the run directory; the repository's tracked tree is never written.
 *
 * @es Corre de verdad la suite Karma de un proyecto Angular con cobertura y devuelve la salida, el código
 * de salida y dónde debe estar `lcov.info`. `ng` se lanza con `process.execPath`, nunca un `.cmd`. La
 * config, la cobertura y los logs viven en el directorio de la corrida.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BUILTIN, builtinMirrorProblem, karmaConfigSource } from './karma-config.mjs';

/** The Angular CLI entry of a workspace. @es La entrada del CLI de Angular de un workspace. */
export const ngCliOf = (workspaceDir) => path.join(workspaceDir, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

/**
 * Why a project cannot be run in `workspaceDir`, or `undefined`. Checked before anything spawns, so a
 * worktree without its toolchain is "cannot grade", never a run that dies halfway.
 * @es Por qué no se puede correr un proyecto, o `undefined`. Se comprueba antes de lanzar nada.
 */
export function karmaRunProblem(workspaceDir, karma) {
  if (!existsSync(ngCliOf(workspaceDir))) return `toolchain missing: ${ngCliOf(workspaceDir)} does not exist (is this worktree provisioned with node_modules?)`;
  if (karma.baseConfig === BUILTIN) return builtinMirrorProblem(workspaceDir);
  if (!existsSync(path.join(workspaceDir, karma.baseConfig))) return `the base Karma config ${karma.baseConfig} does not exist in ${workspaceDir}`;

  return undefined;
}

/** The argv (after `node`) of the graded `ng test` run. @es El argv de la corrida `ng test`. */
export const ngTestArgs = (workspaceDir, karma, configFile) => [ngCliOf(workspaceDir), 'test', karma.ngProject, '--watch=false', '--code-coverage', `--karma-config=${configFile}`, '--browsers=ChromeHeadless'];

/**
 * Runs `karma`'s project in `workspaceDir`, writing everything under `runDir/<name>/`.
 * @returns `{ text, exitCode, lcovPath, coverageFileExists }`.
 * @es Corre el proyecto y escribe todo bajo `runDir/<name>/`.
 */
export function runKarmaProject({ workspaceDir, name, karma, runDir }) {
  const projectDir = path.join(runDir, name);
  const coverageDir = path.join(projectDir, 'coverage');
  const configFile = path.join(projectDir, 'karma.graded.cjs');

  mkdirSync(coverageDir, { recursive: true });
  writeFileSync(configFile, karmaConfigSource({ workspaceDir, baseConfig: karma.baseConfig, coverageDir }));

  const result = spawnSync(process.execPath, ngTestArgs(workspaceDir, karma, configFile), { cwd: workspaceDir, encoding: 'utf8', windowsHide: true, maxBuffer: 512 * 1024 * 1024, env: { ...process.env, NG_CLI_ANALYTICS: 'false' } });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  writeFileSync(path.join(projectDir, 'output.log'), text);

  const lcovPath = path.join(coverageDir, 'lcov.info');

  return { text, exitCode: result.error === undefined && result.signal === null ? result.status : null, lcovPath, coverageFileExists: existsSync(lcovPath) };
}
