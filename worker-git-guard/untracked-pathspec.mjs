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
 * runs in: `git ls-files --others --exclude-standard -z -- <paths>`. A non-empty answer is an offender, minus the
 * files an earlier `git add` of the same `&&` chain names (`git add -- d/new && git commit -m x -- d`, the flow the
 * refusal recommends): by then they are tracked. The directory is the payload cwd moved by the line's own `cd` and
 * by the invocation's `git -C` (`company-remote/invocation-directory.mjs`, the one fold of `-C` the guards share).
 *
 * `--pathspec-from-file=<file>` (judge B, 2026-10-19). Its paths are read from the file, relative to the directory
 * the commit runs in, one per line (NUL separated with `--pathspec-file-nul`), and checked like the words after
 * `--`. A file that cannot be read (stdin `-`, a missing file, an unknown directory) is an offender of its own, and
 * a file whose paths name no specific path (`pathspec-scope.mjs`) is refused like a commit without paths.
 *
 * WHY A MODULE OF ITS OWN. The lexical classifier (`forbidden-invocations.mjs`) is pure and runs no process;
 * this decision runs git and reads files. Only `guard.mjs` composes the two, and git and the file system are
 * PORTS: `listUntracked` and `readPathspecFile` are the default adapters and a caller injects others.
 *
 * AN ERROR IS NOT A DECISION. Git failing, timing out or not being found yields `unchecked`, never an offender,
 * so a broken git never blocks a worker; `guard.mjs` journals the miss so it stays visible.
 *
 * LEFT OUT, stated. An earlier `git add` counts only for literal paths (no glob, no pathspec magic, no expansion,
 * no `-A` without paths), and only when nothing but `&&` joins it to the commit.
 *
 * @es Si un `git commit -- <rutas>` delegado nombra un pathspec que cubre ficheros SIN SEGUIMIENTO, que git deja
 * fuera del commit sin avisar. MEDIDO (master, repo desechable, 2026-10-19): `git commit -- d`, con `d` un directorio
 * con un fichero rastreado modificado y otro nuevo sin seguimiento, sale con 0 y hace commit solo del rastreado;
 * nombrar el fichero sin seguimiento falla y no hace commit de nada. LA DECISIÓN: por cada `commit` con pathspec se
 * pregunta a git una vez, en el directorio donde corre: `git ls-files --others --exclude-standard -z -- <rutas>`;
 * una respuesta no vacía es un infractor, salvo los ficheros que nombra un `git add` anterior de la misma cadena
 * `&&`, que para entonces ya están rastreados. El directorio es el cwd del payload movido por los `cd` de la línea y
 * por el `git -C` (`company-remote/invocation-directory.mjs`). `--pathspec-from-file=<fichero>`: sus rutas se leen
 * del fichero (una por línea, o separadas por NUL con `--pathspec-file-nul`) y se comprueban igual; un fichero
 * ilegible es un infractor propio, y uno que no nombra rutas concretas se rechaza como un commit sin rutas. Git y el
 * sistema de ficheros son PUERTOS inyectables. UN ERROR NO ES UNA DECISIÓN: si git falla, expira o no existe el
 * resultado es `unchecked`, y `guard.mjs` lo anota. QUEDA FUERA: un `git add` anterior solo cuenta con rutas
 * literales y unido al commit solo por `&&`.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { finalValue, optionsOf, surely } from './git-options.mjs';
import { lineInvocations } from './line-invocations.mjs';
import { namesSpecificPaths } from './pathspec-scope.mjs';

/** How long git may take before the check gives up. @es Cuánto puede tardar git antes de abandonar la comprobación. */
export const GIT_TIMEOUT_MS = 5000;

/** The separator that starts a pathspec. @es El separador que abre un pathspec. */
const PATHSPEC_SEPARATOR = '--';

/** The `--pathspec-from-file` value that means standard input, which the guard cannot read. @es El valor que significa la entrada estándar. */
const STANDARD_INPUT = '-';

/** Characters that make an added path a pattern rather than a literal path. @es Caracteres que hacen de una ruta añadida un patrón. */
const PATTERN_CHARACTERS = '*?[:$';

/**
 * The default adapter: asks git, in `directory`, for the untracked and not ignored files under `pathspecs`. The
 * arguments go as an array, never through a shell.
 * @param {string} directory Where git runs.
 * @param {string[]} pathspecs The pathspec of the commit.
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
 * The default file adapter: the text of a pathspec file, or `undefined` when it cannot be read.
 * @es El adaptador de ficheros por defecto: el texto de un fichero de pathspec, o `undefined` si no se puede leer.
 */
export function readPathspecFile(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** The paths an `add` stages that a later commit can rely on: literal paths, resolved. @es Las rutas literales que agrega un `add`, resueltas. */
function addedPaths(invocation) {
  const directory = invocationDirectory(invocation);

  if (typeof directory !== 'string') return [];

  const separator = invocation.args.indexOf(PATHSPEC_SEPARATOR);
  const options = separator === -1 ? invocation.args : invocation.args.slice(0, separator);

  if (options.some((word) => word === '-n' || word === '--dry-run')) return [];

  const words = separator === -1 ? invocation.args.filter((word) => !word.startsWith('-')) : invocation.args.slice(separator + 1);

  return words.filter((word) => ![...PATTERN_CHARACTERS].some((character) => word.includes(character))).map((word) => path.resolve(directory, word));
}

/** Whether `file` is `added` itself or lies under it. @es Si `file` es `added` o está debajo. */
function isUnder(added, file) {
  const relative = path.relative(added, file);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The pathspec of a commit: the words after `--`, the lines of its `--pathspec-from-file`, or the file that cannot
 * be read; `undefined` for a commit with neither.
 * @es El pathspec de un commit: las palabras tras `--`, las líneas de su `--pathspec-from-file`, o el fichero que no
 * se puede leer; `undefined` si no tiene ninguno.
 */
function pathspecOf(args, directory, read) {
  const { events, afterDashes } = optionsOf('commit', args);
  const file = finalValue(events, 'pathspec-from-file');

  if (file === undefined) return afterDashes.length === 0 ? undefined : { pathspecs: afterDashes, fromFile: false };

  const resolved = typeof directory === 'string' ? path.resolve(directory, file) : path.isAbsolute(file) ? file : undefined;
  const text = file === STANDARD_INPUT || resolved === undefined ? undefined : read(resolved);

  if (text === undefined) return { unreadable: file };

  const lines = text.split(surely(events, 'pathspec-file-nul') ? '\0' : '\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

  return { pathspecs: lines.filter((line) => line.length > 0), fromFile: true };
}

/**
 * The first commit of `script` whose pathspec covers untracked files, or whose pathspec file cannot be read or
 * names no specific path, and every commit that could not be checked.
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {(directory: string, pathspecs: string[]) => ({ files: string[] } | { error: string })} [list] The git port.
 * @param {(file: string) => string | undefined} [read] The file port.
 * @returns {{ offender?: { family: string, text: string, files?: string[], file?: string }, unchecked: Array<{ text: string, directory: string | undefined, reason: string }> }}
 * @es El primer commit de `script` cuyo pathspec cubre ficheros sin seguimiento, o cuyo fichero de pathspec no se
 * puede leer o no nombra rutas concretas, y cada commit que no se pudo comprobar.
 */
export function untrackedUnderCommits(script, dialect, cwd, list = listUntracked, read = readPathspecFile) {
  const unchecked = [];
  const added = [];

  for (const invocation of lineInvocations(script, dialect, cwd)) {
    if (invocation.subcommand === 'add') {
      added.push(...addedPaths(invocation).map((resolved) => ({ chain: invocation.chain, resolved })));
      continue;
    }

    if (invocation.subcommand !== 'commit' || surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;

    const directory = invocationDirectory(invocation);
    const pathspec = pathspecOf(invocation.args, directory, read);

    if (pathspec === undefined) continue;
    if (pathspec.unreadable !== undefined) return { offender: { family: 'commitPathspecFile', text: invocation.text, file: pathspec.unreadable }, unchecked };
    if (pathspec.fromFile && !namesSpecificPaths(pathspec.pathspecs, undefined)) return { offender: { family: 'commitNoPaths', text: invocation.text }, unchecked };

    if (typeof directory !== 'string') {
      unchecked.push({ text: invocation.text, directory, reason: 'the directory the commit runs in cannot be followed from the line' });
      continue;
    }

    const answer = list(directory, pathspec.pathspecs);

    if (answer.error !== undefined) {
      unchecked.push({ text: invocation.text, directory, reason: answer.error });
      continue;
    }

    const staged = added.filter((entry) => entry.chain === invocation.chain);
    const files = answer.files.filter((file) => !staged.some((entry) => isUnder(entry.resolved, path.resolve(directory, file))));

    if (files.length > 0) return { offender: { family: 'commitUntracked', text: invocation.text, files }, unchecked };
  }

  return { unchecked };
}
