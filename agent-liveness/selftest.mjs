#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF of the agent lifecycle: the recorder (`recorder.mjs`), the store it writes
 * (`lifecycle-log.mjs`) and the liveness answer that reads it (`active-owner.mjs`), on constructed state.
 *
 * THE STATE SPACE: an agent recorded as stopped / started / start-stop-start / never recorded; each with a transcript
 * that is fresh / stale / missing; a stop or a start for a DIFFERENT agent (near misses); two agents on one worktree
 * (one stopped, one started; both stopped); a start past the crash ceiling; an agent joined by the harness's
 * `worktreePath` and one joined only by the `TENANCY:` line of its brief; an id spelled `agent-<id>` and `<id>`;
 * a lifecycle file with corrupt lines, an unknown event and a bad time; the recorder on a start, a stop, a BOM,
 * garbage, a payload with no agent id, an event that is neither, and a write that cannot happen; and the real
 * dispatcher run on real-shaped SubagentStart and SubagentStop payloads from the two real manifests.
 *
 * @es PRUEBA DE DISCRIMINACIÓN del ciclo de vida de agentes: el registrador, el almacén que escribe y la
 * respuesta de vivacidad que lo lee, sobre estado construido. Espacio de estados: un agente registrado como
 * parado / arrancado / start-stop-start / nunca registrado, cada uno con transcript fresco / viejo / ausente; un
 * stop o un start de OTRO agente (casi-aciertos); dos agentes en un worktree; un start pasado el techo de caída;
 * un agente unido por `worktreePath` del harness y otro solo por la línea `TENANCY:` de su brief; el id escrito
 * `agent-<id>` y `<id>`; un fichero con líneas corruptas, evento desconocido y hora mala; el registrador con un
 * start, un stop, un BOM, basura, un payload sin id, un evento ajeno y una escritura imposible; y el dispatcher
 * real con payloads reales de SubagentStart y SubagentStop de los dos manifiestos reales.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('agent-liveness');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (relative) => import(pathToFileURL(path.join(HERE, relative)).href);
const { ACTIVE_WINDOW_MS, STARTED_CEILING_MS, activeOwner } = await load('active-owner.mjs');
const { agentKey, lifecycleFrom, lifecyclePath, readLifecycle } = await load('lifecycle-log.mjs');
const { evaluate, lineOf } = await load('recorder.mjs');
const { dispatch } = await load('../hook-dispatch/dispatch.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * Runs one section of checks. A production path that THROWS is a failed check of that section, never a crash of
 * the selftest: a crash proves nothing about which decision broke.
 * @es Corre una sección de checks. Un camino de producción que LANZA es un check fallido de la sección, nunca una
 * caída del selftest: una caída no prueba qué decisión se rompió.
 */
async function section(name, run) {
  try {
    await run();
  } catch (error) {
    failures.push(`${name} — threw ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A run that exits before its summary is reported as a failed check. @es Una corrida que sale antes del resumen cuenta como fallo. */
let summarised = false;
process.on('exit', () => {
  if (summarised) return;

  process.stdout.write('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen\n');
  process.exitCode = 1;
});

const scratch = mkdtempSync(path.join(os.tmpdir(), 'agent-lifecycle-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));

const NOW = Date.parse('2026-10-12T12:00:00.000Z');
const MINUTE = 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

/** A transcript written `ageMs` before NOW, or the path of one that does not exist. @es Un transcript escrito hace `ageMs`, o la ruta de uno inexistente. */
function transcript(name, ageMs, content = '{}\n') {
  const file = path.join(scratch, 'transcripts', `${name}.jsonl`);

  if (ageMs === undefined) return file;

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  utimesSync(file, new Date(NOW - ageMs), new Date(NOW - ageMs));

  return file;
}

/** A harness record joined to a worktree by the harness's own path. @es Un registro unido a un worktree por la ruta del harness. */
const isolated = (id, worktree, transcriptFile) => ({ id, worktree, worktreePath: `C:/repo/.claude/worktrees/${worktree}`, transcript: transcriptFile });

/** A record with no worktree of its own: joined only through the TENANCY line of its brief. @es Un registro sin worktree propio. */
const taker = (id, transcriptFile) => ({ id, worktree: '', worktreePath: '', transcript: transcriptFile });

const brief = (tenancy) => `${JSON.stringify({ message: { content: `MEASURED: x\nTENANCY: ${tenancy}\nGOAL: y` } })}\n`;

/** A lifecycle map from `[event, id, ageMs]` triples, in file order. @es Un mapa de ciclo de vida a partir de ternas. */
const recorded = (...events) => lifecycleFrom(events.map(([event, id, ageMs]) => JSON.stringify({ event, agent_id: id, time: iso(NOW - ageMs) })).join('\n'));

const idOf = (owner) => owner?.id;
const ownerOf = (worktree, records, lifecycle) => activeOwner(`C:/repo/.claude/worktrees/${worktree}`, records, NOW, lifecycle);

// --- 1. a recorded STOP means stopped, immediately -------------------------------------------------------------
await section("1. a recorded STOP means stopped, immediately", async () => {
  const fresh = transcript('a1', 5 * 1000);

  check('a finished agent with a fresh transcript reads stopped', idOf(ownerOf('wt1', [isolated('agent-a1', 'wt1', fresh)], recorded(['start', 'a1', 20 * MINUTE], ['stop', 'a1', 10 * 1000]))), undefined);
  check('the same agent with NO lifecycle record keeps the window rule: working', idOf(ownerOf('wt1', [isolated('agent-a1', 'wt1', fresh)], recorded())), 'agent-a1');
  check('a stop alone (no start recorded) is stopped', idOf(ownerOf('wt1', [isolated('agent-a1', 'wt1', fresh)], recorded(['stop', 'a1', 1000]))), undefined);
});

// --- 2. a recorded START with no stop means working, before any write ------------------------------------------
await section("2. a recorded START with no stop means working, before any write", async () => {
  const missing = transcript('a2', undefined);
  const owner = ownerOf('wt2', [isolated('agent-a2', 'wt2', missing)], recorded(['start', 'a2', 3 * MINUTE]));

  check('a just-started agent with no transcript reads working', idOf(owner), 'agent-a2');
  check('its quiet time counts from its start', owner?.quietForMs, 3 * MINUTE);
  check('the same agent with NO lifecycle record and no transcript is not live', idOf(ownerOf('wt2', [isolated('agent-a2', 'wt2', missing)], recorded())), undefined);

  const stale = transcript('a2s', 2 * 60 * MINUTE);

  check('a started agent whose transcript is hours old is still working', idOf(ownerOf('wt2', [isolated('agent-a2s', 'wt2', stale)], recorded(['start', 'a2s', 3 * 60 * MINUTE]))), 'agent-a2s');
  check('its quiet time counts from the latest sign: the later write', ownerOf('wt2', [isolated('agent-a2s', 'wt2', stale)], recorded(['start', 'a2s', 3 * 60 * MINUTE]))?.quietForMs, 2 * 60 * MINUTE);
  check('a start on a worktree of another name is not an owner there', idOf(ownerOf('other', [isolated('agent-a2', 'wt2', missing)], recorded(['start', 'a2', 1000]))), undefined);
  check('the worktree name is compared without case', idOf(ownerOf('WT2', [isolated('agent-a2', 'wt2', missing)], recorded(['start', 'a2', 1000]))), 'agent-a2');
  check('the record\'s own name is compared without case too', idOf(ownerOf('wt2', [isolated('agent-a2', 'Wt2', missing)], recorded(['start', 'a2', 1000]))), 'agent-a2');
  check('a path with no name is no worktree of anyone', idOf(activeOwner('', [isolated('agent-a2', 'wt2', missing)], NOW, recorded(['start', 'a2', 1000]))), undefined);
});

// --- 3. no lifecycle record keeps TODAY'S window behaviour ------------------------------------------------------
await section("3. no lifecycle record keeps TODAY'S window behaviour", async () => {
  check('unrecorded + written a minute ago: working', idOf(ownerOf('wt3', [isolated('agent-a3', 'wt3', transcript('a3f', MINUTE))], recorded())), 'agent-a3');
  check('unrecorded + written just inside the window: working', idOf(ownerOf('wt3', [isolated('agent-a3', 'wt3', transcript('a3e', ACTIVE_WINDOW_MS - 1000))], recorded())), 'agent-a3');
  check('unrecorded + written exactly at the window: not working', idOf(ownerOf('wt3', [isolated('agent-a3', 'wt3', transcript('a3w', ACTIVE_WINDOW_MS))], recorded())), undefined);
  check('unrecorded + written an hour ago: not working', idOf(ownerOf('wt3', [isolated('agent-a3', 'wt3', transcript('a3h', 60 * MINUTE))], recorded())), undefined);
  check('the default lifecycle (nothing recorded in this state) is the window rule', idOf(activeOwner('C:/repo/.claude/worktrees/wt3', [isolated('agent-a3', 'wt3', transcript('a3d', MINUTE))], NOW)), 'agent-a3');
});

// --- 4. near misses --------------------------------------------------------------------------------------------
await section("4. near misses", async () => {
  const fresh = transcript('a4', MINUTE);
  const own = [isolated('agent-a4', 'wt4', fresh)];

  check('a stop for a DIFFERENT agent does not stop this one', idOf(ownerOf('wt4', own, recorded(['stop', 'zzz', 1000]))), 'agent-a4');
  check('a start for a different agent does not make this one work when it is quiet', idOf(ownerOf('wt4', [isolated('agent-a4', 'wt4', transcript('a4q', 90 * MINUTE))], recorded(['start', 'zzz', 1000]))), undefined);
  check('a stop whose id merely CONTAINS this id does not stop it', idOf(ownerOf('wt4', own, recorded(['stop', 'a44', 1000]))), 'agent-a4');
  check('an id recorded as agent-<id> matches the record id', idOf(ownerOf('wt4', own, recorded(['stop', 'agent-a4', 1000]))), undefined);
  check('an id recorded bare matches the agent- record id', idOf(ownerOf('wt4', own, recorded(['stop', 'a4', 1000]))), undefined);
  check('start, stop, start of the SAME agent is working', idOf(ownerOf('wt4', own, recorded(['start', 'a4', 30 * MINUTE], ['stop', 'a4', 20 * MINUTE], ['start', 'a4', 10 * MINUTE]))), 'agent-a4');
  check('start, start, stop of the same agent is stopped', idOf(ownerOf('wt4', own, recorded(['start', 'a4', 30 * MINUTE], ['start', 'a4', 20 * MINUTE], ['stop', 'a4', 10 * MINUTE]))), undefined);

  const first = isolated('agent-first', 'wt5', transcript('first', 2 * 1000));
  const second = isolated('agent-second', 'wt5', transcript('second', undefined));

  check('start A, stop A, then a NEW start of agent B on the same worktree: B is the owner', idOf(ownerOf('wt5', [first, second], recorded(['start', 'first', 20 * MINUTE], ['stop', 'first', 10 * MINUTE], ['start', 'second', 5 * MINUTE]))), 'agent-second');
  check('the same with the records in the other order', idOf(ownerOf('wt5', [second, first], recorded(['start', 'first', 20 * MINUTE], ['stop', 'first', 10 * MINUTE], ['start', 'second', 5 * MINUTE]))), 'agent-second');
  check('both stopped: nobody works on that worktree', idOf(ownerOf('wt5', [first, second], recorded(['start', 'first', 20 * MINUTE], ['stop', 'first', 10 * MINUTE], ['start', 'second', 8 * MINUTE], ['stop', 'second', 5 * MINUTE]))), undefined);
  check('a stopped agent on the worktree does not hide an unrecorded writing one', idOf(ownerOf('wt5', [first, isolated('agent-legacy', 'wt5', transcript('legacy', MINUTE))], recorded(['stop', 'first', 10 * 1000]))), 'agent-legacy');
});

// --- 5. a START with no STOP older than the ceiling is a crashed session ---------------------------------------
await section("5. a START with no STOP older than the ceiling is a crashed session", async () => {
  const old = STARTED_CEILING_MS + MINUTE;

  check('a start past the ceiling with a quiet transcript is stopped', idOf(ownerOf('wt6', [isolated('agent-a6', 'wt6', transcript('a6q', 90 * MINUTE))], recorded(['start', 'a6', old]))), undefined);
  check('a start past the ceiling with no transcript is stopped', idOf(ownerOf('wt6', [isolated('agent-a6', 'wt6', transcript('a6m', undefined))], recorded(['start', 'a6', old]))), undefined);
  check('a start past the ceiling whose transcript is fresh is working (the window rule)', idOf(ownerOf('wt6', [isolated('agent-a6', 'wt6', transcript('a6f', MINUTE))], recorded(['start', 'a6', old]))), 'agent-a6');
  check('a start just inside the ceiling is working', idOf(ownerOf('wt6', [isolated('agent-a6', 'wt6', transcript('a6i', 90 * MINUTE))], recorded(['start', 'a6', STARTED_CEILING_MS - MINUTE]))), 'agent-a6');
  check('a start exactly at the ceiling is read as unrecorded: a quiet transcript means stopped', idOf(ownerOf('wt6', [isolated('agent-a6', 'wt6', transcript('a6x', 90 * MINUTE))], recorded(['start', 'a6', STARTED_CEILING_MS]))), undefined);
  check('a stop past the ceiling is still a stop', idOf(ownerOf('wt6', [isolated('agent-a6', 'wt6', transcript('a6s', MINUTE))], recorded(['stop', 'a6', old]))), undefined);
});

// --- 6. an agent joined only by the TENANCY line of its brief ---------------------------------------------------
await section("6. an agent joined only by the TENANCY line of its brief", async () => {
  // REAL worktrees on disk: a linked worktree keeps `.git` as a FILE, a main checkout as a directory. The linked
  // one lives under `.claude-wt/`, NOT under a `worktrees/` folder, so the answer cannot come from the folder name.
  // @es Worktrees REALES en disco: uno enlazado guarda `.git` como FICHERO; uno principal, como directorio. El
  // enlazado vive bajo `.claude-wt/`, NO bajo una carpeta `worktrees/`, así que la respuesta no sale del nombre.
  const tenant = 'wt7';
  const linkedAt = (name) => {
    const dir = path.join(scratch, '.claude-wt', name);

    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '.git'), `gitdir: /somewhere/.git/worktrees/${name}`);

    return dir.split(path.sep).join('/');
  };
  const mainCheckout = path.join(scratch, 'main-checkout');

  mkdirSync(path.join(mainCheckout, '.git'), { recursive: true });

  const tenantPath = linkedAt(tenant);
  const elsewhere = linkedAt('elsewhere');
  const claimed = transcript('t7', 90 * MINUTE, brief(tenantPath));
  const unclaimed = transcript('t7n', 90 * MINUTE, brief(elsewhere));
  const ownerAt = (records, lifecycle, where = tenantPath) => activeOwner(where, records, NOW, lifecycle);

  check('a started taker whose brief names the worktree is working though quiet', idOf(ownerAt([taker('agent-t7', claimed)], recorded(['start', 't7', 100 * MINUTE]))), 'agent-t7');
  check('a started taker whose brief names ANOTHER worktree is not an owner', idOf(ownerAt([taker('agent-t7n', unclaimed)], recorded(['start', 't7n', 100 * MINUTE]))), undefined);
  check('a started taker with no transcript yet cannot be joined', idOf(ownerAt([taker('agent-t7m', transcript('t7m', undefined))], recorded(['start', 't7m', MINUTE]))), undefined);
  check('a stopped taker is stopped though its brief claims the worktree and it wrote a second ago', idOf(ownerAt([taker('agent-t7s', transcript('t7s', 1000, brief(tenantPath)))], recorded(['stop', 't7s', 500]))), undefined);
  check('an unrecorded taker keeps the window rule through its brief', idOf(ownerAt([taker('agent-t7u', transcript('t7u', MINUTE, brief(tenantPath)))], recorded())), 'agent-t7u');
  check('a taker never claims the main checkout (its .git is a directory)', idOf(ownerAt([taker('agent-t7c', transcript('t7c', MINUTE, brief(mainCheckout)))], recorded(['start', 't7c', MINUTE]), mainCheckout)), undefined);
  check('a taker never claims a path that has no .git at all', idOf(ownerAt([taker('agent-t7p', transcript('t7p', MINUTE, brief(scratch)))], recorded(['start', 't7p', MINUTE]), scratch)), undefined);
  check('a linked worktree outside any worktrees/ folder is joined by the brief (the folder name decides nothing)', path.basename(path.dirname(tenantPath)), '.claude-wt');
});

// --- 7. the store: keys, corrupt text, a missing file ----------------------------------------------------------
await section("7. the store: keys, corrupt text, a missing file", async () => {
  check('agentKey strips the harness prefix', agentKey('agent-abc'), 'abc');
  check('agentKey keeps a bare id', agentKey('abc'), 'abc');
  check('agentKey refuses an empty id', agentKey(''), undefined);
  check('agentKey refuses the bare prefix', agentKey('agent-'), undefined);
  check('agentKey refuses a non-string', agentKey(42), undefined);

  const text = [
    'not json',
    JSON.stringify({ event: 'start', agent_id: 'good', time: iso(NOW) }),
    JSON.stringify({ event: 'pause', agent_id: 'unknown-event', time: iso(NOW) }),
    JSON.stringify({ event: 'start', agent_id: 'bad-time', time: 'yesterday-ish' }),
    JSON.stringify({ event: 'start', time: iso(NOW) }),
    JSON.stringify({ event: 'malfunction', time: iso(NOW), why: 'x' }),
    '',
    '{"event":"stop","agent_id":"torn'
  ].join('\n');
  const map = lifecycleFrom(text);

  check('only the one valid line is kept', [...map.keys()], ['good']);
  check('its event and time are kept', map.get('good'), { event: 'start', at: NOW });
  check('an empty text records nothing', lifecycleFrom('').size, 0);
  check('a lifecycle file that does not exist reads as nothing recorded', existsSync(lifecyclePath()) ? 'exists' : readLifecycle().size, 0);
});

// --- 8. the recorder ---------------------------------------------------------------------------------------------
await section("8. the recorder", async () => {
  const lines = () => (existsSync(lifecyclePath()) ? readFileSync(lifecyclePath(), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []);
  const start = { session_id: 's1', transcript_path: 'C:/t/main.jsonl', cwd: 'C:/repo/.claude/worktrees/wtR', hook_event_name: 'SubagentStart', agent_id: 'ar1', agent_type: 'general-purpose' };
  const stop = { ...start, hook_event_name: 'SubagentStop', stop_hook_active: false, agent_transcript_path: 'C:/t/subagents/agent-ar1.jsonl', last_assistant_message: 'done' };
  const when = new Date(NOW);

  check('a start never blocks', evaluate(JSON.stringify(start), { now: when }), undefined);
  check('a stop never blocks', evaluate(JSON.stringify(stop), { now: when }), undefined);
  check('two lines were recorded', lines().length, 2);
  check('the start line', lines()[0], { event: 'start', agent_id: 'ar1', time: iso(NOW), cwd: 'C:/repo/.claude/worktrees/wtR', session_id: 's1', agent_type: 'general-purpose', keys: ['agent_id', 'agent_type', 'cwd', 'hook_event_name', 'session_id', 'transcript_path'] });
  check('the stop line keeps the agent transcript and the payload keys', [lines()[1].event, lines()[1].transcript, lines()[1].keys.includes('last_assistant_message')], ['stop', 'C:/t/subagents/agent-ar1.jsonl', true]);
  check('what the recorder wrote is what the reader reads: stopped', readLifecycle().get('ar1'), { event: 'stop', at: NOW });

  evaluate(JSON.stringify({ ...start, agent_id: 'ar2' }), { now: when });
  check('and a later start of another agent reads as started', readLifecycle().get('ar2'), { event: 'start', at: NOW });

  const before = lines().length;

  check('an event that is neither a start nor a stop records nothing', (evaluate(JSON.stringify({ ...start, hook_event_name: 'Stop' }), { now: when }), lines().length), before);
  check('a payload with no event name records nothing', (evaluate(JSON.stringify({ agent_id: 'x' }), { now: when }), lines().length), before);
  check('a BOM before valid JSON is read', (evaluate(`﻿${JSON.stringify({ ...start, agent_id: 'ar3' })}`, { now: when }), readLifecycle().get('ar3')?.event), 'start');
  check('garbage never blocks', evaluate('{not json', { now: when }), undefined);
  check('garbage is recorded as a malfunction', lines().at(-1).event, 'malfunction');
  check('a start with no agent id is a malfunction, not a start', (evaluate(JSON.stringify({ ...start, agent_id: undefined }), { now: when }), lines().at(-1)), { event: 'malfunction', time: iso(NOW), why: 'SubagentStart without agent_id', keys: ['agent_type', 'cwd', 'hook_event_name', 'session_id', 'transcript_path'] });
  check('a malfunction line never makes an agent live', [...readLifecycle().keys()].sort(), ['ar1', 'ar2', 'ar3']);
  check('lineOf of a non-object is nothing', [lineOf(null), lineOf('x'), lineOf(undefined)], [undefined, undefined, undefined]);
});

// --- 9. a write that cannot happen: fail open --------------------------------------------------------------------
await section("9. a write that cannot happen: fail open", async () => {
  const blocked = mkdtempSync(path.join(os.tmpdir(), 'agent-lifecycle-blocked-'));
  const file = path.join(blocked, 'a-file-not-a-directory');

  writeFileSync(file, 'x');

  const saved = process.env.HOOK_STATE_DIR;

  process.env.HOOK_STATE_DIR = file;

  let result;
  let threw = false;

  try {
    result = evaluate(JSON.stringify({ hook_event_name: 'SubagentStart', agent_id: 'ar9' }), { now: new Date(NOW) });
  } catch {
    threw = true;
  }

  process.env.HOOK_STATE_DIR = saved;
  rmSync(blocked, { recursive: true, force: true });
  check('an impossible write neither throws nor blocks', [threw, result], [false, undefined]);
});

// --- 10. the real dispatcher on real-shaped payloads from the real manifests -----------------------------------
await section("10. the real dispatcher on real-shaped payloads from the real manifests", async () => {
  const manifests = path.join(HERE, '..', 'hook-dispatch', 'manifests');
  const startManifest = path.join(manifests, 'subagent-start.json');
  const stopManifest = path.join(manifests, 'subagent-stop.json');
  const recorderEntry = '../../agent-liveness/recorder.mjs';
  const own = (event) => {
    const file = path.join(scratch, `${event}.json`);

    writeFileSync(file, JSON.stringify({ event, guards: [path.relative(scratch, path.join(HERE, 'recorder.mjs')).split(path.sep).join('/')] }));

    return file;
  };
  const payload = (event, agent) => JSON.stringify({ session_id: 's9', transcript_path: 'C:/t/main.jsonl', cwd: 'C:/repo/.claude/worktrees/wtD', prompt_id: 'p9', hook_event_name: event, agent_id: agent, agent_type: 'general-purpose', ...(event === 'SubagentStop' ? { stop_hook_active: false, agent_transcript_path: `C:/t/subagents/agent-${agent}.jsonl`, last_assistant_message: 'ok' } : {}) });

  check('the SubagentStart manifest is for the SubagentStart event and runs the recorder', [JSON.parse(readFileSync(startManifest, 'utf8')).event, JSON.parse(readFileSync(startManifest, 'utf8')).guards.includes(recorderEntry)], ['SubagentStart', true]);
  check('the SubagentStop manifest runs the recorder', JSON.parse(readFileSync(stopManifest, 'utf8')).guards.includes(recorderEntry), true);

  const started = await dispatch(own('SubagentStart'), payload('SubagentStart', 'ad1'));
  const stopped = await dispatch(own('SubagentStop'), payload('SubagentStop', 'ad1'));

  check('through the dispatcher a SubagentStart has no verdict and no problem', [started.output ?? null, started.problems], [null, []]);
  check('through the dispatcher a SubagentStop has no verdict and no problem', [stopped.output ?? null, stopped.problems], [null, []]);
  check('the dispatched stop is the last thing recorded about the agent', readLifecycle().get('ad1')?.event, 'stop');

  const afterStart = await dispatch(own('SubagentStart'), payload('SubagentStart', 'ad2'));

  check('a dispatched start alone leaves the agent working', [afterStart.problems, readLifecycle().get('ad2')?.event], [[], 'start']);
});

summarised = true;
process.stdout.write(failures.length === 0 ? `${passed}/${passed} cases green @es ${passed}/${passed} casos en verde\n` : `${failures.map((line) => `FAIL ${line}`).join('\n')}\n${passed} passed, ${failures.length} failed @es ${passed} pasan, ${failures.length} fallan\n`);
process.exit(failures.length === 0 ? 0 : 1);
