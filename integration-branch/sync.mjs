#!/usr/bin/env node
/**
 * Makes a clone's local `refs/remotes/origin/HEAD` follow the integration branch its project declares.
 *
 *   node sync.mjs <clone>      exit 0 in sync, updated, or nothing declared; 2 refused
 *
 * The declared FIRST branch (`declaration.mjs`, the reader a landing shares) becomes the branch origin/HEAD
 * points at, because the review base of gentle-ai and the base of agent worktrees come from origin/HEAD. When
 * the clone has no remote-tracking ref for that branch it REFUSES and names the fetch or the push the owner
 * must decide: it never pushes, never fetches and never invents a ref. Running it again changes nothing.
 *
 * @es Hace que el `refs/remotes/origin/HEAD` local de un clon siga la rama de integración que declara su
 * proyecto. La PRIMERA rama declarada (`declaration.mjs`, el lector que comparte un aterrizaje) pasa a ser a
 * la que apunta origin/HEAD, porque la base de revisión de gentle-ai y la base de los worktrees de agentes
 * salen de origin/HEAD. Si el clon no tiene referencia de seguimiento de esa rama, RECHAZA y nombra el fetch
 * o el push que el dueño debe decidir: nunca hace push, nunca hace fetch y nunca inventa una referencia.
 * Ejecutarlo otra vez no cambia nada.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLEET_KIT, OWN_MODULE } from './declaration.mjs';
import { pointOriginHeadAt } from './git-refs.mjs';
import { speaker } from './messages.mjs';
import { originHeadState } from './origin-head-state.mjs';

const EXIT_OK = 0;
const EXIT_REFUSED = 2;
const UNSET = '(unset @es sin fijar)';

/**
 * Runs the sync for the command-line `args` and returns the process exit code.
 * @es Ejecuta la sincronización para los argumentos `args` de la línea de órdenes y devuelve el código de salida.
 * @param {string[]} args
 * @returns {number}
 */
export function runSync(args) {
  if (args.length !== 1) {
    speaker.complain('usage');
    return EXIT_REFUSED;
  }

  try {
    const dir = path.resolve(args[0]);
    const state = originHeadState(dir);

    if (state === undefined) {
      speaker.complain('not-a-repository', { dir });
      return EXIT_REFUSED;
    }
    if (!state.governed) {
      speaker.say('ungoverned', { main: state.main, fleetKit: FLEET_KIT, ownModule: OWN_MODULE });
      return EXIT_OK;
    }

    const { main, want, source, verdict } = state;
    const current = state.current ?? UNSET;

    if (verdict === 'in-sync') {
      speaker.say('in-sync', { main, want, source });
      return EXIT_OK;
    }
    if (verdict === 'missing-remote-ref') {
      speaker.complain('missing-remote-ref', { main, want, source });
      return EXIT_REFUSED;
    }
    pointOriginHeadAt(main, want);
    speaker.say('updated', { main, current, want, source });
    return EXIT_OK;
  } catch (error) {
    speaker.dataError(error.message);
    return EXIT_REFUSED;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runSync(process.argv.slice(2));
}
