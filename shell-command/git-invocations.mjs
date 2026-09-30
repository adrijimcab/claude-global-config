/**
 * Every `git` invocation a shell line RUNS — its subcommand, its own arguments, the git global options
 * that decide which repository it acts on, and the directory it runs in.
 *
 * WHY THIS IS ONE MODULE. Three guards ask the same question of a line — "which git commands does it
 * run, and where?" — and then each asks its own question of the answer: the cherry-pick guard of
 * `cherry-pick`, the ungated-commit guard of `commit`, the ungated-landing guard of every verb that moves
 * a branch. The first two each carried a private copy of git's global-option grammar, and the second
 * said in its own header that one shared module was the right end state. A third copy would have made
 * the drift that sentence named three copies wide, so the grammar lives here once and each guard keeps
 * only the question that is its own.
 *
 * WHAT COUNTS. A simple command whose word in command position is the `git` executable (`git`,
 * `git.exe`, a full path, after `&`, `sudo`, `env X=1`). Everything the shell treats as DATA is already
 * gone by construction of `shell-command.mjs`: git's words inside `echo`, a quoted string, a heredoc
 * body, a PowerShell here-string or a comment are a MENTION and never an invocation. Commands inside
 * `$(...)` and `bash -c "…"` DO count, because they run.
 *
 * NOT MODELLED, stated: git aliases, which are configuration the line does not show.
 *
 * @es Cada invocación de `git` que EJECUTA una línea: subcomando, argumentos propios, opciones globales
 * que deciden el repositorio y el directorio donde corre. Tres guards hacen la misma pregunta; dos
 * llevaban su propia copia de la gramática de opciones globales de git y uno ya decía que un módulo
 * compartido era el estado final correcto. Una tercera copia habría ensanchado esa deriva, así que la
 * gramática vive aquí una vez. Las MENCIONES no cuentan; `$(...)` y `bash -c` sí. Los alias no se modelan.
 */

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, executableName, simpleCommands } from './shell-command.mjs';

/** Git global options that take a SEPARATE value word, which is therefore not the subcommand. @es Opciones globales de git con valor separado. */
const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);

/** Global options whose value is a PATH, which a Git Bash line may spell `/c/...`. @es Opciones globales cuyo valor es una RUTA. */
const PATH_OPTIONS = ['-C', '--git-dir', '--work-tree'];

/**
 * Git's global options and the index of its subcommand, for the words after `git`. Path values are given
 * their native spelling, because a guard runs `git.exe` directly and no MSYS layer translates `/c/Users`
 * for it the way Git Bash does for the real command.
 * @es Las opciones globales de git y el índice de su subcomando; los valores de ruta en grafía nativa.
 */
function splitGlobalOptions(words, from, platform) {
  const options = [];
  let index = from;

  while (index < words.length && words[index].startsWith('-')) {
    const option = words[index];
    const fusedPath = PATH_OPTIONS.find((name) => option.startsWith(`${name}=`));

    options.push(fusedPath === undefined ? option : `${fusedPath}=${nativeSpelling(option.slice(fusedPath.length + 1), platform)}`);

    if (GIT_OPTIONS_WITH_VALUE.has(option) && index + 1 < words.length) {
      const value = words[index + 1];

      options.push(PATH_OPTIONS.includes(option) ? nativeSpelling(value, platform) : value);
      index += 1;
    }

    index += 1;
  }

  return { options, subcommandIndex: index };
}

/**
 * Every git invocation in `script`, in execution order.
 *
 * @param script The shell line exactly as the tool received it.
 * @param dialect `bash` or `powershell`.
 * @param cwd The directory the line starts in.
 * @returns `[{ subcommand, args, gitOptions, directory, text }]` — `subcommand` is `undefined` for a
 *   `git` carrying options only; `directory` is `undefined` when the line's own `cd` cannot be followed.
 * @es Cada invocación de git de `script`, en orden de ejecución.
 */
export function gitInvocations(script, dialect, cwd, platform = process.platform) {
  const invocations = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1 || executableName(command.words[at]) !== 'git') continue;

    const { options, subcommandIndex } = splitGlobalOptions(command.words, at + 1, platform);

    invocations.push({
      subcommand: command.words[subcommandIndex],
      args: command.words.slice(subcommandIndex + 1),
      gitOptions: options,
      directory,
      text: command.text
    });
  }

  return invocations;
}
