/**
 * Publishes a verified commit: fast-forwards the shared branch in the main checkout to it, pushes that
 * branch, and reads the remote tip back to confirm it IS that commit. A push the remote reports as
 * accepted is not taken as proof; only the tip the remote advertises afterwards is.
 *
 * @es Publica un commit verificado: hace fast-forward de la rama compartida en el checkout principal hasta
 * él, empuja esa rama y relee la punta remota para confirmar que ES ese commit. Que el remoto acepte el push
 * no se toma como prueba; solo lo es la punta que el remoto anuncia después.
 */

import { git, gitOutput } from './git.mjs';
import { Refusal } from './outcome.mjs';
import { mayPublishTo } from './remote-policy.mjs';

/** Fast-forwards the shared branch; git refuses before touching anything when it cannot. @es Fast-forward de la rama compartida. */
function fastForward(main, head) {
  const merged = git(main, ['merge', '--ff-only', '--quiet', head]);
  if (merged.status === 0) return;
  throw new Refusal('fast-forward-failed', [
    `git refused to fast-forward the main checkout ${main} to ${head}; nothing was changed. @es git rechazó el fast-forward del checkout principal ${main} a ${head}; no se cambió nada.`,
    ...merged.stderr.trim().split('\n').map((line) => `    ${line}`),
  ]);
}

/** Pushes the shared branch to the remote. @es Empuja la rama compartida al remoto. */
function push({ main, branch, remote, head }) {
  const pushed = git(main, ['push', '--quiet', remote, `refs/heads/${branch}:refs/heads/${branch}`]);
  if (pushed.status === 0) return;
  throw new Refusal('push-failed', [
    `The push of ${branch} to ${remote} failed. ${branch} in the main checkout is now at the VERIFIED commit ${head} and is not published; push it again once the cause is fixed. @es El push de ${branch} a ${remote} falló. ${branch} en el checkout principal está ahora en el commit VERIFICADO ${head} y no está publicado; vuelve a empujarlo cuando se arregle la causa.`,
    ...pushed.stderr.trim().split('\n').map((line) => `    ${line}`),
  ]);
}

/** Reads the remote tip back and requires it to be the landed commit. @es Relee la punta remota y exige que sea el commit aterrizado. */
function confirmRemoteTip({ main, branch, remote, head }) {
  const advertised = gitOutput(main, ['ls-remote', remote, `refs/heads/${branch}`]).trim().split(/\s+/)[0] ?? '';
  if (advertised === head) return;
  throw new Refusal('remote-tip-mismatch', [
    `After the push, ${remote} advertises ${branch} at ${advertised || '(nothing)'}, not at the landed commit ${head}; the landing is NOT confirmed. @es Tras el push, ${remote} anuncia ${branch} en ${advertised || '(nada)'}, no en el commit aterrizado ${head}; el aterrizaje NO está confirmado.`,
  ]);
}

/**
 * Pushes only where `remote-policy.mjs` allows it; for any other remote the local branch is fast-forwarded,
 * nothing is pushed, and the command the owner runs himself is returned.
 * @es Empuja solo donde `remote-policy.mjs` lo permite; en cualquier otro remoto se hace fast-forward de la
 * rama local, no se empuja nada, y se devuelve la orden que ejecuta el dueño.
 * @param {{ main: string, branch: string, remote: string, tip: string, head: string }} landing
 * @returns {{ commits: string[], pushCommand: string | undefined }} one line per landed commit, oldest last; the owner's push command when nothing was published
 * @es Una línea por commit aterrizado, el más antiguo al final; la orden de push del dueño si no se publicó.
 */
export function publish({ main, branch, remote, tip, head }) {
  fastForward(main, head);
  const publishes = mayPublishTo({ main, remote });
  if (publishes) {
    push({ main, branch, remote, head });
    confirmRemoteTip({ main, branch, remote, head });
  }
  const commits = gitOutput(main, ['log', '--oneline', '--no-decorate', `${tip}..${head}`])
    .split('\n')
    .filter((line) => line !== '');
  return { commits, pushCommand: publishes ? undefined : `git -C "${main}" push ${remote} ${branch}` };
}
