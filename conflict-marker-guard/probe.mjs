/**
 * THE GIT ADAPTER of conflict-marker-guard: asks a repository what its index would commit, and what the
 * worktree would stage for the files still unmerged. Every call is one `git` process with its arguments as an
 * array (never a shell line), a short timeout and a bounded output. A git that cannot answer is a FAILURE the
 * caller turns into an allow plus a journal line; it is never read as "clean".
 *
 * WHY `git diff --cached -U0` AND NOT `--check`. Measured 2026-10-25 on a real conflicted merge, staged:
 * `--check` prints `f.txt:2: leftover conflict marker` per line and exits 2, but it says nothing of which
 * marker KIND a line is, so it cannot tell a conflict from a Markdown `=======` underline (it flags that too),
 * and it does not say whether the file is new in the commit. The patch gives, in the same single call, the
 * added lines, their line numbers, their kinds and `new file`. Cost, stated: git's per-path
 * `conflict-marker-size` attribute is not honoured (the default 7 is what every file in practice uses).
 *
 * WHY THE WORKTREE TOO. In the incident this guard exists for, `git add -- <spec> && git rebase --continue` was
 * ONE command line: when the guard runs, the conflicted file is still UNMERGED, so the index holds no marker
 * yet and `diff --cached` is empty. When the same line stages, the files `git ls-files -u` lists are read from
 * the worktree, because that is what the `add` is about to put in the index.
 *
 * @es EL ADAPTADOR DE GIT de la guardia: pregunta a un repositorio qué commitearía su índice y qué
 * añadiría al índice el árbol de trabajo para los ficheros aún sin fusionar. Cada llamada es UN proceso `git`
 * con argumentos en array, un tiempo límite corto y una salida acotada. Un git que no puede responder es un
 * FALLO que quien llama convierte en permitir más una línea de journal; jamás se lee como «limpio». POR QUÉ
 * `git diff --cached -U0` Y NO `--check`: medido el 2026-10-25, `--check` da líneas pero no el TIPO de marca,
 * así que no distingue un conflicto de un subrayado `=======` de Markdown (lo marca también), ni dice si el
 * fichero es nuevo; el parche lo da todo en una llamada. Coste: no respeta `conflict-marker-size`. POR QUÉ
 * TAMBIÉN EL ÁRBOL: en el incidente, `git add -- <spec> && git rebase --continue` era UNA línea; cuando corre la
 * guardia el fichero sigue sin fusionar, el índice aún no tiene marcas. Si la misma línea hace `add`, los
 * ficheros de `git ls-files -u` se leen del árbol de trabajo.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { conflictIn, conflictsInPatch, isFixturePath, MAX_SCANNED_BYTES, numberedLines } from './markers.mjs';

/** How long one git call may take. @es Cuánto puede tardar una llamada a git. */
export const GIT_TIMEOUT_MS = 4000;

/** The largest output of one git call. @es La mayor salida de una llamada a git. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** Paths unquoted, so a name with accents or spaces is read as it is. @es Rutas sin entrecomillar. */
const PLAIN_PATHS = ['-c', 'core.quotePath=false'];

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
 * The leftover conflicts the index would commit: `{ conflicts }`, or `{ failure }` when git did not answer.
 * @es Los conflictos olvidados que commitearía el índice, o `{ failure }`.
 */
export function indexConflicts(run, directory) {
  const result = run([...PLAIN_PATHS, 'diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--no-textconv'], { cwd: directory });
  const failure = failureOf(result, 'git diff --cached');

  return failure === undefined ? { conflicts: conflictsInPatch(result.stdout) } : { failure };
}

/**
 * The leftover conflicts in the worktree copy of every still-unmerged file: `{ conflicts }`, or `{ failure }`.
 * @param readFile Replaces the file reader (a test seam). @es Sustituye al lector de ficheros.
 * @es Los conflictos olvidados en la copia del árbol de trabajo de cada fichero aún sin fusionar.
 */
export function unmergedConflicts(run, directory, { read = readFileSync, size = (file) => statSync(file).size } = {}) {
  const result = run(['ls-files', '-u', '-z'], { cwd: directory });
  const failure = failureOf(result, 'git ls-files -u');

  if (failure !== undefined) return { failure };

  // Each record is `<mode> <object> <stage>\t<path>`; the same path appears once per stage.
  const names = [...new Set(result.stdout.split('\0').filter((record) => record.includes('\t')).map((record) => record.slice(record.indexOf('\t') + 1)))];
  const conflicts = [];

  for (const name of names) {
    if (isFixturePath(name)) continue;

    try {
      const file = path.resolve(directory, name);

      if (size(file) > MAX_SCANNED_BYTES) continue;

      const conflict = conflictIn(numberedLines(read(file, 'utf8')));

      if (conflict !== undefined) conflicts.push({ path: name, ...conflict });
    } catch {
      // A file that cannot be read (deleted by one side) holds no marker the add could stage.
    }
  }

  return { conflicts };
}
