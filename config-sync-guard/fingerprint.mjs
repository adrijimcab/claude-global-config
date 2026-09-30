/**
 * Fingerprints a declared backup repo's ENTIRE current state — the count of commits ahead of its
 * remote, plus a git TREE HASH of every path in the worktree (tracked or untracked, never gitignored)
 * — so a dismissal (`dismiss.mjs`) can be scoped to the EXACT state it was granted against, and any
 * later change (an edited byte, a new path, a different ahead count) yields a DIFFERENT fingerprint and
 * re-blocks automatically. This closes the gap `dismiss.mjs` shipped with on 2026-09-30: a dismissal
 * recorded only `{at, session, repo, reason}`, so the SAME dismissal kept excusing a repo forever, even
 * after its content changed — measured directly, the same two paths (`hook-dispatch/manifests/
 * subagent-stop.json` and `vendored/`, frozen work of a stopped agent) had to be re-dismissed on every
 * turn of the same session.
 *
 * WHY A TREE HASH, never the dirty-PATH LIST `decide.mjs` already computes. A path list matches on
 * NAMES only — editing an already-dirty file's bytes leaves the same path list, so a name-keyed
 * dismissal would silently keep excusing arbitrary future edits to that same path forever. A git tree
 * object is content-addressed: ANY byte anywhere under the worktree changes the hash, which is exactly
 * the discrimination a scoped dismissal needs.
 *
 * WHY A TEMPORARY INDEX (`GIT_INDEX_FILE`), never the repo's real one. `git write-tree` reads whatever
 * index `GIT_INDEX_FILE` names. Pointing it at a throwaway file lets `git add -A` populate a FRESH
 * index built fully from the current worktree, then `write-tree` hash it, WITHOUT ever opening the
 * real `.git/index` — which this session, or a live agent's own in-flight `git add`, may be using right
 * now. `git add -A` already skips gitignored paths on its own (default behaviour, no `--force`), so an
 * ignored path never enters the fingerprint, matching what `decide.mjs`'s own dirty-path population
 * already means (tracked + untracked, never ignored).
 *
 * WHY `--git-dir`/`--work-tree`, never `git -C <worktree>`. One of the two declared repos
 * (`b100-am-ui/.claude`) has its git dir OUTSIDE its worktree (`repos.mjs`'s own docblock) precisely so
 * that plain `git -C <worktree>` commands never resolve it. `-C` would instead walk UP from the
 * worktree looking for a `.git`, which for that repo means silently fingerprinting the ENCLOSING
 * `b100-am-ui` project repo instead — wrong repo, wrong tree, wrong answer. Explicit `--git-dir`/
 * `--work-tree` (the same shape `repos.mjs`'s own `backup-repo.mjs` wrapper already documents using)
 * removes that ambiguity for both repos uniformly.
 *
 * FAILS TOWARD BLOCK, same stance as every other measurement in this mechanism
 * (`measurement-failure-is-not-a-zero`): a missing `git` binary, a repo with no `gitDir`, a permissions
 * error, or a `git status` failure all return `undefined` — which can never equal a recorded
 * dismissal's fingerprint (`decide.mjs` never even looks one up when the current fingerprint is
 * `undefined`), so a fingerprint that could not be measured excuses nothing.
 *
 * @es Calcula la huella del estado COMPLETO de un repo de respaldo declarado — el conteo de commits de
 * adelanto sobre su remoto, más un HASH DE ÁRBOL git de cada ruta del worktree (tracked o untracked,
 * nunca ignorada) — para que un descarte (`dismiss.mjs`) quede acotado al estado EXACTO contra el que
 * se concedió, y cualquier cambio posterior (un byte editado, una ruta nueva, un conteo de adelanto
 * distinto) produzca una huella DISTINTA y vuelva a bloquear automáticamente.
 *
 * POR QUÉ UN HASH DE ÁRBOL y no la LISTA de rutas sucias que ya calcula `decide.mjs`: una lista de
 * rutas solo compara NOMBRES — editar el contenido de un fichero ya sucio deja la misma lista, así que
 * un descarte anclado al nombre seguiría disculpando ediciones futuras para siempre. Un objeto árbol de
 * git está direccionado por CONTENIDO: cualquier byte que cambie en el worktree cambia el hash.
 *
 * POR QUÉ UN ÍNDICE TEMPORAL (`GIT_INDEX_FILE`), nunca el índice real del repo: así se construye un
 * índice FRESCO desde el worktree actual y se hashea, sin abrir jamás el `.git/index` real que esta
 * sesión, u otro agente vivo, puede estar usando ahora mismo. `git add -A` ya ignora por sí solo las
 * rutas gitignored (comportamiento por defecto, sin `--force`).
 *
 * POR QUÉ `--git-dir`/`--work-tree`, nunca `git -C <worktree>`: el repo `b100-am-ui/.claude` tiene su
 * git dir FUERA de su worktree, precisamente para que un `git -C` plano no lo resuelva — resolvería en
 * su lugar el repo `b100-am-ui` que lo envuelve. Las banderas explícitas quitan esa ambigüedad para
 * ambos repos por igual.
 *
 * FALLA HACIA BLOQUEO: cualquier fallo de medición devuelve `undefined`, que nunca puede igualar la
 * huella de un descarte grabado — una medición que no ocurrió nunca disculpa nada.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseStatusPorcelain } from './status.mjs';

/**
 * `repo`'s current fingerprint, as `"<aheadCount>:<treeHash>"`, or `undefined` if any measurement step
 * fails. `runGit` is the ONE seam a selftest replaces, so the whole function is exercisable without a
 * real `git` binary; it defaults to a real, throwaway-index-scoped call.
 * @es La huella actual de `repo`, como `"<aheadCount>:<treeHash>"`, o `undefined` si falla algo.
 * `runGit` es el ÚNICO seam que un selftest reemplaza.
 */
export function measureFingerprint(repo, { runGit = defaultRunGit } = {}) {
  const status = repo.run(['status', '--porcelain=v1', '--branch']);

  if (!status.ok) return undefined;

  const { aheadCount } = parseStatusPorcelain(status.stdout);
  const treeHash = treeHashOf(repo, runGit);

  return treeHash === undefined ? undefined : `${String(aheadCount)}:${treeHash}`;
}

/**
 * The git tree hash of `repo`'s current full worktree state, computed through a TEMPORARY index so the
 * repo's real index is never opened. Returns `undefined` on any failure — a missing/invalid `gitDir`
 * included, since `git --git-dir=undefined …` simply fails to find a repository there and `git` itself
 * reports the error; no separate `gitDir` presence check is needed to fail closed.
 * @es El hash de árbol del estado actual de `repo`, por un índice TEMPORAL. `undefined` ante cualquier
 * fallo, un `gitDir` inválido incluido: `git` mismo falla al no encontrar el repositorio ahí.
 */
function treeHashOf(repo, runGit) {
  let scratch;

  try {
    scratch = mkdtempSync(path.join(tmpdir(), 'config-sync-guard-fingerprint-'));

    const tempIndex = path.join(scratch, 'index');
    const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
    const qualified = (subcommand) => [`--git-dir=${repo.gitDir}`, `--work-tree=${repo.worktree}`, ...subcommand];

    runGit(qualified(['add', '-A']), repo.worktree, env);

    return runGit(qualified(['write-tree']), repo.worktree, env).trim();
  } catch {
    return undefined;
  } finally {
    if (scratch !== undefined) {
      try {
        rmSync(scratch, { recursive: true, force: true });
      } catch {
        /* a leftover scratch directory costs disk, never correctness. @es Un directorio scratch sobrante cuesta disco, nunca corrección. */
      }
    }
  }
}

/** The real git call `treeHashOf` makes: captures stdout, throws on a non-zero exit. @es La llamada git real: captura stdout, lanza si el código de salida no es cero. */
function defaultRunGit(args, cwd, env) {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
