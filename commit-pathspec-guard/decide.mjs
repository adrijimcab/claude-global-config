/**
 * THE DECISION — does this shell command commit into a declared backup repo (`config-sync-guard/repos.mjs`)
 * WITHOUT naming an explicit pathspec, so `git commit` would sweep in whatever another actor has already
 * staged in that repo's ONE shared index?
 *
 * MEASURED INCIDENT, 2026-09-30 (`acted-on-a-live-actors-working-state`, 2nd occurrence). In the
 * `b100-am-ui-claude-tooling` backup repo, `node .claude/backup-repo.mjs add AGENT-LEDGER.md` followed by
 * `... commit -m "..."` produced `89b9dad` with 64 files: 1 intended plus 63 deletions a DIFFERENT,
 * frozen actor (a guard-migration agent, `a9051dc022c78b59e`) had already staged in that same index. It
 * was pushed before anyone read the diff. ROOT CAUSE: `git commit` with no pathspec commits the WHOLE
 * index, and `git add <path>` only ADDS — it never NARROWS what a bare `commit` then sweeps up. A repo
 * whose working tree several actors can write is a repo where `git commit` alone is never safe.
 *
 * THE RULE: inside a declared backup repo, `git commit` (or the `backup-repo.mjs` wrapper, which forwards
 * its own argv to `git` verbatim — see that file's own docblock) must name an explicit pathspec: either a
 * literal `--` followed by at least one path, or `--only` (git's own "these paths only" form). Every other
 * git subcommand, and a commit into any OTHER repo, is none of this guard's business.
 *
 * TWO SHAPES REACH THE SAME REPO, and both are covered:
 *   - a plain `git [-C <path>] commit ...`, resolved through the line's own `cd`s (`working-directory.mjs`)
 *     and any `-C` (`git-invocations.mjs`, which already applies `~`/Git-Bash path translation, folded in order
 *     by `company-remote/invocation-directory.mjs`, the one `-C` fold the guards share; git itself rejects a
 *     fused `-C=<dir>` with "unknown option", measured 2026-10-19, so that spelling runs nothing);
 *   - `node <...>/backup-repo.mjs commit ...` — detected by resolving the SCRIPT ARGUMENT's own directory
 *     (never the invoking `node`'s cwd) against the declared repo whose wrapper it is, because the wrapper
 *     hardcodes its work-tree to its OWN directory regardless of where it is invoked from.
 *
 * WHAT NEVER TRIGGERS IT, by construction of the shared `shell-command.mjs` parser this reuses rather than
 * re-implementing: a `git`/`commit` MENTIONED inside `echo`, a quoted `-m` message, or a heredoc body is
 * DATA, never a command — the parser already keeps data out of `words`, so no substring scan is needed and
 * none is written here (M5: token scan only, never regex, never substring).
 *
 * FAILS OPEN: any parse failure, any shape this decision cannot resolve, or a script naming no git
 * invocation at all is `undefined` — never a refusal manufactured from a guess.
 *
 * @es LA DECISIÓN: ¿commitea este comando en un repo de respaldo declarado SIN un pathspec explícito, de
 * forma que `git commit` arrastraría lo que otro actor ya tenga en stage en ese ÍNDICE compartido?
 * INCIDENTE MEDIDO el 2026-09-30 (`acted-on-a-live-actors-working-state`, 2.ª ocurrencia): un commit sin
 * pathspec en el repo de respaldo de b100-am-ui se llevó 63 borrados que otro actor (congelado) ya tenía
 * en stage, y se subió antes de que nadie leyera el diff. `git add <ruta>` solo AÑADE, nunca ACOTA lo que
 * un `commit` a secas arrastra después. REGLA: dentro de un repo de respaldo declarado, `commit` exige
 * `-- <rutas>` o `--only`. Dos formas llegan al mismo repo y ambas están cubiertas: un `git commit` llano
 * (resuelto por `cd`/`-C`) y el envoltorio `backup-repo.mjs`, identificado por el directorio de SU PROPIO
 * argumento de script, nunca por el cwd de quien lo invoca. Lo que nunca lo dispara: una MENCIÓN dentro de
 * `echo`, un mensaje entrecomillado o un heredoc — son DATO por construcción del parser compartido. Sin
 * regex, sin subcadena (M5). Falla ABIERTO ante cualquier forma que no pueda resolver.
 */

import path from 'node:path';

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { declaredRepos } from '../config-sync-guard/repos.mjs';
import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { commandWordIndex, dialectOfTool, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** The wrapper script's own basename — case-insensitive, matched on the SCRIPT ARGUMENT, never on `node`'s cwd. @es Nombre del envoltorio. */
const BACKUP_WRAPPER_BASENAME = 'backup-repo.mjs';

/** `--` (a literal pathspec separator) followed by at least one path. @es `--` seguido de al menos una ruta. */
const PATHSPEC_SEPARATOR = '--';

/** git's own "these paths only" flag, which needs no separate `--`. @es Bandera propia de git «solo estas rutas». */
const ONLY_FLAG = '--only';

/** A path for comparison: absolute, forward slashes, lower case — so a junction, a drive letter's case or a trailing separator never hides a match. @es Ruta normalizada para comparar. */
function normalizePath(candidate) {
  return path.resolve(candidate).split('\\').join('/').toLowerCase();
}

/** The declared repo whose worktree IS `directory`, or `undefined`. @es El repo declarado cuyo worktree ES `directory`. */
function repoAt(directory) {
  if (typeof directory !== 'string') return undefined;

  const normalized = normalizePath(directory);

  return declaredRepos().find((repo) => normalizePath(repo.worktree) === normalized);
}

/** `value` resolved against `directory`: absolute values win outright, as `path.resolve` already does. @es `value` resuelto contra `directory`. */
function resolveAgainst(directory, value) {
  if (value === undefined) return directory;
  if (typeof directory !== 'string') return value;

  return path.resolve(directory, value);
}

/** Whether `args` names an explicit pathspec: `-- <path>` or the bare `--only` flag. @es Si `args` nombra un pathspec explícito. */
function hasExplicitPathspec(args) {
  const separatorAt = args.indexOf(PATHSPEC_SEPARATOR);

  if (separatorAt !== -1 && separatorAt < args.length - 1) return true;

  return args.includes(ONLY_FLAG);
}

/** Every plain `git ... commit ...` invocation that lands in a declared backup repo. @es Cada `git commit` llano que aterriza en un repo de respaldo declarado. */
function gitCommitInvocations(script, dialect, cwd) {
  const found = [];

  for (const invocation of gitInvocations(script, dialect, cwd)) {
    if (invocation.subcommand !== 'commit') continue;

    const repo = repoAt(invocationDirectory(invocation));

    if (repo === undefined) continue;

    found.push({ text: invocation.text, args: invocation.args, repo });
  }

  return found;
}

/**
 * Every `node <...>/backup-repo.mjs commit ...` invocation, identified by resolving the SCRIPT ARGUMENT's
 * own directory against the declared repos — never by the invoking `node`'s cwd, because the wrapper
 * hardcodes its work-tree to wherever `backup-repo.mjs` itself lives (see that file's own docblock).
 * @es Cada invocación del envoltorio, identificada por el directorio de SU PROPIO argumento de script.
 */
function wrapperCommitInvocations(script, dialect, cwd, platform = process.platform) {
  const found = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1 || executableName(command.words[at]) !== 'node') continue;

    const scriptWord = command.words[at + 1];

    if (scriptWord === undefined || path.basename(scriptWord).toLowerCase() !== BACKUP_WRAPPER_BASENAME) continue;

    const scriptPath = resolveAgainst(directory, nativeSpelling(scriptWord, platform));
    const repo = repoAt(path.dirname(scriptPath));

    if (repo === undefined) continue;

    const args = command.words.slice(at + 2);

    if (args[0] !== 'commit') continue;

    found.push({ text: command.text, args: args.slice(1), repo });
  }

  return found;
}

/**
 * The offending invocation — `{ text, args, repo }` — of the FIRST commit this script runs into a
 * declared backup repo without an explicit pathspec, or `undefined` when every such commit already
 * names one, when the script commits nowhere declared, or when `payload` names no shell command at all.
 * @es La invocación infractora, o `undefined` cuando ninguna lo es.
 */
export function offendingInvocationFor(payload) {
  const dialect = dialectOfTool(payload?.tool_name);

  if (dialect === undefined) return undefined;

  const command = payload?.tool_input?.command;

  if (typeof command !== 'string' || command.length === 0) return undefined;

  const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();
  const invocations = [...gitCommitInvocations(command, dialect, cwd), ...wrapperCommitInvocations(command, dialect, cwd)];

  return invocations.find((invocation) => !hasExplicitPathspec(invocation.args));
}
