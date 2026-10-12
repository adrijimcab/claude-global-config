#!/usr/bin/env node
/**
 * Proof of the SubagentStop reaper hook, through the REAL dispatcher with a real-shaped payload (the fields the
 * agent SDK types and the changelog name: `hook_event_name`, `agent_id`, `agent_transcript_path`, `agent_type`,
 * `stop_hook_active`, `session_id`, `transcript_path`, `cwd`, `permission_mode`). A fixture harness store holds
 * the agent's transcript and meta file; a process the selftest spawned names the fixture worktree. The hook
 * must end that process and never return a verdict. Also proved: the worktree is derived from the meta file and,
 * failing that, from the brief's TENANCY line; a main checkout is refused and its process survives; another
 * event, garbage and a BOM never throw and never block; a malfunction of the reaper is recorded; the record
 * keeps the payload keys; and the SubagentStop manifest registers the hook with a sidecar for that event.
 * @es Prueba del hook segador de SubagentStop, por el dispatcher REAL con un payload de forma real (los campos
 * que nombran los tipos del SDK y el changelog). Un almacén de harness construido guarda el transcript y el
 * meta del agente; un proceso lanzado por el selftest nombra el worktree del fixture. El hook debe terminarlo y
 * nunca devolver veredicto. También: el worktree sale del meta y, si falta, de la línea TENANCY del brief; un
 * checkout principal se rechaza y su proceso sobrevive; otro evento, basura y un BOM no lanzan ni bloquean; un
 * fallo del segador se registra; el registro guarda las claves del payload; y el manifiesto registra el hook.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';

isolateState('process-reaper');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { evaluate } = await import(pathToFileURL(path.join(HERE, 'reap-on-subagent-stop.mjs')).href);
const { stoppedAgentOf } = await import(pathToFileURL(path.join(HERE, 'stopped-agent.mjs')).href);
const { dispatch } = await import(pathToFileURL(path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs')).href);
const { listProcesses } = await import(pathToFileURL(path.join(HERE, '..', 'worker-status', 'processes.mjs')).href);

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

/** The value of `run`, or 'THROWS' so a crash is a failed check and not an aborted selftest. @es El valor, o 'THROWS'. */
const attempt = (run) => {
  try {
    return run();
  } catch {
    return 'THROWS';
  }
};

const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'reap-hook-')));
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const journal = () => {
  const file = path.join(stateDir('process-reaper'), 'reaps.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
};
const profile = path.join(root, 'profile');
mkdirSync(profile);
// Every process listing this selftest causes (its own and the hook's) runs with a PRIVATE profile: PowerShell writes its profile folders there, never into the real home. @es Todo listado de procesos que causa este selftest corre con un perfil PRIVADO.
Object.assign(process.env, { USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(profile, 'AppData', 'Local') });
const running = (pid) => listProcesses().some((entry) => entry.pid === pid);
const spawned = [];
const holderFor = (directory) => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', directory], { stdio: 'ignore', windowsHide: true });
  spawned.push(child);
  return child;
};
const linkedWorktree = (name) => {
  const directory = path.join(root, name);
  mkdirSync(directory);
  writeFileSync(path.join(directory, '.git'), 'gitdir: elsewhere\n');
  return directory;
};

/** A harness store: the transcript with its brief, and optionally the meta file. @es Un almacén de harness. */
function harnessAgent(id, { brief = 'a brief with no tenancy', meta } = {}) {
  const directory = path.join(root, 'projects', 'p', 'session-1', 'subagents');
  mkdirSync(directory, { recursive: true });
  const transcript = path.join(directory, `agent-${id}.jsonl`);
  writeFileSync(transcript, `${JSON.stringify({ type: 'user', message: { content: brief } })}\n`);
  if (meta !== undefined) writeFileSync(path.join(directory, `agent-${id}.meta.json`), JSON.stringify(meta));
  return transcript;
}
const payloadFor = (id, transcript, extra = {}) => ({
  session_id: 'session-1',
  transcript_path: path.join(root, 'projects', 'p', 'session-1.jsonl'),
  cwd: root,
  permission_mode: 'default',
  hook_event_name: 'SubagentStop',
  stop_hook_active: false,
  agent_id: id,
  agent_transcript_path: transcript,
  agent_type: 'general-purpose',
  last_assistant_message: 'done',
  ...extra
});

// The dispatcher with a manifest that holds only this hook, so the proof does not depend on the fleet.
// @es El dispatcher con un manifiesto que solo tiene este hook, para no depender del resto de la flota.
const manifest = path.join(root, 'subagent-stop.json');
writeFileSync(manifest, JSON.stringify({ event: 'SubagentStop', guards: [path.relative(root, path.join(HERE, 'reap-on-subagent-stop.mjs')).split(path.sep).join('/')] }));
const stopThrough = (payload) => dispatch(manifest, typeof payload === 'string' ? payload : JSON.stringify(payload));

try {
  // 1. The worktree comes from the meta file. @es El worktree sale del meta.
  const wtMeta = linkedWorktree('wt-meta');
  const idMeta = 'ab12cd34ef56ab78c';
  const viaMeta = holderFor(wtMeta);
  const bystander = holderFor(path.join(root, 'bystander'));
  await wait(2000);
  check('precondition: the process naming the worktree runs', running(viaMeta.pid), true);
  const transcriptMeta = harnessAgent(idMeta, { meta: { worktreePath: wtMeta, description: 'fixture' } });
  const stopped = await stopThrough(payloadFor(idMeta, transcriptMeta));
  await wait(1500);
  check('through the dispatcher there is no verdict and no problem', [stopped.output ?? null, stopped.problems], [null, []]);
  check('the process naming the meta worktree is dead', running(viaMeta.pid), false);
  check('an unrelated process survives', running(bystander.pid), true);
  const [first] = journal();
  check('the record names the agent and the derived worktree', [first?.agentId, first?.worktree], [idMeta, wtMeta]);
  check('the record keeps the payload keys, sorted', first?.keys, ['agent_id', 'agent_transcript_path', 'agent_type', 'cwd', 'hook_event_name', 'last_assistant_message', 'permission_mode', 'session_id', 'stop_hook_active', 'transcript_path']);
  // `killed` also counts the unnamed children of the killed tree, which the operating system may add. @es `killed` cuenta también los hijos sin nombre del árbol muerto, que el sistema puede añadir.
check('the record counts what was matched and killed', [first?.matched, first?.killed >= 1, first?.survivors], [1, true, 0]);

  // 2. No meta: the worktree comes from the brief's TENANCY line. @es Sin meta: del TENANCY del brief.
  const wtBrief = linkedWorktree('wt-brief');
  const idBrief = 'ff00ee11dd22cc33b';
  const viaBrief = holderFor(wtBrief);
  await wait(2000);
  const transcriptBrief = harnessAgent(idBrief, { brief: `MEASURED: x\nTENANCY: you write ONLY inside ${wtBrief} and your scratch.` });
  await stopThrough(payloadFor(idBrief, transcriptBrief));
  await wait(1500);
  check('the process naming the TENANCY worktree is dead', running(viaBrief.pid), false);

  // 3. A main checkout named by the brief is refused and its process survives. @es Un checkout principal se rechaza.
  const mainCheckout = path.join(root, 'main-checkout');
  mkdirSync(path.join(mainCheckout, '.git'), { recursive: true });
  const idMain = '1122334455667788a';
  const viaMain = holderFor(mainCheckout);
  await wait(2000);
  await stopThrough(payloadFor(idMain, harnessAgent(idMain, { brief: `TENANCY: ${mainCheckout}` })));
  await wait(500);
  check('a process naming a main checkout survives', running(viaMain.pid), true);
  check('the refusal is recorded', journal().at(-1)?.refused, 'not-a-linked-worktree');

  // 4. Other events, garbage and a BOM. @es Otros eventos, basura y un BOM.
  const wtOther = linkedWorktree('wt-other');
  const idOther = '99aa88bb77cc66dd5';
  const viaOther = holderFor(wtOther);
  await wait(2000);
  const transcriptOther = harnessAgent(idOther, { meta: { worktreePath: wtOther } });
  const before = journal().length;
  check('a Stop payload is ignored', attempt(() => evaluate(JSON.stringify(payloadFor(idOther, transcriptOther, { hook_event_name: 'Stop' })))), undefined);
  check('a Stop payload writes no record', journal().length, before);
  check('a Stop payload kills nothing', running(viaOther.pid), true);
  check('garbage never blocks', attempt(() => evaluate('{not json')), undefined);
  check('garbage is recorded as a malfunction', typeof journal().at(-1)?.malfunction, 'string');
  check('a BOM before valid JSON is read and reaps', (attempt(() => evaluate(`﻿${JSON.stringify(payloadFor(idOther, transcriptOther))}`)), journal().at(-1)?.agentId), idOther);
  await wait(1500);
  check('the BOM payload reaped the worktree process', running(viaOther.pid), false);
  check('a reaper that throws is recorded and never blocks', [attempt(() => evaluate(JSON.stringify(payloadFor(idOther, transcriptOther)), { reap: () => { throw new Error('boom'); } })), journal().at(-1)?.malfunction], [undefined, 'boom']);

  // 4b. No worktree anywhere: the agent id alone names its scratch. @es Sin worktree: el id solo nombra su scratch.
  const idScratch = 'c0ffee00c0ffee00d';
  const scratch = path.join(root, 'fleet-env', 'scratch', idScratch);
  mkdirSync(scratch, { recursive: true });
  const viaScratch = holderFor(scratch);
  await wait(2000);
  await stopThrough(payloadFor(idScratch, harnessAgent(idScratch)));
  await wait(1500);
  check('with no worktree the agent id still reaps its scratch process', running(viaScratch.pid), false);

  // 5. What the payload says. @es Lo que dice el payload.
  check('a payload without agent fields yields nothing', stoppedAgentOf({ hook_event_name: 'SubagentStop' }), {});
  check('an empty agent id is no id', stoppedAgentOf({ agent_id: '', agent_transcript_path: '' }), {});
  check('a transcript that is not a .jsonl has no meta to read', stoppedAgentOf({ agent_id: 'x'.repeat(10), agent_transcript_path: path.join(root, 'nothing.txt') }, () => ''), { agentId: 'xxxxxxxxxx' });

  // 6. The registration. @es El registro.
  const registered = JSON.parse(readFileSync(path.join(HERE, '..', 'hook-dispatch', 'manifests', 'subagent-stop.json'), 'utf8'));
  check('the SubagentStop manifest registers the hook', registered.guards.includes('../../process-reaper/reap-on-subagent-stop.mjs'), true);
  check('the manifest event is SubagentStop', registered.event, 'SubagentStop');
  const sidecar = JSON.parse(readFileSync(path.join(HERE, 'reap-on-subagent-stop.mjs.hook-registration.json'), 'utf8'));
  check('the sidecar registers the SubagentStop event only', sidecar.registrations.map((entry) => entry.event), ['SubagentStop']);
} finally {
  for (const child of spawned) {
    try {
      process.kill(child.pid);
    } catch {
      /* already gone @es ya muerto */
    }
  }
  await wait(300);
  rmSync(root, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
