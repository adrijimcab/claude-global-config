/**
 * Which git commands a shell line RUNS that a delegated worker may not run: the ones that move HEAD, discard
 * work, or skip the commit and push hooks.
 *
 * WHAT COUNTS. An invocation reported by `shell-command/git-invocations.mjs`, so a command that is only
 * MENTIONED (inside `echo`, a quoted `-m` message, a heredoc, a comment) is data and never counted, while one
 * inside `$(...)`, `bash -c`, a chain or a subshell, or behind `git -C <dir>`, is counted.
 *
 * THE FAMILIES (each with the nearest form that stays allowed):
 *   reset         every form.                                  Allowed: `restore --staged`.
 *   checkout      `checkout` and `switch`, every form.
 *   restore       any form that touches the working tree.      Allowed: `--staged` without `--worktree`/`-W`.
 *   clean         any force flag (`-f`, `--force`, `-fd`, ...).  Allowed: `-n` / `--dry-run` alone.
 *   commitNoVerify `commit --no-verify` or `-n`, also in a short cluster (`-nm`, `-anm`).
 *   pushNoVerify  `push --no-verify`, to any remote.
 *   readTree      `read-tree` with `-u` or `--reset`.          Allowed: bare `read-tree <tree>` (index only).
 *   checkoutIndex `checkout-index` with `-f`/`--force` or `-a`/`--all`. Allowed: `checkout-index <file>`.
 *   updateIndex   `update-index --force-remove`.               Allowed: `--refresh`, `--add`, `--cacheinfo`.
 *   updateRef     `update-ref -d`, which deletes a ref.        Allowed: `update-ref <ref> <sha>`.
 *   symbolicRef   `symbolic-ref <name> <ref>` or `-d`.         Allowed: reading, `symbolic-ref [--short] HEAD`.
 * The plumbing families do what `reset`/`restore`/`checkout` do (b100 integration worker's report, 2026-10:
 * `git read-tree --reset -u HEAD`
 * cleared a conflicted index and the working tree). `read-tree --reset` is refused even into a temporary
 * `GIT_INDEX_FILE`, because the line does not prove the variable; read the tree there without `--reset`.
 * `symbolic-ref` is the `checkout`/`switch` reasoning: a worker's branch is fixed by its TENANCY, and
 * repointing HEAD sends the next commit to another branch.
 *
 * HOW OPTIONS ARE READ. Words after a bare `--` are paths, never options. A short cluster (`-anm`) is walked
 * character by character and STOPS at the first option that takes a value, because the rest of the cluster
 * (or the next word) is that value: `-m"no"` is the message `no`, not `-n`; `-m -n` is the message `-n`.
 * `--no-verify` is also matched by git's unambiguous abbreviations (`--no-verif`), since git accepts them.
 *
 * LEFT OUT, stated: `stash` (worker-stash-guard owns it), `commit --amend`, `rebase` and every other
 * subcommand; git aliases, which the line does not show; `update-ref <ref> <sha>` (moves a ref, not named by
 * any incident); `update-ref --stdin` and `update-index --index-info`, whose commands arrive on stdin.
 *
 * @es Qué comandos de git EJECUTA una línea que un worker delegado no puede ejecutar: los que mueven HEAD,
 * descartan trabajo u omiten los hooks de commit y push. Una MENCIÓN (echo, mensaje, heredoc, comentario) es
 * dato; lo que corre en `$(...)`, `bash -c`, cadenas, subshells o tras `git -C` cuenta. Un cúmulo corto
 * (`-anm`) se recorre carácter a carácter y PARA en la primera opción con valor: `-m"no"` es el mensaje `no`,
 * no `-n`. Tras un `--` suelto todo son rutas. Quedan fuera `stash` (lo cubre worker-stash-guard), `--amend`,
 * `rebase` y los demás subcomandos. Las familias de plomería (`read-tree -u/--reset`, `checkout-index -f/-a`,
 * `update-index --force-remove`, `update-ref -d`, `symbolic-ref` de escritura) hacen lo que `reset`,
 * `restore` y `checkout` (informe del worker de integración de b100, 2026-10); leer (`read-tree <árbol>`, `--refresh`, `symbolic-ref HEAD`) sigue
 * permitido. `update-ref <ref> <sha>`, `update-ref --stdin` y `update-index --index-info` quedan fuera.
 */

import { gitInvocations } from '../shell-command/git-invocations.mjs';

const NO_VERIFY = '--no-verify';

/** The shortest abbreviation of `--no-verify` git still resolves uniquely. @es La abreviatura más corta que git resuelve. */
const NO_VERIFY_MIN_LENGTH = '--no-v'.length;

/** Short options that take a value, per subcommand. @es Opciones cortas con valor, por subcomando. */
const SHORT_WITH_VALUE = {
  commit: new Set(['m', 'F', 'C', 'c', 't', 'S', 'u']),
  clean: new Set(['e']),
  restore: new Set(['s']),
  push: new Set(['o']),
  'read-tree': new Set(),
  'checkout-index': new Set(),
  'update-index': new Set(),
  'update-ref': new Set(['m']),
  'symbolic-ref': new Set(['m'])
};

/** Long options that take a SEPARATE value word, per subcommand. @es Opciones largas con valor separado. */
const LONG_WITH_VALUE = {
  commit: new Set(['--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup', '--trailer', '--pathspec-from-file']),
  clean: new Set(['--exclude']),
  restore: new Set(['--source']),
  push: new Set(['--repo', '--receive-pack', '--exec', '--push-option']),
  'read-tree': new Set(['--index-output', '--prefix', '--exclude-per-directory']),
  'checkout-index': new Set(['--prefix', '--stage']),
  'update-index': new Set(),
  'update-ref': new Set(),
  'symbolic-ref': new Set()
};

/**
 * The options an invocation really carries, with option values and paths already removed.
 * @param {string} subcommand A key of `SHORT_WITH_VALUE`.
 * @param {string[]} args The words after the subcommand.
 * @returns {{ longs: string[], shorts: string[], positionals: string[] }} Long options (`--x`, without any
 *   `=value`), short flags, and the words that are neither (names, paths), including every word after `--`.
 * @es Las opciones que la invocación lleva de verdad, sin valores de opción; y las palabras que no son opción.
 */
function optionsOf(subcommand, args) {
  const longs = [];
  const shorts = [];
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }

    if (word.startsWith('--')) {
      const name = word.split('=')[0];

      longs.push(name);
      if (!word.includes('=') && LONG_WITH_VALUE[subcommand].has(name)) index += 1;
    } else if (word.length > 1 && word.startsWith('-')) {
      for (let at = 1; at < word.length; at += 1) {
        const flag = word[at];

        shorts.push(flag);
        if (SHORT_WITH_VALUE[subcommand].has(flag)) {
          if (at === word.length - 1) index += 1; // the value is the next word
          break; // the rest of the cluster is the value
        }
      }
    } else {
      positionals.push(word);
    }
  }

  return { longs, shorts, positionals };
}

/** Whether a long option is `--no-verify` or an unambiguous abbreviation. @es Si es `--no-verify` o una abreviatura. */
const isNoVerify = (name) => name.length >= NO_VERIFY_MIN_LENGTH && NO_VERIFY.startsWith(name);

/**
 * Whether `name` is `full` or an abbreviation git still resolves to it, `minLength` being the shortest prefix
 * unique among that subcommand's options.
 * @es Si `name` es `full` o una abreviatura que git resuelve a ella; `minLength` es el prefijo único más corto.
 */
const isOption = (name, full, minLength) => name.length >= minLength && full.startsWith(name);

/** `read-tree` that writes the working tree (`-u`) or discards the index (`--reset`). @es `read-tree` que escribe el árbol o descarta el índice. */
function readTreeDiscards(args) {
  const { longs, shorts } = optionsOf('read-tree', args);

  return shorts.includes('u') || longs.some((name) => isOption(name, '--reset', '--res'.length));
}

/** `checkout-index` that overwrites files (`-f`) or writes every indexed file (`-a`). @es `checkout-index` que sobrescribe ficheros. */
function checkoutIndexOverwrites(args) {
  const { longs, shorts } = optionsOf('checkout-index', args);

  return shorts.includes('f') || shorts.includes('a') || longs.some((name) => isOption(name, '--force', '--f'.length) || isOption(name, '--all', '--a'.length));
}

/** `update-index --force-remove`, which drops a path from the index even when the file exists. @es `update-index --force-remove`. */
const updateIndexForceRemoves = (args) => optionsOf('update-index', args).longs.some((name) => isOption(name, '--force-remove', '--force-r'.length));

/** `update-ref -d`, which deletes a ref. @es `update-ref -d`, que borra una referencia. */
const updateRefDeletes = (args) => optionsOf('update-ref', args).shorts.includes('d');

/**
 * `symbolic-ref` that WRITES (`<name> <ref>`, two names) or deletes (`-d`/`--delete`); one name only reads.
 * @es `symbolic-ref` que ESCRIBE (dos nombres) o borra; con un solo nombre solo lee.
 */
function symbolicRefWrites(args) {
  const { longs, shorts, positionals } = optionsOf('symbolic-ref', args);

  return positionals.length >= 2 || shorts.includes('d') || longs.some((name) => isOption(name, '--delete', '--d'.length));
}

/** The family an invocation belongs to, or `undefined` when it is allowed. @es La familia, o `undefined` si se permite. */
function familyOf({ subcommand, args }) {
  switch (subcommand) {
    case 'reset':
      return 'reset';
    case 'checkout':
    case 'switch':
      return 'checkout';
    case 'restore': {
      const { longs, shorts } = optionsOf('restore', args);
      const staged = longs.includes('--staged') || shorts.includes('S');
      const worktree = longs.includes('--worktree') || shorts.includes('W');

      return !staged || worktree ? 'restore' : undefined;
    }
    case 'clean': {
      const { longs, shorts } = optionsOf('clean', args);

      return longs.includes('--force') || shorts.includes('f') ? 'clean' : undefined;
    }
    case 'commit': {
      const { longs, shorts } = optionsOf('commit', args);

      return longs.some(isNoVerify) || shorts.includes('n') ? 'commitNoVerify' : undefined;
    }
    case 'push':
      return optionsOf('push', args).longs.some(isNoVerify) ? 'pushNoVerify' : undefined;
    case 'read-tree':
      return readTreeDiscards(args) ? 'readTree' : undefined;
    case 'checkout-index':
      return checkoutIndexOverwrites(args) ? 'checkoutIndex' : undefined;
    case 'update-index':
      return updateIndexForceRemoves(args) ? 'updateIndex' : undefined;
    case 'update-ref':
      return updateRefDeletes(args) ? 'updateRef' : undefined;
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
  return gitInvocations(script, dialect, cwd)
    .map((invocation) => ({ family: familyOf(invocation), text: invocation.text }))
    .filter((found) => found.family !== undefined);
}
