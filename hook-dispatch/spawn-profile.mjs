/**
 * The Stop profiler: a preload (`node --import <this file> dispatch.mjs <manifest>`) that counts every child
 * process the dispatcher starts, by program and by the guard running when it started, and times each guard.
 * It is the instrument that finds the spawns worth cutting; it decides nothing and a real hook never loads it.
 *
 * HOW. The dispatcher announces each guard on `GUARD_CHANNEL` (`guard-channel.mjs`). This preload listens there
 * and wraps the seven starters of `node:child_process` (`spawn`, `spawnSync`, `execFile`, `execFileSync`,
 * `exec`, `execSync`, `fork`), then calls `syncBuiltinESMExports()` so a guard's `import { execFileSync }`
 * binding sees the wrapper too. At exit it appends ONE JSON line to the file named by `PROFILE_LOG_VARIABLE`:
 * `{ guards: [{ guard, ms, spawns: { git: 2 } }], outside: { git: 0 } }`.
 *
 * THE STATED LIMIT: a child's own children are not seen (a `node backup-repo.mjs` that runs git counts as one
 * `node`), because they live in another process; the counted program says where to look next.
 *
 * @es El perfilador de Stop: una precarga que cuenta cada proceso hijo que arranca el dispatcher, por programa y
 * por la guardia que corría al arrancarlo, y mide el tiempo de cada guardia. Es el instrumento que encuentra los
 * spawns que vale la pena recortar; no decide nada y un hook real nunca la carga. Escucha `GUARD_CHANNEL`,
 * envuelve los siete arranques de `node:child_process` y llama a `syncBuiltinESMExports()` para que el
 * `import { execFileSync }` de una guardia vea también el envoltorio. Al salir añade UNA línea JSON al fichero
 * que nombra `PROFILE_LOG_VARIABLE`. LÍMITE DECLARADO: los hijos de un hijo no se ven (un `node backup-repo.mjs`
 * que corre git cuenta como un `node`), porque viven en otro proceso.
 */

import childProcess from 'node:child_process';
import { subscribe } from 'node:diagnostics_channel';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';

import { GUARD_CHANNEL } from './guard-channel.mjs';

/** The variable naming the file the profile line is appended to. @es La variable que nombra el fichero al que se añade la línea del perfil. */
export const PROFILE_LOG_VARIABLE = 'HOOK_DISPATCH_PROFILE_LOG';

/** The starters that take a program and an argument list. @es Los arranques que reciben un programa y una lista de argumentos. */
const FILE_STARTERS = ['spawn', 'spawnSync', 'execFile', 'execFileSync'];

/** The starters that take one shell command line. @es Los arranques que reciben una línea de comandos de shell. */
const SHELL_STARTERS = ['exec', 'execSync'];

/** `git` for `/usr/bin/git`, `C:\\Git\\git.exe` or `GIT.EXE`: the base name, lower case, without `.exe`. @es El nombre base, en minúsculas y sin `.exe`. */
export function programName(file) {
  const base = path.basename(String(file).replaceAll('\\', '/')).toLowerCase();

  return base.endsWith('.exe') ? base.slice(0, -'.exe'.length) : base;
}

/** The program a starter call runs: its first word for a shell line, `node` for `fork`. @es El programa que corre una llamada: la primera palabra de una línea de shell, `node` para `fork`. */
export function programOf(starter, firstArgument) {
  if (starter === 'fork') return 'node';
  if (SHELL_STARTERS.includes(starter)) return programName(String(firstArgument).trim().split(' ')[0]);

  return programName(firstArgument === process.execPath ? 'node' : firstArgument);
}

/**
 * A tally of guard timings and spawns: `start(guard, at)`, `end(guard, at)`, `spawned(program)` and
 * `summary()`. A spawn while no guard runs counts under `outside`. Pure: the clock is passed in.
 * @es Un recuento de tiempos y spawns por guardia. Un spawn sin guardia en curso cuenta en `outside`. Pura: el reloj se pasa.
 */
export function createTally() {
  const guards = [];
  const outside = {};
  let current;

  const bump = (counts, program) => {
    counts[program] = (counts[program] ?? 0) + 1;
  };

  return {
    start(guard, at) {
      current = { guard, startedAt: at, ms: 0, spawns: {} };
      guards.push(current);
    },
    end(guard, at) {
      if (current?.guard !== guard) return;

      current.ms = Math.round((at - current.startedAt) * 10) / 10;
      current = undefined;
    },
    spawned(program) {
      bump(current === undefined ? outside : current.spawns, program);
    },
    summary: () => ({ guards: guards.map(({ guard, ms, spawns }) => ({ guard, ms, spawns })), outside })
  };
}

/** Wraps every starter of `target` so each call reports its program to `tally` first. @es Envuelve cada arranque de `target` para que cada llamada informe antes su programa a `tally`. */
export function instrument(target, tally) {
  for (const starter of [...FILE_STARTERS, ...SHELL_STARTERS, 'fork']) {
    const original = target[starter];

    target[starter] = function counted(...args) {
      tally.spawned(programOf(starter, args[0]));

      return original.apply(this, args);
    };
  }
}

/** Installs the profiler in this process when `PROFILE_LOG_VARIABLE` names a file. @es Instala el perfilador en este proceso cuando `PROFILE_LOG_VARIABLE` nombra un fichero. */
function install() {
  const log = process.env[PROFILE_LOG_VARIABLE];

  if (typeof log !== 'string' || log === '') return;

  const tally = createTally();

  subscribe(GUARD_CHANNEL, ({ phase, guard }) => (phase === 'start' ? tally.start(guard, performance.now()) : tally.end(guard, performance.now())));
  instrument(childProcess, tally);
  syncBuiltinESMExports();
  process.once('exit', () => appendFileSync(log, `${JSON.stringify(tally.summary())}\n`));
}

install();
