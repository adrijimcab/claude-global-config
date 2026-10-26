/**
 * THE DECISION — does this shell command CONTINUE or COMMIT work (`git rebase|merge|cherry-pick|revert|am
 * --continue`, `git am --resolved|-r`, `git commit`) while the repository it acts on holds a leftover conflict
 * marker in what that step would commit?
 *
 * MEASURED INCIDENT, 2026-10-25 (lesson `removal-chained-after-an-unconfirmed-check`, recurrence): while
 * replaying a branch, `rg -c "^(<<<<<<<|=======|>>>>>>>)" <spec>` was chained with `;` before
 * `git add -- <spec> && git rebase --continue`. rg printed 1 — ONE marker line — and the add and the continue ran
 * anyway; the marker was committed and carried by the next ten commits. A check chained with `;` checks nothing,
 * so the check moves to the one place no chain can skip: the guard on the commit-making command itself, for ANY
 * caller.
 *
 * WHICH REPOSITORY: the one each invocation acts on, from the shared shell parser (`git-invocations.mjs`: the
 * line's own `cd`s and every `-C`), folded by `invocationDirectory`, then resolved to its TOP LEVEL
 * (`probe.mjs`), because `cd sub`, `-C sub` and `-C .` are different spellings of one repository. A `git` word
 * inside `echo`, a quoted message or a heredoc is data to the parser, so it is never a command here.
 *
 * WHAT STAGES: `git add`, and a `git commit` that takes worktree content itself (`-a`, `--all`, `-i`, `--include`,
 * `-o`, `--only`, or a pathspec after `--`). When the line stages, the still-unmerged files are read from the
 * worktree too, because that is what the stage is about to put in the index.
 *
 * NOT MODELLED, stated: tracked, already-merged files modified in the worktree that `commit -a` or `commit
 * -- <paths>` would take; the probe sees the index and the unmerged files.
 *
 * FAILS OPEN, journaled: an unfollowable `cd`, a git that errors or times out (and so a directory that is no
 * repository) is a `failures` entry the shim writes to the journal, never a refusal made from a guess.
 *
 * @es LA DECISIÓN: ¿CONTINÚA o COMMITEA este comando trabajo (`git rebase|merge|cherry-pick|revert|am
 * --continue`, `git am --resolved|-r`, `git commit`) mientras el repositorio sobre el que actúa lleva una marca de
 * conflicto olvidada en lo que ese paso commitearía? INCIDENTE MEDIDO el 2026-10-25 (recurrencia de
 * `removal-chained-after-an-unconfirmed-check`): un chequeo encadenado con `;` antes de `git add && git rebase
 * --continue` imprimió 1 —UNA línea de marca— y la cadena siguió; la marca viajó en diez commits. Repositorio: el
 * de cada invocación según el parser compartido, resuelto a su NIVEL SUPERIOR, porque `cd sub`, `-C sub` y `-C .`
 * son grafías de un mismo repositorio. QUÉ HACE STAGE: `git add` y un `git commit` que toma contenido del árbol
 * de trabajo (`-a`, `--all`, `-i`, `--include`, `-o`, `--only`, o una ruta tras `--`); entonces también se leen
 * del árbol los ficheros sin fusionar. NO modelado: ficheros ya fusionados y modificados que `commit -a` tomaría.
 * Falla ABIERTO, con registro.
 */

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { declaredFixturePrefixes } from './fixtures.mjs';
import { indexConflicts, repositoryContext, runGit, unmergedConflicts } from './probe.mjs';

/** The subcommands that continue an operation. @es Los subcomandos que continúan una operación. */
const CONTINUING_SUBCOMMANDS = new Set(['rebase', 'merge', 'cherry-pick', 'revert', 'am']);

/** The options that make `am` commit what the worktree holds. @es Las opciones con las que `am` commitea lo que hay en el árbol. */
const AM_CONTINUE_OPTIONS = ['--continue', '--resolved', '-r'];

/** The long `commit` options that take worktree content. @es Las opciones largas de `commit` que toman contenido del árbol de trabajo. */
const COMMIT_STAGING_LONG_OPTIONS = ['--all', '--include', '--only'];

/** The short `commit` flags that take worktree content. @es Los indicadores cortos de `commit` que toman contenido del árbol de trabajo. */
const COMMIT_STAGING_SHORT_FLAGS = 'aio';

/** The short `commit` options whose value follows (or is attached), so the rest of the cluster is not flags. @es Las opciones cortas con valor. */
const COMMIT_VALUED_SHORT_OPTIONS = 'mFCctuS';

/** The words before a `--`: options and their values, not pathspecs. @es Las palabras antes de un `--`. */
const optionsOf = (args) => (args.includes('--') ? args.slice(0, args.indexOf('--')) : args);

/** Whether one invocation creates a commit. @es Si una invocación crea un commit. */
function commitsWork({ subcommand, args }) {
  if (subcommand === 'commit') return true;
  if (!CONTINUING_SUBCOMMANDS.has(subcommand)) return false;

  return optionsOf(args).some((word) => (subcommand === 'am' ? AM_CONTINUE_OPTIONS : ['--continue']).includes(word));
}

/** Whether a short-option cluster such as `-am` carries a flag that takes worktree content. @es Si un grupo de opciones cortas lleva un indicador que toma contenido del árbol. */
function clusterStages(word) {
  for (const flag of word.slice(1)) {
    if (COMMIT_STAGING_SHORT_FLAGS.includes(flag)) return true;
    if (COMMIT_VALUED_SHORT_OPTIONS.includes(flag)) return false;
  }

  return false;
}

/** Whether a `git commit` takes worktree content itself. @es Si un `git commit` toma contenido del árbol de trabajo. */
function commitStagesItself({ subcommand, args }) {
  if (subcommand !== 'commit') return false;
  if (args.includes('--') && args.indexOf('--') < args.length - 1) return true;

  return optionsOf(args).some((word) => (word.startsWith('--') ? COMMIT_STAGING_LONG_OPTIONS.includes(word) : word.startsWith('-') && clusterStages(word)));
}

/**
 * What the shell command does to the repositories it commits into.
 * @param payload The hook payload (`tool_name`, `tool_input.command`, `cwd`).
 * @param options.run Replaces the git runner (a test seam). @param options.exists Replaces `fs.existsSync`.
 * @param options.lines Replaces the worktree file reader. @param options.fixtures Replaces the fixture declaration.
 * @es Sustituye al ejecutor de git, a `existsSync`, al lector de ficheros y a la declaración de fixtures.
 * @returns `{ offender, failures }` — `offender` is `{ text, directory, conflicts }` for the FIRST commit step that
 *   would commit a conflict, `undefined` when none; `failures` lists `{ directory, reason }` for every probe git
 *   could not answer. @es `offender` es el primer paso que commitearía un conflicto; `failures`, los sondeos sin respuesta.
 */
export function decideFor(payload, { run = runGit, exists, lines, fixtures = declaredFixturePrefixes } = {}) {
  const none = { offender: undefined, failures: [] };
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || command.length === 0) return none;

  const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();
  const failures = [];
  const remembered = new Map();
  const stagingDirectories = [];

  const remember = (key, ask) => {
    if (!remembered.has(key)) remembered.set(key, ask());

    return remembered.get(key);
  };
  const contextOf = (directory) => remember(`context ${directory}`, () => repositoryContext(run, directory, exists));
  const fixturePrefixes = () => remember('fixtures', () => {
    const declared = fixtures();

    if (declared.failure !== undefined) failures.push({ directory: 'fixture-paths.json', reason: declared.failure });

    return declared.prefixes;
  });

  for (const invocation of gitInvocations(command, dialect, cwd)) {
    const directory = invocationDirectory(invocation);

    if (invocation.subcommand === 'add' && directory !== undefined) stagingDirectories.push(directory);
    if (!commitsWork(invocation)) continue;

    if (directory === undefined) {
      failures.push({ directory: String(invocation.directory), reason: `the line's own cd cannot be followed: ${invocation.text}` });
      continue;
    }

    const context = contextOf(directory);

    if (context.failure !== undefined) {
      failures.push({ directory, reason: context.failure });
      continue;
    }

    const stages = commitStagesItself(invocation) || stagingDirectories.some((staged) => contextOf(staged).toplevel === context.toplevel);
    const answers = [remember(`index ${context.toplevel}`, () => indexConflicts(run, context, fixturePrefixes()))];

    if (stages) answers.push(remember(`unmerged ${context.toplevel}`, () => unmergedConflicts(run, context, lines === undefined ? undefined : { lines })));

    for (const answer of answers) if (answer.failure !== undefined) failures.push({ directory, reason: answer.failure });

    const conflicts = answers.flatMap((answer) => answer.conflicts ?? []);

    if (conflicts.length > 0) return { offender: { text: invocation.text, directory: context.toplevel, conflicts }, failures };
  }

  return { offender: undefined, failures };
}
