/**
 * WHAT THE COMMAND ASKS FOR — every place a shell line resolves a conflict by taking ONE WHOLE SIDE.
 *
 * `git checkout --ours <path>`, `git checkout --theirs -- <paths>`, `git restore --ours .` and their
 * PowerShell spellings all say the same thing to git: write one side's blob over the conflict and drop
 * the other. This file only LOCATES those invocations and says which side each one keeps, where it
 * runs, and over which paths. Whether anything would be LOST by it is a question about the index, and
 * it lives in `conflict.mjs` — a search may locate, it may not adjudicate.
 *
 * WHERE IT RUNS is followed rather than assumed, with the same module the cherry-pick guard uses
 * (`../cherry-pick-guard/working-directory.mjs`): `cd worktree && git checkout --ours file` resolves in
 * the worktree, and deciding on the payload's `cwd` would answer about the wrong repository.
 *
 * NO REGEX (M5): set membership and `startsWith` on literals.
 *
 * @es QUÉ PIDE EL COMANDO: cada sitio donde una línea resuelve un conflicto quedándose con UN LADO
 * ENTERO. Este fichero solo LOCALIZA esas invocaciones —qué lado conservan, dónde corren y sobre qué
 * rutas—; si algo se PERDERÍA es una pregunta sobre el índice y vive en `conflict.mjs`. El directorio
 * se SIGUE con el mismo módulo que usa el guard de cherry-pick, no se supone. SIN REGEX.
 */

import { withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { commandWordIndex, dialectOfTool, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** Git subcommands that can write one side of a conflict over the working tree. @es Subcomandos que escriben un lado del conflicto. */
const SIDE_TAKING = new Set(['checkout', 'restore']);

/** The flag naming the side KEPT. The other one is the side dropped. @es La bandera que nombra el lado CONSERVADO. */
const SIDES = new Map([
  ['--ours', 'ours'],
  ['--theirs', 'theirs']
]);

/** The separator after which every word is a path, whatever it looks like. @es El separador tras el que todo son rutas. */
const PATH_SEPARATOR = '--';

/** Options of `checkout`/`restore` that take a value, so the value is not a path. @es Opciones con valor: su valor no es una ruta. */
const OPTIONS_WITH_VALUE = new Set(['--source', '-s', '--pathspec-from-file', '--conflict']);

/** The paths a side-taking invocation names, in order. @es Las rutas que nombra la invocación. */
function pathsOf(words, from) {
  const paths = [];
  let separatorSeen = false;

  for (let index = from; index < words.length; index += 1) {
    const word = words[index];

    if (!separatorSeen && word === PATH_SEPARATOR) {
      separatorSeen = true;
      continue;
    }

    if (!separatorSeen && OPTIONS_WITH_VALUE.has(word)) {
      index += 1;
      continue;
    }

    if (!separatorSeen && word.startsWith('-')) continue;

    paths.push(word);
  }

  return paths;
}

/**
 * Every side-taking invocation in `command`, as `{ side, paths, directory, text }`. `directory` is
 * `undefined` when the line's own `cd` target could not be known, which the decision treats as
 * unmeasured rather than guessing.
 * @es Cada invocación que se queda con un lado. `directory` es `undefined` si no se pudo saber.
 */
export function sideTakings(toolName, command, cwd, platform = process.platform) {
  const dialect = dialectOfTool(toolName);

  if (dialect === undefined || typeof command !== 'string') return [];

  const commands = withWorkingDirectories(simpleCommands(command, dialect), cwd, dialect, platform);
  const found = [];

  for (const { command, directory } of commands) {
    const words = command.words;
    const at = commandWordIndex(words);

    if (at === -1 || executableName(words[at]) !== 'git') continue;

    const subcommandAt = words.findIndex((word, index) => index > at && !word.startsWith('-'));

    if (subcommandAt === -1 || !SIDE_TAKING.has(words[subcommandAt])) continue;

    const side = words.slice(subcommandAt + 1).map((word) => SIDES.get(word)).find((named) => named !== undefined);

    if (side === undefined) continue;

    const paths = pathsOf(words, subcommandAt + 1);

    if (paths.length === 0) continue;

    found.push({ side, paths, directory, text: command.text });
  }

  return found;
}
