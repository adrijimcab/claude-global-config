/**
 * Whether a command that runs earlier on the same shell line may WRITE files, so that a later `git commit` would
 * run on a tree the hook never saw (both judges, 2026-10-19: hook-time TOCTOU).
 *
 * WHY. The guard judges the whole line before any of it runs. `touch d/new && git commit -m x -- d` is judged
 * while `d/new` does not exist, so the untracked check passes, then git leaves the new file out in silence; the
 * same holds for a pathspec file the line writes before the commit reads it.
 *
 * AN ALLOWLIST, failing closed (third Judgment Day round, 2026-10-25). Every earlier command is a writer, except a
 * command on a short list of commands known to write no file, run with no output redirection to a file
 * (`write-targets/redirect-targets.mjs`; `/dev/null`, `nul` and `$null` are no file):
 *   - directory moves (`cd`, `pushd`, `Set-Location`, ...), printing and reading (`echo`, `cat`, `ls`, `grep`,
 *     `Write-Output`, `Get-Content`, ...), and shell built-ins that only set state (`export`, `unset`, `true`,
 *     `test`);
 *   - git subcommands that write no working file: `status`, `rev-parse`, `ls-files`, `add`, `commit`, `restore
 *     --staged` without `--worktree` and `rm --cached` (they change only the index), and `diff`, `log` and `show`
 *     only without `--output` (which writes a file);
 *   - a command of no word at all (only `NAME=value` assignments), and a PowerShell assignment whose value is a
 *     literal (`$x = 'a'`, `$x = $y`, `$x = (...)`, whose inner commands are judged on their own).
 * In a PowerShell `$x = cmd ...` the command is the one after `=`. A command word the line hides (`$CMD`, a
 * PowerShell `& $x`) may be anything, so it is a writer.
 *
 * @es Si un comando que corre antes en la misma línea puede ESCRIBIR ficheros, de modo que un `git commit`
 * posterior correría sobre un árbol que el hook no vio. Es una LISTA PERMITIDA que falla cerrada: todo comando
 * anterior escribe, salvo los de una lista corta que no escriben ficheros y corren sin redirección a un fichero:
 * moverse de directorio, imprimir y leer, built-ins que solo fijan estado; los subcomandos de git `status`,
 * `rev-parse`, `ls-files`, `add`, `commit`, `restore --staged` sin `--worktree` y `rm --cached` (cambian solo el
 * índice), y `diff`, `log` y `show` solo sin `--output`; un comando sin palabras
 * (solo asignaciones) y una asignación de PowerShell cuyo valor es literal. En `$x = comando ...` de PowerShell el
 * comando es el que va tras `=`. Una palabra de comando que la línea esconde (`$CMD`) puede ser cualquier cosa, así
 * que escribe.
 */

import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { commandWordIndex, executableName } from '../shell-command/shell-command.mjs';
import { outputRedirectionTargets } from '../write-targets/redirect-targets.mjs';
import { mayBe, optionsOf, surely } from './git-options.mjs';

/** Commands that write no file. @es Comandos que no escriben ficheros. */
const NON_WRITING = new Set(['cd', 'chdir', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location', 'echo', 'printf', 'write-output', 'write-host', 'export', 'unset', 'true', 'false', ':', 'test', '[', 'cat', 'ls', 'pwd', 'head', 'tail', 'wc', 'grep', 'rg', 'get-content', 'get-childitem', 'select-string', 'out-null']);

/** Git subcommands that write no working file. @es Subcomandos de git que no escriben ficheros de trabajo. */
const NON_WRITING_GIT = new Set(['status', 'rev-parse', 'ls-files', 'add', 'commit']);

/** Git subcommands that write no working file unless given `--output`. @es Subcomandos de git que no escriben salvo con `--output`. */
const READS_UNLESS_OUTPUT = new Set(['diff', 'log', 'show']);

/** The option that sends a diff to a file. @es La opción que manda un diff a un fichero. */
const OUTPUT_OPTION = '--output';

/** The shortest abbreviation of `--output` git could read. @es La abreviatura más corta de `--output` que git podría leer. */
const OUTPUT_ABBREVIATION = 5;

/** What a PowerShell assignment value starts with when it is a literal, not a command. @es Con qué empieza el valor literal de una asignación. */
const LITERAL_STARTS = new Set(["'", '"', '$', '@', '(', '[', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/** Redirection targets that are no file. @es Destinos de redirección que no son un fichero. */
const NO_FILE = new Set(['/dev/null', 'nul']);

/**
 * Whether one parsed command redirects output into a file. The shared reader takes the parsed command (its
 * `redirections` and `dialect`), never the text: given a string it returns nothing, and every redirection would read
 * as no write (measured 2026-11-03 after the vendored sync: 4 R4 cases went green-to-red).
 * @es Si un comando parseado redirige su salida a un fichero. El lector compartido recibe el comando parseado, nunca el
 * texto: con un string no devuelve nada y ninguna redirección contaría como escritura.
 */
function redirectsToFile(command) {
  return outputRedirectionTargets(command).some((found) => (found.target === undefined ? !command.text.toLowerCase().includes('$null') : !NO_FILE.has(found.target.toLowerCase())));
}

/** Whether git arguments send output to a file. @es Si los argumentos de git mandan la salida a un fichero. */
const sendsOutput = (args) => args.some((arg) => {
  const name = arg.split('=')[0];

  return name.startsWith(OUTPUT_OPTION) || (name.length >= OUTPUT_ABBREVIATION && OUTPUT_OPTION.startsWith(name));
});

/**
 * Whether a git subcommand that changes only the index leaves the working files alone: `restore --staged` without
 * `--worktree`, and `rm --cached`.
 * @es Si un subcomando de git que cambia solo el índice deja en paz los ficheros de trabajo.
 */
function changesOnlyIndex(subcommand, args) {
  if (subcommand === 'restore') {
    const { events } = optionsOf('restore', args);

    return surely(events, 'staged') && !mayBe(events, 'worktree');
  }

  return subcommand === 'rm' && surely(optionsOf('rm', args).events, 'cached');
}

/** Whether a git subcommand with its arguments writes no working file. @es Si un subcomando de git no escribe ficheros de trabajo. */
const gitReadsOnly = (subcommand, args = []) => NON_WRITING_GIT.has(subcommand) || (READS_UNLESS_OUTPUT.has(subcommand) && !sendsOutput(args)) || changesOnlyIndex(subcommand, args);

/**
 * Whether the command a PowerShell `$name = ...` runs is read-only: a literal value runs none; otherwise the words
 * after `=` are the command.
 * @es Si el comando que ejecuta una asignación `$nombre = ...` de PowerShell solo lee.
 */
function assignmentReadsOnly(words, text, at) {
  const fused = words[at].indexOf('=');
  const value = text.slice(text.indexOf('=') + 1).trimStart();
  const commandWords = fused === -1 ? words.slice(at + 2) : [words[at].slice(fused + 1), ...words.slice(at + 1)].filter((word) => word.length > 0);

  if (commandWords.length === 0 || LITERAL_STARTS.has(value.charAt(0))) return true;

  const name = executableName(commandWords[0]);

  if (name !== 'git') return NON_WRITING.has(name);

  const [invocation] = gitInvocations(value, 'powershell', '.');

  return invocation !== undefined && gitReadsOnly(invocation.subcommand, invocation.args);
}

/** Whether one earlier command may write files. @es Si un comando anterior puede escribir ficheros. */
function mayWrite(command, dialect) {
  const { words, text, gitSubcommand, gitArgs } = command;

  if (redirectsToFile(command)) return true;

  const at = commandWordIndex(words);

  if (at === -1) return false;

  const first = words[at];
  const isAssignment = dialect === 'powershell' && first.startsWith('$') && (first.includes('=') || words[at + 1] === '=');

  if (isAssignment) return !assignmentReadsOnly(words, text, at);

  // A command word the line hides (`$CMD`, `& $tool`) is never on the list, so it counts as a writer.
  // @es Una palabra de comando que la línea esconde nunca está en la lista, así que cuenta como escritor.
  const name = executableName(first);

  return name === 'git' ? !gitReadsOnly(gitSubcommand, gitArgs) : !NON_WRITING.has(name);
}

/**
 * @param {Array<{ words: string[], text: string, gitSubcommand?: string, gitArgs?: string[], redirections?: object[], dialect?: string }>} before The commands that ran earlier.
 * @param {string} dialect `bash` or `powershell`.
 * @returns {string | undefined} The text of the first earlier command that may write files, or `undefined`.
 * @es El texto del primer comando anterior que puede escribir ficheros, o `undefined`.
 */
export function earlierWriter(before, dialect) {
  return before.find((command) => mayWrite(command, dialect))?.text;
}
