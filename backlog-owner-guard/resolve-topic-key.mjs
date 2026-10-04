/**
 * Resolves an engram observation `id` to its CURRENT `topic_key` by reading engram's own sqlite store —
 * the single source of truth engram itself writes to (owner mandate M8: never a hardcoded id list, a
 * real mechanism derived from the actual store).
 *
 * WHY THE STORE DIRECTLY, not an MCP round-trip or the local HTTP daemon. `mem_get_observation` is an
 * MCP tool, and a `PreToolUse` guard is a plain node process outside that transport — it cannot call it.
 * `engram serve`'s local HTTP API (measured live on this machine: `GET http://localhost:7437/observations/972`
 * returns the row with `topic_key`) depends on a background daemon that may not be running in every
 * environment. The sqlite file at `ENGRAM_DATA_DIR` (default `~/.engram/engram.db`, exactly as
 * documented by `engram --help`) is always present wherever engram itself can read or write, with no
 * daemon dependency — MEASURED: `SELECT topic_key FROM observations WHERE id = 972` against the real
 * store returned `backlog/1.0.0-master`, the exact record this guard exists to protect.
 *
 * `node:sqlite` is a Node core module opened `readOnly: true` — this guard only ever READS the store,
 * never writes it. MEASURED on Node 22.22.0 (2026-10-04): it needs no flag, but importing it prints
 * `ExperimentalWarning: SQLite is an experimental feature` on stderr, and a Node older than 22.5 does not
 * have it at all. Both are handled at the root here, not at each caller: the module is loaded LAZILY (a
 * guard that never resolves an id never loads it, so a static import can no longer crash the importing
 * guard at load), under a scoped silencer that drops only that one notice (`withSqliteWarningSilenced`),
 * and a Node without it is reported as `store-unreadable` like any other unreadable store.
 * @es `node:sqlite` es un módulo central de Node abierto en `readOnly`. MEDIDO en Node 22.22.0
 * (2026-10-04): no necesita flag, pero importarlo imprime un `ExperimentalWarning` en stderr, y un Node
 * anterior a 22.5 no lo tiene. Ambas cosas se resuelven en la raíz, no en cada llamante: el módulo se
 * carga PEREZOSAMENTE (un import estático ya no puede tumbar la guardia al cargar), bajo un silenciador
 * acotado que descarta solo ese aviso, y un Node sin él se reporta como `store-unreadable`.
 *
 *
 * FAILS CLOSED, not open, and that is deliberate and asymmetric with every sibling guard in this fleet.
 * Every other guard here fails OPEN on its own malfunction, because letting a tool call through is the
 * safe default when a guard cannot verify. This one is the opposite: the thing being protected is
 * unrecoverable state (an overwritten backlog revision), and letting an update through because the
 * resolver could not prove otherwise is exactly the defect this guard exists to close. So a missing
 * database, an unreadable file, a query error, or an id that does not resolve are ALL reported as errors
 * to the caller, and `decide.mjs` turns every one of them into a DENY for a subagent caller — never a
 * silent allow.
 *
 * @es Resuelve un `id` de observación de engram a su `topic_key` ACTUAL leyendo el propio almacén sqlite
 * de engram — la única fuente de verdad (mandato M8: nunca una lista de ids fija, un mecanismo real
 * derivado del almacén real). Por qué el almacén directo y no un viaje MCP o el demonio HTTP local: un
 * guard de `PreToolUse` es un proceso node fuera de ese transporte, y el demonio HTTP depende de un
 * proceso en segundo plano que puede no estar corriendo. El fichero sqlite en `ENGRAM_DATA_DIR`
 * (por defecto `~/.engram/engram.db`, tal como documenta `engram --help`) está siempre presente donde
 * engram pueda leer o escribir. FALLA CERRADO, no abierto — a diferencia de toda guardia hermana de esta
 * flota: lo que se protege es estado irrecuperable, así que un almacén ausente, un fichero ilegible, un
 * error de consulta o un id que no resuelve se reportan TODOS como error, y `decide.mjs` los convierte
 * en DENY para un llamante subagente — nunca en un permiso silencioso.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const requireModule = createRequire(import.meta.url);

/** The one notice this resolver silences, matched by its text. @es El único aviso que este resolutor silencia, reconocido por su texto. */
const SQLITE_EXPERIMENTAL_NOTICE = 'SQLite is an experimental feature';

/**
 * Runs `load` with `process.emitWarning` filtered so ONLY Node's SQLite ExperimentalWarning is dropped;
 * every other warning passes through, and the original function is restored even when `load` throws.
 * @es Corre `load` con `process.emitWarning` filtrado: SOLO se descarta el ExperimentalWarning de SQLite
 * de Node; cualquier otro aviso pasa, y la función original se restaura aunque `load` lance.
 */
export function withSqliteWarningSilenced(load) {
  const original = process.emitWarning;

  process.emitWarning = function silencedEmitWarning(warning, ...rest) {
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
    const isSqliteNotice = type === 'ExperimentalWarning' && String(warning).includes(SQLITE_EXPERIMENTAL_NOTICE);

    if (isSqliteNotice) return;

    return original.call(process, warning, ...rest);
  };

  try {
    return load();
  } finally {
    process.emitWarning = original;
  }
}

/** `node:sqlite`, loaded on first use without its warning. Throws when this Node does not have it. @es `node:sqlite`, cargado al primer uso sin su aviso. Lanza si este Node no lo tiene. */
function loadSqlite() {
  return withSqliteWarningSilenced(() => requireModule('node:sqlite'));
}

/**
 * The default engram sqlite database path, honouring `ENGRAM_DATA_DIR` exactly as `engram --help`
 * documents it: "Empty or whitespace-only values use the platform default; nonblank values are used as
 * provided". MEASURED against the real store on this machine (2026-09-30): resolves to
 * `C:\Users\adrian.jimenez\.engram\engram.db`, and a live query against it for observation 972 returned
 * `topic_key: "backlog/1.0.0-master"`.
 * @es Ruta por defecto del sqlite de engram, respetando `ENGRAM_DATA_DIR` igual que lo documenta
 * `engram --help`. Medido contra el almacén real de esta máquina.
 */
export function defaultDatabasePath() {
  const override = process.env.ENGRAM_DATA_DIR;
  const dataDir = typeof override === 'string' && override.trim().length > 0 ? override : path.join(os.homedir(), '.engram');

  return path.join(dataDir, 'engram.db');
}

/** The loaded module, or `undefined` when the loader says it is absent or throws (a Node without it). @es El módulo cargado, o `undefined` si el cargador lo da por ausente o lanza. */
function loadedSqlite(load) {
  try {
    return load();
  } catch {
    return undefined;
  }
}

/**
 * Resolves `id` to `{ topicKey }`, or `{ error }` when it cannot be proven. `databasePath` is injectable
 * so `selftest.mjs` can point this at a real, disposable sqlite database carrying the same schema,
 * rather than mocking the query away.
 *
 * @param {unknown} id the observation id from a `mem_update`/`mem_delete` tool call
 * @param {{ databasePath?: string, loadSqlite?: () => { DatabaseSync: new (path: string, options: { readOnly: boolean }) => any } | undefined }} [options]
 *   `loadSqlite` is injectable so a Node without `node:sqlite` can be exercised. @es `loadSqlite` es inyectable.
 * @returns {{ topicKey: string | null } | { error: 'no-id' | 'store-unreadable' | 'not-found' | 'query-failed', detail?: string }}
 */
export function resolveTopicKeyById(id, options = {}) {
  if (!Number.isFinite(id)) return { error: 'no-id' };

  const databasePath = options.databasePath ?? defaultDatabasePath();

  if (!existsSync(databasePath)) return { error: 'store-unreadable' };

  let db;

  try {
    const sqlite = loadedSqlite(options.loadSqlite ?? loadSqlite);

    if (sqlite === undefined) return { error: 'store-unreadable' };

    db =new sqlite.DatabaseSync(databasePath, { readOnly: true });

    const row = db.prepare('SELECT topic_key FROM observations WHERE id = ?').get(id);

    if (row === undefined) return { error: 'not-found' };

    const topicKey = /** @type {{ topic_key?: unknown }} */ (row).topic_key;

    return { topicKey: typeof topicKey === 'string' ? topicKey : null };
  } catch (error) {
    return { error: 'query-failed', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      db?.close();
    } catch {
      /* closing a handle that never fully opened must never throw past a resolution result */
    }
  }
}
