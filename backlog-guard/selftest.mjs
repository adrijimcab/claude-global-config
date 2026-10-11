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
import { findPendingMarker, PENDING_MARKERS } from './markers.mjs';
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
function verdict(payload, { offset = 0, tail = '', size = undefined, store = {}, storeErrors = {} } = {}) {
  const writes = [];
  const lookups = [];
  const degraded = [];
  const decision = decide(payload, {
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
  });

  return { result: decision === undefined ? 'allow' : 'deny', writes, lookups, degraded };
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
check('malformed JSON -> evaluate() allows (undefined)', evaluate('NOT JSON AT ALL'), undefined);
check('empty stdin -> evaluate() allows (undefined)', evaluate(''), undefined);
check('BOM + valid JSON is still parsed (PowerShell 5.1 shape)', evaluate(`\ufeff${JSON.stringify(stopPayload(CLEAN_MESSAGE))}`), undefined);

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
  decide(stopPayload(PENDING_MESSAGE), { readState: () => undefined, writeState: () => {}, readTail: () => undefined, sizeOf: () => undefined }) === undefined,
  true
);

// ---------------------------------------------------------------------------------------------
// DIAGNOSTICS: the marker/topic_key primitives, in isolation.
// ---------------------------------------------------------------------------------------------
check('findPendingMarker finds a real owner-named root', findPendingMarker('This is still open and worth flagging.'), 'still open');
check('findPendingMarker does not fire on the bare Spanish word "todo" alone', findPendingMarker('Corrí todo el árbol y todo salió verde.'), undefined);
check('findPendingMarker fires on the list/comment shape "todo:"', findPendingMarker('todo: reconciliar node_modules'), 'todo:');
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
      const out = execFileSync(process.execPath, [GUARD_CLI], { input, encoding: 'utf8', env });
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
  const bypassed = execFileSync(process.execPath, [GUARD_CLI], {
    input: JSON.stringify(stopPayload(PENDING_MESSAGE, { sessionId, transcriptPath, stopHookActive: true })),
    encoding: 'utf8'
  });
  check('END TO END stop_hook_active: allowed even with a pending phrase', bypassed.includes('"decision":"block"'), false);

  rmSync(scratch, { recursive: true, force: true });

  function appendToFile(file, text) {
    writeFileSync(file, readFileSync(file, 'utf8') + text, 'utf8');
  }
}

// ---------------------------------------------------------------------------------------------
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
