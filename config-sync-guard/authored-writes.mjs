/**
 * The journal of home-configuration writes whose AUTHOR is known: `{ path, mtimeMs, session }`, so a dirty
 * path is credited to the session that wrote it and to no other.
 *
 * THE DESIGN. A tool that writes configuration (the lessons ledger tool) knows its own session, so it
 * records, after each command, every file the command changed together with that file's final mtime
 * (`touched-paths.mjs`). `path-ownership.mjs` asks this journal first: a path whose CURRENT mtime matches a
 * record is the recorded session's, exactly; only a path with no matching record falls back to the older
 * evidence (structured writes in a transcript, then shell-call windows). The key is the mtime, so a later
 * write by anyone else, which changes it, stops matching by itself and nothing has to be expired.
 *
 * THE REJECTED ALTERNATIVE. Narrowing the shell-window rule (for instance, ignoring windows on paths under
 * `~/.claude`) was rejected: a window is circumstantial evidence, yet it is the only evidence for a write
 * made by a shell redirect or a tool with no session, so removing it re-opens the unexplained-path noise the
 * rule was built to close (measured 2026-10-01), and it would still credit whichever session's window
 * happened to overlap. A recorded author is a fact; a window is a guess; the fact outranks the guess and the
 * guess stays where nothing better exists. Measured 2026-10-12: session b100-am-ui-15 was blocked on
 * `lessons-ledger.md`, which the orchestrator session had written, because its shell call was running then.
 *
 * THE STATED LIMIT: the journal keeps the newest `MAX_RECORDS` records; an author older than that is
 * forgotten and the path falls back to the window rule. A journal that cannot be written loses evidence,
 * never a decision.
 *
 * @es El journal de escrituras de configuración del home con AUTOR conocido: `{ path, mtimeMs, session }`,
 * para acreditar una ruta sucia a la sesión que la escribió y a ninguna otra. EL DISEÑO: la herramienta que
 * escribe (la del ledger de lecciones) conoce su sesión y registra, tras cada comando, cada fichero que
 * cambió con su mtime final. `path-ownership.mjs` consulta primero este journal: una ruta cuyo mtime ACTUAL
 * casa con un registro es de esa sesión, exactamente; solo una sin registro cae a la evidencia anterior
 * (escrituras estructuradas del transcript, luego ventanas de shell). La clave es el mtime: una escritura
 * posterior ajena lo cambia y deja de casar sola, sin caducidades. ALTERNATIVA DESCARTADA: acotar la regla
 * de ventanas (p. ej. ignorarlas bajo `~/.claude`): la ventana sigue siendo la única evidencia de una
 * escritura por redirección de shell o de una herramienta sin sesión, así que quitarla reabre el ruido de
 * rutas sin explicar (medido el 2026-10-01) y seguiría culpando a quien solape. Un autor registrado es un
 * hecho; una ventana, una conjetura: el hecho gana y la conjetura queda donde no hay nada mejor. Medido el
 * 2026-10-12: b100-am-ui-15 quedó bloqueada por `lessons-ledger.md`, que escribió la sesión orquestadora,
 * porque su shell corría en ese instante. LÍMITE: se conservan los `MAX_RECORDS` registros más nuevos.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';
import { normalizedPath } from './transcript-writes.mjs';

/** The most records kept; older ones are forgotten. @es El máximo de registros conservados. */
export const MAX_RECORDS = 1000;

/** The journal file, resolved at each call through the one state-location module. @es El fichero del journal, resuelto en cada llamada. */
const defaultJournal = () => path.join(stateDir('config-sync-guard'), 'authored-writes.jsonl');

/** The records of `journal`, oldest first; an unreadable journal or a bad line yields none. @es Los registros del journal, el más viejo primero. */
export function readAuthoredWrites(journal = defaultJournal()) {
  let text;

  try {
    text = readFileSync(journal, 'utf8');
  } catch {
    return [];
  }

  const records = [];

  for (const line of text.split('\n')) {
    try {
      const record = JSON.parse(line);

      if (typeof record?.path === 'string' && typeof record.session === 'string' && Number.isFinite(record.mtimeMs)) records.push(record);
    } catch {
      continue;
    }
  }

  return records;
}

/**
 * Appends one record per `{ path, mtimeMs }` of `changed` for `session`, and trims the journal to
 * `MAX_RECORDS`. Nothing is written for an unknown session (`undefined`, empty or `unknown`): an author
 * nobody knows is not a fact. Returns the records written.
 * @es Añade un registro por cada `{ path, mtimeMs }` de `changed` para `session` y recorta el journal. Sin
 * sesión conocida no se escribe nada. Devuelve los registros escritos.
 */
export function recordAuthoredWrites(changed, session, journal = defaultJournal()) {
  if (typeof session !== 'string' || session.length === 0 || session === 'unknown' || changed.length === 0) return [];

  const records = changed.map((entry) => ({ path: normalizedPath(entry.path), mtimeMs: entry.mtimeMs, session }));

  try {
    mkdirSync(path.dirname(journal), { recursive: true });
    appendFileSync(journal, records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');

    const all = readAuthoredWrites(journal);

    if (all.length > MAX_RECORDS) writeFileSync(journal, all.slice(-MAX_RECORDS).map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');
  } catch {
    return [];
  }

  return records;
}

/**
 * The sessions recorded as having written `dirtyPath` at exactly `mtimeMs`. `dirtyPath` may be a directory
 * git collapsed to one entry: a record of a file under it matches too. No measurable time matches nothing.
 * @es Las sesiones registradas como autoras de `dirtyPath` con exactamente `mtimeMs`. Puede ser un
 * directorio colapsado por git: casa un registro de un fichero bajo él. Sin hora medible no casa nada.
 */
export function authorsAt(records, dirtyPath, mtimeMs) {
  const target = normalizedPath(dirtyPath);
  const folder = target.endsWith('/') ? target : `${target}/`;

  return [...new Set(records.filter((record) => record.mtimeMs === mtimeMs && (record.path === target || record.path.startsWith(folder))).map((record) => record.session))];
}
