/**
 * THE DECISION — does this shell command run `gentle-ai sdd-attempt <verb> --cwd <main checkout>` while
 * the repository's work lives in a LINKED worktree?
 *
 * MEASURED INCIDENT, 2026-10-11, TWICE: `sdd-attempt acquire --cwd <main checkout>` while the unit was
 * applied in a linked worktree; settle then charged everything integrated meanwhile (9,300 changed lines
 * vs a real 1,287) and blocked. ROOT CAUSE: the ledger measures the tree it is told to, and the main
 * checkout was the wrong one. A hook cannot know the unit's base, so it does not forecast size; it
 * refuses only the wrong tree.
 *
 * Verbs covered: acquire, settle, begin, record, finish. `status`, `reset`, `inspect` and every other
 * command are none of this guard's business. Only a command in command position counts: a mention inside
 * `echo`, a quoted message or a heredoc is data, by construction of the shared parser.
 *
 * gentle-ai v4 (ODD) retired `sdd-attempt`; the same measurement moved to `gentle-ai review assess|start|status`,
 * which assess a unit's base-to-HEAD range in the repository `--cwd` names, and `--cwd` defaults to "." there
 * (v4.0.0 internal/cli/review_assess.go:249, review_facade.go:777 and :2126). So under v4 an absent `--cwd`
 * binds the command's own directory. The v2.9.1 verbs stay covered while a rollback to 2.9.1 is possible.
 * @es gentle-ai v4 (ODD) retiró `sdd-attempt`; la misma medición pasó a `gentle-ai review assess|start|status`,
 * que miden el rango base-HEAD de la unidad en el repositorio que nombra `--cwd`, y ahí `--cwd` vale "." por
 * omisión: bajo v4 un `--cwd` ausente ata el directorio del propio comando. Los verbos de v2.9.1 siguen
 * cubiertos mientras sea posible volver a 2.9.1.
 *
 * @es LA DECISIÓN: ¿corre este comando `gentle-ai sdd-attempt <verbo> --cwd <checkout principal>` mientras
 * el trabajo vive en un worktree ENLAZADO? Incidente medido dos veces el 2026-10-11: el ledger mide el
 * árbol que se le indica, y el principal era el equivocado. Un hook no conoce la base de la unidad, así
 * que no pronostica tamaño: solo rechaza el árbol equivocado.
 */

import path from 'node:path';

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, dialectOfTool, executableName, simpleCommands } from '../shell-command/shell-command.mjs';
import { linkedWorktreesCarryingWork } from './worktree-work.mjs';

/** The sdd-attempt verbs that bind the ledger to a tree. @es Verbos que atan el ledger a un árbol. */
export const BOUND_VERBS = new Set(['acquire', 'settle', 'begin', 'record', 'finish']);

/** The v4 review verbs that assess a range of the `--cwd` tree. @es Verbos de revisión v4 que miden un rango del árbol `--cwd`. */
export const RANGE_REVIEW_VERBS = new Set(['assess', 'start', 'status']);

/**
 * The `--cwd` a gentle-ai invocation binds, from the words after `gentle-ai`, or `undefined` when it binds none:
 * v2.9.1 `sdd-attempt <bound verb>` binds only an explicit `--cwd`; v4 `review <range verb>` defaults it to ".".
 * @es El `--cwd` que ata una invocación de gentle-ai, o `undefined` si no ata ninguno.
 */
function boundCwd(words) {
  if (words[0] === 'sdd-attempt' && BOUND_VERBS.has(words[1])) return cwdOption(words.slice(2));
  if (words[0] === 'review' && RANGE_REVIEW_VERBS.has(words[1])) return cwdOption(words.slice(2)) ?? '.';
  return undefined;
}

/** The value of `--cwd` in `args` (`--cwd v` or `--cwd=v`), or `undefined`. @es El valor de `--cwd`. */
function cwdOption(args) {
  const at = args.findIndex((word) => word === '--cwd' || word.startsWith('--cwd='));

  if (at === -1) return undefined;

  return args[at] === '--cwd' ? args[at + 1] : args[at].slice('--cwd='.length);
}

/**
 * Every `{ text, cwd }` this script binds the ledger to: the resolved `--cwd` of each bound invocation.
 * @es Cada `{ text, cwd }` al que este script ata el ledger.
 */
export function boundInvocations(script, dialect, startDirectory, platform = process.platform) {
  const found = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), startDirectory, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1 || executableName(command.words[at]) !== 'gentle-ai') continue;

    const value = boundCwd(command.words.slice(at + 1));

    if (value === undefined || typeof directory !== 'string') continue;

    found.push({ text: command.text.trim(), cwd: path.resolve(directory, nativeSpelling(value, platform)) });
  }

  return found;
}

/**
 * The first offending invocation — `{ text, cwd, worktrees }` — or `undefined` to allow. THROWS when git
 * cannot be read; the shim fails open on it.
 * @es La primera invocación infractora, o `undefined` para permitir. LANZA si git no se puede leer.
 */
export function offendingInvocationFor(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string') return undefined;

  for (const invocation of boundInvocations(command, dialect, typeof payload.cwd === 'string' ? payload.cwd : process.cwd())) {
    const worktrees = linkedWorktreesCarryingWork(invocation.cwd);

    if (worktrees.length > 0) return { ...invocation, worktrees };
  }

  return undefined;
}
