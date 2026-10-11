/**
 * Owns the question "which branch does this project integrate into?" for a landing. A project declares its
 * integration branches in ONE source, and a landing may go only onto the FIRST one: `.claude/fleet-kit.json`
 * `integrationBranches` where the project uses fleet-kit, else its own module
 * `.claude/integrate/integration-branches.mjs` exporting `INTEGRATION_BRANCHES`. A repository with neither
 * source is not governed and the check does not apply. A source that exists but cannot be read or understood
 * refuses (fail closed), naming the file.
 *
 * @es Es dueño de la pregunta «¿en qué rama integra este proyecto?» para un aterrizaje. Un proyecto declara
 * sus ramas de integración en UNA fuente y un aterrizaje solo puede ir a la PRIMERA: `integrationBranches`
 * de `.claude/fleet-kit.json` si usa fleet-kit, o su propio módulo `.claude/integrate/integration-branches.mjs`
 * que exporta `INTEGRATION_BRANCHES`. Un repositorio sin ninguna fuente no está gobernado y la comprobación
 * no aplica. Una fuente que existe pero no se puede leer o entender rechaza (falla cerrado), nombrando el fichero.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Refusal } from './outcome.mjs';

const FLEET_KIT = '.claude/fleet-kit.json';
const OWN_MODULE = '.claude/integrate/integration-branches.mjs';
const MODULE_TIMEOUT_MS = 15_000;

/** Prints the module's export as JSON, in its own process so project code never runs inside this one. @es Imprime el export del módulo en JSON, en su propio proceso. */
const MODULE_READER = 'import(process.argv[1]).then((m) => console.log(JSON.stringify(m.INTEGRATION_BRANCHES ?? null)))';

/** Refuses because a declared source cannot be used. @es Rechaza porque una fuente declarada no se puede usar. */
function unreadable(file, why) {
  return new Refusal('integration-source-unreadable', [
    `The integration-branch source ${file} exists but cannot be used (${why}); fix that file, a landing is refused until it declares a non-empty list of branch names. @es La fuente de ramas de integración ${file} existe pero no se puede usar (${why}); corrige ese fichero, el aterrizaje se rechaza hasta que declare una lista no vacía de nombres de rama.`,
  ]);
}

/** A non-empty list of non-empty strings, or a Refusal naming the file. @es Una lista no vacía de textos no vacíos, o un Refusal que nombra el fichero. */
function validList(value, file) {
  const ok = Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry !== '');
  if (!ok) throw unreadable(file, 'not a non-empty list of branch names @es no es una lista no vacía de nombres de rama');
  return value;
}

/** The list a fleet-kit file declares: undefined when it declares none. @es La lista que declara fleet-kit, o undefined. */
function fromFleetKit(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw unreadable(file, `${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || !('integrationBranches' in parsed)) return undefined;
  return validList(parsed.integrationBranches, file);
}

/** The list the project's own module exports. @es La lista que exporta el módulo propio del proyecto. */
function fromOwnModule(file) {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', MODULE_READER, pathToFileURL(file).href], { encoding: 'utf8', timeout: MODULE_TIMEOUT_MS });
  if (run.status !== 0) throw unreadable(file, `import failed: ${(run.stderr || run.error?.message || '').trim().split('\n')[0]}`);
  return validList(JSON.parse(run.stdout), file);
}

/**
 * Requires `branch` to be the first integration branch the project declares.
 * @param {{ main: string, branch: string }} inputs
 * @returns {string} what the check found, for the report @es lo que encontró la comprobación, para el informe
 */
export function requireIntegrationBranch({ main, branch }) {
  const fleetKit = path.join(main, FLEET_KIT);
  const ownModule = path.join(main, OWN_MODULE);
  const fleetList = existsSync(fleetKit) ? fromFleetKit(fleetKit) : undefined;
  const source = fleetList === undefined ? ownModule : fleetKit;
  const list = fleetList ?? (existsSync(ownModule) ? fromOwnModule(ownModule) : undefined);
  if (list === undefined) {
    return `Integration-branch check did not apply: ${main} declares no source (${FLEET_KIT}, ${OWN_MODULE}). @es La comprobación de rama de integración no aplicó: ${main} no declara ninguna fuente (${FLEET_KIT}, ${OWN_MODULE}).`;
  }
  if (list[0] !== branch) {
    throw new Refusal('branch-not-integration-branch', [
      `Requested --branch ${branch}, but the first declared integration branch is ${list[0]}; landings go only onto it. Update ${source} if the integration branch changed. @es Se pidió --branch ${branch}, pero la primera rama de integración declarada es ${list[0]}; los aterrizajes van solo a ella. Actualiza ${source} si la rama de integración cambió.`,
    ]);
  }
  return `Integration-branch check passed: ${branch} is the first branch declared in ${source}. @es Comprobación de rama de integración superada: ${branch} es la primera rama declarada en ${source}.`;
}
