/**
 * Which git commands a shell line RUNS that a delegated worker may not run: the ones that move HEAD, discard
 * work, or skip the commit and push hooks.
 *
 * WHAT COUNTS. An invocation reported by `line-invocations.mjs` (over `shell-command/git-invocations.mjs`), so a
 * command that is only MENTIONED (inside `echo`, a quoted `-m` message, a heredoc, a comment) is data and never
 * counted, while one inside `$(...)`, `bash -c`, a chain or a subshell, behind `git -C <dir>`, or behind an alias
 * the line defines with `git -c alias.<name>=...`, is counted.
 *
 * THE FAMILIES (each with the nearest form that stays allowed):
 *   reset         every form.                                  Allowed: `restore --staged`.
 *   checkout      `checkout` and `switch`, every form.
 *   restore       any form that touches the working tree.      Allowed: `--staged` without `--worktree`/`-W`.
 *   clean         any force flag (`-f`, `--force`, `-fd`, ...).  Allowed: `-n` / `--dry-run` alone.
 *   commitNoVerify `commit --no-verify` or `-n`, also in a short cluster (`-nm`, `-anm`), unless a later
 *                 `--verify` undoes it.
 *   commitNoPaths `commit` with `-a`/`--all` or `-i`/`--include`, with no path after `--`, or with a pathspec that
 *                 names no specific path (`pathspec-scope.mjs`: `.`, `:/`, `*`, only exclusions, only `$FILES`).
 *                 Allowed: `commit -m <msg> -- <path>...`, `commit --pathspec-from-file=<f>` (its contents are
 *                 checked by `untracked-pathspec.mjs`), and `commit --dry-run` (it commits and stages nothing).
 *   pushNoVerify  `push --no-verify`, to any remote, unless a later `--verify` undoes it.
 *   readTree     `read-tree` with `-u` or `--reset`, and every `read-tree` that writes the LIVE index (a bare
 *                 `read-tree <tree>` replaces it, `--empty` or no tree empties it: the loss of `reset`).
 *                 Allowed: `-n`/`--dry-run`, `--index-output=<file>` (git writes that file and leaves the live
 *                 index alone, measured 2026-10-19), a command line that sets `GIT_INDEX_FILE` (an environment
 *                 prefix, or `$env:GIT_INDEX_FILE = ...` earlier on the same PowerShell line), and `-h`.
 *   checkoutIndex `checkout-index` with `-f`/`--force` or `-a`/`--all`. Allowed: `checkout-index <file>`.
 *   updateIndex   `update-index --force-remove`.               Allowed: `--refresh`, `--add`, `--cacheinfo`.
 *   updateRef     every `update-ref` write: `-d`, `<ref> <sha>`, `--stdin`.  Allowed: `update-ref -h`; read refs with `rev-parse`.
 *   symbolicRef   `symbolic-ref <name> <ref>` or `-d`.         Allowed: reading, `symbolic-ref [--short] HEAD`.
 * The plumbing families do what `reset`/`restore`/`checkout` do (b100 integration worker's report, 2026-10:
 * `git read-tree --reset -u HEAD` cleared a conflicted index and the working tree). `read-tree --reset` and `-u`
 * stay refused even into a temporary `GIT_INDEX_FILE`. `symbolic-ref` is the `checkout`/`switch` reasoning: a
 * worker's branch is fixed by its TENANCY, and repointing HEAD sends the next commit to another branch.
 *
 * WHY COMMIT NAMES ITS PATHS (Discovery -11 report: commitlint rejected a worker's commit twice, f615bf9b on
 * 2026-10-18 and d417d169 on 2026-10-19; the files it had staged stayed in the index and the next commit swept
 * them in under the wrong message, and history rewriting is denied). Under git's default `--only` mode,
 * `git commit -- <paths>` commits only the named paths even when others are staged; `-i`/`--include` turns that
 * mode off and commits everything staged plus the named paths, so it is refused like `-a`. The rule is lexical,
 * with no git call.
 *
 * HOW OPTIONS ARE READ: `git-options.mjs`, git's own option tables, so an abbreviation (`--mes`, `--no-verif`) is
 * the option it abbreviates, an optional value (`-S`, `-u` of commit) never eats the next word, and the last of
 * `--dry-run`/`--no-dry-run` or `--no-verify`/`--verify` wins. `update-index` is the exception: it applies each
 * option to the paths after it, so any `--force-remove` counts.
 *
 * LEFT OUT, stated: `stash` (worker-stash-guard owns it), `commit --amend`, `rebase` and every other
 * subcommand; aliases defined in git configuration, which the line does not show; `update-index --index-info`,
 * allowed on purpose: it writes index entries only, never working files. `update-ref --stdin` is refused because
 * its commands arrive unseen.
 *
 * @es Qué comandos de git EJECUTA una línea que un worker delegado no puede ejecutar: los que mueven HEAD,
 * descartan trabajo u omiten los hooks de commit y push. Una MENCIÓN (echo, mensaje, heredoc, comentario) es
 * dato; lo que corre en `$(...)`, `bash -c`, cadenas, subshells, tras `git -C` o tras un alias definido en la línea
 * con `git -c alias.<nombre>=...` cuenta. Las opciones se leen con las tablas de git (`git-options.mjs`): una
 * abreviatura es la opción que abrevia, un valor opcional (`-S`, `-u` de commit) no consume la palabra siguiente y
 * gana el último de `--dry-run`/`--no-dry-run` y de `--no-verify`/`--verify`; en `update-index` cuenta cualquier
 * `--force-remove`. Quedan fuera `stash` (lo cubre worker-stash-guard), `--amend`, `rebase`, los demás subcomandos
 * y los alias de la configuración. Las familias de plomería (`read-tree -u/--reset`, `checkout-index -f/-a`,
 * `update-index --force-remove`, toda escritura de `update-ref`, `symbolic-ref` de escritura) hacen lo que `reset`,
 * `restore` y `checkout` (informe del worker de integración de b100, 2026-10). Un `read-tree` que escribe el índice
 * VIVO (un `read-tree <árbol>` simple lo reemplaza; `--empty` o sin árbol lo vacía) se rechaza; se permiten
 * `-n`/`--dry-run`, `--index-output=<fichero>` (git escribe ese fichero y no toca el índice vivo, medido el
 * 2026-10-19), una línea que fija `GIT_INDEX_FILE` y `-h`. Leer (`--refresh`, `symbolic-ref HEAD`, `rev-parse`)
 * sigue permitido; `update-index --index-info` se permite a propósito (escribe solo entradas del índice) y
 * `update-ref --stdin` se rechaza porque sus comandos llegan sin verse. Un `commit` debe nombrar sus rutas tras `--`
 * (informe de Discovery -11: un commit rechazado por commitlint dejó archivos en el índice y el siguiente commit
 * los arrastró bajo otro mensaje, dos veces): se rechazan `commit` sin rutas, `-a`/`--all`, `-i`/`--include` (que
 * desactiva el modo `--only` por defecto y commitea todo el índice además de las rutas) y un pathspec que no nombra
 * rutas concretas; se permiten `--pathspec-from-file` y `--dry-run`.
 */

import { anyMayBe, finalValue, mayBe, optionsOf, surely } from './git-options.mjs';
import { lineInvocations } from './line-invocations.mjs';
import { namesSpecificPaths } from './pathspec-scope.mjs';

/** The variable that sends the index git writes to another file. @es La variable que manda el índice a otro fichero. */
const INDEX_FILE_VARIABLE = 'GIT_INDEX_FILE';

/**
 * The family of a `commit`: `--no-verify`/`-n` first; then a commit that can sweep in what is already staged,
 * which is one with `-a`/`--all` or `-i`/`--include`, or with no specific path after `--`. A `--dry-run` writes no
 * commit and stages nothing, so it is allowed; a `--pathspec-from-file` names its paths in a file.
 * @es La familia de un `commit`: primero `--no-verify`/`-n`; luego el que puede arrastrar lo que ya está en el
 * índice (`-a`/`--all`, `-i`/`--include`, o sin rutas concretas tras `--`). `--dry-run` no hace commit ni agrega
 * al índice: se permite; `--pathspec-from-file` nombra sus rutas en un fichero.
 */
function commitFamily(args, dialect) {
  const { events, afterDashes } = optionsOf('commit', args);

  if (mayBe(events, 'verify', false)) return 'commitNoVerify';
  if (surely(events, 'dry-run')) return undefined;
  if (mayBe(events, 'all') || mayBe(events, 'include')) return 'commitNoPaths';
  if (afterDashes.length === 0) return finalValue(events, 'pathspec-from-file') === undefined ? 'commitNoPaths' : undefined;

  return namesSpecificPaths(afterDashes, dialect) ? undefined : 'commitNoPaths';
}

/**
 * Whether a `read-tree` may run: never with `-u` (it writes the working tree) or `--reset`; otherwise only when it
 * writes no live index (a dry run, `--index-output`, a `GIT_INDEX_FILE` the line sets) or only prints its usage.
 * @es Si un `read-tree` puede correr: nunca con `-u` ni `--reset`; si no, solo cuando no escribe el índice vivo.
 */
function readTreeWrites(args, environment) {
  const { events } = optionsOf('read-tree', args);

  if (mayBe(events, '-u') || mayBe(events, 'reset')) return true;
  if (args.length === 1 && args[0] === '-h') return false;
  if (surely(events, 'dry-run') || finalValue(events, 'index-output') !== undefined) return false;

  return (environment.get(INDEX_FILE_VARIABLE) ?? '').length === 0;
}

/** `checkout-index` that overwrites files (`-f`) or writes every indexed file (`-a`). @es `checkout-index` que sobrescribe ficheros. */
function checkoutIndexOverwrites(args) {
  const { events } = optionsOf('checkout-index', args);

  return mayBe(events, 'force') || mayBe(events, 'all');
}

/** `update-index --force-remove`, which drops a path from the index even when the file exists. @es `update-index --force-remove`. */
const updateIndexForceRemoves = (args) => anyMayBe(optionsOf('update-index', args).events, 'force-remove');

/**
 * Every `update-ref` that WRITES: `-d` (delete), `<ref> <sha>` (two names, moves a ref) or `--stdin` (its
 * commands are unseen, so they are refused, not trusted). `update-ref -h` and a bare one only print usage.
 * @es Todo `update-ref` que ESCRIBE: `-d`, `<ref> <sha>` (dos nombres) o `--stdin` (comandos que la línea no
 * muestra, por eso se rechaza). `-h` y el comando solo imprimen el uso.
 */
function updateRefWrites(args) {
  const { events, positionals } = optionsOf('update-ref', args);

  return mayBe(events, '-d') || positionals.length >= 2 || mayBe(events, 'stdin');
}

/**
 * `symbolic-ref` that WRITES (`<name> <ref>`, two names) or deletes (`-d`/`--delete`); one name only reads.
 * @es `symbolic-ref` que ESCRIBE (dos nombres) o borra; con un solo nombre solo lee.
 */
function symbolicRefWrites(args) {
  const { events, positionals } = optionsOf('symbolic-ref', args);

  return positionals.length >= 2 || mayBe(events, 'delete');
}

/** The family an invocation belongs to, or `undefined` when it is allowed. @es La familia, o `undefined` si se permite. */
function familyOf({ subcommand, args, environment }, dialect) {
  switch (subcommand) {
    case 'reset':
      return 'reset';
    case 'checkout':
    case 'switch':
      return 'checkout';
    case 'restore': {
      const { events } = optionsOf('restore', args);

      return surely(events, 'staged') && !mayBe(events, 'worktree') ? undefined : 'restore';
    }
    case 'clean':
      return mayBe(optionsOf('clean', args).events, 'force') ? 'clean' : undefined;
    case 'commit':
      return commitFamily(args, dialect);
    case 'push':
      return mayBe(optionsOf('push', args).events, 'verify', false) ? 'pushNoVerify' : undefined;
    case 'read-tree':
      return readTreeWrites(args, environment) ? 'readTree' : undefined;
    case 'checkout-index':
      return checkoutIndexOverwrites(args) ? 'checkoutIndex' : undefined;
    case 'update-index':
      return updateIndexForceRemoves(args) ? 'updateIndex' : undefined;
    case 'update-ref':
      return updateRefWrites(args) ? 'updateRef' : undefined;
    case 'symbolic-ref':
      return symbolicRefWrites(args) ? 'symbolicRef' : undefined;
    default:
      return undefined;
  }
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @returns {Array<{ family: string, text: string }>} The forbidden invocations, in execution order.
 * @es Las invocaciones prohibidas, en orden de ejecución.
 */
export function forbiddenInvocations(script, dialect, cwd) {
  return lineInvocations(script, dialect, cwd)
    .map((invocation) => ({ family: familyOf(invocation, dialect), text: invocation.text }))
    .filter((found) => found.family !== undefined);
}
