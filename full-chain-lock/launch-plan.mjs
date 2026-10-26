/**
 * How to START a command without a shell parsing its arguments: `{ file, args, options }` for `child_process.spawn`.
 *
 * On POSIX, and on Windows for a real executable (`.exe`, `.com`, or a path), the command and its arguments go
 * straight through as an ARRAY: nothing parses them. On Windows a bare name such as `npm` is not an executable but
 * a `.cmd` launcher found through `PATH` and `PATHEXT`, and since the 2024 Node security fix a `.cmd` can only be
 * started through `cmd.exe`. That one case builds the `cmd.exe /d /s /c "<launcher> <args>"` line itself: every
 * argument is wrapped in double quotes when it holds anything but plain characters, and an argument holding a
 * double quote or a percent sign, which `cmd.exe` would reinterpret, is REFUSED rather than carried wrongly.
 *
 * Pure: the file system and the environment are parameters, so the Windows plan is provable on any platform.
 *
 * @es Cómo INICIAR un comando sin que un shell interprete sus argumentos: `{ file, args, options }` para `spawn`.
 * En POSIX, y en Windows para un ejecutable real, comando y argumentos pasan como ARRAY. En Windows un nombre
 * suelto como `npm` es un lanzador `.cmd` hallado por `PATH` y `PATHEXT`, que solo se inicia vía `cmd.exe`: ese
 * único caso arma la línea `cmd.exe /d /s /c "<lanzador> <args>"`, entrecomillando todo argumento que lleve algo
 * más que caracteres simples y RECHAZANDO el que lleve comillas dobles o `%`. Puro: sistema de ficheros y entorno
 * son parámetros.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import { CommandNotStarted } from './chain-runner.mjs';

/** Characters an argument may hold without quoting for `cmd.exe`. @es Caracteres que un argumento puede llevar sin comillas para `cmd.exe`. */
const PLAIN = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.:\\/=@+,');

/** Characters `cmd.exe` would reinterpret even inside double quotes. @es Caracteres que `cmd.exe` reinterpretaría incluso entre comillas dobles. */
const UNSAFE = new Set('"%');

/** The launcher extensions that only `cmd.exe` can start. @es Las extensiones de lanzador que solo `cmd.exe` puede iniciar. */
const CMD_EXTENSIONS = new Set(['.cmd', '.bat']);

/** Wraps an argument for `cmd.exe`, or refuses it. @es Envuelve un argumento para `cmd.exe`, o lo rechaza. */
function cmdQuoted(argument) {
  if ([...argument].some((character) => UNSAFE.has(character))) throw new CommandNotStarted('unsafe-argument', { argument });

  return [...argument].every((character) => PLAIN.has(character)) && argument !== '' ? argument : `"${argument}"`;
}

/** The launcher of a bare `command` on Windows: its full path, or `undefined`. @es El lanzador de un `command` suelto en Windows: su ruta completa, o `undefined`. */
function findOnPath(command, env, exists) {
  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((extension) => extension !== '');
  const directories = (env.PATH ?? env.Path ?? '').split(';').filter((directory) => directory !== '');

  for (const directory of directories) {
    for (const extension of ['', ...extensions]) {
      const candidate = path.win32.join(directory, `${command}${extension}`);

      if (path.win32.extname(candidate) !== '' && exists(candidate)) return candidate;
    }
  }

  return undefined;
}

/**
 * @param {string} command The program, as the caller wrote it.
 * @param {string[]} args Its arguments, one element each.
 * @param {{ platform?: string, env?: object, exists?: (file: string) => boolean }} [context]
 * @returns {{ file: string, args: string[], options: object }}
 * @throws {CommandNotStarted} for an argument a Windows `.cmd` launcher cannot carry safely.
 * @es El plan de arranque de `command` con `args`. Lanza `CommandNotStarted` para un argumento que un `.cmd` no puede transportar con seguridad.
 */
export function launchPlan(command, args, { platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const direct = { file: command, args, options: { stdio: 'inherit', shell: false, windowsHide: true } };

  if (platform !== 'win32') return direct;

  const hasDirectory = command.includes('/') || command.includes('\\');
  const resolved = hasDirectory ? command : findOnPath(command, env, exists);

  if (resolved === undefined || !CMD_EXTENSIONS.has(path.win32.extname(resolved).toLowerCase())) return { ...direct, file: resolved ?? command };

  const line = [`"${resolved}"`, ...args.map(cmdQuoted)].join(' ');

  return { file: env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], options: { ...direct.options, windowsVerbatimArguments: true } };
}
