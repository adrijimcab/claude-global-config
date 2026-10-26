/**
 * The state of the INDEX for some paths, read with ONE bounded `git status` call: which of them have a staged
 * content that differs from HEAD, or a worktree content that differs from the index, and WHICH staged content
 * (the blob id of the index entry). Git is reached through a port (`runGit`) so a test replaces the process, and
 * a git error or a timeout comes back as a value, never as an exception: the caller journals the reason and lets
 * the command go.
 *
 * WHY `--porcelain=v2`. It answers both columns and the index blob id of every path in one process, in a
 * documented record shape (`1 XY sub mH mI mW hH hI path`; a rename or copy is `2 ... Xscore path` followed by
 * its origin; an unmerged path is `u ...`), so no output is scraped by guessing. `--find-renames` lets a staged
 * move of a path appear as a rename WHEN both names are in the pathspec; `--untracked-files=no` keeps a
 * directory pathspec from listing files git has never tracked.
 *
 * @es El estado del ÍNDICE para unas rutas, leído con UNA llamada acotada a `git status`: cuáles tienen un
 * contenido en stage distinto de HEAD o un contenido de árbol de trabajo distinto del índice, y CUÁL contenido
 * en stage (el id del blob de la entrada del índice). Git se alcanza por un puerto (`runGit`): un error o un
 * tiempo agotado vuelve como valor, nunca como excepción, y quien llama registra la razón y deja pasar el
 * comando. `--porcelain=v2` da las dos columnas y el blob de cada ruta en un registro documentado.
 */

import { execFileSync } from 'node:child_process';

/** Milliseconds a git call may take before it is given up. @es Milisegundos que puede tardar una llamada a git. */
export const GIT_TIMEOUT_MS = 5000;

/** The most output a git call may print. @es Lo máximo que puede imprimir una llamada a git. */
const MAX_BUFFER = 8 * 1024 * 1024;

const NUL = '\0';

/** How many space-separated fields precede the path in each record type. @es Cuántos campos preceden a la ruta en cada tipo de registro. */
const FIELDS_BEFORE_PATH = Object.freeze({ 1: 8, 2: 9, u: 10 });

/** The position of the index blob id among those fields. @es La posición del blob del índice entre esos campos. */
const BLOB_FIELD = Object.freeze({ 1: 7, 2: 7, u: 8 });

/**
 * Runs git with an ARGUMENT ARRAY, never a shell line.
 * @returns `{ ok: true, stdout }` or `{ ok: false, reason }` with a bilingual reason.
 * @es Corre git con un ARREGLO de argumentos, nunca una línea de shell. Devuelve `{ ok, stdout }` o `{ ok: false, reason }`.
 */
export function runGit(args, { cwd, timeoutMs = GIT_TIMEOUT_MS } = {}) {
  try {
    const stdout = execFileSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    return { ok: true, stdout };
  } catch (error) {
    const timedOut = error?.code === 'ETIMEDOUT';
    const detail = timedOut ? `timed out after ${timeoutMs} ms @es agotó ${timeoutMs} ms` : String(error?.stderr || error?.message || error).trim();

    return { ok: false, reason: `git ${args[0]} failed: ${detail} @es git ${args[0]} falló: ${detail}` };
  }
}

/** The first `count` space-separated fields of `record` and the rest, which is the path and may hold spaces. @es Los primeros `count` campos y el resto. */
function splitFields(record, count) {
  const fields = [];
  let from = 0;

  for (let seen = 0; seen < count; seen += 1) {
    const space = record.indexOf(' ', from);

    if (space === -1) return undefined;

    fields.push(record.slice(from, space));
    from = space + 1;
  }

  return { fields, path: record.slice(from) };
}

/**
 * Parses `git status --porcelain=v2 -z` into the tracked paths it lists.
 * @returns `[{ path, code, blob }]`: `code` is the two status columns with a blank for "unchanged" (`MM`, `M `,
 *   ` M`...), `blob` the index blob id. The origin record that follows a rename or copy is skipped: it is a name,
 *   not an entry.
 * @es Analiza `git status --porcelain=v2 -z` en las rutas rastreadas que lista.
 */
export function parseStatus(stdout) {
  const records = stdout.split(NUL);
  const found = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const type = record[0];
    const count = FIELDS_BEFORE_PATH[type];

    if (count === undefined || record[1] !== ' ') continue;

    const split = splitFields(record, count);

    if (split === undefined) continue;

    const entry = { path: split.path, code: split.fields[1].split('.').join(' '), blob: split.fields[BLOB_FIELD[type]] };

    if (type === '2') index += 1;

    found.push(entry);
  }

  return found;
}

/** The arguments of the status call, the pathspec last. @es Los argumentos de la llamada a status. */
const statusArguments = (paths) => ['status', '--porcelain=v2', '-z', '--find-renames', '--untracked-files=no', '--', ...paths];

/**
 * The paths among `paths` whose index differs from HEAD or from the worktree.
 * @returns `{ ok: true, entries }` or `{ ok: false, reason }`.
 * @es Las rutas de `paths` cuyo índice difiere de HEAD o del árbol de trabajo.
 */
export function indexEntries(paths, { cwd, git = runGit } = {}) {
  const status = git(statusArguments(paths), { cwd });

  if (!status.ok) return status;

  return { ok: true, entries: parseStatus(status.stdout) };
}

/**
 * Every changed tracked path of the WHOLE repository, for following a path that was moved after it went stale:
 * git's own rename detection compares content and misses a small file, so the caller also matches the index
 * blob, which a `git mv` keeps.
 * @returns `{ ok: true, entries }` or `{ ok: false, reason }`.
 * @es Cada ruta rastreada cambiada de TODO el repositorio, para seguir una ruta que se movió: la detección de renombrados de git compara contenido y no ve un fichero pequeño, así que quien llama también compara el blob, que `git mv` conserva.
 */
export function repositoryEntries({ cwd, git = runGit } = {}) {
  return indexEntries([], { cwd, git });
}

/**
 * The top-level directory of the repository `cwd` is in.
 * @returns `{ ok: true, toplevel }` or `{ ok: false, reason }`.
 * @es El directorio raíz del repositorio en que está `cwd`.
 */
export function repositoryTop(cwd, { git = runGit } = {}) {
  const top = git(['rev-parse', '--show-toplevel'], { cwd });

  if (!top.ok) return top;

  return { ok: true, toplevel: top.stdout.trim() };
}

/** Whether both columns differ: the index holds a variant that is neither HEAD nor the worktree. @es Si las dos columnas difieren: el índice guarda una variante que no es ni HEAD ni el árbol de trabajo. */
export const indexDisagreesWithBoth = ({ code }) => code[0] !== ' ' && code[1] !== ' ';
