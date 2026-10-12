/**
 * Owns the reading of a clone's integration state: what its project declares as the integration branch, where
 * `origin/HEAD` points, and the sync verdict between the two. The sync tool and the drift warning both ask
 * here, so they cannot disagree about whether a clone has drifted.
 *
 * @es Es dueño de la lectura del estado de integración de un clon: qué declara su proyecto como rama de
 * integración, a dónde apunta `origin/HEAD` y el veredicto de sincronización entre ambos. La herramienta de
 * sincronización y el aviso de deriva preguntan aquí, así que no pueden discrepar sobre si un clon derivó.
 */

import { readIntegrationDeclaration } from './declaration.mjs';
import { mainCheckoutOf, originHeadBranch, remoteBranchExists } from './git-refs.mjs';
import { syncVerdict } from './sync-verdict.mjs';

/**
 * @param {string} dir any directory of the clone, its linked worktrees included @es cualquier directorio del clon, sus worktrees enlazados incluidos
 * @returns {undefined | { governed: false, main: string } | { governed: true, main: string, source: string, want: string, current: string | undefined, verdict: 'in-sync' | 'set' | 'missing-remote-ref' }}
 *   `undefined` when `dir` is not in a repository @es `undefined` si `dir` no está en un repositorio
 * @throws {import('./declaration.mjs').DeclarationUnreadable}
 */
export function originHeadState(dir) {
  const main = mainCheckoutOf(dir);
  if (main === undefined) return undefined;
  const declaration = readIntegrationDeclaration(main);
  if (declaration === undefined) return { governed: false, main };
  const want = declaration.branches[0];
  const current = originHeadBranch(main);
  const verdict = syncVerdict({ want, current, remoteRefExists: remoteBranchExists(main, want) });
  return { governed: true, main, source: declaration.source, want, current, verdict };
}
