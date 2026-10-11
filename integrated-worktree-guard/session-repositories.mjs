/**
 * The repositories a session worked in, derived from its transcript's tool calls (and the directories the
 * hook was given), as their MAIN checkouts.
 *
 * WHAT IS READ. Every transcript record's `cwd`; every tool call's path-bearing input (`file_path`, `path`,
 * `notebook_path`, `cwd`); and, for a Bash or PowerShell call, the directory each git invocation runs in and
 * every `git -C <dir>` target, resolved by the shared shell parser (`shell-command/git-invocations.mjs`). A
 * word in a command that is only a MENTION is therefore not a path the session worked in.
 *
 * HOW A PATH BECOMES A REPOSITORY. By walking up the filesystem to the nearest `.git`, no process spawned:
 * a directory `.git` is a main checkout; a `.git` FILE is a linked worktree, whose `gitdir` holds a
 * `commondir` that leads back to the main checkout's `.git` directory. A path inside a linked worktree, or
 * in one already removed, so resolves to the same main checkout as one inside the main checkout.
 *
 * WHICH WORKTREES THE SESSION OWNS. Ownership is per WORKTREE, never per repository: reaching the main
 * checkout (reading a rule, running a script there) makes a session a visitor of the repository, not the
 * owner of every worktree it has. A session owns a linked worktree when one of its paths lies inside it,
 * and a `git worktree add` it ran counts as a path inside the worktree it created
 * (`added-worktree-path.mjs`). `ownsWorktree` answers that question for one worktree directory.
 *
 * THE TRANSCRIPT IS STREAMED in fixed chunks and never loaded whole: a long session's transcript is tens of
 * megabytes. `transcriptRead: false` says the transcript could not be read, so the caller knows the list is
 * only what the hook itself named.
 *
 * @es Los repos en que trabajó una sesión, derivados de las llamadas a herramientas de su transcript (y de
 * los directorios que el hook recibió), como sus checkouts PRINCIPALES. Se lee el `cwd` de cada registro,
 * las entradas con ruta de cada herramienta y, para Bash/PowerShell, el directorio de cada invocación de git
 * y cada destino de `git -C`, resueltos por el parser compartido: una MENCIÓN no es una ruta de trabajo.
 * Una ruta se vuelve repo subiendo hasta el `.git` más cercano, sin lanzar procesos: un `.git` directorio es
 * un checkout principal; un `.git` FICHERO es un worktree enlazado, cuyo `commondir` vuelve al principal. El
 * transcript se lee por TROZOS, nunca entero. `transcriptRead: false` dice que no se pudo leer. La propiedad es por
 * WORKTREE, nunca por repo: tocar el checkout principal (leer una regla, correr un script ahí) hace a la sesión
 * visitante del repo, no dueña de cada worktree que tiene. Es dueña de un worktree enlazado cuando una de sus
 * rutas cae dentro, y un `git worktree add` que ejecutó cuenta como una ruta dentro del worktree que creó.
 */

import { closeSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { addedWorktreePath } from './added-worktree-path.mjs';

const CHUNK_BYTES = 1024 * 1024;
const NEWLINE = 0x0a;
/** Tool inputs that name a path. @es Entradas de herramienta que nombran una ruta. */
const PATH_FIELDS = ['file_path', 'path', 'notebook_path', 'cwd'];
const GITDIR_PREFIX = 'gitdir:';

/** Every complete JSON line of `file`, parsed, read in chunks. @es Cada línea JSON completa, parseada, leída por trozos. */
function* recordsOf(file) {
  const descriptor = openSync(file, 'r');
  const buffer = Buffer.alloc(CHUNK_BYTES);
  let pending = Buffer.alloc(0);

  try {
    for (let read = readSync(descriptor, buffer, 0, CHUNK_BYTES, null); read > 0; read = readSync(descriptor, buffer, 0, CHUNK_BYTES, null)) {
      pending = Buffer.concat([pending, buffer.subarray(0, read)]);

      for (let end = pending.indexOf(NEWLINE); end !== -1; end = pending.indexOf(NEWLINE)) {
        const line = pending.subarray(0, end).toString('utf8');

        pending = pending.subarray(end + 1);

        try {
          yield JSON.parse(line);
        } catch {
          /* a blank or torn line is not a record */
        }
      }
    }
  } finally {
    closeSync(descriptor);
  }
}

/** Directories a Bash or PowerShell call's git invocations act in, and the worktrees they add. @es Directorios en que actúan las invocaciones de git de una llamada de shell y los worktrees que añaden. */
function gitDirectoriesOf(toolName, command, cwd) {
  const dialect = dialectOfTool(toolName);

  if (dialect === undefined || typeof command !== 'string' || !command.includes('git') || typeof cwd !== 'string') return [];

  const directories = [];

  for (const invocation of gitInvocations(command, dialect, cwd)) {
    const { directory, gitOptions } = invocation;
    const added = addedWorktreePath(invocation);

    if (added !== undefined) directories.push(added);
    if (typeof directory === 'string') directories.push(directory);

    gitOptions.forEach((option, at) => {
      if (option === '-C' && typeof gitOptions[at + 1] === 'string' && typeof directory === 'string') directories.push(path.resolve(directory, gitOptions[at + 1]));
    });
  }

  return directories;
}

/** Every path a transcript record puts the session in. @es Cada ruta en que un registro pone a la sesión. */
export function pathsOf(record) {
  const paths = typeof record?.cwd === 'string' ? [record.cwd] : [];
  const content = record?.message?.content;

  if (!Array.isArray(content)) return paths;

  for (const part of content) {
    if (part?.type !== 'tool_use' || part.input === null || typeof part.input !== 'object') continue;

    for (const field of PATH_FIELDS) if (typeof part.input[field] === 'string') paths.push(part.input[field]);

    try {
      paths.push(...gitDirectoriesOf(part.name, part.input.command, record.cwd));
    } catch {
      /* a command the parser cannot read names no path */
    }
  }

  return paths;
}

/** The main checkout a `.git` FILE of a linked worktree leads to, else the directory itself. @es El checkout principal al que lleva el `.git` FICHERO de un worktree enlazado. */
function mainOfLinked(directory, dotGitFile) {
  try {
    const declared = readFileSync(dotGitFile, 'utf8').trim();

    if (!declared.startsWith(GITDIR_PREFIX)) return directory;

    const gitDir = path.resolve(directory, declared.slice(GITDIR_PREFIX.length).trim());
    const commonDir = path.resolve(gitDir, readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());

    return path.basename(commonDir) === '.git' ? path.dirname(commonDir) : commonDir;
  } catch {
    return directory;
  }
}

/**
 * Where `somePath` lies: the main checkout of its repository and, when the nearest `.git` is a linked
 * worktree's, that worktree's root. `undefined` when it lies in no repository.
 * @es Dónde cae `somePath`: el checkout principal de su repo y, si el `.git` más cercano es el de un worktree
 * enlazado, la raíz de ese worktree. `undefined` si no cae en ningún repo.
 */
function locate(somePath) {
  let directory = path.resolve(somePath);

  for (;;) {
    let entry;

    try {
      entry = lstatSync(path.join(directory, '.git'));
    } catch {
      entry = undefined;
    }

    if (entry?.isDirectory()) return { main: directory };
    if (entry?.isFile()) return { main: mainOfLinked(directory, path.join(directory, '.git')), linkedRoot: directory };

    const parent = path.dirname(directory);

    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * The main checkout of the repository `somePath` lies in, or `undefined` when it lies in none.
 * @es El checkout principal del repo en que cae `somePath`, o `undefined` si en ninguno.
 */
export const mainCheckoutOf = (somePath) => locate(somePath)?.main;

/** A path as one identity: real, absolute, case-folded where the filesystem is. @es Una ruta como identidad única. */
function identityOf(directory) {
  let real = directory;

  try {
    real = realpathSync.native(directory);
  } catch {
    /* a removed main checkout keeps its spelling */
  }

  return process.platform === 'win32' ? real.toLowerCase() : real;
}

/**
 * @param {{ transcriptPath?: string, directories?: string[] }} input The transcript and the directories the hook named.
 * @returns {{ repositories: string[], ownsWorktree: (worktreePath: string) => boolean, transcriptRead: boolean }}
 *   Distinct main checkouts, first seen first; and whether the session OWNS a linked worktree.
 * @es Checkouts principales distintos, el primero visto primero; y si la sesión es DUEÑA de un worktree enlazado.
 */
export function repositoriesWorkedIn({ transcriptPath, directories = [] }) {
  const seen = new Map();
  const inside = new Set();
  const visited = new Set();
  let transcriptRead = false;

  const note = (somePath) => {
    const key = identityOf(path.resolve(somePath));

    if (visited.has(key)) return;
    visited.add(key);

    const located = locate(somePath);

    if (located === undefined) return;
    if (!seen.has(identityOf(located.main))) seen.set(identityOf(located.main), located.main);
    if (located.linkedRoot !== undefined) inside.add(identityOf(located.linkedRoot));
  };

  for (const directory of directories) if (typeof directory === 'string' && directory !== '') note(directory);

  if (typeof transcriptPath === 'string' && transcriptPath !== '') {
    try {
      for (const record of recordsOf(transcriptPath)) for (const candidate of pathsOf(record)) note(candidate);
      transcriptRead = true;
    } catch {
      transcriptRead = false;
    }
  }

  return { repositories: [...seen.values()], ownsWorktree: (worktreePath) => inside.has(identityOf(path.resolve(worktreePath))), transcriptRead };
}
