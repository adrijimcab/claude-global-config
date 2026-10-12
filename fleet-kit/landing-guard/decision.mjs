/**
 * The landing guard's decision: would this shell line move an integration branch to content that no
 * complete, green run of the repository's declared unit suite has graded?
 *
 * The parts, each owned by one module: `branch-moves.mjs` reads what the line REQUESTS,
 * `move-resolution.mjs` asks git what each request would DO, and `../gate-run/verdicts.mjs` says whether
 * a tree has a green verdict. This file joins them per repository — each git invocation is judged against
 * the config governing the directory it acts in — and applies that repository's mode: `enforce` refuses,
 * `advise` lets the command run with the finding in front of the agent.
 *
 * A git invocation whose directory the line makes unknowable (a `cd` to an expanded variable) cannot be
 * attributed to any repository, so no config governs it: it is skipped, and the skip is stated in DESIGN.md.
 *
 * @es La decisión de la guarda de aterrizaje: ¿movería esta línea una rama de integración a contenido que
 * ninguna corrida completa y verde de la suite declarada ha calificado? Cada invocación se juzga contra la
 * config del directorio donde actúa, y se aplica el modo de ese repositorio.
 */

import { findConfig } from '../config/load-config.mjs';
import { isDisabled } from '../config/validate.mjs';
import { judge, readVerdict } from '../gate-run/verdicts.mjs';
import { gitAsker } from '../lib/git.mjs';
import { effectiveDirectory } from '../lib/invocation-directory.mjs';
import { repositoryOptions } from '../lib/invocation-repository.mjs';
import { dialectOfTool } from '../../shell-command/shell-command.mjs';
import { requestedMoves } from './branch-moves.mjs';
import { resolveMove } from './move-resolution.mjs';
import { landingNotice } from './notice.mjs';

/** Each finding of one resolved outcome: an unknowable move, or a move to an ungraded tree. @es Los hallazgos de un resultado resuelto. */
function findingOf(outcome, governed, stateRoot) {
  if (outcome.kind === 'unknowable') return { ...outcome };

  const verdict = judge(readVerdict(governed.repository.mainCheckout, outcome.tree, stateRoot), governed.config.unitSuite);

  return verdict.green ? undefined : { ...outcome, why: verdict.why };
}

/**
 * Every finding in `payload`'s shell line, each with the repository and mode that governs it.
 * @returns `[{ finding, governed, invocation }]`.
 * @es Cada hallazgo de la línea de `payload`, con el repositorio y modo que lo gobiernan.
 */
export function landingFindings(payload, { stateRoot } = {}) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || typeof payload?.cwd !== 'string') return [];

  return requestedMoves(command, dialect, payload.cwd).flatMap((request) => {
    const directory = effectiveDirectory(request.invocation);

    if (directory === undefined) return [];

    const ask = gitAsker(directory, repositoryOptions(request.invocation, dialect));
    const governed = findConfig(directory, ask);

    if (governed === undefined || isDisabled(governed.config.landingGuard)) return [];

    return resolveMove(request, ask, governed.config.integrationBranches)
      .map((outcome) => findingOf(outcome, governed, stateRoot))
      .filter((finding) => finding !== undefined)
      .map((finding) => ({ finding, governed, invocation: request.invocation }));
  });
}

/**
 * The guard's answer: `{ deny }` when any finding's repository enforces, `{ advise }` when all advise,
 * `undefined` when there is nothing to say.
 * @es La respuesta de la guarda: negar si algún repositorio exige, avisar si todos avisan, o nada.
 */
export function decide(payload, options = {}) {
  const findings = landingFindings(payload, options);

  if (findings.length === 0) return undefined;

  const text = landingNotice(findings);

  return findings.some(({ governed }) => governed.config.landingGuard.mode === 'enforce') ? { deny: text } : { advise: text };
}
