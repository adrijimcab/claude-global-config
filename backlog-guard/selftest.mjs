#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for backlog-guard — the `Stop` mechanism enforcing the owner directive
 * "Backlog maestro — todo hallazgo entra en el momento" (`~/.claude/rules/00-owner-mandates.md`).
 *
 * Exercises `decide()`'s whole state space with constructed, real-shaped payloads and injected
 * dependencies — never a live session, per this fleet's own `guard-that-cannot-go-red` rule (a guard is
 * not trusted until proven to discriminate across the state space its decision ranges over). Then runs
 * the real `guard.mjs` process end to end over one small, real, constructed transcript file, to prove
 * the WIRING (stdin -> decide -> stdout) and not just the injected decision.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de backlog-guard. Ejercita todo el espacio de estados de `decide()` con
 * payloads construidos y dependencias inyectadas — nunca una sesión viva. Luego corre `guard.mjs` de
 * verdad, de punta a punta, sobre un transcript pequeño y real construido, para probar el CABLEADO.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { commandDismiss, MINIMUM_REASON_LENGTH, parseArgs } from './dismiss.mjs';
import { decide } from './decide.mjs';
import { evaluate } from './guard.mjs';
import { findAnnouncement } from './announcement.mjs';
import { findPendingMarker, PENDING_MARKERS } from './markers.mjs';
import { proseOutsideQuotes } from './prose.mjs';
import { hasMasterDocumentCommit } from './backlog-document-save.mjs';
import { replay } from './replay.mjs';
import { hasMasterBacklogSave, isMasterBacklogTopicKey, topicKeyValuesIn } from './master-save.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('backlog-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD_CLI = path.join(HERE, 'guard.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);

  if (actualText === expectedText) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${expectedText}, got ${actualText}`);
}

const PENDING_MESSAGE = 'Found a real bug in the coverage exclude list — this is worth flagging, still open for the owner to decide.';
const CLEAN_MESSAGE = 'All 52 selftest assertions pass, 19 of 19 mutants killed, nothing else to report.';

/** A real-shaped `Stop` payload, mirroring the fields `turn-guard.mjs`/`claim-guard.mjs` already read. @es Un payload `Stop` con forma real. */
function stopPayload(message, { sessionId = 's-1', transcriptPath = 'C:/fixture/transcript.jsonl', stopHookActive = false } = {}) {
  return {
    session_id: sessionId,
    transcript_path: transcriptPath,
    hook_event_name: 'Stop',
    stop_hook_active: stopHookActive,
    last_assistant_message: message
  };
}

/**
 * The verdict as `'allow'` / `'deny'`, from FULLY injected dependencies — no real transcript file and,
 * critically, no REAL engram store: `store` maps an observation id to its topic_key (an id absent from
 * it is "not-found"), `storeErrors` maps an id to a store failure, and every id the decision asks about
 * is recorded in `lookups`. Reading the developer's real store would make the verdict depend on live
 * mutable state — the `guard-that-cannot-go-red` shape this fleet's own promoted rule names.
 * @es El veredicto con TODAS las dependencias inyectadas — sin tocar ni el transcript real ni el
 * almacén REAL de engram: `store` mapea un id de observación a su topic_key (un id ausente es
 * «not-found»), `storeErrors` mapea un id a un fallo del almacén y cada id consultado queda en `lookups`.
 */
/** `fn()`, or the string `'threw'` when it throws, so a crash reads as a failed check and not as a crashed run. @es `fn()` o la cadena `'threw'` si lanza: un crash se lee como un check fallido. */
function settle(fn) {
  try {
    return fn();
  } catch {
    return 'threw';
  }
}

function verdict(payload, { offset = 0, tail = '', size = undefined, store = {}, storeErrors = {} } = {}) {
  const writes = [];
  const lookups = [];
  const degraded = [];
  const decision = settle(() => decide(payload, {
    readState: () => (offset === undefined ? undefined : { offset }),
    writeState: (sessionId, state) => writes.push({ sessionId, state }),
    readTail: () => tail,
    sizeOf: () => size,
    resolveTopicKey: (id) => {
      lookups.push(id);

      if (Object.hasOwn(storeErrors, id)) return { error: storeErrors[id] };

      return Object.hasOwn(store, id) ? { topicKey: store[id] } : { error: 'not-found' };
    },
    reportDegraded: (info) => degraded.push(info)
  }));

  return { result: decision === 'threw' ? 'threw' : decision === undefined ? 'allow' : 'deny', writes, lookups, degraded };
}

/** One transcript line holding an engram tool call, in the real nested shape. @es Una línea de transcript con una llamada de herramienta de engram, con la forma anidada real. */
function toolUseLine(name, input) {
  return JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_x', name, input }] } });
}

const UPDATE = 'mcp__plugin_engram_engram__mem_update';

// ---------------------------------------------------------------------------------------------
// STATE 1: pending phrase + no save -> block
// ---------------------------------------------------------------------------------------------
check('pending phrase + no save -> block', verdict(stopPayload(PENDING_MESSAGE), { tail: 'plain text, no tool calls at all' }).result, 'deny');

// ---------------------------------------------------------------------------------------------
// STATE 2: pending phrase + master save in turn -> allow
// ---------------------------------------------------------------------------------------------
{
  const tail = '{"type":"tool_use","name":"mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"…"}}';
  check('pending phrase + master save in turn -> allow', verdict(stopPayload(PENDING_MESSAGE), { tail }).result, 'allow');
}

// ---------------------------------------------------------------------------------------------
// STATE 3 (the near miss): pending phrase + save with a DIFFERENT topic_key -> block
// ---------------------------------------------------------------------------------------------
{
  const tail = '{"type":"tool_use","name":"mem_save","input":{"topic_key":"decision/pending-something","content":"…"}}';
  check('near miss: save with a DIFFERENT topic_key -> still block', verdict(stopPayload(PENDING_MESSAGE), { tail }).result, 'deny');
}
{
  // A second near miss: the mcp-prefixed tool name, still detected via substring — and STILL a
  // near miss when the topic_key namespace is right but the SUFFIX is not "-master" (a per-item
  // backlog note, not the one master record).
  const tail = '{"name":"mcp__plugin_engram_engram__mem_save","input":{"topic_key":"backlog/1.0.0-item-42"}}';
  check('near miss: backlog/ namespace but NOT the -master suffix -> still block', verdict(stopPayload(PENDING_MESSAGE), { tail }).result, 'deny');
}

// ---------------------------------------------------------------------------------------------
// THE mem_update FACE (`mem_update` edits an existing observation by `id` alone — no `topic_key` of
// its own). ONE QUESTION decides it: "is the observation this turn's `mem_update` targeted a master
// backlog record?" — answered by ASKING THE ENGRAM STORE (`resolveTopicKey`), never by remembering what
// an earlier turn happened to read. Live defect that replaced the transcript learning (2026-10-02,
// id 1129): a `mem_update` of a master id whose read sat in an earlier turn was refused as
// "nothing saved".
// @es LA CARA mem_update: UNA pregunta la decide — «¿la observación que el `mem_update` de este turno
// tocó es un registro de backlog maestro?» — respondida PREGUNTANDO AL ALMACÉN de engram, nunca
// recordando lo que un turno anterior leyó. Defecto en vivo que reemplazó el aprendizaje del transcript.
// ---------------------------------------------------------------------------------------------
const MASTER_STORE = { 972: 'backlog/1.0.0-master', 1129: 'backlog/discovery-migration-master', 631: 'decision/unrelated-note', 700: 'backlog/1.0.0-master-plan', 701: null };

{
  const tail = toolUseLine(UPDATE, { id: 1129, content: 'revisión completa' });
  const { result, lookups } = verdict(stopPayload(PENDING_MESSAGE), { tail, store: MASTER_STORE });

  check('mem_update of a master id with NO read of it anywhere in the turn -> allow (the store says master)', result, 'allow');
  check('...and the store was asked about exactly that id', lookups, [1129]);
}
{
  const tail = toolUseLine(UPDATE, { id: 631, content: 'a different, unrelated note' });
  const { result, lookups } = verdict(stopPayload(PENDING_MESSAGE), { tail, store: MASTER_STORE });

  check('mem_update of a NON-master id -> block', result, 'deny');
  check('...after asking the store about it', lookups, [631]);
}
check('mem_update of an id the store does not hold (not-found) -> block', verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine(UPDATE, { id: 424242 }), store: MASTER_STORE }).result, 'deny');
check('near miss: id whose topic_key only CONTAINS "master" (backlog/…-master-plan) -> block', verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine(UPDATE, { id: 700 }), store: MASTER_STORE }).result, 'deny');
check('id whose row has a null topic_key -> block', verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine(UPDATE, { id: 701 }), store: MASTER_STORE }).result, 'deny');
{
  // The update happened in an EARLIER turn only: this turn's tail holds nothing, so the store is not
  // even consulted and the per-turn windowing is unchanged.
  // @es El update fue de un turno ANTERIOR: la cola de este turno está vacía; ni se consulta el almacén.
  const { result, lookups } = verdict(stopPayload(PENDING_MESSAGE), { tail: '', store: MASTER_STORE });

  check('mem_update of the master id in an EARLIER turn only -> block', result, 'deny');
  check('...and the store is not consulted when the turn holds no mem_update', lookups, []);
}
{
  // Only a mem_update TARGET counts: the master id appearing in a READ's result, beside an update of an
  // unrelated id, must not satisfy the turn (the old scan took any known id anywhere in the tail).
  // @es Solo cuenta el OBJETIVO de un mem_update: el id maestro en el resultado de una LECTURA, junto a
  // un update de otro id, no satisface el turno (el escaneo antiguo tomaba cualquier id conocido).
  const tail = [
    toolUseLine('mcp__plugin_engram_engram__mem_get_observation', { id: 972 }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: '{"id":972,"result":"#972 [decision] x\\nTopic: backlog/1.0.0-master"}' }] }] } }),
    toolUseLine(UPDATE, { id: 631 })
  ].join('\n');
  const { result, lookups } = verdict(stopPayload(PENDING_MESSAGE), { tail, store: MASTER_STORE });

  check('a master id that is only READ in the turn, beside a mem_update of a non-master id -> block', result, 'deny');
  check('...and only the mem_update target was asked about', lookups, [631]);
}
check('both tool spellings are recognised: the bare mcp__engram__ mount allows too', verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine('mcp__engram__mem_update', { id: 972 }), store: MASTER_STORE }).result, 'allow');
check('a non-numeric id is never asked about and does not satisfy the turn', (() => {
  const { result, lookups } = verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine(UPDATE, { id: 'abc' }), store: MASTER_STORE });

  return `${result}/${String(lookups.length)}`;
})(), 'deny/0');
check('a corrupt transcript line is skipped, the valid update after it still counts', verdict(stopPayload(PENDING_MESSAGE), { tail: `{"half a li\n${toolUseLine(UPDATE, { id: 972 })}`, store: MASTER_STORE }).result, 'allow');
check('the bare tool name "mem_update" is recognised too', verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine('mem_update', { id: 972 }), store: MASTER_STORE }).result, 'allow');
check('the same id updated twice is asked about once', verdict(stopPayload(PENDING_MESSAGE), { tail: [toolUseLine(UPDATE, { id: 631 }), toolUseLine(UPDATE, { id: 631 })].join('\n'), store: MASTER_STORE }).lookups, [631]);
check('first update non-master, second master -> allow', verdict(stopPayload(PENDING_MESSAGE), { tail: [toolUseLine(UPDATE, { id: 631 }), toolUseLine(UPDATE, { id: 972 })].join('\n'), store: MASTER_STORE }).result, 'allow');

// --- THE STORE CANNOT BE READ: decided and justified in `decide.mjs`' header. A `mem_update` is in the
//     turn but nothing proves what it targeted -> FAIL OPEN and say so (a false block is the defect this
//     replaces; a false allow is bounded by the heuristic announcement and is journalled).
// @es EL ALMACÉN NO SE PUEDE LEER: un `mem_update` está en el turno pero nada prueba su objetivo -> FALLA
//     ABIERTO y lo dice (un bloqueo falso es el defecto que esto reemplaza; un permiso falso queda
//     acotado por el anuncio heurístico y se anota en el journal).
{
  const tail = toolUseLine(UPDATE, { id: 631 });
  const { result, degraded } = verdict(stopPayload(PENDING_MESSAGE), { tail, storeErrors: { 631: 'store-unreadable' } });

  check('store unreadable + a mem_update in the turn -> allow (fail open)', result, 'allow');
  check('...and the degradation is reported exactly once, naming the store failure', degraded, [{ errors: ['store-unreadable'] }]);
}
check('a failed query (query-failed) fails open the same way', verdict(stopPayload(PENDING_MESSAGE), { tail: toolUseLine(UPDATE, { id: 631 }), storeErrors: { 631: 'query-failed' } }).result, 'allow');
{
  const { result, lookups, degraded } = verdict(stopPayload(PENDING_MESSAGE), { tail: 'plain text, no tool calls at all', storeErrors: { 631: 'store-unreadable' } });

  check('store unreadable but NO mem_update in the turn -> still block (nothing to fail open for)', result, 'deny');
  check('...and no degradation is reported when the store was never needed', [lookups.length, degraded.length], [0, 0]);
}
{
  const tail = [toolUseLine(UPDATE, { id: 631 }), toolUseLine(UPDATE, { id: 100 })].join('\n');
  const { result } = verdict(stopPayload(PENDING_MESSAGE), { tail, store: MASTER_STORE, storeErrors: { 100: 'store-unreadable' } });

  check('one update proven non-master and another unreadable -> allow (the unreadable one could be the master)', result, 'allow');
}
{
  const tail = [toolUseLine(UPDATE, { id: 100 }), toolUseLine(UPDATE, { id: 972 })].join('\n');
  const { result, degraded } = verdict(stopPayload(PENDING_MESSAGE), { tail, store: MASTER_STORE, storeErrors: { 100: 'store-unreadable' } });

  check('a master proven by the store wins over an unreadable sibling update -> allow', result, 'allow');
  check('...with no degradation reported, because the store DID answer the question', degraded, []);
}
{
  // The save path is untouched: a master `mem_save` in the turn satisfies it without any store lookup.
  // @es La vía de guardado no cambia: un `mem_save` maestro satisface el turno sin consultar el almacén.
  const tail = '{"type":"tool_use","name":"mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"…"}}';
  const { result, lookups } = verdict(stopPayload(PENDING_MESSAGE), { tail, store: MASTER_STORE });

  check('a master mem_save still satisfies the turn', result, 'allow');
  check('...without consulting the store', lookups, []);
}

// ---------------------------------------------------------------------------------------------
// STATE 4: no pending phrase -> allow
// ---------------------------------------------------------------------------------------------
check('no pending phrase -> allow', verdict(stopPayload(CLEAN_MESSAGE), { tail: '' }).result, 'allow');
check('empty message -> allow', verdict(stopPayload('')).result, 'allow');

// ---------------------------------------------------------------------------------------------
// STATE 5: a save in an EARLIER turn only -> block. Modelled as: the stored offset already sits
// PAST the position of that earlier save (because the guard advanced it at the end of that turn),
// so the tail available to THIS turn never contains it.
// ---------------------------------------------------------------------------------------------
{
  const earlierSave = '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master"}}';
  const wholeTranscript = `${earlierSave}\n{"type":"assistant","text":"turn 2, nothing saved this time"}`;
  const offsetPastTheEarlierSave = earlierSave.length + 1; // the guard's own offset, recorded after turn 1
  const tailForThisTurn = wholeTranscript.slice(offsetPastTheEarlierSave); // what THIS turn's window actually sees

  check(
    'a master save from an EARLIER turn does not satisfy a LATER pending announcement',
    verdict(stopPayload(PENDING_MESSAGE), { offset: offsetPastTheEarlierSave, tail: tailForThisTurn }).result,
    'deny'
  );
  check('the earlier save is truly absent from what this turn reads', tailForThisTurn.includes('mem_save'), false);
}

// ---------------------------------------------------------------------------------------------
// STATE 6: stop_hook_active -> allow (already raised once this turn, never raise it twice)
// ---------------------------------------------------------------------------------------------
check('stop_hook_active -> allow, even with a pending phrase and no save', verdict(stopPayload(PENDING_MESSAGE, { stopHookActive: true }), { tail: '' }).result, 'allow');

// ---------------------------------------------------------------------------------------------
// STATE 7: malformed payload -> allow + exit 0 (via the real `evaluate()`, not the injected decide())
// ---------------------------------------------------------------------------------------------
check('malformed JSON -> evaluate() allows (undefined)', settle(() => evaluate('NOT JSON AT ALL')), undefined);
check('empty stdin -> evaluate() allows (undefined)', settle(() => evaluate('')), undefined);
check('BOM + valid JSON is still parsed (PowerShell 5.1 shape)', settle(() => evaluate(`\ufeff${JSON.stringify(stopPayload(CLEAN_MESSAGE))}`)), undefined);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the offset always advances, on every non-bypassed path, so the NEXT turn's window
// starts fresh — proven by inspecting the `writes` the injected `writeState` captured.
// ---------------------------------------------------------------------------------------------
{
  const { writes } = verdict(stopPayload(CLEAN_MESSAGE), { size: 4242 });
  check('the offset advances to the current transcript size even when nothing was pending', writes[0]?.state?.offset, 4242);
}
{
  const { writes } = verdict(stopPayload(PENDING_MESSAGE), { tail: '', size: 9999 });
  check('the offset advances even when the turn is blocked (the retry bypasses via stop_hook_active)', writes[0]?.state?.offset, 9999);
}

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: an unreadable transcript fails OPEN, never a false block.
// ---------------------------------------------------------------------------------------------
check(
  'an unreadable transcript (tail undefined) fails OPEN, never a false block',
  settle(() => decide(stopPayload(PENDING_MESSAGE), { readState: () => undefined, writeState: () => {}, readTail: () => undefined, sizeOf: () => undefined })) === undefined,
  true
);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the marker/topic_key primitives, in isolation.
// ---------------------------------------------------------------------------------------------
check('findPendingMarker finds a real owner-named root', findPendingMarker('This is left pending and worth flagging.'), 'left pending');
check('findPendingMarker does not fire on the bare Spanish word "todo" alone', findPendingMarker('Corrí todo el árbol y todo salió verde.'), undefined);
check('findPendingMarker fires on the list/comment shape "TODO:"', findPendingMarker('TODO: reconciliar node_modules'), 'TODO:');
check('findPendingMarker does not fire on the Spanish "todo:" (everything:)', findPendingMarker('Lo cerré todo: seis worktrees.'), undefined);
check('PENDING_MARKERS is non-empty', PENDING_MARKERS.length > 0, true);

check('topicKeyValuesIn extracts every value, in order', topicKeyValuesIn('a"topic_key":"x"b"topic_key":"y"c'), ['x', 'y']);
check('isMasterBacklogTopicKey accepts the real b100-am-ui shape', isMasterBacklogTopicKey('backlog/1.0.0-master'), true);
check('isMasterBacklogTopicKey rejects a namespace match with the wrong suffix', isMasterBacklogTopicKey('backlog/1.0.0-item-1'), false);
check('isMasterBacklogTopicKey rejects an unrelated namespace', isMasterBacklogTopicKey('decision/1.0.0-master'), false);
check('isMasterBacklogTopicKey rejects the bare namespace with no milestone', isMasterBacklogTopicKey('backlog/-master'), false);
check('hasMasterBacklogSave is false without ANY save-tool marker, even with a matching topic_key', hasMasterBacklogSave('"topic_key":"backlog/1.0.0-master"'), false);
check('hasMasterBacklogSave is false for undefined/empty input', hasMasterBacklogSave(undefined), false);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the dismiss CLI's own validation.
// ---------------------------------------------------------------------------------------------
check('parseArgs reads --flag value pairs', parseArgs(['--session', 's-1', '--reason', 'because it is genuinely not a finding here']), { session: 's-1', reason: 'because it is genuinely not a finding here' });
{
  const calls = [];
  const result = commandDismiss(
    { session: 's-1', marker: 'still open', reason: 'this is a false positive: "still open" here means the door, not work' },
    { append: (...args) => calls.push(args), mkdir: () => {} }
  );

  check('a long-enough reason is accepted and appended', result.ok, true);
  check('the dismissal is appended exactly once', calls.length, 1);
}
{
  const result = commandDismiss({ session: 's-1', reason: 'too short' }, { append: () => {}, mkdir: () => {} });

  check('a reason shorter than the minimum is REFUSED', result.ok, false);
  check('the refusal names the minimum length', result.problems.some((p) => p.includes(String(MINIMUM_REASON_LENGTH))), true);
}
{
  const result = commandDismiss({ session: 's-1', reason: 'one line only, but\nthis has a newline in it' }, { append: () => {}, mkdir: () => {} });

  check('a multi-line reason is REFUSED (it must fit one JSONL line)', result.ok, false);
}

// ---------------------------------------------------------------------------------------------
// THE WHOLE HOOK, END TO END, over a REAL constructed transcript file and a REAL `guard.mjs`
// process — proves the wiring (stdin -> decide -> stdout, offset persisted on disk), not just the
// injected decision. Real git/session state is never read; everything here is a fixture this
// selftest builds and removes.
// ---------------------------------------------------------------------------------------------
{
  const scratch = mkdtempSync(path.join(tmpdir(), 'backlog-guard-selftest-'));
  // Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
  // también ante una excepción: un selftest no deja nada tras de sí.
  process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
  const transcriptPath = path.join(scratch, 'transcript.jsonl');
  const sessionId = `selftest-${String(process.pid)}-${String(Date.now())}`;

  // A real, disposable engram store shaped like the real one (`observations(id, topic_key)`), reached
  // through `ENGRAM_DATA_DIR` exactly as production reaches `~/.engram`. @es Un almacén de engram real y
  // desechable con la forma del real, alcanzado por `ENGRAM_DATA_DIR` igual que producción alcanza `~/.engram`.
  {
    const seed = new DatabaseSync(path.join(scratch, 'engram.db'));

    seed.exec('CREATE TABLE observations (id INTEGER PRIMARY KEY, topic_key TEXT)');
    seed.prepare('INSERT INTO observations (id, topic_key) VALUES (?, ?)').run(1129, 'backlog/discovery-migration-master');
    seed.prepare('INSERT INTO observations (id, topic_key) VALUES (?, ?)').run(631, 'decision/unrelated-note');
    seed.close();
  }

  function runGuard(message, { dataDir = scratch } = {}) {
    const input = JSON.stringify(stopPayload(message, { sessionId, transcriptPath }));
    const env = { ...process.env, ENGRAM_DATA_DIR: dataDir };

    try {
      const out = execFileSync(process.execPath, [GUARD_CLI], { input, encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (error) {
      return { code: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}` };
    }
  }

  const verdictOf = (run) => `${String(run.code)}/${run.out.includes('"decision":"block"') ? 'deny' : 'allow'}`;
  const degradedJournalledFor = () => {
    const journalFile = path.join(stateDir('backlog-guard'), 'refusals.jsonl');

    return existsSync(journalFile) ? readFileSync(journalFile, 'utf8').split('\n').filter((line) => line.includes(sessionId) && line.includes('"store-unreadable"')).length : 0;
  };

  // Turn 1: nothing saved yet, no pending phrase -> allow, and the offset gets recorded.
  writeFileSync(transcriptPath, '{"type":"assistant","text":"turn 1, exploring, nothing pending yet"}\n', 'utf8');
  const turn1 = runGuard(CLEAN_MESSAGE);
  check('END TO END turn 1 (no pending phrase): allowed, exit 0', `${String(turn1.code)}/${turn1.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // An intervening, non-pending turn is where the master-backlog save actually happens (a routine
  // housekeeping save, unrelated to any pending announcement) — running the guard here is what
  // advances its offset PAST the save, the same way it would after any real turn.
  appendToFile(transcriptPath, '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master"}}\n');
  const housekeepingTurn = runGuard(CLEAN_MESSAGE);
  check('END TO END housekeeping turn (save happens, no pending phrase): allowed', `${String(housekeepingTurn.code)}/${housekeepingTurn.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Turn 2: a pending phrase NOW, but the only save in the whole file sits BEFORE the offset the
  // housekeeping turn just recorded — this turn's own window never sees it -> block.
  const journalPath = path.join(stateDir('backlog-guard'), 'refusals.jsonl');
  const journalledFor = () => (existsSync(journalPath) ? readFileSync(journalPath, 'utf8').split('\n').filter((line) => line.includes(sessionId)).length : 0);
  const journalBefore = journalledFor();

  appendToFile(transcriptPath, '{"type":"assistant","text":"turn 2, found a real bug, still open for the owner"}\n');
  const turn2 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 2 (pending phrase, save was in the ALREADY-COVERED earlier window): blocked', `${String(turn2.code)}/${turn2.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/deny');
  check('END TO END turn 2: the refusal names the guard', turn2.out.includes('BACKLOG-GUARD TRIPPED'), true);
  check('END TO END turn 2: the refusal carries the Spanish half', turn2.out.includes('@es BACKLOG-GUARD SALTÓ'), true);
  check('END TO END turn 2: the refusal names the phrase that tripped it, in both languages', turn2.out.includes('worth flagging') && turn2.out.includes('nuevo («worth flagging») y este turno'), true);
  check('END TO END turn 2: the refusal offers committing the versioned document', turn2.out.includes('or commit the versioned document') && turn2.out.includes('o commiteá el documento versionado'), true);
  check('END TO END turn 2: the refusal names the dismiss escape hatch', turn2.out.includes('dismiss.mjs'), true);
  check('END TO END turn 2: the refusal is journaled as evidence', journalledFor() - journalBefore, 1);

  // Turn 3: a master-backlog save appended DURING this turn's own window (after turn 2's offset) ->
  // the SAME pending phrase now passes, because this time the save genuinely sits in this turn.
  appendToFile(transcriptPath, '{"name":"mem_save","input":{"topic_key":"backlog/1.0.0-master","content":"updated with the finding"}}\n');
  const turn3 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 3 (pending phrase, save genuinely IN this turn): allowed', `${String(turn3.code)}/${turn3.out.includes('"decision":"block"') ? 'deny' : 'allow'}`, '0/allow');

  // Turns 4-7: the mem_update face against a REAL (constructed, disposable) engram sqlite store reached
  // through `ENGRAM_DATA_DIR`, in REAL separate processes. No earlier read of the master id exists
  // anywhere in the transcript — the exact shape of the 2026-10-02 live defect (id 1129): the verdict can
  // only come from the store.
  // @es Turnos 4-7: la cara mem_update contra un almacén sqlite de engram REAL (construido y desechable)
  // alcanzado por `ENGRAM_DATA_DIR`, en procesos separados REALES. No hay lectura previa del id maestro
  // en el transcript — la forma exacta del defecto en vivo del 2026-10-02 (id 1129).
  const turn4Line = toolUseLine(UPDATE, { id: 1129, content: 'revised master, never read in any turn' });

  appendToFile(transcriptPath, `${turn4Line}\n`);
  const turn4 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 4 (mem_update of a master id that was NEVER read in the transcript): allowed', verdictOf(turn4), '0/allow');

  appendToFile(transcriptPath, `${toolUseLine(UPDATE, { id: 631, content: 'unrelated note' })}\n`);
  const turn5 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 5 (mem_update of a NON-master id): blocked', verdictOf(turn5), '0/deny');

  const degradedBefore = degradedJournalledFor();

  appendToFile(transcriptPath, `${toolUseLine(UPDATE, { id: 631, content: 'unrelated note, store gone' })}\n`);
  const turn6 = runGuard(PENDING_MESSAGE, { dataDir: path.join(scratch, 'no-engram-here') });
  check('END TO END turn 6 (mem_update, engram store missing): fails open, allowed', verdictOf(turn6), '0/allow');
  check('END TO END turn 6: the fail-open is journaled as evidence, naming the store failure', degradedJournalledFor() - degradedBefore, 1);

  appendToFile(transcriptPath, `${toolUseLine(UPDATE, { id: 1129, content: 'revised again' })}\n`);
  const turn7 = runGuard(PENDING_MESSAGE);
  check('END TO END turn 7 (store readable again, master id): allowed, and no new degradation journaled', `${verdictOf(turn7)}/${String(degradedJournalledFor() - degradedBefore)}`, '0/allow/1');

  // stop_hook_active always allows, real process included.
  const bypassed = settle(() => execFileSync(process.execPath, [GUARD_CLI], {
    input: JSON.stringify(stopPayload(PENDING_MESSAGE, { sessionId, transcriptPath, stopHookActive: true })),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  }));
  check('END TO END stop_hook_active: allowed even with a pending phrase', bypassed === 'threw' ? 'threw' : bypassed.includes('"decision":"block"'), false);

  function appendToFile(file, text) {
    writeFileSync(file, readFileSync(file, 'utf8') + text, 'utf8');
  }
}

// ---------------------------------------------------------------------------------------------
// --- the versioned master backlog document, committed, is a save. @es El documento versionado del backlog maestro, commiteado, es un guardado.
{
  const call = (command, { id = 'toolu_1', failed = false, tool = 'Bash' } = {}) =>
    [toolUseLine(tool, { command }).replace('toolu_x', id), JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: failed }] } })].join('\n');
  const GIT = 'git -C /r commit -m "docs: backlog" -- .claude/checklists/master-backlog.md';
  const BACKUP = 'node .claude/backup-repo.mjs commit -m "docs: backlog" -- checklists/master-backlog.md';

  check('a successful git commit of the master document is a save', hasMasterDocumentCommit(call(GIT)), true);
  check('a successful backup-repo commit of the master document is a save', hasMasterDocumentCommit(call(BACKUP)), true);
  check('a Windows-separator path is recognised', hasMasterDocumentCommit(call(GIT.replaceAll('/', '\\'))), true);
  check('a failed commit is not a save', hasMasterDocumentCommit(call(GIT, { failed: true })), false);
  check('a commit with no result is not a save', hasMasterDocumentCommit(toolUseLine('Bash', { command: GIT })), false);
  check('a commit of another file is not a save', hasMasterDocumentCommit(call('git commit -m x -- src/a.ts')), false);
  check('a commit without a pathspec is not a save', hasMasterDocumentCommit(call('git commit -m x checklists/master-backlog.md')), false);
  check('reading the document is not a save', hasMasterDocumentCommit(call('git log -- checklists/master-backlog.md')), false);
  check('the archive folder is not the document', hasMasterDocumentCommit(call('git commit -m x -- checklists/master-backlog-archive/a.md')), false);
  check('an empty excerpt is not a save', hasMasterDocumentCommit(''), false);
  check('decide lets a turn that committed the master document end', verdict(stopPayload(PENDING_MESSAGE), { tail: call(GIT) }).result, 'allow');
  check('decide still blocks when that commit failed', verdict(stopPayload(PENDING_MESSAGE), { tail: call(GIT, { failed: true }) }).result, 'deny');
}


// --- INTENT: the guard fires on an ANNOUNCED unrecorded item, not on a word. @es INTENCIÓN: dispara ante un ítem ANUNCIADO sin registrar, no ante una palabra.
check('a code span is not the author words', proseOutsideQuotes('run `lo anoto` now'), 'run   now');
check('a fenced block is not the author words', proseOutsideQuotes('a\n```\nlo anoto\n```\nb').includes('lo anoto'), false);
check('a quote line is not the author words', proseOutsideQuotes('> lo anoto\nok').includes('lo anoto'), false);
check('guillemets are a quotation', proseOutsideQuotes('la regla «lo anoto» dice').includes('lo anoto'), false);
check('an opener with no closer stays visible', proseOutsideQuotes('dijo "lo anoto').includes('lo anoto'), true);
check('a new announced item still blocks', findAnnouncement('Encontré un defecto. Lo anoto en el backlog cuando cierre la tanda.'), 'lo anoto en el backlog');

// --- PHRASE FORMS, not bare verbs. Each FALSE POSITIVE below is a phrase whose dismissal is recorded in
// --- `state/dismissals.jsonl` (2026-10-11 to 2026-10-18) or reported by the orchestrator on 2026-10-18; each
// --- TRUE POSITIVE announces a NEW unrecorded item. The verbs «sumo / agrego / anoto / apunto» alone also say
// --- «I add finished work to a checkpoint» or «I would add it if you ask», and «falta / queda por» also say
// --- «nothing is missing» or «stays under a threshold».
// @es FORMAS DE FRASE, no verbos sueltos. Cada FALSO POSITIVO es una frase con descarte registrado en
// @es `state/dismissals.jsonl` o reportada por el orquestador; cada VERDADERO POSITIVO anuncia un ítem NUEVO.
const FALSE_POSITIVES = [
  ['adding a finished worker fix to a checkpoint (3 dismissals of «lo sumo»)', 'Lo sumo al checkpoint-37 cuando el worker termine.'],
  ['adding a finished result to a landing (dismissal of «lo agrego»)', 'Lo agrego al checkpoint-40 en cuanto el worker confirme.'],
  ['a conditional offer to extend a report (dismissal of «lo agrego»)', 'Lo agrego si querés ampliar el esquema del informe.'],
  ['«a lo sumo» is «at most»', 'A lo sumo tarda 200 ms en el peor caso.'],
  ['noting the item inside a checkpoint (orchestrator report of «lo anoto»)', 'Lo anoto en el checkpoint-42 al aterrizar.'],
  ['«queda por debajo» is a measurement threshold (2 dismissals of «queda por»)', 'El parseo queda por debajo de los 200 ms.'],
  ['«no hace falta hacer nada» says no action is needed (dismissal of «falta hacer»)', 'No hace falta hacer nada mientras el worker termina.'],
  ['nothing left to integrate (dismissal of «pendiente de integrar»)', 'No hay nada pendiente de integrar tras el aterrizaje.'],
  ['«ya no falta integrar» (orchestrator report of «falta integrar»)', 'Ya no falta integrar nada de la tanda.'],
  ['«no hay» in front of a marker', 'No hay pendiente de integrar nada en la tanda.'],
  ['«queda por» followed by a noun, plural', 'Quedan por debajo del umbral dos mediciones.'],
  ['noting the item inside a checkpoint («apunto»)', 'Lo apunto en el checkpoint-43 al aterrizar.'],
  ['«lo que queda pendiente» describes an item recorded earlier (a labelled live turn)', 'Lo que queda pendiente, sin apuro: un runner de selftests.']
];
const TRUE_POSITIVES = [
  ['I leave an item pending', 'Lo dejo pendiente para la próxima tanda.', 'lo dejo pendiente'],
  ['an item stays pending', 'Queda pendiente el cambio del hook.', 'queda pendiente'],
  ['items stay pending', 'Quedan pendientes dos cambios del hook.', 'quedan pendientes'],
  ['I add it to the backlog', 'Lo agrego al backlog al cerrar.', 'agrego al backlog'],
  ['I add it to the backlog («sumo»)', 'Lo sumo al backlog cuando cierre.', 'sumo al backlog'],
  ['I add it to the pending list', 'Lo agrego a la lista de pendientes.', 'lo agrego a la lista'],
  ['I add it to the pending list («sumo»)', 'Lo sumo a la lista de pendientes.', 'lo sumo a la lista'],
  ['I note it as pending', 'Lo anoto como pendiente.', 'lo anoto como pendiente'],
  ['I note it for later', 'Lo apunto para después.', 'lo apunto para después'],
  ['work stays to be done', 'Queda por resolver la migración.', 'queda por'],
  ['an infinitive in -er', 'Queda por hacer el cambio del hook.', 'queda por'],
  ['an infinitive in -ir', 'Queda por definir la ruta.', 'queda por'],
  ['an infinitive right before the full stop', 'Eso queda por resolver.', 'queda por'],
  ['several things stay to be done', 'Quedan por integrar tres ramas.', 'quedan por'],
  ['something is missing to integrate', 'Falta integrar la rama del worker.', 'falta integrar'],
  ['work is pending integration', 'Hay trabajo pendiente de integrar en dos ramas.', 'pendiente de integrar'],
  ['«uno» ends in «no» but negates nothing', 'Es uno pendiente de integrar todavía.', 'pendiente de integrar'],
  ['a negator at the very start of the text is a negator', 'Nada pendiente de integrar. Queda por resolver la migración.', 'queda por'],
  ['the second occurrence is not negated even when the first is', 'No falta integrar nada, pero falta integrar la rama del worker.', 'falta integrar']
];

for (const [label, text] of FALSE_POSITIVES) check(`does not fire: ${label}`, findAnnouncement(text), undefined);
for (const [label, text, marker] of TRUE_POSITIVES) check(`still fires: ${label}`, findAnnouncement(text), marker);
check('the bare word backlog does not block', findAnnouncement('Revisé el backlog y no cambió nada.'), undefined);
check('a quoted announcement does not block', findAnnouncement('La regla dice "lo anoto" y la cumplí.'), undefined);
check('an item already recorded in the same sentence does not block', findAnnouncement('Lo anoto: ya está en el backlog.'), undefined);
check('an observation cited in the next sentence does not block', findAnnouncement('Va al backlog final.\nLo guardé en engram (#1209).'), undefined);
check('an observation reference alone records the sentence', findAnnouncement('Lo anoto como pendiente, es el #1209.'), undefined);
check('"sigue pendiente" (continues) is not new', findAnnouncement('Sigue pendiente tu decisión.'), undefined);
check('the infinitive "encolar" mentions the rule, it does not announce', findAnnouncement('Resolver en el momento en vez de encolar.'), undefined);
check('an uppercase TODO: still blocks', findAnnouncement('Quedó un TODO: reconciliar.'), 'TODO:');
check('decide lets a turn that merely names the backlog end', verdict(stopPayload('Revisé el backlog, sin cambios.'), { tail: '' }).result, 'allow');
check('findAnnouncement of a non-string is undefined', findAnnouncement(undefined), undefined);

{
  const counts = replay();
  check('every labelled false positive of the live journals is judged, 60 of them', counts.allow.total, 60);
  check('at least 58 of the 60 dismissed refusals are now allowed', counts.allow.allowed >= 58, true);
  check('all 4 genuine announcements still block', counts.block, { total: 4, blocked: 4 });
}


// THE WIRING: the guard is registered for Stop, and the REAL global manifest lists it. Read from
// `homedir()`, deliberately NOT from a path relative to this file's own location: there is exactly
// ONE real `~/.claude/hook-dispatch/manifests/stop.json` on the machine, and a mutation-proof sandbox
// copies this selftest into a throwaway directory that has no sibling `hook-dispatch/` at all — a
// path relative to `HERE` would silently read nothing there and this check would stop meaning
// anything the moment it runs inside a mutant sandbox. Under the selftest runner the home is a sandbox,
// so the tree under test is read from `SELFTEST_TREE`, which the runner sets (`selftest-runner/run.mjs`).
// @es EL CABLEADO: el manifiesto REAL, leído desde `homedir()` a propósito, nunca relativo a la
// ubicación de este fichero — un sandbox de mutación copia este selftest a un directorio sin
// `hook-dispatch/` hermano, y una ruta relativa a `HERE` leería nada ahí en silencio. Bajo el runner
// de selftests el home es un sandbox, así que el árbol bajo prueba se lee de `SELFTEST_TREE`.
{
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  check('the declaration registers Stop', declaration.registrations?.[0]?.event, 'Stop');

  const tree = process.env.SELFTEST_TREE || path.join(homedir(), '.claude');
  const manifestPath = path.join(tree, 'hook-dispatch', 'manifests', 'stop.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { guards: [] };
  check('the REAL global Stop manifest lists backlog-guard', manifest.guards.some((entry) => entry.includes('backlog-guard/guard.mjs')), true);
}

process.stdout.write(`backlog-guard.selftest: ${String(passed)} passed, ${String(failures.length)} failed\n`);

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);

process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
