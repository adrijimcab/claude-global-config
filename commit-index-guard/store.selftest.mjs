#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the per-repository record of `commit-index-guard` (`stale-store.mjs`), with no git
 * and no repository: the record is written, found whatever the spelling of its repository path, rotated when
 * old, forgotten when settled and read as empty when torn or ill-formed.
 *
 * @es PRUEBA DE DISCRIMINACIÓN del registro por repositorio de `commit-index-guard`, sin git ni repositorio:
 * se escribe, se encuentra sea cual sea la grafía de la ruta, se rota si es viejo, se olvida si se resuelve y
 * se lee como vacío si está roto o mal formado.
 */

import { mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('commit-index-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (file) => import(pathToFileURL(path.join(HERE, file)).href);
const { anyRecorded, clearStale, recordStale, recordedStale } = await load('stale-store.mjs');
const { stateDirectory } = await load('diary.mjs');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const clearState = () => rmSync(stateDirectory(), { recursive: true, force: true });
/** Every record file of the state directory; empty when there is none, so a missing file fails a check instead of crashing. @es Cada fichero de registro; vacío si no hay. */
const recordFiles = () => (readdirSync(stateDirectory(), { withFileTypes: true }).filter((entry) => entry.name.startsWith('stale-')).map((entry) => path.join(stateDirectory(), entry.name)));
const overwriteRecords = (text) => recordFiles().forEach((file) => writeFileSync(file, text));
const ageRecords = (date) => recordFiles().forEach((file) => utimesSync(file, date, date));
const ENTRY = { path: 'a.txt', code: 'MM' };

/** The limit written HERE, seven days, never read from the module under test. @es El límite escrito AQUÍ, siete días. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ---- WRITE AND FIND.
clearState();
check('nothing is recorded in an empty state directory', anyRecorded(), false);
recordStale('C:/Some/Repo', [ENTRY]);
check('a recorded repository is found', recordedStale('C:/Some/Repo'), [ENTRY]);
check('a repository that was never recorded has nothing', recordedStale('C:/Other/Repo'), []);
check('a record is found whatever the case or separators of the repository path', recordedStale('c:\\some\\repo'), [ENTRY]);
check('a record makes anyRecorded true', anyRecorded(), true);

// ---- FORGET.
clearStale('C:/Some/Repo');
check('a settled record is forgotten', [recordedStale('C:/Some/Repo'), anyRecorded()], [[], false]);

// ---- ILL-FORMED.
recordStale('C:/Some/Repo', [ENTRY]);
overwriteRecords(JSON.stringify({ entries: [null, { path: 1 }, { path: 'ok', code: 'MM' }] }));
check('a record with junk entries yields only the well-formed ones', recordedStale('C:/Some/Repo'), [{ path: 'ok', code: 'MM' }]);
overwriteRecords(JSON.stringify({ entries: 'not a list' }));
check('a record whose entries are not a list reads as empty', recordedStale('C:/Some/Repo'), []);
overwriteRecords('{"toplevel":');
check('a torn record reads as nothing recorded', recordedStale('C:/Some/Repo'), []);

// ---- ROTATION.
clearState();
recordStale('C:/Old/Repo', [ENTRY]);
check('a record survives the write that made it', recordedStale('C:/Old/Repo'), [ENTRY]);

const longAgo = new Date(Date.now() - MAX_AGE_MS - 60_000);

ageRecords(longAgo);
recordStale('C:/New/Repo', [ENTRY]);
check('a record untouched for longer than its limit is rotated away by the next write', recordedStale('C:/Old/Repo'), []);
check('the record just written is kept', recordedStale('C:/New/Repo'), [ENTRY]);

const recentlyEnough = new Date(Date.now() - MAX_AGE_MS + 3_600_000);

ageRecords(recentlyEnough);
recordStale('C:/Third/Repo', [ENTRY]);
check('a record younger than its limit survives a later write', recordedStale('C:/New/Repo'), [ENTRY]);

// ---- A JOURNAL IS NEVER A RECORD.
clearState();
mkdirSync(stateDirectory(), { recursive: true });
writeFileSync(path.join(stateDirectory(), 'errors.jsonl'), '{}\n');
check('only a journal in the state directory: nothing is recorded', anyRecorded(), false);
utimesSync(path.join(stateDirectory(), 'errors.jsonl'), longAgo, longAgo);
recordStale('C:/Whatever/Repo', [ENTRY]);
check('rotation removes only stale records, never an old journal', readdirSync(stateDirectory()).includes('errors.jsonl'), true);

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  commit-index-guard store selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
