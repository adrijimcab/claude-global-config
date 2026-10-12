/**
 * Which ODD documents the stopping session ITSELF wrote. It owns authorship for this guard and nothing else:
 * it narrows a project's documents to the ones this session's transcript wrote or edited through a structured
 * `Write`/`Edit`/`MultiEdit`/`NotebookEdit` call, read by the shared `../config-sync-guard/transcript-writes.mjs`
 * (the same evidence config-sync-guard uses to decide whose change a dirty path is).
 *
 * WHY. Several sessions share one project root; a refusal about a document another session wrote is noise the
 * stopping session cannot discharge (owner order 2026-10-12: warn only the session the thing belongs to). The
 * comparison is on the ABSOLUTE path, so a write of the same relative path in another checkout is not this one.
 *
 * A transcript that cannot be read attributes nothing: it is reported as an error, never as "wrote everything".
 *
 * @es Qué documentos ODD escribió la propia sesión que para. Es dueño de la autoría para esta guardia: reduce
 * los documentos del proyecto a los que el transcript de esta sesión escribió o editó con una llamada
 * estructurada, leída por el módulo compartido de config-sync-guard. Varias sesiones comparten la raíz; un
 * rechazo por un documento ajeno es ruido que la sesión no puede saldar. Se compara la ruta ABSOLUTA. Un
 * transcript ilegible no atribuye nada: es un error, nunca «escribió todo».
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { normalizedPath, writtenPathsIn } from '../config-sync-guard/transcript-writes.mjs';

/**
 * @param {string | undefined} transcriptPath
 * @param {string} projectRoot
 * @param {{ feature: string, modifiedAtMs: number }[]} documents
 * @returns {{ documents: { feature: string, modifiedAtMs: number }[] } | { error: string }}
 * @es Los `documents` que esta sesión escribió, o `{ error }` si no se pudo leer su transcript.
 */
export function documentsWrittenBy(transcriptPath, projectRoot, documents) {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') return { error: 'no transcript_path in the payload' };

  let written;

  try {
    written = new Set(writtenPathsIn(readFileSync(transcriptPath, 'utf8')));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const folder = path.resolve(projectRoot, 'odd', 'tasks');

  return { documents: documents.filter(({ feature }) => written.has(normalizedPath(path.join(folder, `${feature}.md`)))) };
}
