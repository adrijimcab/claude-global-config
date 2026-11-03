/**
 * The directory each simple command of a shell line runs in, following the line's own `cd`s.
 *
 * WHY IT MATTERS HERE. A pick is dangerous because of WHERE it lands, not because of how it is
 * spelled: `cd .claude/worktrees/agent-x && git cherry-pick abc` from the main checkout is ordinary
 * worktree work, and `cd /c/.../b100-am-ui && git cherry-pick abc` from a worktree is a raw pick onto
 * develop. Deciding on the payload's `cwd` alone would get both wrong, in opposite directions.
 *
 * WHAT IS FOLLOWED: `cd`, `chdir`, `pushd`/`popd` in bash; `Set-Location`, `sl`, `cd`, `chdir`,
 * `Push-Location`/`pushd`, `Pop-Location`/`popd` in PowerShell; `cd`, `chdir`, `pushd`, `popd` in cmd, where
 * `cd` with no path only PRINTS the directory, `/d` is a switch and the rest of the line is the path; bash
 * `( ... )` subshells, whose `cd` does not outlive the parenthesis. Git Bash spellings (`/c/Users/...`) and `~`
 * are translated.
 *
 * ONE DIRECTORY PER SHELL. Each command is read in the dialect of the shell that runs it (`command.shell`, from
 * `shell-command.mjs`), and a nested shell (`bash -c`, `cmd /c`, a `$(...)`) starts in the directory of the
 * command that starts it and keeps its `cd`s to itself: `bash -c 'cd /tmp' && rm x` removes `x` where the line
 * started, never in `/tmp`. A list built by hand, with no `shell`, is one shell in `dialect`.
 *
 * WHAT IS NOT KNOWABLE, and is reported as such rather than guessed: a target holding `$` or `%`
 * (a variable), and `cd -`. The directory then becomes `undefined` until the next literal `cd`, and the
 * caller decides what an unknown directory means for its own decision.
 *
 * @es El directorio en que corre cada comando de una línea, siguiendo sus propios `cd`. Un pick es
 * peligroso por DÓNDE aterriza, no por cómo se escribe. Lo que no se puede saber (una variable, `cd -`)
 * se devuelve como `undefined`, nunca se adivina. UN DIRECTORIO POR SHELL: cada comando se lee en el dialecto
 * de la shell que lo corre, y una shell anidada empieza en el directorio del comando que la arranca y se guarda
 * sus `cd`: `bash -c 'cd /tmp' && rm x` borra `x` donde empezó la línea. En cmd, `cd` sin ruta solo IMPRIME el
 * directorio, `/d` es un switch y el resto de la línea es la ruta.
 */

import os from 'node:os';
import path from 'node:path';

import { commandWordIndex, DIALECTS, executableName, isUnresolvableWord } from '../shell-command/shell-command.mjs';

const CHANGE_DIRECTORY = new Set(['cd', 'chdir', 'set-location', 'sl']);
const PUSH_DIRECTORY = new Set(['pushd', 'push-location']);
const POP_DIRECTORY = new Set(['popd', 'pop-location']);

/** PowerShell parameter names that introduce the path argument. @es Parámetros de PowerShell que introducen la ruta. */
const PATH_PARAMETERS = new Set(['-path', '-literalpath']);

/** The cmd `cd` switch that also changes the drive; not part of the path. @es El switch de `cd` de cmd que también cambia de unidad. */
const CMD_DRIVE_SWITCH = '/d';

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

  return target === '-' || isUnresolvableWord(target) ? undefined : target;
}

/**
 * The path argument of a cmd directory command, `null` for "no argument", or `undefined` when unknowable. cmd
 * takes the rest of the line as the path, so `cd C:\Program Files` needs no quotes, and `/d` is a switch.
 * @es El argumento de ruta de un comando de directorio de cmd: cmd toma el resto de la línea como ruta, y `/d` es un switch.
 */
function cmdTargetOf(argumentsAfterCommand) {
  const operands = argumentsAfterCommand.filter((word) => word.toLowerCase() !== CMD_DRIVE_SWITCH);

  if (operands.length === 0) return null;

  const target = operands.join(' ');

  return isUnresolvableWord(target) ? undefined : target;
}

/** The directory a shell's commands run in at `depth` subshells: a deeper one inherits the innermost. @es El directorio a `depth` subshells. */
const directoryAt = (stack, depth) => stack[Math.min(depth, stack.length - 1)];

/**
 * Pairs every command with the directory it runs in.
 *
 * @param commands `simpleCommands(...)` output, in execution order.
 * @param start The directory the line starts in (the payload's `cwd`).
 * @param dialect Which shell ran the line: the dialect of a command that names no `shell` of its own.
 * @param platform Injectable for the Git Bash translation; defaults to this process's.
 * @returns `[{ command, directory }]`, `directory` being `undefined` where unknowable.
 * @es Empareja cada comando con el directorio en que corre; `undefined` donde no se puede saber.
 */
export function withWorkingDirectories(commands, start, dialect, platform = process.platform) {
  const lineShell = { dialect, parent: undefined, parentDepth: 0 };
  const shells = new Map();
  const paired = [];

  // A shell's state is born with its first command, before the command that starts it runs, so its parent's
  // directory at that moment is the one it inherits. @es El estado de una shell nace con su primer comando, antes
  // de que corra el que la arranca, así que hereda el directorio que su padre tiene en ese momento.
  const stateOf = (shell) => {
    if (!shells.has(shell)) {
      const inherited = shell.parent === undefined ? path.resolve(start) : directoryAt(stateOf(shell.parent).stack, shell.parentDepth);

      shells.set(shell, { stack: [inherited], pushed: [] });
    }

    return shells.get(shell);
  };

  for (const command of commands) {
    const shell = command.shell ?? lineShell;
    const { stack, pushed } = stateOf(shell);
    const depth = shell.dialect === DIALECTS.BASH ? command.depth : 0;

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

    const changesDirectory = CHANGE_DIRECTORY.has(name) || PUSH_DIRECTORY.has(name);
    const target = shell.dialect === DIALECTS.CMD ? cmdTargetOf(command.words.slice(at + 1)) : targetOf(command.words.slice(at + 1));

    // cmd's `cd` and `pushd` with no path print, they move nothing. @es Sin ruta, `cd` y `pushd` de cmd imprimen, no mueven nada.
    if (changesDirectory && shell.dialect === DIALECTS.CMD && target === null) continue;

    if (CHANGE_DIRECTORY.has(name)) {
      stack[stack.length - 1] = resolve(target);
      continue;
    }

    if (PUSH_DIRECTORY.has(name)) {
      pushed.push(directory);
      stack[stack.length - 1] = resolve(target);
      continue;
    }

    if (POP_DIRECTORY.has(name)) stack[stack.length - 1] = pushed.length > 0 ? pushed.pop() : undefined;
  }

  return paired;
}
