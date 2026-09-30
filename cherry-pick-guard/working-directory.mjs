/**
 * The directory each simple command of a shell line runs in, following the line's own `cd`s.
 *
 * WHY IT MATTERS HERE. A pick is dangerous because of WHERE it lands, not because of how it is
 * spelled: `cd .claude/worktrees/agent-x && git cherry-pick abc` from the main checkout is ordinary
 * worktree work, and `cd /c/.../b100-am-ui && git cherry-pick abc` from a worktree is a raw pick onto
 * develop. Deciding on the payload's `cwd` alone would get both wrong, in opposite directions.
 *
 * WHAT IS FOLLOWED: `cd`, `chdir`, `pushd`/`popd` in bash; `Set-Location`, `sl`, `cd`, `chdir`,
 * `Push-Location`/`pushd`, `Pop-Location`/`popd` in PowerShell; bash `( ... )` subshells, whose `cd`
 * does not outlive the parenthesis. Git Bash spellings (`/c/Users/...`) and `~` are translated.
 *
 * WHAT IS NOT KNOWABLE, and is reported as such rather than guessed: a target holding `$` or `%`
 * (a variable), and `cd -`. The directory then becomes `undefined` until the next literal `cd`, and the
 * caller decides what an unknown directory means for its own decision.
 *
 * @es El directorio en que corre cada comando de una línea, siguiendo sus propios `cd`. Un pick es
 * peligroso por DÓNDE aterriza, no por cómo se escribe. Lo que no se puede saber (una variable, `cd -`)
 * se devuelve como `undefined`, nunca se adivina.
 */

import os from 'node:os';
import path from 'node:path';

import { commandWordIndex, DIALECTS, executableName } from '../shell-command/shell-command.mjs';

const CHANGE_DIRECTORY = new Set(['cd', 'chdir', 'set-location', 'sl']);
const PUSH_DIRECTORY = new Set(['pushd', 'push-location']);
const POP_DIRECTORY = new Set(['popd', 'pop-location']);

/** PowerShell parameter names that introduce the path argument. @es Parámetros de PowerShell que introducen la ruta. */
const PATH_PARAMETERS = new Set(['-path', '-literalpath']);

/** True when a word's value depends on expansion this module does not perform. @es Verdadero si la palabra depende de una expansión. */
const isUnresolvable = (word) => word.includes('$') || word.includes('%');

/**
 * A Git Bash path as the native filesystem spells it: `/c/Users/x` is `C:/Users/x` on Windows.
 * @es Una ruta de Git Bash tal como la escribe el sistema: `/c/Users/x` es `C:/Users/x` en Windows.
 */
export function nativeSpelling(word, platform = process.platform) {
  if (word === '~' || word.startsWith('~/')) return path.join(os.homedir(), word.slice(1));
  if (platform !== 'win32' || !word.startsWith('/')) return word;

  const drive = word.charAt(1);
  const afterDrive = word.charAt(2);
  const isDriveLetter = drive.length === 1 && drive.toLowerCase() !== drive.toUpperCase();

  return isDriveLetter && (afterDrive === '/' || afterDrive === '') ? `${drive.toUpperCase()}:/${word.slice(3)}` : word;
}

/** The path argument of a directory command, `null` for "no argument", or `undefined` when unknowable. @es El argumento de ruta de un comando de directorio. */
function targetOf(argumentsAfterCommand) {
  const operands = [];

  for (let index = 0; index < argumentsAfterCommand.length; index += 1) {
    const word = argumentsAfterCommand[index];

    if (PATH_PARAMETERS.has(word.toLowerCase())) {
      operands.push(argumentsAfterCommand[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (word.startsWith('-') && word !== '-') continue;

    operands.push(word);
  }

  if (operands.length === 0) return null;

  const [target] = operands;

  return target === '-' || isUnresolvable(target) ? undefined : target;
}

/**
 * Pairs every command with the directory it runs in.
 *
 * @param commands `simpleCommands(...)` output, in execution order.
 * @param start The directory the line starts in (the payload's `cwd`).
 * @param dialect Which shell ran the line.
 * @param platform Injectable for the Git Bash translation; defaults to this process's.
 * @returns `[{ command, directory }]`, `directory` being `undefined` where unknowable.
 * @es Empareja cada comando con el directorio en que corre; `undefined` donde no se puede saber.
 */
export function withWorkingDirectories(commands, start, dialect, platform = process.platform) {
  const stack = [path.resolve(start)];
  const pushed = [];
  const paired = [];

  for (const command of commands) {
    const depth = dialect === DIALECTS.BASH ? command.depth : 0;

    while (stack.length - 1 > depth) stack.pop();
    while (stack.length - 1 < depth) stack.push(stack.at(-1));

    const directory = stack.at(-1);

    paired.push({ command, directory });

    const at = commandWordIndex(command.words);

    if (at === -1) continue;

    const name = executableName(command.words[at]);
    const resolve = (target) => {
      if (target === undefined || directory === undefined) return undefined;
      if (target === null) return os.homedir();

      return path.resolve(directory, nativeSpelling(target, platform));
    };

    if (CHANGE_DIRECTORY.has(name)) {
      stack[stack.length - 1] = resolve(targetOf(command.words.slice(at + 1)));
      continue;
    }

    if (PUSH_DIRECTORY.has(name)) {
      pushed.push(directory);
      stack[stack.length - 1] = resolve(targetOf(command.words.slice(at + 1)));
      continue;
    }

    if (POP_DIRECTORY.has(name)) stack[stack.length - 1] = pushed.length > 0 ? pushed.pop() : undefined;
  }

  return paired;
}
