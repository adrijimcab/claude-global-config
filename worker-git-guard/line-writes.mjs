/**
 * Whether a command that runs earlier on the same shell line may WRITE files, so that a later `git commit` would
 * run on a tree the hook never saw (both judges, 2026-10-19: hook-time TOCTOU).
 *
 * WHY. The guard judges the whole line before any of it runs. `touch d/new && git commit -m x -- d` is judged
 * while `d/new` does not exist, so the untracked check passes, then git leaves the new file out in silence; the
 * same holds for a pathspec file the line writes before the commit reads it.
 *
 * WHAT COUNTS AS A WRITER: any output redirection to a file (`write-targets/redirect-targets.mjs`; `/dev/null`,
 * `nul` and `$null` are no file), and any command outside a short list of commands known to write no file:
 * directory moves (`cd`, `pushd`, `Set-Location`, ...), printing and reading (`echo`, `cat`, `ls`, `grep`,
 * `Write-Output`, `Get-Content`, ...), shell
 * built-ins that only set state (`export`, `unset`, `true`, `test`, a PowerShell `$variable = ...`), and git
 * subcommands that write no working file (`add`, `status`, `diff`, `log`, `show`, `rev-parse`, `ls-files`,
 * `commit`). Every other program (`touch`, `cp`, `mv`, `node gen.mjs`, `npm run build`) may write anywhere, which
 * the line does not show, so it counts.
 *
 * @es Si un comando que corre antes en la misma línea puede ESCRIBIR ficheros, de modo que un `git commit`
 * posterior correría sobre un árbol que el hook no vio. Cuenta como escritor toda redirección de salida a un
 * fichero (`/dev/null`, `nul` y `$null` no lo son) y todo comando fuera de una lista corta que no escribe ficheros:
 * moverse de directorio, imprimir, built-ins que solo fijan estado y subcomandos de git que no escriben ficheros de
 * trabajo. Cualquier otro programa (`touch`, `cp`, `mv`, un generador) puede escribir donde sea, y la línea no lo
 * muestra.
 */

import { commandWordIndex, executableName } from '../shell-command/shell-command.mjs';
import { outputRedirectionTargets } from '../write-targets/redirect-targets.mjs';

/** Commands that write no file. @es Comandos que no escriben ficheros. */
const NON_WRITING = new Set(['cd', 'chdir', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location', 'echo', 'printf', 'write-output', 'write-host', 'export', 'unset', 'true', 'false', ':', 'test', '[', 'cat', 'ls', 'pwd', 'head', 'tail', 'wc', 'grep', 'rg', 'get-content', 'get-childitem', 'select-string', 'out-null']);

/** Git subcommands that write no working file. @es Subcomandos de git que no escriben ficheros de trabajo. */
const NON_WRITING_GIT = new Set(['add', 'status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'commit']);

/** Redirection targets that are no file. @es Destinos de redirección que no son un fichero. */
const NO_FILE = new Set(['/dev/null', 'nul']);

/** Whether one command redirects output into a file. @es Si un comando redirige su salida a un fichero. */
function redirectsToFile(text, dialect) {
  return outputRedirectionTargets(text, dialect).some((found) => (found.target === undefined ? !text.toLowerCase().includes('$null') : !NO_FILE.has(found.target.toLowerCase())));
}

/**
 * @param {Array<{ words: string[], text: string, gitSubcommand?: string }>} before The commands that ran earlier.
 * @param {string} dialect `bash` or `powershell`.
 * @returns {string | undefined} The text of the first earlier command that may write files, or `undefined`.
 * @es El texto del primer comando anterior que puede escribir ficheros, o `undefined`.
 */
export function earlierWriter(before, dialect) {
  const writer = before.find(({ words, text, gitSubcommand }) => {
    if (redirectsToFile(text, dialect)) return true;

    const at = commandWordIndex(words);

    if (at === -1 || words[at].startsWith('$')) return false;

    const name = executableName(words[at]);

    return name === 'git' ? !NON_WRITING_GIT.has(gitSubcommand) : !NON_WRITING.has(name);
  });

  return writer?.text;
}
