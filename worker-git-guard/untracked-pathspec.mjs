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
 * runs in and on the repository the line points it at (`--git-dir`, `--work-tree`, `GIT_DIR`, `GIT_WORK_TREE`,
 * `GIT_INDEX_FILE` are forwarded): `git ls-files --others --exclude-standard -z -- <paths>`. A non-empty answer is
 * an offender, minus the files an earlier `git add` of the same `&&` chain stages (`git add -- d/new && git commit
 * -m x -- d`, the flow the refusal recommends). That `add` is read through git's own option table: a dry run, `-u`,
 * `-p`, `-i`, `-e` and `-N` stage no new file, so they do not count; `-A` with no path covers the whole worktree.
 * The directory is the payload cwd moved by the line's own `cd` and by the invocation's `git -C`
 * (`company-remote/invocation-directory.mjs`, the one fold of `-C` the guards share).
 *
 * THE TREE THE HOOK SEES (both judges, 2026-10-19). The whole line is judged before any of it runs, so when an
 * earlier command of the line may write files (`line-writes.mjs`) and the commit reads a pathspec file (one that
 * does not exist yet included: the writer may be creating it) or names a pathspec that can match files still to
 * come (a glob or a directory), the answer would be about a stale tree; such a commit is refused, and the refusal
 * says to commit in its own command once the files exist. This is decided before the file is read.
 *
 * `--pathspec-from-file=<file>` (judge B, 2026-10-19). Its paths are read from the file, relative to the directory
 * the commit runs in, one per line (NUL separated with `--pathspec-file-nul`), a line in double quotes unquoted as
 * git does (C style: `\n`, `\t`, `\"`, `\\`, octal bytes), and checked like the words after `--`. A file that cannot
 * be read (stdin `-`, a missing file, an unknown directory) is an offender of its own, and a file whose paths sweep
 * the worktree (`pathspec-scope.mjs`) is refused like a commit without paths.
 *
 * WHY A MODULE OF ITS OWN. The lexical classifier (`forbidden-invocations.mjs`) runs no process; this decision runs
 * git and reads files. Only `guard.mjs` composes the two, and git and the file system are PORTS: `listUntracked` and
 * `readPathspecFile` are the default adapters and a caller injects others.
 *
 * AN ERROR IS NOT A DECISION. Git failing, timing out or not being found yields `unchecked`, never an offender,
 * so a broken git never blocks a worker; `guard.mjs` journals the miss so it stays visible.
 *
 * THE ADD THAT COUNTS (third Judgment Day round, 2026-10-25). An earlier `git add` counts only into the commit's
 * own index (the same `GIT_INDEX_FILE`, or the same live index), and a later `restore --staged` or `rm` of a path it
 * covers (or of no path, or of a pathspec file) cancels it.
 *
 * LEFT OUT, stated. An earlier `git add` counts only when nothing but `&&` joins it to the commit, and only for the
 * paths it names literally (a glob resolved as a literal path names no file) or for `-A` with no path; one that
 * reads its paths from a file does not count.
 *
 * @es Si un `git commit -- <rutas>` delegado nombra un pathspec que cubre ficheros SIN SEGUIMIENTO, que git deja
 * fuera del commit sin avisar. MEDIDO (master, 2026-10-19): `git commit -- d` con un fichero nuevo sin seguimiento en
 * `d` sale con 0 y lo deja fuera. LA DECISIÓN: por cada `commit` con pathspec se pregunta a git una vez, en su
 * directorio y sobre el repositorio al que la línea lo apunta (se reenvían `--git-dir`, `--work-tree`, `GIT_DIR`,
 * `GIT_WORK_TREE` y `GIT_INDEX_FILE`); una respuesta no vacía es un infractor, salvo lo que agrega un `git add`
 * anterior de la misma cadena `&&` y del mismo índice que el commit, leído con la tabla de opciones de git (un ensayo,
 * `-u`, `-p`, `-i`, `-e` y `-N` no agregan ficheros nuevos; `-A` sin rutas cubre todo el worktree); un `restore
 * --staged` o `rm` posterior de una ruta que cubre lo anula. EL ÁRBOL QUE VE EL HOOK: la línea se juzga antes de
 * correr, así que si un comando anterior puede escribir ficheros y el commit lee un fichero de pathspec (también uno
 * que aún no existe: el escritor puede estar creándolo) o nombra un
 * pathspec que puede casar con ficheros por venir (un glob o un directorio), se rechaza y se pide hacer el commit en
 * su propio comando cuando los ficheros existan. `--pathspec-from-file`: sus líneas se leen (con NUL si se pide, y
 * las entrecomilladas al estilo C se desentrecomillan como hace git) y se comprueban igual; un fichero ilegible es un
 * infractor propio y uno que barre el worktree se rechaza como un commit sin rutas. Git y el sistema de ficheros son
 * PUERTOS inyectables; un error de git es `unchecked`, nunca un infractor.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { finalValue, mayBe, optionsOf, surely } from './git-options.mjs';
import { holdsExpansion } from './line-config.mjs';
import { lineInvocations } from './line-invocations.mjs';
import { earlierWriter } from './line-writes.mjs';
import { matchesFilesToCome, sweepsWorktree } from './pathspec-scope.mjs';
import { gitEnvironmentOf, indexFileOf, isWithin, repositoryLayout, samePath } from './repository-layout.mjs';

/** How long git may take before the check gives up. @es Cuánto puede tardar git antes de abandonar la comprobación. */
export const GIT_TIMEOUT_MS = 5000;

/** The `--pathspec-from-file` value that means standard input, which the guard cannot read. @es El valor que significa la entrada estándar. */
const STANDARD_INPUT = '-';

/** The `git add` options that stage no new file. @es Las opciones de `git add` que no agregan ficheros nuevos. */
const ADDS_NO_NEW_FILE = ['dry-run', 'update', 'interactive', 'patch', 'edit', 'intent-to-add'];

/** The subcommands that take paths back out of the index. @es Los subcomandos que sacan rutas del índice. */
const UNSTAGING = new Set(['restore', 'rm']);

/** The C escapes git unquotes in a quoted pathspec line. @es Los escapes C que git desentrecomilla. */
const C_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34 };

/**
 * The default adapter: asks git, in `directory`, for the untracked and not ignored files under `pathspecs`. The
 * arguments go as an array, never through a shell.
 * @param {string} directory Where git runs.
 * @param {string[]} pathspecs The pathspec of the commit.
 * @param {Record<string, string>} [environment] The repository variables the line sets, forwarded to git.
 * @param {typeof spawnSync} [run] The process port, injectable so a selftest can make git time out.
 * @returns {{ files: string[] } | { error: string }} The untracked paths, or why git could not tell.
 * @es El adaptador por defecto: pregunta a git, en `directory`, por los ficheros sin seguimiento y no ignorados
 * bajo `pathspecs`, con los argumentos como arreglo y sin shell, y con las variables de repositorio de la línea.
 */
export function listUntracked(directory, pathspecs, environment = {}, run = spawnSync) {
  const result = run('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs], {
    cwd: directory,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true
  });

  if (result.error !== undefined) {
    const timedOut = result.error.code === 'ETIMEDOUT';

    return { error: timedOut ? `git ls-files timed out after ${GIT_TIMEOUT_MS} ms @es git ls-files superó el límite de ${GIT_TIMEOUT_MS} ms` : `git ls-files could not run: ${result.error.message} @es git ls-files no pudo ejecutarse` };
  }

  if (result.status !== 0) return { error: `git ls-files exited ${String(result.status)}: ${String(result.stderr).trim().split('\n')[0]} @es git ls-files salió con ${String(result.status)}` };

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

/** A pathspec line as git reads it: unquoted C style when it is in double quotes. @es Una línea de pathspec como la lee git. */
function unquoted(line) {
  if (line.length < 2 || !line.startsWith('"') || !line.endsWith('"')) return line;

  const bytes = [];
  const body = line.slice(1, -1);

  for (let at = 0; at < body.length; at += 1) {
    const character = body.charAt(at);
    const next = body.charAt(at + 1);

    if (character !== '\\') {
      bytes.push(...Buffer.from(character, 'utf8'));
    } else if (/^[0-7]{3}$/.test(body.slice(at + 1, at + 4))) {
      bytes.push(Number.parseInt(body.slice(at + 1, at + 4), 8));
      at += 3;
    } else {
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      at += 1;
    }
  }

  return Buffer.from(bytes).toString('utf8');
}

/** The paths an `add` stages new files under, resolved. @es Las rutas bajo las que un `add` agrega ficheros nuevos, resueltas. */
function addedPaths(invocation) {
  const directory = invocationDirectory(invocation);

  if (typeof directory !== 'string') return [];

  const { events, positionals } = optionsOf('add', invocation.args);

  if (ADDS_NO_NEW_FILE.some((key) => mayBe(events, key)) || finalValue(events, 'pathspec-from-file') !== undefined) return [];

  if (positionals.length === 0) {
    const layout = surely(events, 'all') ? repositoryLayout(directory, invocation.environment, invocation.gitOptions) : undefined;

    return layout === undefined ? [] : [layout.root];
  }

  return positionals.map((word) => path.resolve(directory, word));
}

/**
 * The paths a later command takes back out of the index: `restore` (the lexical rules allow it only with
 * `--staged`) and `rm` (`--cached` or not), resolved; every path (`[undefined]`) when it names none, reads them
 * from a file, or runs where the line cannot follow; `[]` for a dry run or any other command.
 * @es Las rutas que un comando posterior saca del índice: `restore` (solo con `--staged`) y `rm`; todas si no nombra
 * ninguna, las lee de un fichero o corre donde la línea no se puede seguir; ninguna para un ensayo u otro comando.
 */
function unstagedPaths(invocation) {
  if (!UNSTAGING.has(invocation.subcommand)) return [];

  const { events, positionals } = optionsOf(invocation.subcommand, invocation.args);

  if (surely(events, 'dry-run')) return [];

  const directory = invocationDirectory(invocation);

  // A pathspec file comes with no path words (git refuses both together), so it unstages everything here too.
  // @es Un fichero de pathspec llega sin rutas (git rechaza ambos juntos), así que aquí también lo saca todo.
  if (typeof directory !== 'string' || invocation.gitOptions.some(holdsExpansion) || positionals.length === 0) return [undefined];

  return positionals.map((word) => path.resolve(directory, word));
}

/** Whether two resolved paths overlap: one is the other or lies under it. @es Si dos rutas se solapan. */
const overlaps = (first, second) => first === undefined || isWithin(first, second) || isWithin(second, first);

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

  const nul = surely(events, 'pathspec-file-nul');
  const lines = text.split(nul ? '\0' : '\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

  return { pathspecs: lines.filter((line) => line.length > 0).map((line) => (nul ? line : unquoted(line))), fromFile: true };
}

/**
 * The first commit of `script` whose pathspec covers untracked files, whose pathspec file cannot be read or sweeps
 * the worktree, or that runs after an earlier command of the line may have written files under it; and every
 * commit that could not be checked.
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {(directory: string, pathspecs: string[], environment: Record<string, string>) => ({ files: string[] } | { error: string })} [list] The git port.
 * @param {(file: string) => string | undefined} [read] The file port.
 * @returns {{ offender?: { family: string, text: string, files?: string[], directory?: string, file?: string, writer?: string }, unchecked: Array<{ text: string, directory: string | undefined, reason: string }> }}
 * @es El primer commit de `script` cuyo pathspec cubre ficheros sin seguimiento, cuyo fichero de pathspec no se
 * puede leer o barre el worktree, o que corre tras un comando de la línea que pudo escribir ficheros bajo él; y
 * cada commit que no se pudo comprobar.
 */
export function untrackedUnderCommits(script, dialect, cwd, list = listUntracked, read = readPathspecFile) {
  const unchecked = [];
  const added = [];

  for (const invocation of lineInvocations(script, dialect, cwd)) {
    const indexFile = indexFileOf(invocationDirectory(invocation), invocation.environment, invocation.gitOptions);

    if (invocation.subcommand === 'add') {
      added.push(...addedPaths(invocation).map((resolved) => ({ chain: invocation.chain, resolved, indexFile })));
      continue;
    }

    for (const taken of unstagedPaths(invocation)) {
      for (let at = added.length - 1; at >= 0; at -= 1) if (overlaps(taken, added[at].resolved)) added.splice(at, 1);
    }

    if (invocation.subcommand !== 'commit' || surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;

    const directory = invocationDirectory(invocation);
    const pathspec = pathspecOf(invocation.args, directory, read);

    if (pathspec === undefined) continue;

    const layout = repositoryLayout(directory, invocation.environment, invocation.gitOptions);
    const writer = earlierWriter(invocation.before, dialect);
    const base = typeof directory === 'string' ? directory : cwd;
    const readsPathspecFile = pathspec.unreadable !== undefined || pathspec.fromFile;

    // A pathspec file an earlier command may write (or create) is judged as the writer's: the hook cannot see it yet.
    // @es Un fichero de pathspec que un comando anterior puede escribir (o crear) se juzga como del escritor.
    if (writer !== undefined && (readsPathspecFile || pathspec.pathspecs.some((spec) => matchesFilesToCome(spec, base, layout?.root)))) {
      return { offender: { family: 'commitAfterWrites', text: invocation.text, writer }, unchecked };
    }

    if (pathspec.unreadable !== undefined) return { offender: { family: 'commitPathspecFile', text: invocation.text, file: pathspec.unreadable }, unchecked };
    if (pathspec.fromFile && sweepsWorktree(pathspec.pathspecs, { dialect: undefined, directory, layout })) return { offender: { family: 'commitNoPaths', text: invocation.text }, unchecked };

    const environment = typeof directory === 'string' ? gitEnvironmentOf(directory, invocation.environment, invocation.gitOptions) : undefined;

    if (environment === undefined) {
      unchecked.push({ text: invocation.text, directory, reason: 'the directory or the repository the commit runs in cannot be followed from the line @es el directorio o el repositorio del commit no se pueden seguir desde la línea' });
      continue;
    }

    const answer = list(directory, pathspec.pathspecs, environment);

    if (answer.error !== undefined) {
      unchecked.push({ text: invocation.text, directory, reason: answer.error });
      continue;
    }

    const staged = added.filter((entry) => entry.chain === invocation.chain && entry.indexFile !== undefined && samePath(entry.indexFile, indexFile));
    const files = answer.files.filter((file) => !staged.some((entry) => isWithin(entry.resolved, path.resolve(directory, file))));

    if (files.length > 0) return { offender: { family: 'commitUntracked', text: invocation.text, files, directory }, unchecked };
  }

  return { unchecked };
}
