/**
 * Archive acceptance for `backlog-content-guard`: a record may SHRINK without losing detail when the dropped
 * items were first saved, verbatim, into an ARCHIVE record and the new content cites that record.
 *
 * WHY. Engram caps a record at 50,000 bytes, and the master backlog reached 49,253. Retiring hundreds of
 * old items through closure lines (see `loss.mjs`) makes the record BIGGER, so without an archive the guard
 * leaves no way to shrink the master without losing detail.
 *
 * THE PROCEDURE the orchestrator follows:
 *   1. `mem_save` the old sections VERBATIM into a new record whose `topic_key` is the target's
 *      `topic_key` + `-archive` + anything (for example `backlog/1.0.0-master-archive-1`), same project.
 *   2. Rewrite the target WITHOUT those sections and with one line per archive: `ARCHIVED: #<archive id>`
 *      (several ids may share a line: `ARCHIVED: #12, #13`).
 *   3. The guard accepts each dropped item as retained when its normalised text occurs in a cited archive.
 *
 * WHAT IS REFUSED, always fail CLOSED: a cited id that cannot be read (store error, absent or soft-deleted
 * row), a cited record that is not an archive of THIS target's `topic_key` (prefix `<topic_key>-archive`,
 * case-insensitive), and an archive of another project. An item missing from every cited archive stays
 * dropped and is named in the refusal. A citation excuses nothing by itself: items are matched, not claimed.
 * The archive records are guarded like any other record, so an archive cannot later lose what it holds.
 *
 * No regular expression (owner mandate M5): every parse is a plain string operation.
 *
 * @es Aceptación por archivo de `backlog-content-guard`: un registro puede ENCOGER sin perder detalle si los
 * items eliminados se guardaron antes, literales, en un registro ARCHIVO y el contenido nuevo lo cita.
 * PROCEDIMIENTO: (1) `mem_save` de las secciones viejas LITERALES en un registro con `topic_key` = el del
 * destino + `-archive` + sufijo, mismo proyecto; (2) reescribir el destino sin esas secciones y con una
 * línea `ARCHIVED: #<id del archivo>` por archivo (varios ids por línea con comas); (3) la guardia acepta
 * cada item eliminado cuyo texto normalizado aparezca en un archivo citado. SE RECHAZA, siempre CERRADO: un
 * id citado ilegible, un registro citado que no es archivo del `topic_key` del destino, y un archivo de otro
 * proyecto. Un item ausente de todos los archivos citados sigue perdido y se nombra en el rechazo.
 */

import { extractItems } from './items.mjs';

/** Suffix a cited record's `topic_key` must carry after the target's. @es Sufijo que debe llevar el `topic_key` del archivo. */
export const ARCHIVE_SUFFIX = '-archive';

const ARCHIVED_LABEL = 'archived:';
const DIGITS = '0123456789';
const EDGE_PUNCTUATION = ',;.()[]{}*_`"\'!?';

function withoutBullet(line) {
  return ['- ', '* ', '+ '].find((marker) => line.startsWith(marker)) === undefined ? line : line.slice(2).trim();
}

function trimEdges(token) {
  const characters = [...token];
  let start = 0;
  let end = characters.length;

  while (start < end && EDGE_PUNCTUATION.includes(characters[start])) start += 1;
  while (end > start && EDGE_PUNCTUATION.includes(characters[end - 1])) end -= 1;

  return characters.slice(start, end).join('');
}

/** The observation id a `#<digits>` token names, else `undefined`. @es El id que nombra un token `#<dígitos>`. */
function idOf(token) {
  const bare = trimEdges(token);
  const digits = bare.slice(1);

  return bare.startsWith('#') && digits !== '' && [...digits].every((character) => DIGITS.includes(character)) ? Number(digits) : undefined;
}

/**
 * The archive ids cited by `ARCHIVED: #<id>` lines of `text`, in order, without repeats. A line counts only
 * when it STARTS with the label (after an optional bullet), case-insensitive.
 * @es Los ids de archivo citados por líneas `ARCHIVED: #<id>` de `text`, en orden y sin repetir.
 */
export function citedArchiveIds(text) {
  const ids = [];

  for (const rawLine of text.split('\n')) {
    const line = withoutBullet(rawLine.trim());

    if (!line.toLowerCase().startsWith(ARCHIVED_LABEL)) continue;

    for (const token of line.slice(ARCHIVED_LABEL.length).split(' ').flatMap((part) => part.split('\t'))) {
      const id = idOf(token);

      if (id !== undefined && !ids.includes(id)) ids.push(id);
    }
  }

  return ids;
}

/** One-line reason a cited row is not a usable archive of the target, else `undefined`. @es Motivo si la fila citada no sirve como archivo. */
function archiveProblem(row, target) {
  const prefix = `${target.topicKey}${ARCHIVE_SUFFIX}`.toLowerCase();

  if (typeof row.topic_key !== 'string' || !row.topic_key.toLowerCase().startsWith(prefix)) return `#${row.id} has topic_key ${row.topic_key ?? 'none'}, not an archive of ${target.topicKey} (expected prefix ${prefix})`;
  if (row.project !== target.project) return `#${row.id} belongs to project ${row.project ?? 'none'}, not ${target.project ?? 'none'}`;

  return undefined;
}

/**
 * Resolves the archives cited by `nextText` for `target = { topicKey, project }` through `readers.byId`.
 * @returns {{ problems: string[], haystack: string }} `problems` is non-empty when any citation is unusable
 *   (the caller refuses); `haystack` is the joined normalised items of every usable cited archive.
 * @es Resuelve los archivos citados. `problems` no vacío = citación inutilizable (se rechaza).
 */
export function resolveArchives(nextText, target, readers) {
  const problems = [];
  const texts = [];

  for (const id of citedArchiveIds(nextText)) {
    const read = readers.byId(id);

    if ('error' in read) {
      problems.push(`#${id} cannot be read (${read.error})`);
    } else if (read.rows.length === 0) {
      problems.push(`#${id} does not exist or is deleted`);
    } else {
      const problem = archiveProblem(read.rows[0], target);

      if (problem === undefined) texts.push(extractItems(read.rows[0].content).join(' '));
      else problems.push(problem);
    }
  }

  return { problems, haystack: texts.join(' ') };
}
