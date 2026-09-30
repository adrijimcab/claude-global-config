/**
 * The THIRD way the exit code stops being the operation's verdict: the harness KILLS the command
 * before the operation finishes, and the code that comes back describes the kill.
 *
 * WHAT HAPPENED, measured and recorded as `measurement-failure-is-not-a-zero` (2026-09-07). A
 * `git cherry-pick --continue` was run under the Bash tool's DEFAULT two-minute timeout, in a repository
 * whose `pre-commit` hook runs for minutes. The harness killed the hook mid-write, after it had already
 * rewritten `README.md` and `docs/CONFLUENCE.md`. The retry then printed `continue exit=128` and
 * `fatal: cherry-pick failed` over an integration that had actually SUCCEEDED — both commits present,
 * tree clean, no sequencer directory. A false RED over finished work is the expensive direction of this
 * lesson: the response to it is to redo or abort something already done.
 *
 * WHY THE DEFAULT IS NOT ENOUGH HERE, from this repository's own hook rather than from a feeling.
 * `.husky/pre-commit` runs lint-staged over the staged set and, on an integration branch, the live
 * counter sync, whose header states the measurement: `vitest list` is needed for the authoritative test
 * count and is MEASURED at 90 s. Ninety seconds of collection inside a two-minute budget leaves the rest
 * of the hook — ESLint, Stylelint, Prettier, commitlint — competing for thirty. So the hazard is not
 * hypothetical for this tree; it is the arithmetic of its own hook.
 *
 * WHAT IS REFUSED, and what is deliberately not. Only the operations the promoted rule names, because
 * they are the ones that RUN THE HOOKS: `git commit`, and the `--continue` of a cherry-pick, revert,
 * rebase, merge or am, plus `git merge`/`git rebase` themselves, which make commits through the same
 * hooks. Explicitly NOT refused: `--no-verify`, which is git's own way of saying "no hooks"; `--abort`,
 * `--quit` and `--skip`, which make no commit; a plain `git cherry-pick <sha>`, because a CLEAN pick was
 * measured never to reach `pre-commit` at all (git runs it only for `git commit`); and every command the
 * shell treats as data — a heredoc body, a quoted string, `echo git commit …` — because the words come
 * from `shell-command.mjs`, which reads command position rather than text.
 *
 * WHAT SATISFIES IT. An explicit `timeout` of at least five minutes, or `run_in_background`, which is
 * not killed on that clock at all. Both are fields of the tool call this guard reads from the real
 * payload; neither costs anything when the hook turns out to be fast.
 *
 * NO REGEX (M5): set membership and `startsWith` on literals.
 *
 * @es La TERCERA forma de que el código de salida deje de ser el veredicto: que el harness MATE el
 * comando y el código describa la muerte. MEDIDO: un `git cherry-pick --continue` con el timeout por
 * defecto (2 min) fue matado a mitad del hook tras reescribir dos documentos, y el reintento imprimió
 * `exit=128` sobre una integración que SÍ había terminado. El `pre-commit` de este repo declara en su
 * propia cabecera 90 s MEDIDOS solo para `vitest list`, así que el presupuesto por defecto no da. Se
 * rechaza únicamente lo que EJECUTA LOS HOOKS (commit y los `--continue`, más merge y rebase), nunca
 * `--no-verify`, `--abort/--quit/--skip`, un pick limpio (medido: no llega a `pre-commit`) ni nada que
 * la shell trate como DATO. Lo satisface un `timeout` explícito de 5 minutos o `run_in_background`.
 */

import path from 'node:path';

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, dialectOfTool, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** The shortest declared budget this guard accepts, in milliseconds. @es El presupuesto declarado mínimo. */
export const MINIMUM_TIMEOUT_MS = 300_000;

/** The harness default, named in the refusal so the arithmetic is visible. @es El valor por defecto del harness. */
export const HARNESS_DEFAULT_TIMEOUT_MS = 120_000;

/** Git subcommands that make a commit through this repository's hooks. @es Subcomandos que commitean pasando por los hooks. */
const COMMITTING = new Set(['commit', 'merge', 'rebase']);

/** Sequencer subcommands that run the hooks only when RESUMED. @es Subcomandos del secuenciador: solo al REANUDAR. */
const RESUMABLE = new Set(['cherry-pick', 'revert', 'rebase', 'merge', 'am']);

/** The flag that resumes one of those, and therefore commits. @es La bandera que reanuda y por tanto commitea. */
const CONTINUE = '--continue';

/** Flags under which the operation makes no commit, and therefore runs no hook. @es Banderas bajo las que no se commitea. */
const NO_COMMIT = new Set(['--abort', '--quit', '--skip', '--dry-run']);

/** git's own way of saying "run no hooks". @es La forma de git de decir «sin hooks». */
const NO_HOOKS = new Set(['--no-verify', '-n']);

/** The subcommand of a `git` invocation: its first word that is not an option or a `-C <path>` target. @es El subcomando de una invocación de `git`. */
function subcommandOf(words, at) {
  for (let index = at + 1; index < words.length; index += 1) {
    const word = words[index];

    if (word === '-C' || word === '--git-dir' || word === '--work-tree') {
      index += 1;
      continue;
    }

    if (word.startsWith('-')) continue;

    return { name: word, options: words.slice(index + 1) };
  }

  return undefined;
}

/** The hook-running operation `command` performs, or `undefined`. @es La operación que ejecuta hooks, o `undefined`. */
function hookRunningOperation(command) {
  const at = commandWordIndex(command.words);

  if (at === -1 || executableName(command.words[at]) !== 'git') return undefined;

  const subcommand = subcommandOf(command.words, at);

  if (subcommand === undefined) return undefined;

  const flags = subcommand.options;

  if (flags.some((word) => NO_HOOKS.has(word))) return undefined;
  if (flags.some((word) => NO_COMMIT.has(word))) return undefined;

  if (RESUMABLE.has(subcommand.name) && flags.includes(CONTINUE)) return `git ${subcommand.name} ${CONTINUE}`;
  if (COMMITTING.has(subcommand.name)) return `git ${subcommand.name}`;

  return undefined;
}

/**
 * The hook-running operation this tool call would run on a clock too short for the hooks, or
 * `undefined` when there is none — because no such operation is in the command, because the call
 * declares a long enough `timeout`, or because it runs in the background, which that clock does not
 * bound. Bash and PowerShell both run git, so both are decided.
 * @es La operación con hooks que correría con un reloj demasiado corto, o `undefined`.
 */
export function mayBeKilledMidHook(toolName, toolInput, cwd) {
  const dialect = dialectOfTool(toolName);

  if (dialect === undefined || typeof toolInput?.command !== 'string') return undefined;
  if (toolInput.run_in_background === true) return undefined;

  const timeout = toolInput.timeout;

  if (typeof timeout === 'number' && timeout >= MINIMUM_TIMEOUT_MS) return undefined;

  const commands = simpleCommands(toolInput.command, dialect);
  // A payload without a cwd still has its operations decided; only WHERE they run stays unknown.
  // @es Un payload sin cwd sigue decidiendo sus operaciones; solo DÓNDE corren queda desconocido.
  const located = typeof cwd === 'string' ? withWorkingDirectories(commands, cwd, dialect) : commands.map((command) => ({ command, directory: undefined }));

  for (const { command, directory } of located) {
    const operation = hookRunningOperation(command);

    if (operation !== undefined) return { operation, timeout, directory: gitDirectoryOf(command, directory) };
  }

  return undefined;
}

/**
 * The directory the git invocation acts in — where its hooks live: the line's own `cd`s, then each `-C`.
 * `undefined` when the line makes it unknowable, which the caller treats as "hooks assumed to run".
 * Measured 2026-09-30 in the move's replay: `cd <another repo> && git commit` was attributed to the
 * payload's cwd, so the refusal named hooks the command would never run.
 * @es El directorio donde actúa la invocación git (donde viven sus hooks): los `cd` de la línea y luego
 * cada `-C`. `undefined` si la línea lo hace incognoscible.
 */
function gitDirectoryOf(command, directory) {
  if (typeof directory !== 'string') return undefined;

  const gitWord = commandWordIndex(command.words);
  let resolved = directory;

  for (let index = gitWord + 1; index < command.words.length - 1; index += 1) {
    if (command.words[index] === '-C') resolved = path.resolve(resolved, nativeSpelling(command.words[index + 1]));
    else if (!command.words[index].startsWith('-')) break;
  }

  return resolved;
}
