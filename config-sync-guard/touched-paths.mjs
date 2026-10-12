/**
 * Which files a piece of work changed, measured by comparing the modification times of a set of roots
 * before and after it.
 *
 * WHY A SNAPSHOT AND NOT A HOOK IN EACH WRITER. A command that edits home configuration (the lessons
 * ledger tool: a ledger, a rules file, an evidence file, a stub) has many writers, and a new one can be
 * added tomorrow. One measurement around the whole command names every file that changed whatever wrote it,
 * and misses none that a future writer adds. THE STATED LIMIT: a file another process writes during the same
 * command is counted as this command's (a window of tens of milliseconds); the journal records the file's
 * final mtime, so any LATER write by anyone else no longer matches and falls back to the shell-window rule.
 * A link is measured as itself and never followed (`lstat` reports it as a non-directory); an unreadable
 * or vanished entry is skipped.
 *
 * @es Qué ficheros cambió un trabajo, medido comparando los mtime de un conjunto de raíces antes y después.
 * POR QUÉ UNA FOTO Y NO UN GANCHO EN CADA ESCRITOR: un comando que edita la configuración del home tiene
 * muchos escritores y mañana puede haber otro; una medición alrededor del comando nombra todo fichero que
 * cambió, lo escriba quien lo escriba. LÍMITE DECLARADO: un fichero que otro proceso escriba durante el
 * mismo comando se cuenta como de este (decenas de milisegundos); el journal guarda el mtime FINAL, así que
 * cualquier escritura POSTERIOR ajena ya no casa y vuelve a la regla de la ventana de shell. Un enlace se mide
 * como él mismo y nunca se sigue (`lstat` lo da por no-directorio); una entrada ilegible o desaparecida se salta.
 */

import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Every file at or under `root` with its mtime, added to `into`. @es Cada fichero en o bajo `root` con su mtime, añadido a `into`. */
function collect(root, into) {
  try {
    const stat = lstatSync(root);

    if (!stat.isDirectory()) {
      into.set(root, stat.mtimeMs);

      return;
    }

    for (const name of readdirSync(root)) collect(path.join(root, name), into);
  } catch {
    // A root that vanished or cannot be read measures nothing. @es Una raíz que desapareció o no se lee no mide nada.
  }
}

/** `Map<absolute path, mtimeMs>` of every file at or under the `roots`. @es Mapa ruta absoluta -> mtime de cada fichero en o bajo las raíces. */
export function snapshotMtimes(roots) {
  const snapshot = new Map();

  for (const root of roots) collect(root, snapshot);

  return snapshot;
}

/**
 * The files of `after` that are new or whose mtime differs from `before`, as `[{ path, mtimeMs }]`: what
 * the work in between wrote. A file that vanished is not a write.
 * @es Los ficheros de `after` nuevos o con mtime distinto al de `before`: lo que escribió el trabajo intermedio.
 */
export function changedBetween(before, after) {
  return [...after].filter(([file, mtimeMs]) => before.get(file) !== mtimeMs).map(([file, mtimeMs]) => ({ path: file, mtimeMs }));
}
