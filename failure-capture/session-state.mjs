/**
 * Where the state of ONE session lives, so several live sessions never share a file they all rewrite: the stamp
 * that says a session recorded a capture, and the cooldown of the turn guard for one session and agent. Each is
 * its own small file named after the session, written whole through a temporary file and a rename, so a reader
 * never sees half of it and a writer never touches another session's file (K2 and K3 of the failure-capture
 * audit: one `last-capture.json` and one `guard-state.json` for every session lost updates between sessions).
 *
 * @es Dónde vive el estado de UNA sesión, para que varias sesiones vivas nunca compartan un fichero que todas
 * reescriben: el sello que dice que una sesión registró una captura y el cooldown del guard de turno para una
 * sesión y agente. Cada uno es un fichero pequeño con el nombre de la sesión, escrito entero mediante un
 * temporal y un rename, así un lector nunca ve media escritura y un escritor nunca toca el fichero de otra
 * sesión (K2 y K3 de la auditoría de failure-capture: un solo `last-capture.json` y un solo `guard-state.json`
 * para todas las sesiones perdían actualizaciones entre sesiones).
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The longest file name kept as the id spelled out; a longer id is named by its hash. @es El nombre más largo que se deja como el id escrito; uno más largo se nombra por su hash. */
const LONGEST_NAME = 100;

/**
 * A file name for any session or scope id: the id URI-encoded (so `|`, `/`, `\` and `:` can never reach the
 * path), its dots spelled out (so `.` and `..` are not names), or the hash of an id too long to be one.
 * @es Un nombre de fichero para cualquier id de sesión o alcance: el id codificado como URI (así `|`, `/`, `\` y
 * `:` nunca llegan a la ruta), con sus puntos escritos aparte (para que `.` y `..` no sean nombres), o el hash
 * de un id demasiado largo.
 */
export function fileNameOf(id) {
  const spelled = encodeURIComponent(String(id)).split('.').join('%2E');

  return spelled.length <= LONGEST_NAME ? spelled : createHash('sha256').update(String(id)).digest('hex');
}

/** The stamp file of a session. @es El fichero de sello de una sesión. */
export const stampFile = (stateDirectory, session) => path.join(stateDirectory, 'stamps', `${fileNameOf(session)}.json`);

/** The cooldown file of a session and agent. @es El fichero de cooldown de una sesión y agente. */
export const cooldownFile = (stateDirectory, scopeKey) => path.join(stateDirectory, 'guard-state', `${fileNameOf(scopeKey)}.json`);

/** Reads a JSON file, or `fallback` when it is missing or unreadable. @es Lee un fichero JSON, o `fallback` si falta o es ilegible. */
export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Writes a JSON file whole: to a temporary file of its own, then renamed over the target, so no reader sees half a
 * file and two writers of the same file leave one complete value.
 * @es Escribe un fichero JSON entero: a un temporal propio y luego con rename sobre el destino, así ningún lector
 * ve medio fichero y dos escritores del mismo fichero dejan un valor completo.
 */
export function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });

  const temporary = `${file}.${String(process.pid)}-${randomBytes(4).toString('hex')}.tmp`;

  writeFileSync(temporary, JSON.stringify(value), 'utf8');
  renameSync(temporary, file);
}
