/**
 * The tree a refused full chain MEASURES, so the runner command the refusal suggests can carry `--tree <tree>` and
 * never fall back to the directory the runner happens to start in (the incident of 2026-11-04: a `land.mjs` wrapped
 * from another checkout recorded that checkout, and the write guard protected the wrong tree).
 *
 * THE DECISION, in order:
 *   - a `worktree-landing/land.mjs` line measures the value of its `--worktree` argument (`--worktree <dir>` or
 *     `--worktree=<dir>`), resolved against the directory the line runs in;
 *   - any other chain measures `measuredTree()` of the directory the line runs in, the very function the runner
 *     uses, so the suggestion and the lock record agree;
 *   - the directory the line runs in is the call's `cwd`, followed through the plain `cd <dir>` / `pushd` /
 *     `Set-Location <dir>` commands of the line that run before the chain;
 *   - when no tree can be named (no `cwd` in the payload, a `cd` whose target is not a plain word, a directory that
 *     is in no git working tree, a landing with no `--worktree`), the answer is `undefined`: the refusal says so
 *     instead of guessing.
 *
 * @es El árbol que MIDE una cadena completa rechazada, para que el comando del runner que sugiere la negativa lleve
 * `--tree <árbol>` y nunca caiga en el directorio donde arranque el runner (el incidente del 2026-11-04: un
 * `land.mjs` envuelto desde otro checkout registró ese checkout y el guard de escritura protegió el árbol
 * equivocado). LA DECISIÓN, en orden: una línea de `worktree-landing/land.mjs` mide el valor de su `--worktree`,
 * resuelto contra el directorio donde corre la línea; cualquier otra cadena mide `measuredTree()` de ese
 * directorio, la misma función que usa el runner; el directorio es el `cwd` de la llamada, seguido por los `cd` /
 * `pushd` / `Set-Location` simples que corren antes de la cadena; si no se puede nombrar un árbol (sin `cwd`, un
 * `cd` con destino que no es una palabra simple, un directorio fuera de todo árbol git, un aterrizaje sin
 * `--worktree`) la respuesta es `undefined`: la negativa lo dice en vez de adivinar.
 */

import path from 'node:path';

import { commandWordIndex, executableName, isUnresolvableWord, simpleCommands } from '../shell-command/shell-command.mjs';
import { gitTopLevel, measuredTree } from './measured-tree.mjs';

/** The landing program whose measured tree is its `--worktree`. @es El programa de aterrizaje cuyo árbol medido es su `--worktree`. */
const LANDING_SUFFIX = 'worktree-landing/land.mjs';

/** The programs that change the directory of the shell that runs them. @es Los programas que cambian el directorio de la shell que los corre. */
const DIRECTORY_CHANGERS = new Set(['cd', 'chdir', 'pushd', 'set-location', 'sl']);

/** A path spelled with forward slashes. @es Una ruta con barras normales. */
const forwardSlashes = (value) => value.split('\\').join('/');

/** The value of the `--worktree` flag in `words`, or `undefined`. @es El valor del flag `--worktree` en `words`, o `undefined`. */
function worktreeArgument(words) {
  const at = words.findIndex((word) => word === '--worktree' || word.startsWith('--worktree='));

  if (at === -1) return undefined;

  const value = words[at] === '--worktree' ? words[at + 1] : words[at].slice('--worktree='.length);

  return value === undefined || value === '' || isUnresolvableWord(value) ? undefined : value;
}

/**
 * The directory the chain command runs in: `cwd` moved by every directory change that precedes it in the line.
 * @es El directorio donde corre el comando de la cadena: `cwd` movido por cada cambio de directorio que lo precede en la línea.
 */
function directoryOf(offenderText, { cwd, dialect, script }) {
  let directory = cwd;

  for (const command of simpleCommands(script, dialect, { includeNested: false })) {
    if (command.text === offenderText) break;

    const at = commandWordIndex(command.words);

    if (at === -1 || !DIRECTORY_CHANGERS.has(executableName(command.words[at]).toLowerCase())) continue;

    const target = command.words.slice(at + 1).find((word) => !word.startsWith('-'));

    directory = directory === undefined || target === undefined || isUnresolvableWord(target) ? undefined : path.resolve(directory, target);
  }

  return directory;
}

/**
 * @param {{ text: string }} offender The first unwrapped full chain of the line.
 * @param {{ cwd: (string|undefined), dialect: string, script: string }} context The call's directory, shell dialect and whole line.
 * @param {{ topLevelOf?: (directory: string) => (string|undefined) }} [seams] Replaces the git question (a test seam).
 * @returns {string|undefined} The absolute tree with forward slashes, or `undefined` when it cannot be named.
 * @es El árbol absoluto con barras normales, o `undefined` si no se puede nombrar.
 */
export function wrappedTree(offender, context, seams = {}) {
  const directory = directoryOf(offender.text, context);
  const command = simpleCommands(offender.text, context.dialect).find((candidate) => commandWordIndex(candidate.words) !== -1);
  const words = command?.words ?? [];
  const isLanding = words.some((word) => forwardSlashes(word).endsWith(LANDING_SUFFIX));

  if (isLanding) {
    const worktree = worktreeArgument(words);

    if (worktree === undefined || (directory === undefined && !path.isAbsolute(worktree))) return undefined;

    return forwardSlashes(path.resolve(directory ?? '', worktree));
  }

  if (directory === undefined) return undefined;

  let inGitTree = true;
  const topLevelOf = (candidate) => {
    const top = (seams.topLevelOf ?? gitTopLevel)(candidate);

    inGitTree = top !== undefined;

    return top;
  };
  const tree = measuredTree(directory, { topLevelOf });

  return inGitTree ? forwardSlashes(tree) : undefined;
}
