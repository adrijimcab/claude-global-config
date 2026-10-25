/**
 * The state of the INDEX for some paths, read with ONE bounded `git status` call: which of them have a staged
 * content that differs from HEAD, or a worktree content that differs from the index. Git is reached through a
 * port (`runGit`) so a test replaces the process, and a git error or a timeout comes back as a value, never as
 * an exception: the caller journals the reason and lets the command go.
 *
 * WHY STATUS AND NOT DIFF. `git status --porcelain=v1 -z` answers both columns for every path in one process
 * and its record shape is a documented interface (`XY <path>`, a rename or copy followed by its origin), so no
 * output is scraped by guessing. `--untracked-files=no` keeps a directory pathspec from listing files git has
 * never tracked.
 *
 * @es El estado del ÍNDICE para unas rutas, leído con UNA llamada acotada a `git status`: cuáles tienen un
 * contenido en stage distinto de HEAD o un contenido de árbol de trabajo distinto del índice. Git se alcanza
 * por un puerto (`runGit`): un error de git o un tiempo agotado vuelve como valor, nunca como excepción, y
 * quien llama registra la razón y deja pasar el comando.
 */

import { execFileSync } from 'node:child_process';

/** Milliseconds a git call may take before it is given up. @es Milisegundos que puede tardar una llamada a git. */
export const GIT_TIMEOUT_MS = 5000;

/** The most output a git call may print. @es Lo máximo que puede imprimir una llamada a git. */
const MAX_BUFFER = 8 * 1024 * 1024;

const NUL = '\0';

/** Status codes of a path git does not track or ignores on purpose: they carry no index state. @es Códigos de rutas que git no rastrea. */
const UNTRACKED_CODES = new Set(['??', '!!']);

/** Codes whose record is followed by the origin path. @es Códigos cuyo registro va seguido de la ruta de origen. */
const ORIGIN_CODES = new Set(['R', 'C']);

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

/**
 * Parses `git status --porcelain=v1 -z` into the paths whose index is not in step.
 * @returns `[{ path, code }]`, `code` being the two status columns (`MM`, `M `, ` M`...).
 * @es Analiza `git status --porcelain=v1 -z` en las rutas cuyo índice no está al día.
 */
export function parseStatus(stdout) {
  const records = stdout.split(NUL);
  const found = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];

    if (record.length < 4) continue;

    const code = record.slice(0, 2);

    if (ORIGIN_CODES.has(code[0]) || ORIGIN_CODES.has(code[1])) index += 1;
    if (UNTRACKED_CODES.has(code)) continue;

    found.push({ path: record.slice(3), code });
  }

  return found;
}

/**
 * The paths among `paths` whose index differs from HEAD or from the worktree.
 * @returns `{ ok: true, entries }` or `{ ok: false, reason }`.
 * @es Las rutas de `paths` cuyo índice difiere de HEAD o del árbol de trabajo.
 */
export function indexEntries(paths, { cwd, git = runGit } = {}) {
  const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', ...paths], { cwd });

  if (!status.ok) return status;

  return { ok: true, entries: parseStatus(status.stdout) };
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
