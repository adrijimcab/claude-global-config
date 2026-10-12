/**
 * Reads the LANDING PATH of a project: every command that runs when work lands, each tagged with the root that
 * reaches it. A root is one of: `unit-suite` (the npm script `.claude/fleet-kit.json` names as `unitSuite`, the
 * one the landing guard runs), `integration-script` (the conventional whole-gate scripts of `package.json`),
 * `ci-job` (a job of `.gitlab-ci.yml` that can fail the pipeline), and the two that do NOT enforce: `hook` (a
 * husky hook, bypassed by `--no-verify`) and `ci-job-allowed-failure` (a job with `allow_failure`). From a root
 * the reader follows `npm run`, the `pre`/`post` lifecycle scripts and script aggregators through the project's
 * own `package.json`; a workspace-scoped run (`-w`, `--workspace`) names a script this file cannot see and is
 * recorded, not followed.
 *
 * @es Lee el CAMINO DE ATERRIZAJE de un proyecto: cada comando que corre cuando el trabajo aterriza, marcado con
 * la raíz que lo alcanza. Una raíz es: `unit-suite` (el script npm que `.claude/fleet-kit.json` llama `unitSuite`,
 * el que corre el guard de aterrizaje), `integration-script` (los scripts convencionales de gate completo de
 * `package.json`), `ci-job` (un job de `.gitlab-ci.yml` que puede fallar el pipeline), y las dos que NO aplican:
 * `hook` (un hook de husky, que `--no-verify` salta) y `ci-job-allowed-failure` (un job con `allow_failure`). Desde
 * una raíz sigue `npm run`, los scripts `pre`/`post` y los agregadores a través del `package.json` del propio
 * proyecto; una ejecución de workspace (`-w`, `--workspace`) nombra un script que este fichero no ve y se anota, no
 * se sigue.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ciJobs } from './ci-jobs.mjs';
import { aggregatedNames, commandsOf, scriptNamed } from './shell-commands.mjs';

/** The conventional whole-gate scripts, in the order the reader tries them. @es Los scripts de gate completo convencionales. */
export const INTEGRATION_SCRIPTS = Object.freeze(['build:ci-pr', 'build:ci', 'ci', 'verify']);

/** The roots whose commands enforce at landing. @es Las raíces cuyos comandos aplican al aterrizar. */
export const ENFORCING_ROOTS = Object.freeze(['unit-suite', 'integration-script', 'ci-job']);

const HOOKS = Object.freeze(['pre-push', 'pre-commit']);
const WORKSPACE_FLAGS = new Set(['-w', '--workspace', '--workspaces', '-ws']);

/** Parsed JSON of a file, or undefined when it is absent. A present file that is not JSON throws. @es JSON de un fichero, o undefined si no está. */
export function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

/** The `unitSuite.npmScript` of the nearest `.claude/fleet-kit.json` at or above `root`. @es El `unitSuite.npmScript` del `.claude/fleet-kit.json` más cercano. */
export function fleetKitUnitScript(root) {
  let directory = path.resolve(root);

  for (let depth = 0; depth < 4; depth += 1) {
    const file = path.join(directory, '.claude', 'fleet-kit.json');

    if (existsSync(file)) return { file, script: readJson(file)?.unitSuite?.npmScript };
    if (path.dirname(directory) === directory) break;
    directory = path.dirname(directory);
  }

  return undefined;
}

/** Follows one script and what it runs, pushing a record per command. @es Sigue un script y lo que ejecuta, anotando un registro por comando. */
function followScript(name, context, trail) {
  const key = `${context.rootKind}:${name}`;
  const text = context.scripts[name];

  if (text === undefined || context.seen.has(key)) return;
  context.seen.add(key);

  const here = [...trail, name];

  followScript(`pre${name}`, context, here);
  followCommands(commandsOf(text), context, here, { file: context.packageFile, script: name });
  followScript(`post${name}`, context, here);
  context.seen.delete(key);
}

/** Records each command and follows the scripts it runs. @es Anota cada comando y sigue los scripts que ejecuta. */
function followCommands(commands, context, trail, source) {
  for (const argv of commands) {
    context.records.push({ argv, rootKind: context.rootKind, via: trail, ...source });

    if (argv.some((word) => WORKSPACE_FLAGS.has(word))) continue;

    const run = scriptNamed(argv);

    if (run !== undefined) followScript(run, context, trail);
    for (const aggregated of aggregatedNames(argv)) followScript(aggregated, context, trail);
  }
}

/** The non-comment, non-husky-boilerplate lines of a hook file. @es Las líneas de un hook sin comentarios ni plantilla de husky. */
function hookLines(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.trim(), line: index + 1 }))
    .filter(({ text }) => text !== '' && !text.startsWith('#') && !text.startsWith('. '));
}

/**
 * The landing path of the project at `root`: `{ records, roots, scripts }`. A `record` is `{ argv, rootKind, via,
 * file, script?, line? }`; `roots` lists each root the reader found with its evidence file.
 * @es El camino de aterrizaje del proyecto en `root`: `{ records, roots, scripts }`.
 */
export function readLanding(root) {
  const packageFile = path.join(root, 'package.json');
  const scripts = readJson(packageFile)?.scripts ?? {};
  const records = [];
  const roots = [];
  const base = { scripts, packageFile, records, seen: new Set() };
  const fleet = fleetKitUnitScript(root);

  if (fleet?.script !== undefined && scripts[fleet.script] !== undefined) {
    roots.push({ kind: 'unit-suite', name: fleet.script, file: fleet.file });
    followScript(fleet.script, { ...base, rootKind: 'unit-suite' }, []);
  }

  for (const name of INTEGRATION_SCRIPTS.filter((candidate) => scripts[candidate] !== undefined)) {
    roots.push({ kind: 'integration-script', name, file: packageFile });
    followScript(name, { ...base, rootKind: 'integration-script' }, []);
  }

  for (const hook of HOOKS.map((name) => path.join(root, '.husky', name)).filter(existsSync)) {
    roots.push({ kind: 'hook', name: path.basename(hook), file: hook });
    for (const { text, line } of hookLines(hook)) followCommands(commandsOf(text), { ...base, rootKind: 'hook' }, [path.basename(hook)], { file: hook, line });
  }

  const ciFile = path.join(root, '.gitlab-ci.yml');

  if (existsSync(ciFile)) {
    for (const job of ciJobs(readFileSync(ciFile, 'utf8'))) {
      const rootKind = job.allowFailure ? 'ci-job-allowed-failure' : 'ci-job';

      roots.push({ kind: rootKind, name: job.name, file: ciFile });
      for (const { text, line } of job.commands) followCommands(commandsOf(text), { ...base, rootKind, seen: new Set() }, [`job ${job.name}`], { file: ciFile, line });
    }
  }

  return { records, roots, scripts };
}
