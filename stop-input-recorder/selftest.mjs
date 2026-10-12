#!/usr/bin/env node
/**
 * Proof of the stop-input recorder: a stop and a re-stop each append one record with the right flag, length,
 * hash and excerpts; a payload without the message records its absence; garbage and a BOM do not throw and never
 * block; and the dispatcher runs it from the Stop manifest without a verdict.
 * @es Prueba del registrador de entradas de parada: una parada y una re-parada añaden un registro con el flag, el
 * largo, el hash y los extractos correctos; un payload sin mensaje registra su ausencia; basura y un BOM no lanzan
 * ni bloquean; y el dispatcher lo corre desde el manifiesto de Stop sin veredicto.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';

isolateState('stop-input-recorder');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { EXCERPT, evaluate } = await import(pathToFileURL(path.join(HERE, 'guard.mjs')).href);
const { dispatch } = await import(pathToFileURL(path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs')).href);

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const journal = () => {
  const file = path.join(stateDir('stop-input-recorder'), 'stops.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
};
const now = new Date('2026-10-12T00:00:00.000Z');
const long = `${'a'.repeat(EXCERPT)}MIDDLE${'z'.repeat(EXCERPT)}`;

check('a stop never blocks', evaluate(JSON.stringify({ session_id: 's1', stop_hook_active: false, last_assistant_message: long, transcript_path: 't' }), { now }), undefined);
check('a re-stop never blocks', evaluate(JSON.stringify({ session_id: 's1', stop_hook_active: true, last_assistant_message: 'second' }), { now }), undefined);
const [first, second] = journal();
check('the stop records its flag as false', first?.stopHookActive, false);
check('the re-stop records its flag as true', second?.stopHookActive, true);
check('the record keeps the session', first?.session, 's1');
check('the record keeps the payload keys, sorted', first?.keys, ['last_assistant_message', 'session_id', 'stop_hook_active', 'transcript_path']);
check('the record keeps the message length', first?.message?.length, long.length);
check('the record keeps the message hash', first?.message?.sha256, createHash('sha256').update(long).digest('hex'));
check('the head is the first characters only', first?.message?.head, 'a'.repeat(EXCERPT));
check('the tail is the last characters only', first?.message?.tail, 'z'.repeat(EXCERPT));
check('the middle of a long message is not kept', JSON.stringify(first).includes('MIDDLE'), false);

check('a payload without the message never blocks', evaluate(JSON.stringify({ session_id: 's2' }), { now }), undefined);
check('its absence is recorded', journal()[2]?.message, undefined);
check('garbage never blocks', evaluate('{not json', { now }), undefined);
check('garbage is recorded as a malfunction', typeof journal()[3]?.malfunction, 'string');
check('a BOM before valid JSON is read', (evaluate(`﻿${JSON.stringify({ session_id: 's3', stop_hook_active: true })}`, { now }), journal()[4]?.session), 's3');

const manifest = path.join(HERE, '..', 'hook-dispatch', 'manifests', 'stop.json');
const manifestGuards = JSON.parse(readFileSync(manifest, 'utf8')).guards;
check('the Stop manifest registers the recorder', manifestGuards.includes('../../stop-input-recorder/guard.mjs'), true);
// The real dispatcher with a manifest that holds only this guard, so the proof does not depend on the rest of
// the fleet. @es El dispatcher real con un manifiesto que solo tiene esta guardia.
const before = journal().length;
const manifestDir = mkdtempSync(path.join(os.tmpdir(), 'stop-recorder-'));
const ownManifest = path.join(manifestDir, 'stop.json');
writeFileSync(ownManifest, JSON.stringify({ event: 'Stop', guards: [path.relative(manifestDir, path.join(HERE, 'guard.mjs')).split(path.sep).join('/')] }));
const dispatched = await dispatch(ownManifest, JSON.stringify({ session_id: 's4', stop_hook_active: false, last_assistant_message: 'via dispatch' }));
rmSync(manifestDir, { recursive: true, force: true });
check('through the dispatcher there is no verdict and no problem', [dispatched.output ?? null, dispatched.problems], [null, []]);
check('through the dispatcher one record is appended', journal().length, before + 1);

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
