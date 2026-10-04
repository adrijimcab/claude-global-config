/**
 * The pure decision of `backlog-content-guard`: an engram `mem_save` / `mem_update` that would REPLACE an
 * existing record's content must not silently lose what the record already held.
 *
 * WHY THIS EXISTS (`backlog-rewritten-from-summary-lost-detail`, second occurrence). Engram's `mem_save`
 * with an EXISTING `topic_key` is a full upsert. Twice the owner's backlog lost measured detail that way:
 * revisions 53-59 of the master were each rewritten from a running summary, and later a save meant as an
 * append to `backlog/1.0.0-bilingual-gate-hardening` (observation #1092) replaced the detailed record
 * with a short update. A rule written in prose was promoted after the first and recurred anyway, so this
 * is the mechanism: the guard reads the CURRENT revision and refuses a write that drops meaningful items
 * (see `loss.mjs`) unless each one is explicitly closed or superseded.
 *
 * THE STATE SPACE, each state exercised by `selftest.mjs`:
 *
 *   other tool / no content to write / no topic_key on a save      -> ALLOW (nothing this guard judges)
 *   save, key not present in the store (first save)                -> ALLOW
 *   save or update, nothing dropped (addition, reorder, reflow)    -> ALLOW
 *   save or update, items dropped but each retired by a closure line -> ALLOW
 *   save or update, items dropped and not retired                  -> DENY, naming the dropped items
 *   dropped items all present verbatim in cited `ARCHIVED: #id` archives -> ALLOW (see `archive.mjs`)
 *   dropped item absent from the cited archives                    -> DENY, naming it
 *   cited archive unreadable / other topic_key / other project     -> DENY, fail CLOSED
 *   save, store unreadable, key master-shaped (`backlog/*-master`) -> DENY, fail CLOSED
 *   save, store unreadable, ordinary key                           -> ALLOW, fail OPEN
 *   save, several rows match and project cannot narrow it, master  -> DENY, fail CLOSED (ambiguous)
 *   save, several rows match and project cannot narrow it, ordinary-> ALLOW, fail OPEN
 *   update, id unreadable or absent                                -> ALLOW (master-ness unknowable)
 *
 * FAIL-CLOSED ONLY WHERE THE LOSS IS UNRECOVERABLE. For the master backlog an unverifiable write is
 * refused, like `backlog-owner-guard`: a silently replaced master revision cannot be reconstructed. For an
 * ordinary record an unreadable store lets the call through, because blocking every memory write whenever
 * the sqlite file is momentarily unreadable would get the guard switched off. The tradeoff is explicit:
 * an ordinary record can lose detail in the window where the store cannot be read.
 *
 * @es Decisión pura de `backlog-content-guard`: un `mem_save`/`mem_update` de engram que REEMPLAZARÍA el
 * contenido de un registro existente no puede perder en silencio lo que ya tenía. Existe por la segunda
 * recurrencia de `backlog-rewritten-from-summary-lost-detail`: el upsert por `topic_key` reemplaza todo el
 * contenido. Lee la revisión ACTUAL y rechaza una escritura que pierde items con significado salvo que
 * cada uno se cierre o se sustituya explícitamente. FALLA CERRADO solo donde la pérdida es irrecuperable
 * (backlog maestro: una escritura no verificable se rechaza); para un registro ordinario falla ABIERTO,
 * porque bloquear toda escritura de memoria cada vez que el sqlite no se pueda leer haría que alguien
 * apague la guardia. El coste queda dicho: un registro ordinario puede perder detalle en esa ventana.
 */

import { isMasterBacklogTopicKey } from '../backlog-guard/master-save.mjs';
import { resolveArchives } from './archive.mjs';
import { droppedItems } from './loss.mjs';

export const SAVE_TOOLS = new Set(['mcp__engram__mem_save', 'mcp__plugin_engram_engram__mem_save']);
export const UPDATE_TOOLS = new Set(['mcp__engram__mem_update', 'mcp__plugin_engram_engram__mem_update']);

/** Scope engram assumes when a save names none. @es Ámbito que engram asume cuando un guardado no indica ninguno. */
const DEFAULT_SCOPE = 'project';

function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Last path segment of a working directory, either separator style. @es Último segmento de un directorio de trabajo. */
function directoryName(directory) {
  return typeof directory === 'string' ? directory.split('\\').join('/').split('/').filter((part) => part !== '').at(-1) : undefined;
}

/**
 * Refusal descriptor when `row.content` would lose items in `next`, else `undefined`. Items cited as
 * archived (see `archive.mjs`) count as retained; an unusable citation is refused, fail CLOSED.
 * @es Descriptor de rechazo si `next` pierde items de `row.content`. Los items archivados (ver `archive.mjs`) cuentan como conservados; una citación inutilizable se rechaza, CERRADO.
 */
function lossRefusal(base, row, next, readers) {
  const dropped = droppedItems(row.content, next);

  if (dropped.length === 0) return undefined;

  const { problems, haystack } = resolveArchives(next, { topicKey: base.topicKey, project: row.project }, readers);

  if (problems.length > 0) return { ...base, kind: 'archive-invalid', dropped, problems };

  const unarchived = dropped.filter((item) => !haystack.includes(item));

  return unarchived.length === 0 ? undefined : { ...base, kind: 'content-loss', dropped: unarchived };
}

/** The unique live row a save targets, `{ row }`, `{ absent: true }` or `{ ambiguous: true }`. @es La fila única a la que apunta un guardado. */
function saveTarget(rows, payload, toolInput) {
  if (rows.length === 0) return { absent: true };
  if (rows.length === 1) return { row: rows[0] };

  const hint = isText(toolInput.project) ? toolInput.project : directoryName(payload?.cwd);
  const narrowed = rows.filter((row) => row.project === hint);

  return narrowed.length === 1 ? { row: narrowed[0] } : { ambiguous: true };
}

function decideSave(payload, toolName, toolInput, readers) {
  const { topic_key: topicKey, content } = toolInput;

  if (!isText(topicKey) || typeof content !== 'string') return undefined;

  const isMaster = isMasterBacklogTopicKey(topicKey);
  const base = { toolName, topicKey };
  const scope = isText(toolInput.scope) ? toolInput.scope : DEFAULT_SCOPE;
  const read = readers.byTopicKey(topicKey, { project: toolInput.project, scope });

  if ('error' in read) return isMaster ? { ...base, kind: 'unverifiable-master', detail: read.error } : undefined;

  const target = saveTarget(read.rows, payload, toolInput);

  if (target.ambiguous) return isMaster ? { ...base, kind: 'ambiguous-master', detail: `${read.rows.length} rows` } : undefined;
  if (target.absent) return undefined;

  return lossRefusal({ ...base, id: target.row.id }, target.row, content, readers);
}

function decideUpdate(toolName, toolInput, readers) {
  const { id, content } = toolInput;

  if (typeof content !== 'string') return undefined;

  const read = readers.byId(id);

  if ('error' in read || read.rows.length === 0) return undefined;

  const [row] = read.rows;

  return lossRefusal({ toolName, id, topicKey: row.topic_key }, row, content, readers);
}

/**
 * The verdict for one `PreToolUse` payload, split into `toolName`/`toolInput`, with injected
 * `readers = { byId(id), byTopicKey(topicKey, filters) }` over the store.
 * @returns {undefined | { kind: string, toolName: string, topicKey?: string | null, id?: unknown, dropped?: string[], detail?: string }}
 *   `undefined` means ALLOW; anything else is a refusal descriptor for `reason.mjs`.
 */
export function decide(payload, toolName, toolInput, readers) {
  if (toolInput === null || typeof toolInput !== 'object') return undefined;
  if (SAVE_TOOLS.has(toolName)) return decideSave(payload, toolName, toolInput, readers);
  if (UPDATE_TOOLS.has(toolName)) return decideUpdate(toolName, toolInput, readers);

  return undefined;
}
