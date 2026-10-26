/**
 * One command-line word that names a file, turned into the real paths it can mean: brace lists expanded, the
 * working directory applied, Git Bash's `/tmp` rebased onto the real temp root, a glob expanded against the file
 * system. A word that cannot be known before the command runs (a variable, a command substitution, a brace
 * range, an unknowable `cd`) comes back as an `unresolvable` entry with a reason CODE, never as a guess.
 *
 * GIT BASH `/tmp`. Git Bash maps `/tmp` to the user's temp folder, but the path arrives here as `C:/tmp/...`, a
 * folder that does not exist, so a deletion there would look like deleting nothing. The rebasing is the one
 * `shared-temp-guard/shared-temp-targets.mjs` already owns (`spellingsUnder`); both spellings are judged.
 *
 * REASON CODES, the vocabulary `refusal.mjs` words in both languages: `variable` (a `$` or `%` expansion, a
 * backtick substitution in bash, a brace range) and `directory` (the line's own `cd` cannot be followed).
 *
 * @es Una palabra de línea de comandos que nombra un fichero, convertida en las rutas reales que puede
 * significar: listas con llaves expandidas, el directorio de trabajo aplicado, el `/tmp` de Git Bash
 * reubicado sobre la raíz temporal real y el glob expandido contra el sistema de ficheros. Una palabra que no
 * se puede saber antes de ejecutar (variable, sustitución de comandos, rango de llaves, un `cd` imposible de
 * seguir) vuelve como entrada `unresolvable` con un CÓDIGO de motivo, nunca como una conjetura. EL `/tmp` DE
 * GIT BASH llega como `C:/tmp/...`, una carpeta que no existe, y borrar allí parecería no borrar nada; la
 * reubicación es la que ya posee `shared-temp-targets.mjs` (`spellingsUnder`), y se juzgan las dos grafías.
 */

import path from 'node:path';

import { nativeSpelling } from '../cherry-pick-guard/working-directory.mjs';
import { DIALECTS } from '../shell-command/shell-command.mjs';
import { canonical, sharedTempRoots, spellingsUnder } from '../shared-temp-guard/shared-temp-targets.mjs';
import { braceExpansion, expandPath, hasWildcard } from './wildcards.mjs';

/** Whether a word carries an expansion only the running shell can resolve. @es Si la palabra lleva una expansión que solo la shell en ejecución resuelve. */
function dependsOnExpansion(word, dialect) {
  return word.includes('$') || word.includes('%') || (dialect === DIALECTS.BASH && word.includes('`'));
}

/** The spellings of an absolute path: its own, and where Git Bash's `/tmp` really is. @es Las grafías de una ruta absoluta: la propia y donde está de verdad el `/tmp` de Git Bash. */
function spellings(absolute) {
  const rebased = sharedTempRoots().map((root) => spellingsUnder(absolute, canonical(root))[1]).find((spelling) => spelling !== undefined);

  return rebased === undefined ? [absolute] : [absolute, rebased];
}

/**
 * @param {string} raw One word as the shell line spells it.
 * @param {string | undefined} directory The directory the command runs in, `undefined` when unknowable.
 * @param {string} via The command, named in the refusal.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} platform Injectable for the Git Bash path translation.
 * @returns {Array<{ path: string, via: string } | { path: undefined, unresolvable: string, via: string }>}
 * @es Las rutas que la palabra puede significar, o una entrada `unresolvable` con su código.
 */
export function resolveOperand(raw, directory, via, dialect, platform = process.platform) {
  if (dependsOnExpansion(raw, dialect)) return [{ path: undefined, unresolvable: 'variable', via }];
  if (directory === undefined) return [{ path: undefined, unresolvable: 'directory', via }];

  const { words, unsupported } = dialect === DIALECTS.BASH ? braceExpansion(raw) : { words: [raw], unsupported: false };

  if (unsupported) return [{ path: undefined, unresolvable: 'variable', via }];

  const entries = [];

  for (const word of words) {
    for (const absolute of spellings(path.resolve(directory, nativeSpelling(word, platform)))) {
      if (hasWildcard(word)) entries.push(...expandPath(absolute).map((expanded) => ({ path: expanded, via })));

      entries.push({ path: absolute, via });
    }
  }

  return entries;
}
