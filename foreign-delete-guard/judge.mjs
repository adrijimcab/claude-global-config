/**
 * The decision of foreign-delete-guard: may this delegated agent make this deletion? It composes the single-
 * purpose parts, each owned by one module: what the line deletes (`deletion-targets.mjs`), what the agent created
 * (`authored-journal.mjs` and `authorship.mjs`), the worktree the agent was given (`own-tree.mjs`), and which
 * deleted files are not the agent's (`foreign-paths.mjs`).
 *
 * ORDER, AND WHY. (1) A line that deletes nothing is allowed without reading anything. (2) A target that cannot
 * be known before the command runs is refused WITHOUT the journal, because no record can vouch for a name nobody
 * knows yet. (3) An agent that cannot be told apart (no `agent_id`, no `agent-<id>.jsonl` transcript name) cannot
 * be judged and ALLOWS, like every guard of this fleet that cannot decide. (4) Only then the agent's journal is
 * read. What THIS line itself creates is never consulted: it is recorded after the decision (`guard.mjs`), and a
 * path created by this line does not exist yet, so a creation in the same line, before or after the deletion,
 * can authorize nothing that exists now.
 *
 * @es La decisión de foreign-delete-guard: ¿puede este agente delegado hacer este borrado? Compone las partes de
 * un solo oficio. ORDEN: (1) una línea que no borra nada pasa sin leer nada; (2) un objetivo que no se puede saber
 * antes de ejecutar se rechaza SIN el journal; (3) un agente que no se puede distinguir no se juzga y PERMITE;
 * (4) solo entonces se lee el journal del agente. Lo que crea ESTA línea nunca se consulta: se anota después de
 * decidir, y una ruta creada por esta línea todavía no existe, así que una creación en la misma línea, antes o
 * después del borrado, no puede autorizar nada que exista ahora.
 */

import { callDirectory } from '../write-targets/tool-call-writes.mjs';
import { agentKeyOf, identityOf, readJournal } from './authored-journal.mjs';
import { ownershipOf } from './authorship.mjs';
import { deletionTargets, gitCleanPreview } from './deletion-targets.mjs';
import { foreignLeaves, MAX_ENTRIES } from './foreign-paths.mjs';
import { tenancyWorktree } from './own-tree.mjs';

/**
 * @param {object} payload The parsed `PreToolUse` payload of a delegated agent's shell call.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} command The shell line.
 * @param {{ cleanPreview?: Function, journalOf?: Function, identify?: Function, records?: Function, limit?: number, platform?: string }} [seams] Injectable git, journal, fleet-record and walk edges, and the platform the line is read as.
 * @returns {{ kind: 'foreign', via: string, files: string[] } | { kind: 'unresolved', code: string, via: string } | undefined} `undefined` lets the call run.
 * @es `undefined` deja correr la llamada.
 */
export function judgeDeletion(payload, dialect, command, { cleanPreview = gitCleanPreview, journalOf = readJournal, identify = identityOf, records, limit = MAX_ENTRIES, platform = process.platform } = {}) {
  const cwd = callDirectory(payload);
  const targets = deletionTargets(command, dialect, cwd, { cleanPreview, platform });

  if (targets.length === 0) return undefined;

  const unknown = targets.find((target) => target.unresolvable !== undefined);

  if (unknown !== undefined) return { kind: 'unresolved', code: unknown.unresolvable, via: unknown.via };

  const agentKey = agentKeyOf(payload);

  if (agentKey === undefined) return undefined;

  const ownership = ownershipOf(journalOf(agentKey), tenancyWorktree({ cwd, agentKey, records }), identify);
  const foreign = new Map();

  for (const target of targets) {
    const found = foreignLeaves(target.path, ownership, limit);

    if (found.exceeded) return { kind: 'unresolved', code: 'limit', via: target.via };

    for (const file of found.foreign) if (!foreign.has(file)) foreign.set(file, target.via);
  }

  return foreign.size === 0 ? undefined : { kind: 'foreign', via: [...foreign.values()][0], files: [...foreign.keys()] };
}
