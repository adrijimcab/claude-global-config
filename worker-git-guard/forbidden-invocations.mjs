/**
 * Which git commands a shell line RUNS that a delegated worker may not run: the ones that move HEAD, discard
 * work, or skip the commit and push hooks.
 *
 * WHAT COUNTS. An invocation reported by `line-invocations.mjs` (over `shell-command/git-invocations.mjs`), so a
 * command that is only MENTIONED (inside `echo`, a quoted `-m` message, a heredoc, a comment) is data and never
 * counted, while one inside `$(...)`, `bash -c`, a chain or a subshell, behind `git -C <dir>`, or behind an alias
 * the line sets (`-c alias.<name>=...`, `--config-env`, `GIT_CONFIG_COUNT`), is counted.
 *
 * THE FAMILIES (each with the nearest form that stays allowed):
 *   reset         every form.                                  Allowed: `restore --staged`.
 *   checkout      `checkout` and `switch`, every form.
 *   restore       any form that touches the working tree.      Allowed: `--staged` without `--worktree`/`-W`.
 *   clean         any force flag (`-f`, `--force`, `-fd`, ...), and any `clean` without `-n`/`--dry-run` when the
 *                 line sets `clean.requireForce` to false (git then deletes without `-f`).
 *                 Allowed: `-n` / `--dry-run`.
 *   commitNoVerify `commit --no-verify` or `-n`, also in a short cluster (`-nm`, `-anm`), unless a later
 *                 `--verify` undoes it.
 *   commitNoPaths `commit` with `-a`/`--all`, `-i`/`--include`, `-p`/`--patch` or `--interactive` (both commit the
 *                 whole index copy they build), with no path after `--`, or with a pathspec that sweeps the
 *                 worktree (`pathspec-scope.mjs`: the root or above it, a match-everything glob there, only
 *                 exclusions, only `$FILES`, an expansion followed by `/`).
 *                 Allowed: `commit -m <msg> -- <path>...`, `commit --pathspec-from-file=<f>` (its contents are
 *                 checked by `untracked-pathspec.mjs`), and `commit --dry-run` (it commits and stages nothing).
 *   pushNoVerify  `push --no-verify`, to any remote, unless a later `--verify` undoes it.
 *   readTree     `read-tree` with `-u` or `--reset`, and every `read-tree` that writes the LIVE index (a bare
 *                 `read-tree <tree>` replaces it, `--empty` or no tree empties it: the loss of `reset`).
 *                 Allowed: `-n`/`--dry-run` (it writes nothing, with `-u` and `--reset` too), `-h`, and an index
 *                 sent elsewhere by `--index-output=<file>` (git writes that file and leaves the live index alone,
 *                 measured 2026-10-19) or by `GIT_INDEX_FILE` set on the line (an environment prefix, `export`, or
 *                 `$env:GIT_INDEX_FILE = ...` earlier on a PowerShell line, unless removed again). Neither may name
 *                 the live index itself (`repository-layout.mjs`) nor hide its value behind an expansion.
 *   aliasUnseen   an alias the line sets whose body it does not show (`--config-env` naming a variable the line
 *                 does not set, or a body that is one expansion): it runs an unseen command.
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
 * mode off and commits everything staged plus the named paths, and `-p`/`--interactive` commit the index copy
 * they build from everything staged, so they are refused like `-a`. The rule runs no git: it reads the line, and
 * the repository layout from the file system.
 *
 * HOW OPTIONS ARE READ: `git-options.mjs`, git's own option tables, so an abbreviation (`--mes`, `--no-verif`) is
 * the option it abbreviates, an optional value (`-S`, `-u` of commit) never eats the next word, and the last of
 * `--dry-run`/`--no-dry-run` or `--no-verify`/`--verify` wins. `update-index` is the exception: it applies each
 * option to the paths after it, so any `--force-remove` counts.
 *
 * LEFT OUT, stated: `stash` (worker-stash-guard owns it), `commit --amend`, `rebase` and every other
 * subcommand; settings and aliases from git's configuration FILES (`clean.requireForce` included), which the line
 * does not show; `update-index --index-info`, allowed on purpose: it writes index entries only, never working
 * files. `update-ref --stdin` is refused because its commands arrive unseen.
 *
 * @es Qué comandos de git EJECUTA una línea que un worker delegado no puede ejecutar: los que mueven HEAD,
 * descartan trabajo u omiten los hooks de commit y push. Una MENCIÓN es dato; lo que corre en `$(...)`, `bash -c`,
 * cadenas, subshells, tras `git -C` o tras un alias que fija la línea (`-c alias.<nombre>=...`, `--config-env`,
 * `GIT_CONFIG_COUNT`) cuenta; un alias cuyo cuerpo la línea no muestra se rechaza. Las opciones se leen con las
 * tablas de git (`git-options.mjs`). `clean` se rechaza con `-f` y también sin `-n` cuando la línea pone
 * `clean.requireForce` en falso. Un `commit` debe nombrar sus rutas tras `--`: se rechazan `-a`, `-i`, `-p` e
 * `--interactive` (commitean la copia del índice que construyen) y un pathspec que barre el worktree (la raíz o más
 * arriba, un glob que lo cubre todo allí, solo exclusiones, solo `$FILES`, una expansión seguida de `/`); se
 * permiten `--pathspec-from-file` y `--dry-run`. Un `read-tree` que escribe el índice VIVO se rechaza; se permiten
 * `-n`/`--dry-run` (no escribe nada, ni con `-u` ni con `--reset`), `-h`, `--index-output=<fichero>` y un
 * `GIT_INDEX_FILE` fijado en la línea, salvo que nombren el propio índice vivo o escondan su valor tras una
 * expansión. Quedan fuera `stash`, `--amend`, `rebase`, los demás subcomandos y los ajustes y alias de los
 * ficheros de configuración.
 */

import path from 'node:path';

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { anyMayBe, finalValue, mayBe, optionsOf, surely } from './git-options.mjs';
import { lineInvocations, UNSEEN } from './line-invocations.mjs';
import { sweepsWorktree } from './pathspec-scope.mjs';
import { isHidden, repositoryLayout, samePath } from './repository-layout.mjs';

/** The variable that sends the index git writes to another file. @es La variable que manda el índice a otro fichero. */
const INDEX_FILE_VARIABLE = 'GIT_INDEX_FILE';

/** The configuration key that lets `clean` delete without `-f`. @es La clave que deja a `clean` borrar sin `-f`. */
const REQUIRE_FORCE_KEY = 'clean.requireforce';

/** The spellings git reads as a false boolean. @es Las formas que git lee como booleano falso. */
const FALSE_VALUES = new Set(['false', 'no', 'off', '0', '']);

/** The repository facts a rule may read about one invocation. @es Los datos del repositorio que una regla puede leer. */
function contextOf(invocation) {
  const directory = invocationDirectory(invocation);

  return { directory, layout: repositoryLayout(directory, invocation.environment, invocation.gitOptions) };
}

/**
 * The family of a `commit`: `--no-verify`/`-n` first; then a commit that can sweep in what is already staged,
 * which is one with `-a`, `-i`, `-p` or `--interactive`, or with no specific path after `--`. A `--dry-run`
 * writes no commit and stages nothing, so it is allowed; a `--pathspec-from-file` names its paths in a file.
 * @es La familia de un `commit`: primero `--no-verify`/`-n`; luego el que puede arrastrar lo que ya está en el
 * índice (`-a`, `-i`, `-p`, `--interactive`, o sin rutas concretas tras `--`). `--dry-run` se permite.
 */
function commitFamily(invocation, dialect) {
  const { events, afterDashes } = optionsOf('commit', invocation.args);

  if (mayBe(events, 'verify', false)) return 'commitNoVerify';
  if (surely(events, 'dry-run')) return undefined;
  if (['all', 'include', 'patch', 'interactive'].some((key) => mayBe(events, key))) return 'commitNoPaths';
  if (afterDashes.length === 0) return finalValue(events, 'pathspec-from-file') === undefined ? 'commitNoPaths' : undefined;

  return sweepsWorktree(afterDashes, { dialect, ...contextOf(invocation) }) ? 'commitNoPaths' : undefined;
}

/**
 * Whether an index file a line names is the live one, or one the line hides. With a directory the line cannot
 * follow, nothing is known, so it counts; with no repository found, git fails before writing, so it does not.
 * @es Si un fichero de índice que nombra la línea es el vivo, o uno que la línea esconde.
 */
function namesLiveIndex(value, { directory, layout }) {
  if (isHidden(value)) return true;
  if (typeof directory !== 'string') return true;

  return layout !== undefined && samePath(path.resolve(directory, value), layout.liveIndex);
}

/**
 * Whether a `read-tree` may run: a dry run writes nothing; `-u` (it writes the working tree) and `--reset` never;
 * otherwise only an index sent elsewhere, never to the live one, or a usage print.
 * @es Si un `read-tree` puede correr: un ensayo no escribe nada; `-u` y `--reset` nunca; si no, solo con el índice
 * enviado a otro fichero que no sea el vivo, o para imprimir el uso.
 */
function readTreeWrites(invocation) {
  const { args, environment } = invocation;
  const { events } = optionsOf('read-tree', args);

  if (surely(events, 'dry-run')) return false;
  if (mayBe(events, '-u') || mayBe(events, 'reset')) return true;
  if (args.length === 1 && args[0] === '-h') return false;

  const target = finalValue(events, 'index-output') ?? environment.get(INDEX_FILE_VARIABLE) ?? '';

  return target.length === 0 || namesLiveIndex(target, contextOf(invocation));
}

/**
 * Whether a `clean` deletes: with `-f`, or without a dry run when the line sets `clean.requireForce` to false.
 * @es Si un `clean` borra: con `-f`, o sin ensayo cuando la línea pone `clean.requireForce` en falso.
 */
function cleanDeletes({ args, config }) {
  const { events } = optionsOf('clean', args);
  const requireForce = config.get(REQUIRE_FORCE_KEY);
  const forceNotRequired = requireForce === UNSEEN || (requireForce !== undefined && FALSE_VALUES.has(requireForce.toLowerCase()));

  return mayBe(events, 'force') || (forceNotRequired && !surely(events, 'dry-run'));
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
function familyOf(invocation, dialect) {
  const { subcommand, args } = invocation;

  if (invocation.unseenAlias === true) return 'aliasUnseen';

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
      return cleanDeletes(invocation) ? 'clean' : undefined;
    case 'commit':
      return commitFamily(invocation, dialect);
    case 'push':
      return mayBe(optionsOf('push', args).events, 'verify', false) ? 'pushNoVerify' : undefined;
    case 'read-tree':
      return readTreeWrites(invocation) ? 'readTree' : undefined;
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
