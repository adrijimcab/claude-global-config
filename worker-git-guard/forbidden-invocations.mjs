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
 *
 * HOW OPTIONS ARE READ. Words after a bare `--` are paths, never options. A short cluster (`-anm`) is walked
 * character by character and STOPS at the first option that takes a value, because the rest of the cluster
 * (or the next word) is that value: `-m"no"` is the message `no`, not `-n`; `-m -n` is the message `-n`.
 * `--no-verify` is also matched by git's unambiguous abbreviations (`--no-verif`), since git accepts them.
 *
 * LEFT OUT, stated: `stash` (worker-stash-guard owns it), `commit --amend`, `rebase` and every other
 * subcommand; git aliases, which the line does not show.
 *
 * @es Qué comandos de git EJECUTA una línea que un worker delegado no puede ejecutar: los que mueven HEAD,
 * descartan trabajo u omiten los hooks de commit y push. Una MENCIÓN (echo, mensaje, heredoc, comentario) es
 * dato; lo que corre en `$(...)`, `bash -c`, cadenas, subshells o tras `git -C` cuenta. Un cúmulo corto
 * (`-anm`) se recorre carácter a carácter y PARA en la primera opción con valor: `-m"no"` es el mensaje `no`,
 * no `-n`. Tras un `--` suelto todo son rutas. Quedan fuera `stash` (lo cubre worker-stash-guard), `--amend`,
 * `rebase` y los demás subcomandos.
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
  push: new Set(['o'])
};

/** Long options that take a SEPARATE value word, per subcommand. @es Opciones largas con valor separado. */
const LONG_WITH_VALUE = {
  commit: new Set(['--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup', '--trailer', '--pathspec-from-file']),
  clean: new Set(['--exclude']),
  restore: new Set(['--source']),
  push: new Set(['--repo', '--receive-pack', '--exec', '--push-option'])
};

/**
 * The options an invocation really carries, with option values and paths already removed.
 * @param {string} subcommand A key of `SHORT_WITH_VALUE`.
 * @param {string[]} args The words after the subcommand.
 * @returns {{ longs: string[], shorts: string[] }} Long options (`--x`, without any `=value`) and short flags.
 * @es Las opciones que la invocación lleva de verdad, sin valores de opción ni rutas.
 */
function optionsOf(subcommand, args) {
  const longs = [];
  const shorts = [];

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];

    if (word === '--') break;

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
    }
  }

  return { longs, shorts };
}

/** Whether a long option is `--no-verify` or an unambiguous abbreviation. @es Si es `--no-verify` o una abreviatura. */
const isNoVerify = (name) => name.length >= NO_VERIFY_MIN_LENGTH && NO_VERIFY.startsWith(name);

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
