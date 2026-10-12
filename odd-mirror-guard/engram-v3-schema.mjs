/**
 * The engram v3 DDL of the two tables the odd-mirror-guard selftest needs (`sessions` and `observations`),
 * captured ONCE from a live engram database so the selftest never depends on the machine it runs on.
 *
 * Captured: 2026-10-12, engram 3.3.2 (`engram version`), copied verbatim from `sqlite_master`.
 * `schema-drift-check.mjs` compares this fixture with the live schema on demand.
 *
 * @es El DDL v3 de engram de las dos tablas que necesita el selftest de odd-mirror-guard, capturado UNA vez
 * de una base viva (2026-10-12, engram 3.3.2) para que el selftest no dependa de la máquina. El chequeo
 * `schema-drift-check.mjs` lo compara con el esquema vivo cuando se pide.
 */

export const ENGRAM_SCHEMA_CAPTURE = { engramVersion: '3.3.2', capturedOn: '2026-10-12' };

export const SESSIONS_DDL = "CREATE TABLE sessions (\n\t\t\t\tid         TEXT PRIMARY KEY,\n\t\t\tproject    TEXT NOT NULL,\n\t\t\tdirectory  TEXT NOT NULL,\n\t\t\tstarted_at TEXT NOT NULL DEFAULT (datetime('now')),\n\t\t\tended_at   TEXT,\n\t\t\tsummary    TEXT\n\t\t, ownership_mode TEXT, runtime_lease_expires_at TEXT, local_creation_project TEXT)";

export const OBSERVATIONS_DDL = "CREATE TABLE observations (\n\t\t\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,\n\t\t\t\tsync_id    TEXT,\n\t\t\t\tsession_id TEXT    NOT NULL,\n\t\t\ttype       TEXT    NOT NULL,\n\t\t\ttitle      TEXT    NOT NULL,\n\t\t\tcontent    TEXT    NOT NULL,\n\t\t\ttool_name  TEXT,\n\t\t\tproject    TEXT,\n\t\t\tscope      TEXT    NOT NULL DEFAULT 'project',\n\t\t\ttopic_key  TEXT,\n\t\t\tnormalized_hash TEXT,\n\t\t\trevision_count INTEGER NOT NULL DEFAULT 1,\n\t\t\tduplicate_count INTEGER NOT NULL DEFAULT 1,\n\t\t\tlast_seen_at TEXT,\n\t\t\tcreated_at TEXT    NOT NULL DEFAULT (datetime('now')),\n\t\t\tupdated_at TEXT    NOT NULL DEFAULT (datetime('now')),\n\t\t\tdeleted_at TEXT, review_after TEXT, expires_at TEXT, embedding BLOB, embedding_model TEXT, embedding_created_at TEXT, pinned BOOLEAN NOT NULL DEFAULT 0,\n\t\t\tFOREIGN KEY (session_id) REFERENCES sessions(id)\n\t\t)";
