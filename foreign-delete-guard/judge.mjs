/**
 * The decision of foreign-delete-guard: may this delegated agent make this deletion? It composes the five
 * single-purpose parts, each owned by one module: what the line deletes (`deletion-targets.mjs`), what the agent
 * created (`authorship.mjs`), the agent's own worktree (`own-tree.mjs`), and which deleted files are not the
 * agent's (`foreign-paths.mjs`).
 *
 * ORDER, AND WHY. (1) A line that deletes nothing is allowed without reading anything. (2) A target that cannot
 * be known before the command runs is refused WITHOUT the transcript, because no authorship record can vouch for
 * a name nobody knows yet. (3) Only then the transcript is read; if it is missing or unreadable the guard cannot
 * decide and ALLOWS, like every guard of this fleet that cannot decide. (4) The calls of the CURRENT line that
 * create files count as authored, so `echo x > f && rm f` passes.
 *
 * @es La decisión de foreign-delete-guard: ¿puede este agente delegado hacer este borrado? Compone las partes de
 * un solo oficio. ORDEN: (1) una línea que no borra nada pasa sin leer nada; (2) un objetivo que no se puede
 * saber antes de ejecutar se rechaza SIN el transcript; (3) solo entonces se lee el transcript, y si falta o es
 * ilegible el guard no puede decidir y PERMITE; (4) lo que crea la línea ACTUAL cuenta como autorado.
 */

import { readFileSync } from 'node:fs';

import { callDirectory } from '../write-targets/tool-call-writes.mjs';
import { authoredByCall, authoredPathsIn, ownershipOf } from './authorship.mjs';
import { deletionTargets, gitCleanPreview } from './deletion-targets.mjs';
import { foreignLeaves, MAX_ENTRIES } from './foreign-paths.mjs';
import { linkedWorktreeRoot } from './own-tree.mjs';

/** The agent's transcript text, or `undefined` when there is no readable one. @es El texto del transcript del agente, o `undefined`. */
function readTranscript(transcriptPath) {
  if (typeof transcriptPath !== 'string' || transcriptPath.length === 0) return undefined;

  try {
    return readFileSync(transcriptPath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * @param {object} payload The parsed `PreToolUse` payload of a delegated agent's shell call.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} command The shell line.
 * @param {{ cleanPreview?: Function, transcriptOf?: Function }} [seams] Injectable file-system and git edges.
 * @returns {{ kind: 'foreign', via: string, files: string[] } | { kind: 'unresolved', code: string, via: string } | undefined} `undefined` lets the call run.
 * @es `undefined` deja correr la llamada.
 */
export function judgeDeletion(payload, dialect, command, { cleanPreview = gitCleanPreview, transcriptOf = readTranscript, limit = MAX_ENTRIES } = {}) {
  const cwd = callDirectory(payload);
  const targets = deletionTargets(command, dialect, cwd, { cleanPreview });

  if (targets.length === 0) return undefined;

  const unknown = targets.find((target) => target.unresolvable !== undefined);

  if (unknown !== undefined) return { kind: 'unresolved', code: unknown.unresolvable, via: unknown.via };

  const transcript = transcriptOf(payload.transcript_path);

  if (transcript === undefined) return undefined;

  const ownership = ownershipOf([...authoredPathsIn(transcript, cwd), ...authoredByCall(payload)], linkedWorktreeRoot(cwd));
  const foreign = new Map();

  for (const target of targets) {
    const found = foreignLeaves(target.path, ownership, limit);

    if (found.exceeded) return { kind: 'unresolved', code: 'limit', via: target.via };

    for (const file of found.foreign) if (!foreign.has(file)) foreign.set(file, target.via);
  }

  return foreign.size === 0 ? undefined : { kind: 'foreign', via: [...foreign.values()][0], files: [...foreign.keys()] };
}
