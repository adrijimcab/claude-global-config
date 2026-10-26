/**
 * The one way every mutation campaign of `commit-index-guard` runs: the fleet root, the crash policy and the
 * exit code are decided here once, so a campaign file holds only its rows. A crash kill is counted as a
 * survivor (`crashKills: 'fail'`): a mutant that merely makes the mechanism throw proves no check decided it.
 *
 * @es La única forma en que corre cada campaña de mutación de `commit-index-guard`: la raíz de la flota, la
 * política de caídas y el código de salida se deciden aquí una vez, y un fichero de campaña solo guarda sus
 * filas. Una muerte por caída cuenta como superviviente: un mutante que solo hace lanzar al mecanismo no prueba
 * que una comprobación lo decidiera.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

/** Runs a campaign and exits 0 when no mutant survived, 1 otherwise. @es Corre una campaña y sale con 0 si no sobrevivió ningún mutante. */
export function runCampaign({ selftest, paths, mutants }) {
  const survivors = runMutants({
    fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    paths,
    selftest,
    mutants,
    crashKills: 'fail'
  });

  process.exit(survivors === 0 ? 0 : 1);
}
