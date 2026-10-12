/**
 * Owns the question "which integration branches does this project DECLARE?" for every tool that follows the
 * declaration (a landing, the origin/HEAD sync, the drift warning): ONE reader, so no two tools can disagree
 * about it. A project declares its branches in ONE source, in this order: `.claude/fleet-kit.json`
 * `integrationBranches` where the project uses fleet-kit, else its own module
 * `.claude/integrate/integration-branches.mjs` exporting `INTEGRATION_BRANCHES`. The FIRST branch is the one
 * work lands on. A repository with neither source declares nothing (`undefined`). A source that exists but
 * cannot be read or understood throws `DeclarationUnreadable` (fail closed), naming the file.
 *
 * @es Es dueño de la pregunta «¿qué ramas de integración DECLARA este proyecto?» para toda herramienta que
 * sigue la declaración (un aterrizaje, la sincronización de origin/HEAD, el aviso de deriva): UN lector, así
 * que dos herramientas no pueden discrepar. Un proyecto declara sus ramas en UNA fuente, en este orden:
 * `integrationBranches` de `.claude/fleet-kit.json` si usa fleet-kit, o su propio módulo
 * `.claude/integrate/integration-branches.mjs` que exporta `INTEGRATION_BRANCHES`. La PRIMERA rama es aquella
 * a la que va el trabajo. Un repositorio sin ninguna fuente no declara nada (`undefined`). Una fuente que
 * existe pero no se puede leer o entender lanza `DeclarationUnreadable` (falla cerrado), nombrando el fichero.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FLEET_KIT = '.claude/fleet-kit.json';
export const OWN_MODULE = '.claude/integrate/integration-branches.mjs';
const MODULE_TIMEOUT_MS = 15_000;

/** Prints the module's export as JSON, in its own process so project code never runs inside this one. @es Imprime el export del módulo en JSON, en su propio proceso. */
const MODULE_READER = 'import(process.argv[1]).then((m) => console.log(JSON.stringify(m.INTEGRATION_BRANCHES ?? null)))';

/** A declared source that exists but cannot be used. @es Una fuente declarada que existe pero no se puede usar. */
export class DeclarationUnreadable extends Error {
  /**
   * @param {string} file the source file @es el fichero fuente
   * @param {string} why  what is wrong with it @es qué le pasa
   */
  constructor(file, why) {
    super(`The integration-branch source ${file} exists but cannot be used (${why}); fix that file, it must declare a non-empty list of branch names. @es La fuente de ramas de integración ${file} existe pero no se puede usar (${why}); corrige ese fichero, debe declarar una lista no vacía de nombres de rama.`);
    this.file = file;
  }
}

/** A non-empty list of non-empty strings, or a throw naming the file. @es Una lista no vacía de textos no vacíos, o un lanzamiento que nombra el fichero. */
function validList(value, file) {
  const ok = Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry !== '');
  if (!ok) throw new DeclarationUnreadable(file, 'not a non-empty list of branch names @es no es una lista no vacía de nombres de rama');
  return value;
}

/** The list a fleet-kit file declares: undefined when it declares none. @es La lista que declara fleet-kit, o undefined. */
function fromFleetKit(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new DeclarationUnreadable(file, `${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || !('integrationBranches' in parsed)) return undefined;
  return validList(parsed.integrationBranches, file);
}

/** The list the project's own module exports. @es La lista que exporta el módulo propio del proyecto. */
function fromOwnModule(file) {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', MODULE_READER, pathToFileURL(file).href], { encoding: 'utf8', timeout: MODULE_TIMEOUT_MS });
  if (run.status !== 0) throw new DeclarationUnreadable(file, `import failed: ${(run.stderr || run.error?.message || '').trim().split('\n')[0]}`);
  return validList(JSON.parse(run.stdout), file);
}

/**
 * The integration branches the project at `main` declares, and the file that declares them.
 * @param {string} main the project's main checkout @es el checkout principal del proyecto
 * @returns {{ branches: string[], source: string } | undefined} undefined when the project declares nothing @es undefined si no declara nada
 * @throws {DeclarationUnreadable}
 */
export function readIntegrationDeclaration(main) {
  const fleetKit = path.join(main, FLEET_KIT);
  const ownModule = path.join(main, OWN_MODULE);
  const fleetList = existsSync(fleetKit) ? fromFleetKit(fleetKit) : undefined;
  const source = fleetList === undefined ? ownModule : fleetKit;
  const branches = fleetList ?? (existsSync(ownModule) ? fromOwnModule(ownModule) : undefined);
  return branches === undefined ? undefined : { branches, source };
}
