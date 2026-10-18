/**
 * The files a shell line names through an OPTION rather than a redirect: `-o <file>`, `--output <file>`
 * (and their `=`/fused spellings), and the message file of `git commit -F <file>` / `--file <file>`.
 *
 * WHY HERE. `write-targets/shell-writes.mjs` (vendored, never edited) reports redirects, `tee`, `cp`/`mv`,
 * `sed -i` and the PowerShell content cmdlets, but it does not read options. This guard has to see them: the
 * 2026-10-12 incident was a `git commit -F m1.txt` whose message file another session overwrote, and a
 * mutant campaign is as often written with `-o` as with `>`. It reuses the shared parser
 * (`simpleCommands`) and the shared directory tracking (`withWorkingDirectories`), so a `cd /tmp` before a
 * relative target is followed exactly as `shell-writes.mjs` follows it; no second lexer.
 *
 * KNOWN LIMIT, stated: `-o` is read as an output option for every executable, so `ls -o /tmp` (where `-o` is a
 * flag with no value) is read as a write to `/tmp`. A worker that needs that listing can list another way; the
 * alternative, a per-executable table, would silently miss every tool that is not in it.
 *
 * @es Los ficheros que una línea de shell nombra por una OPCIÓN y no por una redirección: `-o <fichero>`,
 * `--output <fichero>` (y sus grafías con `=` o pegadas) y el fichero de mensaje de `git commit -F`/`--file`.
 * `shell-writes.mjs` (vendorizado, no se edita) no lee opciones y este guard las necesita: el incidente del
 * 2026-10-12 fue un `git commit -F m1.txt` cuyo fichero pisó otra sesión. Reutiliza el parser y el seguimiento
 * de directorios compartidos; ningún lexer propio. LÍMITE conocido: `-o` se lee como salida en todo ejecutable,
 * así que `ls -o /tmp` se lee como escritura; la alternativa, una tabla por ejecutable, fallaría en silencio.
 */

import path from 'node:path';

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, simpleCommands } from '../shell-command/shell-command.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';

/** Options whose NEXT word, or whose `=`-suffix, is an output file. @es Opciones cuya palabra siguiente es un fichero de salida. */
const OUTPUT_OPTIONS = ['--output', '--output-file', '--out-file', '--outfile'];

/** Options of `git commit` that name the message file. @es Opciones de `git commit` que nombran el fichero de mensaje. */
const COMMIT_FILE_OPTIONS = ['--file'];

/** A target word that names no file: stdin/stdout. @es Una palabra que no nombra fichero. */
const isNoFile = (word) => word === undefined || word === '' || word === '-';

/**
 * The value an option carries in `words`, for every place the option appears: `name value`, `name=value`
 * and, for a one-letter option, the fused `-Xvalue`.
 * @es El valor que lleva una opción en `words`, en cada aparición: `name valor`, `name=valor` y, para una
 * opción de una letra, la forma pegada `-Xvalor`.
 */
function optionValues(words, longNames, shortLetter) {
  const values = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (longNames.includes(word) || word === `-${shortLetter}`) {
      values.push(words[index + 1]);
      index += 1;
      continue;
    }

    const longName = longNames.find((name) => word.startsWith(`${name}=`));

    if (longName !== undefined) {
      values.push(word.slice(longName.length + 1));
      continue;
    }

    if (word.startsWith(`-${shortLetter}`) && !word.startsWith('--') && word.length > 2) values.push(word.slice(2));
  }

  return values;
}

/** One target resolved against the directory it runs in. @es Un destino resuelto contra su directorio. */
function resolved(raw, directory, platform, via) {
  if (typeof raw !== 'string' || raw.includes('$') || raw.includes('%')) return { path: undefined, unresolvable: `the ${via} target depends on a variable`, via };
  if (directory === undefined) return { path: undefined, unresolvable: `the directory this ${via} runs in is unknowable`, via };

  return { path: path.resolve(directory, nativeSpelling(raw, platform)), unresolvable: undefined, via };
}

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @param {string} platform Injectable for the Git Bash path translation.
 * @returns {Array<{ path: string | undefined, via: string }>} Every file named by `-o`/`--output` or `git commit -F`/`--file`.
 * @es Cada fichero nombrado por `-o`/`--output` o por `git commit -F`/`--file`.
 */
export function optionWriteTargets(script, dialect, cwd, platform = process.platform) {
  const found = [];

  for (const { command, directory } of withWorkingDirectories(simpleCommands(script, dialect), cwd, dialect, platform)) {
    const at = commandWordIndex(command.words);

    if (at === -1) continue;

    for (const raw of optionValues(command.words.slice(at + 1), OUTPUT_OPTIONS, 'o')) {
      if (!isNoFile(raw)) found.push(resolved(raw, directory, platform, 'an output option'));
    }
  }

  for (const invocation of gitInvocations(script, dialect, cwd, platform)) {
    if (invocation.subcommand !== 'commit') continue;

    for (const raw of optionValues(invocation.args, COMMIT_FILE_OPTIONS, 'F')) {
      if (!isNoFile(raw)) found.push(resolved(raw, invocation.directory, platform, 'git commit -F'));
    }
  }

  return found;
}
