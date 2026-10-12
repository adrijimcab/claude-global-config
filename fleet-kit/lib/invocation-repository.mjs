/**
 * The git global options that make a git invocation act on a repository other than the one its directory
 * belongs to, resolved the way git resolves them.
 *
 * WHAT GIT DOES. `-C <dir>` changes the directory, in order; `--git-dir` (or `GIT_DIR` in the command's own
 * environment) names the repository, a relative path being resolved against the directory `-C` left, and
 * the option wins over the variable; `--work-tree` names only the TREE, never which refs a branch move
 * changes. So the repository is decided by `--git-dir` alone, and this module returns that option and
 * nothing else: handing `--work-tree` to a repository lookup would let a tree that is not the clone's
 * make a move into the clone look like it left it.
 *
 * WHERE THE WORDS COME FROM. `gitInvocations` already lists `--git-dir` among the options in `gitOptions`;
 * `GIT_DIR=...` before `git` it drops, so the invocation's own text is tokenised again with the shared
 * `simpleCommands` and the `NAME=value` words before the command word are read. Not modelled, stated: a
 * `GIT_DIR` exported or `$env:`-assigned by an EARLIER statement, which the line does not attach to this
 * invocation.
 *
 * @es Las opciones globales de git que hacen que una invocación actúe sobre un repositorio distinto del de
 * su directorio, resueltas como las resuelve git: `--git-dir` (o `GIT_DIR` en el entorno del propio
 * comando) nombra el repositorio, una ruta relativa se resuelve tras los `-C`, y la opción gana a la
 * variable; `--work-tree` solo nombra el ÁRBOL, nunca qué refs cambia un movimiento de rama, así que este
 * módulo devuelve solo `--git-dir`. No se modela un `GIT_DIR` exportado en una sentencia anterior.
 */

import path from 'node:path';

import { nativeSpelling } from '../../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, simpleCommands } from '../../shell-command/shell-command.mjs';

const GIT_DIR_OPTION = '--git-dir';

/** The `GIT_DIR` value in the `NAME=value` words before the command word of `text`, or `undefined`. @es El valor de `GIT_DIR` antes del comando. */
function environmentGitDir(text, dialect, platform) {
  const [command] = simpleCommands(text, dialect, { includeNested: false });

  if (command === undefined) return undefined;

  const assignment = command.words.slice(0, commandWordIndex(command.words)).findLast((word) => word.startsWith('GIT_DIR='));

  return assignment === undefined ? undefined : nativeSpelling(assignment.slice('GIT_DIR='.length), platform);
}

/** The value of the last `--git-dir` in `options` (separate or fused word), as `{ value, at }` or `undefined`. @es El último `--git-dir`. */
function optionGitDir(options) {
  let found;

  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === GIT_DIR_OPTION) found = { value: options[index + 1], at: index };
    else if (options[index].startsWith(`${GIT_DIR_OPTION}=`)) found = { value: options[index].slice(GIT_DIR_OPTION.length + 1), at: index };
  }

  return found;
}

/** The directory in force when option `until` is applied: the line's directory with the `-C`s before it. @es El directorio vigente. */
function directoryAt(invocation, until) {
  let directory = invocation.directory;

  for (let index = 0; index < until && directory !== undefined; index += 1) {
    if (invocation.gitOptions[index] === '-C') directory = path.resolve(directory, invocation.gitOptions[index + 1] ?? '.');
  }

  return directory;
}

/**
 * `['--git-dir=<absolute path>']` when the invocation names its repository, `[]` when it acts on the
 * repository its directory belongs to.
 * @param invocation An element of `gitInvocations(...)`.
 * @param dialect `bash` or `powershell`, the one the line was parsed with.
 * @es `['--git-dir=<ruta absoluta>']` si la invocación nombra su repositorio, `[]` si actúa sobre el de su directorio.
 */
export function repositoryOptions(invocation, dialect, platform = process.platform) {
  const option = optionGitDir(invocation.gitOptions);
  const named = option === undefined ? environmentGitDir(invocation.text, dialect, platform) : option.value;

  if (named === undefined) return [];

  const base = directoryAt(invocation, option === undefined ? invocation.gitOptions.length : option.at);

  return [`${GIT_DIR_OPTION}=${base === undefined ? named : path.resolve(base, named)}`];
}
