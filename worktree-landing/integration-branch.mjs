/**
 * Owns the landing's use of the integration-branch declaration: a landing may go only onto the FIRST branch
 * the project declares (read by `../integration-branch/declaration.mjs`, the one reader every tool shares). A
 * repository that declares nothing is not governed and the check does not apply. A declaration that exists
 * but cannot be used refuses (fail closed), naming the file.
 *
 * @es Es dueño del uso que hace el aterrizaje de la declaración de rama de integración: un aterrizaje solo
 * puede ir a la PRIMERA rama que declara el proyecto (la lee `../integration-branch/declaration.mjs`, el
 * lector único que comparten todas las herramientas). Un repositorio que no declara nada no está gobernado y
 * la comprobación no aplica. Una declaración que existe pero no se puede usar rechaza (falla cerrado), nombrando el fichero.
 */

import { DeclarationUnreadable, FLEET_KIT, OWN_MODULE, readIntegrationDeclaration } from '../integration-branch/declaration.mjs';
import { Refusal } from './outcome.mjs';

/**
 * Requires `branch` to be the first integration branch the project declares.
 * @param {{ main: string, branch: string }} inputs
 * @returns {string} what the check found, for the report @es lo que encontró la comprobación, para el informe
 */
export function requireIntegrationBranch({ main, branch }) {
  let declaration;
  try {
    declaration = readIntegrationDeclaration(main);
  } catch (error) {
    if (error instanceof DeclarationUnreadable) throw new Refusal('integration-source-unreadable', [error.message]);
    throw error;
  }
  if (declaration === undefined) {
    return `Integration-branch check did not apply: ${main} declares no source (${FLEET_KIT}, ${OWN_MODULE}). @es La comprobación de rama de integración no aplicó: ${main} no declara ninguna fuente (${FLEET_KIT}, ${OWN_MODULE}).`;
  }
  const { branches, source } = declaration;
  if (branches[0] !== branch) {
    throw new Refusal('branch-not-integration-branch', [
      `Requested --branch ${branch}, but the first declared integration branch is ${branches[0]}; landings go only onto it. Update ${source} if the integration branch changed. @es Se pidió --branch ${branch}, pero la primera rama de integración declarada es ${branches[0]}; los aterrizajes van solo a ella. Actualiza ${source} si la rama de integración cambió.`,
    ]);
  }
  return `Integration-branch check passed: ${branch} is the first branch declared in ${source}. @es Comprobación de rama de integración superada: ${branch} es la primera rama declarada en ${source}.`;
}
