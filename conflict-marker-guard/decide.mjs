/**
 * THE DECISION — does this shell command CONTINUE or COMMIT work (`git rebase|merge|cherry-pick|am --continue`,
 * `git commit`) while the repository it acts on holds a leftover conflict marker in what that step would commit?
 *
 * MEASURED INCIDENT, 2026-10-25 (lesson `removal-chained-after-an-unconfirmed-check`, recurrence): while
 * replaying a branch, `rg -c "^(<<<<<<<|=======|>>>>>>>)" <spec>` was chained with `;` before
 * `git add -- <spec> && git rebase --continue`. rg printed 1 and the add and the continue ran anyway; the marker
 * was committed and carried by the next ten commits. A check chained with `;` checks nothing, so the check moves
 * to the one place no chain can skip: the guard on the commit-making command itself, for ANY caller.
 *
 * WHICH REPOSITORY: the one each invocation acts on, from the shared shell parser (`git-invocations.mjs`: the
 * line's own `cd`s and every `-C`), folded by `invocationDirectory`. A `git` word inside `echo`, a quoted
 * message or a heredoc is data to that parser, so it is never a command here.
 *
 * WHAT IS PROBED (`probe.mjs`): the lines the index adds; and, when the same line also runs `git add`, the
 * worktree copy of the still-unmerged files, which that add is about to stage. NOT MODELLED, stated:
 * `git commit -a` and `git commit -- <paths>`, which commit worktree content the index does not hold.
 *
 * FAILS OPEN, journaled: an unfollowable `cd`, a git that errors or times out (and so a directory that is no
 * repository) is a `failures` entry the shim writes to the journal, never a refusal made from a guess.
 *
 * @es LA DECISIÓN: ¿CONTINÚA o COMMITEA este comando trabajo (`git rebase|merge|cherry-pick|am --continue`,
 * `git commit`) mientras el repositorio sobre el que actúa lleva una marca de conflicto olvidada en lo que ese
 * paso commitearía? INCIDENTE MEDIDO el 2026-10-25 (recurrencia de `removal-chained-after-an-unconfirmed-check`):
 * un chequeo encadenado con `;` antes de `git add && git rebase --continue` no frenó nada y la marca se
 * commiteó y viajó en diez commits. Un chequeo encadenado no comprueba nada, así que se mueve al único lugar que
 * ninguna cadena salta: la guardia sobre el propio comando, para CUALQUIER llamador. Repositorio: el de cada
 * invocación según el parser compartido. Se sondea el índice y, si la misma línea hace `git add`, la copia de
 * trabajo de los ficheros sin fusionar. NO modelado: `commit -a` y `commit -- <rutas>`. Falla ABIERTO, con
 * registro.
 */

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { indexConflicts, runGit, unmergedConflicts } from './probe.mjs';

/** The subcommands whose `--continue` creates a commit. @es Los subcomandos cuyo `--continue` crea un commit. */
const CONTINUING_SUBCOMMANDS = new Set(['rebase', 'merge', 'cherry-pick', 'am']);

/** Whether one invocation creates a commit. @es Si una invocación crea un commit. */
function commitsWork({ subcommand, args }) {
  if (subcommand === 'commit') return true;

  return CONTINUING_SUBCOMMANDS.has(subcommand) && args.includes('--continue');
}

/**
 * What the shell command does to the repositories it commits into.
 * @param payload The hook payload (`tool_name`, `tool_input.command`, `cwd`).
 * @param options.run Replaces the git runner (a test seam). @es Sustituye al ejecutor de git.
 * @returns `{ offender, failures }` — `offender` is `{ text, directory, conflicts }` for the FIRST commit step that
 *   would commit a conflict, `undefined` when none; `failures` lists `{ directory, reason }` for every probe git
 *   could not answer. @es `offender` es el primer paso que commitearía un conflicto; `failures`, los sondeos sin respuesta.
 */
export function decideFor(payload, { run = runGit } = {}) {
  const none = { offender: undefined, failures: [] };
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || command.length === 0) return none;

  const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();
  const failures = [];
  const probed = new Map();
  const staging = new Set();

  const probe = (key, ask) => {
    if (!probed.has(key)) probed.set(key, ask());

    return probed.get(key);
  };

  for (const invocation of gitInvocations(command, dialect, cwd)) {
    const directory = invocationDirectory(invocation);

    if (invocation.subcommand === 'add') staging.add(directory);
    if (!commitsWork(invocation)) continue;

    if (directory === undefined) {
      failures.push({ directory: String(invocation.directory), reason: `the line's own cd cannot be followed: ${invocation.text}` });
      continue;
    }

    const answers = [probe(`index ${directory}`, () => indexConflicts(run, directory))];

    if (staging.has(directory)) answers.push(probe(`unmerged ${directory}`, () => unmergedConflicts(run, directory)));

    for (const answer of answers) if (answer.failure !== undefined) failures.push({ directory, reason: answer.failure });

    const conflicts = answers.flatMap((answer) => answer.conflicts ?? []);

    if (conflicts.length > 0) return { offender: { text: invocation.text, directory, conflicts }, failures };
  }

  return { offender: undefined, failures };
}
