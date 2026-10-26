/**
 * THE GIT ADAPTER of conflict-marker-guard: asks a repository what its index would commit, and what the
 * worktree would stage for the files still unmerged. Every call is one `git` process with its arguments as an
 * array (never a shell line), a short timeout and a bounded output. A git that cannot answer is a FAILURE the
 * caller turns into an allow plus a journal line; it is never read as "clean".
 *
 * THE CALLS, for one repository, in order:
 *  1. `rev-parse --show-toplevel --git-path <MERGE|REBASE|CHERRY_PICK|REVERT>_HEAD` — the top level that keys
 *     every other call, and whether a merge, rebase, cherry-pick or revert is in progress.
 *  2. `diff --cached --name-status -z -M -G<marker shapes>` — the PREFILTER: only paths whose change touches a
 *     line shaped like a marker (rename sources included, so a rename is never read as a new file).
 *  3. `diff --cached -U0 … -- <those paths>` — the patch, with every config-dependent switch pinned
 *     (`--no-relative`, `--src-prefix=a/`, `--dst-prefix=b/`, `-M`, `--no-color`, `--literal-pathspecs`), skipped
 *     when step 2 found nothing.
 *  4. only when the same line also stages: `ls-files -u -z --full-name` from the top level, and each listed file
 *     is read from the worktree as a STREAM (no size limit, no memory cost), because that is what the `add` is
 *     about to put in the index. A listed file that cannot be read is itself a conflict: git records it as one.
 *
 * WHY THE PATCH AND NOT `--check`: measured 2026-10-25 on a real conflicted merge, `--check` prints
 * `f.txt:2: leftover conflict marker` and exits 2, but it flags a Markdown `=======` underline too and says
 * neither the marker kind nor whether the file is new. WHY THE WORKTREE TOO: in the incident, `git add -- <spec>
 * && git rebase --continue` was ONE line; when the guard runs the file is still unmerged and the index holds no
 * marker. Cost, stated: git's per-path `conflict-marker-size` attribute is not honoured (the default 7 is used).
 *
 * @es EL ADAPTADOR DE GIT de la guardia. Cada llamada es UN proceso `git` con argumentos en array, tiempo
 * límite corto y salida acotada; un git que no responde es un FALLO (se permite y se registra), jamás «limpio».
 * Las llamadas: (1) `rev-parse` da el nivel superior que enlaza todo y si hay fusión, rebase, cherry-pick o revert
 * en curso; (2) el PREFILTRO `diff --cached --name-status -G` deja solo las rutas cuyo cambio toca una línea con
 * forma de marca (con el origen de los renombrados); (3) el parche `-U0` con todo lo que depende de la
 * configuración FIJADO; (4) solo si la misma línea hace `add`, `ls-files -u --full-name` desde el nivel superior
 * y cada fichero se lee del árbol de trabajo en FLUJO, sin límite de tamaño; uno ilegible es en sí un conflicto.
 * Por qué el parche y no `--check`: marca también el subrayado Markdown y no dice el tipo ni si el fichero es
 * nuevo. Por qué también el árbol: en el incidente el `add` y el `continue` eran UNA línea. Coste: no se respeta
 * `conflict-marker-size`.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { conflictIn, conflictsInPatch } from './markers.mjs';

/** How long one git call may take. @es Cuánto puede tardar una llamada a git. */
export const GIT_TIMEOUT_MS = 4000;

/** The largest output of one git call. @es La mayor salida de una llamada a git. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** How many bytes of a worktree file are read at a time. @es Cuántos bytes de un fichero se leen por vez. */
export const CHUNK_BYTES = 64 * 1024;

/** The paths of a prefiltered diff above which the patch is taken for the whole index. @es Por encima de esto el parche abarca todo el índice. */
export const MAX_PATHSPEC = 200;

/** Lines shaped like a marker, as the pickaxe regular expression (POSIX extended) `-G` reads it. @es Líneas con forma de marca para `-G`. */
const MARKER_SHAPES = '^(<<<<<<<|=======|>>>>>>>)';

/** Global git switches: paths unquoted, and pathspecs taken literally. @es Opciones globales de git. */
const PLAIN = ['-c', 'core.quotePath=false', '--literal-pathspecs'];

/** The in-progress states, each a file in the git directory while it lasts. @es Los estados en curso. */
const IN_PROGRESS_FILES = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];

/** `git <args>` in `cwd`: `{ status, stdout, stderr, error }`. `spawn` is a test seam. @es Corre `git <args>` en `cwd`; `spawn` es un punto de prueba. */
export function runGit(args, { cwd }, spawn = spawnSync) {
  return spawn('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true });
}

/** Why a git call did not answer, in one line, or `undefined` when it did. @es Por qué una llamada no respondió. */
function failureOf(result, what) {
  if (result.error !== undefined) return `${what}: ${result.error.code ?? result.error.message}`;
  if (result.status !== 0) return `${what}: git exited ${result.status}: ${String(result.stderr).split('\n')[0]}`;

  return undefined;
}

/**
 * The repository `directory` belongs to: `{ toplevel, inProgress }`, or `{ failure }`.
 * @param exists Replaces `fs.existsSync` (a test seam). @es Sustituye a `fs.existsSync`.
 * @es El repositorio al que pertenece `directory`.
 */
export function repositoryContext(run, directory, exists = existsSync) {
  const result = run(['rev-parse', '--show-toplevel', ...IN_PROGRESS_FILES.flatMap((name) => ['--git-path', name])], { cwd: directory });
  const failure = failureOf(result, 'git rev-parse');

  if (failure !== undefined) return { failure };

  const [toplevel, ...statePaths] = result.stdout.split('\n');

  return { toplevel, inProgress: statePaths.slice(0, IN_PROGRESS_FILES.length).some((statePath) => statePath.length > 0 && exists(path.resolve(directory, statePath))) };
}

/** The paths a `--name-status -z` listing names, rename and copy sources included. @es Las rutas que nombra un listado `--name-status -z`. */
function pathsOfNameStatus(stdout) {
  const tokens = stdout.split('\0');
  const paths = [];

  for (let index = 0; index < tokens.length - 1; ) {
    const width = tokens[index].startsWith('R') || tokens[index].startsWith('C') ? 2 : 1;

    paths.push(...tokens.slice(index + 1, index + 1 + width));
    index += 1 + width;
  }

  return paths;
}

/**
 * The leftover conflicts the index would commit: `{ conflicts }`, or `{ failure }` when git did not answer.
 * @param fixturePrefixes The declared fixture prefixes. @es Los prefijos de fixtures declarados.
 * @es Los conflictos olvidados que commitearía el índice, o `{ failure }`.
 */
export function indexConflicts(run, { toplevel, inProgress }, fixturePrefixes) {
  const listing = run([...PLAIN, 'diff', '--cached', '--name-status', '-z', '-M', '--no-relative', '--no-color', '--no-ext-diff', '--no-textconv', `-G${MARKER_SHAPES}`], { cwd: toplevel });
  const listingFailure = failureOf(listing, 'git diff --cached --name-status');

  if (listingFailure !== undefined) return { failure: listingFailure };

  const candidates = pathsOfNameStatus(listing.stdout);

  if (candidates.length === 0) return { conflicts: [] };

  const restrict = candidates.length <= MAX_PATHSPEC ? ['--', ...candidates] : [];
  const patch = run([...PLAIN, 'diff', '--cached', '-U0', '--no-relative', '--src-prefix=a/', '--dst-prefix=b/', '-M', '--no-color', '--no-ext-diff', '--no-textconv', ...restrict], { cwd: toplevel });
  const patchFailure = failureOf(patch, 'git diff --cached');

  return patchFailure === undefined ? { conflicts: conflictsInPatch(patch.stdout, { exemptNew: !inProgress, fixturePrefixes }) } : { failure: patchFailure };
}

/**
 * The lines of a file, read in chunks: the whole file is never in memory. Throws when it cannot be opened or read.
 * @param options.open @param options.read @param options.close Replace the `fs` calls (test seams).
 * @es Las líneas de un fichero, leídas por trozos: el fichero entero nunca está en memoria.
 */
export function* fileLines(file, { open = openSync, read = readSync, close = closeSync } = {}) {
  const descriptor = open(file, 'r');

  try {
    const decoder = new StringDecoder('utf8');
    const buffer = Buffer.alloc(CHUNK_BYTES);
    let carry = '';

    for (;;) {
      const count = read(descriptor, buffer, 0, CHUNK_BYTES, null);

      if (count === 0) break;

      const parts = `${carry}${decoder.write(buffer.subarray(0, count))}`.split('\n');

      carry = parts.pop();
      yield* parts;
    }

    carry += decoder.end();
    if (carry.length > 0) yield carry;
  } finally {
    close(descriptor);
  }
}

/** The lines of `lines` with their numbers, lazily. @es Las líneas con su número, de forma perezosa. */
function* numbered(lines) {
  let number = 0;

  for (const text of lines) {
    number += 1;
    yield { number, text };
  }
}

/**
 * The conflicts in the worktree copy of every still-unmerged file: `{ conflicts }`, or `{ failure }`. A listed file
 * is in conflict by git's own record, so ANY marker counts, and one that cannot be read is reported as a conflict
 * (`unreadable`), never as clean.
 * @param options.lines Replaces `fileLines` (a test seam). @es Sustituye a `fileLines`.
 * @es Los conflictos en la copia del árbol de trabajo de cada fichero aún sin fusionar.
 */
export function unmergedConflicts(run, { toplevel }, { lines = fileLines } = {}) {
  const result = run(['ls-files', '-u', '-z', '--full-name'], { cwd: toplevel });
  const failure = failureOf(result, 'git ls-files -u');

  if (failure !== undefined) return { failure };

  // Each record is `<mode> <object> <stage>\t<path>`; the same path appears once per stage.
  const names = [...new Set(result.stdout.split('\0').filter((record) => record.includes('\t')).map((record) => record.slice(record.indexOf('\t') + 1)))];
  const conflicts = [];

  for (const name of names) {
    try {
      const conflict = conflictIn(numbered(lines(path.join(toplevel, name))), { unmerged: true });

      if (conflict !== undefined) conflicts.push({ path: name, ...conflict });
    } catch (error) {
      conflicts.push({ path: name, line: 0, kinds: [], unreadable: error.code ?? error.message });
    }
  }

  return { conflicts };
}
