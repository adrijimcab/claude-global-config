/**
 * THE VERSIONED MASTER BACKLOG AS A SAVE — did a shell call of this turn commit `checklists/master-backlog.md`?
 *
 * Owns one question: does the transcript excerpt of the turn hold a SUCCESSFUL shell call whose command
 * commits a path ending `checklists/master-backlog.md` with a pathspec — `git commit … -- <path>` or
 * `node …/backup-repo.mjs commit … -- <path>`? Projects that keep the master backlog as a versioned
 * document (b100-am-ui, `~/.claude`) save it by that commit, not by an engram write. A failed call
 * (`is_error`) or a call with no result is not a save. No regex (owner mandate M5).
 *
 * @es EL BACKLOG MAESTRO VERSIONADO COMO GUARDADO — ¿un comando de shell de este turno commiteó
 * `checklists/master-backlog.md`? Cuenta solo una llamada EXITOSA cuyo comando commitea con pathspec una
 * ruta que termina en esa ruta, con `git commit … -- <ruta>` o `backup-repo.mjs commit … -- <ruta>`. Una
 * llamada fallida (`is_error`) o sin resultado no es un guardado. Sin regex (M5).
 */

import { objectsIn, parsedLine } from './master-update.mjs';

const DOCUMENT_SUFFIX = 'checklists/master-backlog.md';

/** Whether `command` commits a path ending the master document, with a pathspec. @es Si `command` commitea con pathspec una ruta que termina en el documento maestro. */
function commitsMasterDocument(command) {
  const words = command.split(' ');
  const isCommit = words.includes('commit') && (words.includes('git') || command.includes('backup-repo.mjs'));
  const hasPathspec = command.includes(' -- ') || command.includes('--only');
  const tokens = words.map((token) => token.replaceAll('\\', '/').replaceAll('"', '').replaceAll("'", ''));

  return isCommit && hasPathspec && tokens.some((token) => token.endsWith(DOCUMENT_SUFFIX));
}

/** Whether transcript excerpt `tail` holds a successful call committing the master backlog document. @es Si `tail` tiene una llamada exitosa que commitea el documento del backlog maestro. */
export function hasMasterDocumentCommit(tail) {
  if (typeof tail !== 'string' || tail.length === 0) return false;

  const commits = new Set();
  const succeeded = new Set();

  for (const line of tail.split('\n')) {
    const record = parsedLine(line);

    if (record === undefined) continue;

    for (const node of objectsIn(record)) {
      if (node.type === 'tool_use' && typeof node.input?.command === 'string' && commitsMasterDocument(node.input.command)) commits.add(node.id);
      if (node.type === 'tool_result' && node.is_error !== true) succeeded.add(node.tool_use_id);
    }
  }

  return [...commits].some((id) => succeeded.has(id));
}
