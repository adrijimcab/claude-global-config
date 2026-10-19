/**
 * Whether a delegated `git commit -- <paths>` names a pathspec that covers UNTRACKED files, which git then
 * leaves out of the commit without a word.
 *
 * MEASURED (master, throwaway repo, 2026-10-19). `git commit -m two -- d`, `d` a directory holding a tracked file
 * with changes and an untracked new one, exits 0 and commits only the tracked file. `git commit -m three --
 * solo.txt`, naming the untracked file itself, fails with "pathspec did not match" and commits nothing. So the
 * silent hazard is a directory or glob pathspec that covers an untracked file (Discovery: 26b7227b imported a file
 * that landed only in 0235cc85, so 26b7227b alone does not build).
 *
 * THE DECISION. For each `commit` invocation that carries a pathspec, ask git once, in the directory the commit
 * runs in: `git ls-files --others --exclude-standard -z -- <paths>`. A non-empty answer is an offender. The
 * directory is the payload cwd moved by the line's own `cd` and by the invocation's `git -C`.
 *
 * WHY A MODULE OF ITS OWN. The lexical classifier (`forbidden-invocations.mjs`) is pure and runs no process;
 * this decision runs git. Only `guard.mjs` composes the two, and git is a PORT: `listUntracked` is the default
 * adapter and a caller injects another.
 *
 * AN ERROR IS NOT A DECISION. Git failing, timing out or not being found yields `unchecked`, never an offender,
 * so a broken git never blocks a worker; `guard.mjs` journals the miss so it stays visible.
 *
 * LEFT OUT, stated. A chain `git add -- d/new.txt && git commit -- d` is judged BEFORE the add runs, so it is
 * refused; the refusal says to add in its own command. `--pathspec-from-file` carries no `--` words, so the
 * lexical rule already refuses it. A `--dry-run` abbreviation is read from the words before `--`, so a message
 * that is literally `--dry-run` lets that one commit through unchecked (the allowing side).
 *
 * @es Si un `git commit -- <rutas>` delegado nombra un pathspec que cubre ficheros SIN SEGUIMIENTO, que git deja
 * fuera del commit sin avisar. MEDIDO (master, repo desechable, 2026-10-19): `git commit -- d`, con `d` un directorio
 * con un fichero rastreado modificado y otro nuevo sin seguimiento, sale con 0 y commitea solo el rastreado; nombrar
 * el fichero sin seguimiento falla y no commitea nada. LA DECISIÓN: por cada `commit` con pathspec se pregunta a git
 * una vez, en el directorio donde corre: `git ls-files --others --exclude-standard -z -- <rutas>`; una respuesta no
 * vacía es un infractor. El directorio es el cwd del payload movido por los `cd` de la línea y por el `git -C`. Va en
 * su módulo porque el clasificador léxico es puro y este lanza un proceso; solo `guard.mjs` los compone, y git es un
 * PUERTO inyectable. UN ERROR NO ES UNA DECISIÓN: si git falla, expira o no existe el resultado es `unchecked`, nunca un
 * infractor, y `guard.mjs` lo anota. QUEDA FUERA: `git add -- d/n && git commit -- d` se juzga ANTES del add y se
 * rechaza (el mensaje pide el add en su propio comando); `--pathspec-from-file` ya lo rechaza la regla léxica.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { gitInvocations } from '../shell-command/git-invocations.mjs';

/** How long git may take before the check gives up. @es Cuánto puede tardar git antes de abandonar la comprobación. */
export const GIT_TIMEOUT_MS = 5000;

/** The separator that starts the pathspec. @es El separador que abre el pathspec. */
const PATHSPEC_SEPARATOR = '--';

/** The shortest abbreviation of `--dry-run` git resolves uniquely (`--dr`). @es La abreviatura más corta única de `--dry-run`. */
const DRY_RUN_MIN_LENGTH = '--dr'.length;

/** The words after the first bare `--`, which are paths and never options. @es Las palabras tras el primer `--` suelto: rutas. */
function pathspecOf(args) {
  const at = args.indexOf(PATHSPEC_SEPARATOR);

  return at === -1 ? [] : args.slice(at + 1);
}

/** Whether the options before `--` ask for a dry run, which stages and commits nothing. @es Si las opciones antes de `--` piden `--dry-run`. */
function isDryRun(args) {
  const separator = args.indexOf(PATHSPEC_SEPARATOR);
  const options = separator === -1 ? args : args.slice(0, separator);

  return options.some((word) => word.length >= DRY_RUN_MIN_LENGTH && '--dry-run'.startsWith(word));
}

/**
 * The directory a `git -C <dir>` (applied in order) moves the invocation to, from the directory its `cd`s reached.
 * `git-invocations.mjs` already gives a `-C` value its native spelling.
 * @es El directorio al que llevan los `git -C`, aplicados en orden, desde el que alcanzaron los `cd`.
 */
function repositoryDirectory(gitOptions, startDirectory) {
  let directory = startDirectory;

  for (let index = 0; index < gitOptions.length; index += 1) {
    if (gitOptions[index] === '-C' && index + 1 < gitOptions.length) {
      directory = typeof directory === 'string' ? path.resolve(directory, gitOptions[index + 1]) : gitOptions[index + 1];
    }
  }

  return directory;
}

/**
 * The default adapter: asks git, in `directory`, for the untracked and not ignored files under `pathspecs`. The
 * arguments go as an array, never through a shell.
 * @param {string} directory Where git runs.
 * @param {string[]} pathspecs The words after `--` of the commit.
 * @param {typeof spawnSync} [run] The process port, injectable so a selftest can make git time out.
 * @returns {{ files: string[] } | { error: string }} The untracked paths, or why git could not tell.
 * @es El adaptador por defecto: pregunta a git, en `directory`, por los ficheros sin seguimiento y no ignorados
 * bajo `pathspecs`, con los argumentos como arreglo y sin shell. `run` es el puerto de procesos, inyectable para
 * que un selftest haga expirar a git. Devuelve las rutas, o por qué git no pudo decirlo.
 */
export function listUntracked(directory, pathspecs, run = spawnSync) {
  const result = run('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs], {
    cwd: directory,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true
  });

  if (result.error !== undefined) {
    const timedOut = result.error.code === 'ETIMEDOUT';

    return { error: timedOut ? `git ls-files timed out after ${GIT_TIMEOUT_MS} ms` : `git ls-files could not run: ${result.error.message}` };
  }

  if (result.status !== 0) return { error: `git ls-files exited ${String(result.status)}: ${String(result.stderr).trim().split('\n')[0]}` };

  return { files: result.stdout.split('\0').filter((file) => file.length > 0) };
}

/**
 * The first commit of `script` whose pathspec covers untracked files, and every commit that could not be checked.
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {(directory: string, pathspecs: string[]) => ({ files: string[] } | { error: string })} [list] The git port.
 * @returns {{ offender?: { text: string, files: string[] }, unchecked: Array<{ text: string, directory: string | undefined, reason: string }> }}
 * @es El primer commit de `script` cuyo pathspec cubre ficheros sin seguimiento, y cada commit que no se pudo comprobar.
 */
export function untrackedUnderCommits(script, dialect, cwd, list = listUntracked) {
  const unchecked = [];

  for (const invocation of gitInvocations(script, dialect, cwd)) {
    if (invocation.subcommand !== 'commit' || isDryRun(invocation.args)) continue;

    const pathspecs = pathspecOf(invocation.args);

    if (pathspecs.length === 0) continue;

    const directory = repositoryDirectory(invocation.gitOptions, invocation.directory);

    if (typeof directory !== 'string') {
      unchecked.push({ text: invocation.text, directory, reason: 'the directory the commit runs in cannot be followed from the line' });
      continue;
    }

    const answer = list(directory, pathspecs);

    if (answer.error !== undefined) {
      unchecked.push({ text: invocation.text, directory, reason: answer.error });
    } else if (answer.files.length > 0) {
      return { offender: { text: invocation.text, files: answer.files }, unchecked };
    }
  }

  return { unchecked };
}
