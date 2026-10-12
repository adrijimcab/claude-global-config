/**
 * Reads the CURRENT revision of an engram observation straight from engram's own sqlite store, so the
 * guard can compare it with the content a save/update is about to write.
 *
 * Same store access as `../backlog-owner-guard/resolve-topic-key.mjs` (read-only `node:sqlite` on
 * `ENGRAM_DATA_DIR` or `~/.engram/engram.db`, which is why the database path helper is reused rather
 * than copied, owner mandate M8). A guard is a plain node process outside the MCP transport and cannot
 * call `mem_get_observation`.
 *
 * Two lookups, both over LIVE rows only (`deleted_at IS NULL`):
 *   - by `id`, for `mem_update`;
 *   - by `topic_key` (case-insensitive, like the upsert key) narrowed by `project` and `scope`, for
 *     `mem_save`, which UPSERTS on that key: measured, a save that reuses an existing key REPLACES the
 *     whole content.
 * Every failure is reported as data (`{ error }`), never thrown, so `decide.mjs` owns the fail-closed
 * versus fail-open policy.
 *
 * @es Lee la revisión ACTUAL de una observación directamente del sqlite de engram, para compararla con
 * lo que va a escribir un guardado/actualización. Mismo acceso que `backlog-owner-guard` (solo lectura).
 * Dos búsquedas sobre filas VIVAS: por `id` (`mem_update`) y por `topic_key` + `project` + `scope`
 * (`mem_save`, que hace UPSERT sobre esa clave y REEMPLAZA todo el contenido). Todo fallo se devuelve
 * como dato; la política de fallo cerrado/abierto es de `decide.mjs`.
 */

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { defaultDatabasePath } from '../backlog-owner-guard/resolve-topic-key.mjs';

const COLUMNS = 'id, project, scope, topic_key, content, updated_at';

/** Runs `query` against a read-only handle, turning every failure into `{ error }`. @es Ejecuta la consulta en solo lectura; todo fallo es `{ error }`. */
function withStore(databasePath, query) {
  if (!existsSync(databasePath)) return { error: 'store-unreadable' };

  let db;

  try {
    db = new DatabaseSync(databasePath, { readOnly: true });

    return { rows: query(db) };
  } catch (error) {
    return { error: 'query-failed', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      db?.close();
    } catch {
      /* closing a handle that never fully opened must never throw past a result */
    }
  }
}

/**
 * The live row with this `id`, as `{ rows: [row] }` (empty when absent) or `{ error }`.
 * @es La fila viva con este `id`.
 */
export function readRevisionById(id, options = {}) {
  if (!Number.isFinite(id)) return { error: 'no-id' };

  return withStore(options.databasePath ?? defaultDatabasePath(), (db) => db.prepare(`SELECT ${COLUMNS} FROM observations WHERE id = ? AND deleted_at IS NULL`).all(id));
}

/**
 * The live rows sharing `topicKey`, narrowed by `project` and `scope` when given, newest first.
 * @es Las filas vivas con ese `topicKey`, acotadas por `project` y `scope` si se dan, la más nueva primero.
 */
export function readRevisionsByTopicKey(topicKey, filters = {}, options = {}) {
  return withStore(options.databasePath ?? defaultDatabasePath(), (db) => {
    const clauses = ['lower(topic_key) = lower(?)', 'deleted_at IS NULL'];
    const values = [topicKey];

    if (typeof filters.project === 'string' && filters.project !== '') {
      clauses.push('project = ?');
      values.push(filters.project);
    }

    if (typeof filters.scope === 'string' && filters.scope !== '') {
      clauses.push('scope = ?');
      values.push(filters.scope);
    }

    return db.prepare(`SELECT ${COLUMNS} FROM observations WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`).all(...values);
  });
}
