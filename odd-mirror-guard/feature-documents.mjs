/**
 * Lists the ODD feature documents of a project: the `*.md` files directly under `<project>/odd/tasks/`, each
 * with the instant it was last written. It owns the question "which documents does this project keep?" and
 * nothing about engram.
 *
 * A project with no `odd/tasks` folder has no documents (an empty list, not an error); a folder that exists
 * but cannot be read is an error, so an unreadable directory never reads as "nothing to check".
 *
 * @es Lista los documentos de feature ODD de un proyecto: los `*.md` directamente bajo `<proyecto>/odd/tasks/`,
 * cada uno con el instante de su última escritura. Responde «¿qué documentos guarda este proyecto?» y nada de
 * engram. Sin carpeta `odd/tasks` no hay documentos (lista vacía, no error); una carpeta que existe pero no
 * se puede leer es un error, para que un directorio ilegible nunca se lea como «nada que revisar».
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * @returns {{ documents: { feature: string, modifiedAtMs: number }[] } | { error: string }}
 * @es `documents` ordenados por nombre, o `{ error }`.
 */
export function featureDocuments(projectRoot) {
  const folder = path.join(projectRoot, 'odd', 'tasks');

  if (!existsSync(folder)) return { documents: [] };

  try {
    const documents = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => ({ feature: entry.name.slice(0, -'.md'.length), modifiedAtMs: statSync(path.join(folder, entry.name)).mtimeMs }))
      .sort((a, b) => a.feature.localeCompare(b.feature));

    return { documents };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
