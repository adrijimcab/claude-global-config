#!/usr/bin/env node
/**
 * `PreToolUse` guard, global (every project, every caller): an engram `mem_save` / `mem_update` may not
 * silently drop content the target record already holds. Mechanism for
 * `backlog-rewritten-from-summary-lost-detail` (second occurrence: a save with an existing `topic_key`
 * meant as an append replaced the detailed record of observation #1092 with a short update).
 *
 * The decision lives in `decide.mjs` (pure, store access injected), the comparison in `loss.mjs` and
 * `items.mjs`, the store reads in `current-revision.mjs`, the wording in `reason.mjs`. This file is the
 * thin shim: stdin -> `evaluate()` -> stdout, plus a journal so a real refusal is auditable.
 *
 * ARCHIVE ACCEPTANCE (`archive.mjs`): an item dropped from a record is retained when its text is verbatim in a
 * cited archive, so a record near engram's 50,000-byte cap can shrink without losing detail. Procedure:
 * (1) `mem_save` the old sections verbatim into a record with topic_key "<target topic_key>-archive<suffix>",
 * same project; (2) rewrite the target without them plus a line `ARCHIVED: #<archive id>`; an unreadable,
 * foreign-topic or foreign-project archive is refused (fail CLOSED), an item absent from the archive is named.
 *
 * FAILS OPEN on this guard's OWN malfunctions (unreadable stdin, bad JSON, a throw in the decision),
 * and CLOSED only for the master backlog when its current revision cannot be read (see `decide.mjs`).
 *
 * @es ACEPTACIÓN POR ARCHIVO (`archive.mjs`): un item eliminado de un registro cuenta como conservado si su texto
 * está literal en un archivo citado; así un registro cerca del tope de 50.000 bytes de engram puede encoger sin
 * perder detalle. Procedimiento: (1) `mem_save` de las secciones viejas literales en un registro con topic_key
 * "<topic_key del destino>-archive<sufijo>", mismo proyecto; (2) reescribir el destino sin ellas, con una línea
 * `ARCHIVED: #<id del archivo>`; un archivo ilegible, de otro topic_key o de otro proyecto se rechaza (CERRADO)
 * y un item ausente del archivo se nombra.
 *
 * @es Guardia `PreToolUse`, global (todo proyecto, todo llamante): un `mem_save`/`mem_update` de engram
 * no puede perder en silencio contenido que el registro ya tiene. Mecanismo de
 * `backlog-rewritten-from-summary-lost-detail`. Falla ABIERTO ante sus fallos PROPIOS y CERRADO solo
 * para el backlog maestro cuando no puede leer su revisión actual.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { readRevisionById, readRevisionsByTopicKey } from './current-revision.mjs';
import { decide, SAVE_TOOLS, UPDATE_TOOLS } from './decide.mjs';
import { reason } from './reason.mjs';

/** Where this mechanism keeps its state, resolved at each call through the one state-location module. @es Dónde guarda su estado este mecanismo, resuelto en cada llamada por el único módulo de ubicaciones. */
const stateDirectory = () => stateDir('backlog-content-guard');
const refusalsFile = () => path.join(stateDirectory(), 'refusals.jsonl');

/** Every tool name this guard has an opinion about. @es Toda herramienta sobre la que esta guardia opina. */
export const GUARDED_TOOLS = new Set([...SAVE_TOOLS, ...UPDATE_TOOLS]);

function journal(entry) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    appendFileSync(refusalsFile(), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* the journal is evidence, never a precondition: its failure must not change the decision */
  }
}

function withoutBom(raw) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/**
 * The hook output for a raw `PreToolUse` payload, or `undefined` to allow. `options.databasePath` points
 * the store reads at another sqlite file (the selftest's disposable one). Exported so the dispatcher can
 * run it in-process.
 * @es La salida de hook para un payload crudo, o `undefined` para permitir. `options.databasePath`
 * redirige la lectura del almacén (la base desechable del selftest).
 */
export function evaluate(raw, options = {}) {
  let payload;

  try {
    payload = JSON.parse(withoutBom(raw));
  } catch {
    return undefined;
  }

  const toolName = payload?.tool_name;

  if (!GUARDED_TOOLS.has(toolName)) return undefined;

  const readers = {
    byId: (id) => readRevisionById(id, options),
    byTopicKey: (topicKey, filters) => readRevisionsByTopicKey(topicKey, filters, options)
  };
  let refusal;

  try {
    refusal = decide(payload, toolName, payload?.tool_input, readers);
  } catch {
    // An unexpected throw in the decision is a malfunction of THIS guard, not a verdict on the call.
    return undefined;
  }

  if (refusal === undefined) return undefined;

  journal({ at: new Date().toISOString(), session: payload?.session_id, agentId: payload?.agent_id, tool: toolName, kind: refusal.kind, id: refusal.id, topicKey: refusal.topicKey, dropped: refusal.dropped?.length });

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason(refusal)
    }
  };
}

function main() {
  let raw;

  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    process.exit(0);
  }

  const output = evaluate(raw);

  if (output !== undefined) console.log(JSON.stringify(output));
  process.exit(0);
}

// A module that EXPORTS runs no work when imported (`guard-that-cannot-go-red`): main() runs only when
// this file is the process entry point.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
