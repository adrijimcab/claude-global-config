/**
 * Finds a subagent of this machine by id (reusing the harness-store walk of `agent-liveness`, which does
 * not honour .gitignore) and the worktree its transcript shows: the harness `worktreePath`, else the first
 * absolute path on a `TENANCY:` line of its brief.
 * @es Halla un subagente por id (con el recorrido del almacén de `agent-liveness`, que no respeta
 * .gitignore) y el worktree que muestra su transcript: el `worktreePath` del harness o la primera ruta
 * absoluta de la línea `TENANCY:` del brief.
 */

import path from 'node:path';

import { agentRecords, briefOf } from '../agent-liveness/liveness.mjs';

const WRAPPERS = '`\'",;()';
const isAbsolute = (token) => token.startsWith('/') || (token.charAt(1) === ':' && '/\\'.includes(token.charAt(2)));
function unwrapped(token) {
  let start = 0;
  let end = token.length;

  while (start < end && WRAPPERS.includes(token.charAt(start))) start += 1;
  while (end > start && WRAPPERS.includes(token.charAt(end - 1))) end -= 1;

  return token.slice(start, end);
}

/** The record for `id` (with or without the `agent-` prefix), or `undefined`. @es El registro del id, o `undefined`. */
export function findAgent(id, { root, projectDir, records } = {}) {
  const wanted = id.startsWith('agent-') ? id : `agent-${id}`;
  const all = records ?? agentRecords(projectDir === undefined ? root : path.dirname(projectDir));

  return all.find((record) => record.id === wanted && (projectDir === undefined || record.project === path.basename(projectDir)));
}

/** The worktree path shown by the record, or `undefined`. @es La ruta del worktree que muestra el registro. */
export function worktreeOf(record, readBrief = briefOf) {
  if (record.worktreePath !== '') return record.worktreePath;

  for (const line of readBrief(record.transcript).split('\n')) {
    const at = line.indexOf('TENANCY');
    const rest = at === -1 ? '' : line.slice(at + 'TENANCY'.length).trimStart();

    if (!rest.startsWith(':')) continue;

    const found = rest.split(' ').map(unwrapped).find(isAbsolute);

    if (found !== undefined) return found;
  }

  return undefined;
}
