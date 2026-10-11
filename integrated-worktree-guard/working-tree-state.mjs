/**
 * What a worktree holds that would be LOST if its directory were deleted now: tracked edits, untracked
 * files and IGNORED files, read from `git status --porcelain --ignored -z` (the entries git itself reports,
 * ignored ones included, because an ignored file nobody declared is work: `gitignored-deliverable-destroyed-
 * by-worktree-autoclean`).
 *
 * ONE DISTINCTION, made by the filesystem and not by a name list: an ignored entry that is a LINK (a symlink
 * or a Windows junction, which `lstat` reports as a symbolic link) carries no content of its own — it points
 * at content that lives elsewhere. It is not work, so it does not make a worktree look dirty; but it is
 * returned apart as `links`, because deleting a link the wrong way FOLLOWS it and destroys the target
 * (`recursive-delete-followed-a-junction`), so the caller must name each one in its removal advice. No path
 * is exempted by name: a real `node_modules` directory counts as work, a junction to one does not. The one
 * other exemption is an ignored entry DECLARED as process output (`declared-run-output.mjs`), named by its producer.
 *
 * `measured: false` is "git could not tell", never "clean".
 *
 * @es Qué guarda un worktree que se PERDERÍA si se borrara su directorio ahora: ediciones, no seguidos e
 * IGNORADOS, leídos de `git status --porcelain --ignored -z`. Una distinción, hecha por el sistema de
 * ficheros y no por una lista de nombres: una entrada ignorada que es un ENLACE (symlink o junction de
 * Windows) no tiene contenido propio, no es trabajo, así que no ensucia el worktree; pero se devuelve aparte
 * en `links`, porque borrar un enlace mal LO SIGUE y destruye el destino. Ninguna ruta se exime por nombre:
 * un `node_modules` real cuenta como trabajo, una junction a uno no. `measured: false` es «git no pudo
 * saberlo», nunca «limpio».
 */

import { lstatSync } from 'node:fs';
import path from 'node:path';

import { undeclaredPartOf } from './declared-run-output.mjs';
import { readGit } from './git-read.mjs';

const IGNORED = '!!';
/** Statuses whose record is followed by a second field naming the origin path. @es Estados cuyo registro lleva un segundo campo con la ruta de origen. */
const TWO_FIELD_STATUSES = new Set(['R', 'C']);

/** Whether `entry` (relative to `worktree`) is a symlink or junction. @es Si `entry` es un symlink o una junction. */
function isLink(worktree, entry) {
  try {
    return lstatSync(path.join(worktree, entry.endsWith('/') ? entry.slice(0, -1) : entry)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * @param {string} worktree The worktree directory.
 * @returns {{ measured: false } | { measured: true, work: string[], links: string[] }}
 *   `work`: the entries that would be lost; `links`: ignored links, apart.
 * @es `work`: lo que se perdería; `links`: enlaces ignorados, aparte.
 */
export function workingTreeState(worktree) {
  const raw = readGit(worktree, ['status', '--porcelain=v1', '--ignored', '-z']);

  if (raw === undefined) return { measured: false };

  const fields = raw.split('\0').filter((field) => field !== '');
  const work = [];
  const links = [];

  for (let at = 0; at < fields.length; at += 1) {
    const status = fields[at].slice(0, 2);
    const entry = fields[at].slice(3);

    if (TWO_FIELD_STATUSES.has(status[0]) || TWO_FIELD_STATUSES.has(status[1])) at += 1;

    if (status === IGNORED && isLink(worktree, entry)) links.push(entry);
    else if (status === IGNORED) work.push(...undeclaredPartOf(worktree, entry));
    else work.push(entry);
  }

  return { measured: true, work, links };
}
