#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the per-repository record of `commit-index-guard` (`stale-store.mjs`), with no git
 * and no repository: entries are ADDED by merging, never replaced; an entry keeps its first-seen time while its
 * blob is unchanged and starts a new one when the blob changes; only `retainStale` removes a path; an entry is
 * ignored and rotated away seven days after it was first seen; and a torn or ill-formed record reads as empty.
 *
 * @es PRUEBA DE DISCRIMINACIÓN del registro por repositorio de `commit-index-guard`, sin git ni repositorio:
 * las entradas se AÑADEN fundiéndose, nunca se reemplazan; una entrada conserva su primera hora mientras su blob
 * no cambia y empieza otra cuando cambia; solo `retainStale` quita una ruta; una entrada se ignora y se rota
 * siete días después de verse por primera vez; y un registro roto o mal formado se lee como vacío.
 */

import { mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('commit-index-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (file) => import(pathToFileURL(path.join(HERE, file)).href);
const { anyRecorded, recordStale, recordedStale, retainStale } = await load('stale-store.mjs');
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
const recordFiles = () => {
  try {
    return readdirSync(stateDirectory()).filter((name) => name.startsWith('stale-')).map((name) => path.join(stateDirectory(), name));
  } catch {
    return [];
  }
};
const overwriteRecords = (text) => recordFiles().forEach((file) => writeFileSync(file, text));

/** The limit written HERE, seven days, never read from the module under test. @es El límite escrito AQUÍ, siete días. */
const DAY = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 7 * DAY;
const T0 = Date.UTC(2026, 9, 1);
const at = (milliseconds) => new Date(milliseconds).toISOString();
const entry = (name, blob = 'blob-1') => ({ path: name, code: 'MM', blob });
const stored = (name, blob, since) => ({ path: name, code: 'MM', blob, since: at(since) });
const pathsOf = (entries) => entries.map((item) => item.path).sort();

// ---- WRITE AND FIND.
clearState();
check('nothing is recorded in an empty state directory', anyRecorded(), false);
recordStale('C:/Some/Repo', [entry('a.ts')], T0);
check('a recorded entry carries its blob and the time it was first seen', recordedStale('C:/Some/Repo', T0), [stored('a.ts', 'blob-1', T0)]);
check('a repository that was never recorded has nothing', recordedStale('C:/Other/Repo', T0), []);
check('a record is found whatever the case or separators of the repository path', recordedStale('c:\\some\\repo', T0).length, 1);
check('a record makes anyRecorded true', anyRecorded(), true);
recordStale('C:/Third/Repo', [], T0);
check('recording nothing leaves no file for that repository', recordFiles().length, 1);

// ---- RECORDING ONLY ADDS: a second commit never forgets the first.
recordStale('C:/Some/Repo', [entry('b.ts', 'blob-2')], T0 + DAY);
check('a later recording is merged by path, never replacing what was there', pathsOf(recordedStale('C:/Some/Repo', T0 + DAY)), ['a.ts', 'b.ts']);
recordStale('C:/Some/Repo', [entry('c.ts', 'blob-3'), entry('d.ts', 'blob-4')], T0 + DAY);
check('several entries of one write are all kept next to the earlier ones', pathsOf(recordedStale('C:/Some/Repo', T0 + DAY)), ['a.ts', 'b.ts', 'c.ts', 'd.ts']);
recordStale('C:/Other/Repo', [entry('x.ts')], T0 + DAY);
check('another repository keeps a record of its own', [pathsOf(recordedStale('C:/Other/Repo', T0 + DAY)), pathsOf(recordedStale('C:/Some/Repo', T0 + DAY)).length], [['x.ts'], 4]);

// ---- AGE RUNS FROM THE FIRST RECORDING OF A BLOB.
clearState();
recordStale('C:/Some/Repo', [entry('a.ts')], T0);
recordStale('C:/Some/Repo', [entry('a.ts')], T0 + 6 * DAY);
check('the same blob seen again keeps its first-seen time', recordedStale('C:/Some/Repo', T0 + 6 * DAY).map((item) => item.since), [at(T0)]);
check('the same blob seen again does not extend its life', recordedStale('C:/Some/Repo', T0 + MAX_AGE_MS + 1), []);
recordStale('C:/Some/Repo', [entry('a.ts', 'blob-2')], T0 + 6 * DAY);
check('a different blob for the path starts its own first-seen time and replaces the old blob', recordedStale('C:/Some/Repo', T0 + 6 * DAY), [stored('a.ts', 'blob-2', T0 + 6 * DAY)]);

// ---- ROTATION BY AGE.
clearState();
recordStale('C:/Some/Repo', [entry('a.ts')], T0);
check('an entry is alive at exactly its limit', recordedStale('C:/Some/Repo', T0 + MAX_AGE_MS).length, 1);
check('an entry is ignored one millisecond past its limit', recordedStale('C:/Some/Repo', T0 + MAX_AGE_MS + 1), []);
check('an entry is alive just inside its limit', recordedStale('C:/Some/Repo', T0 + MAX_AGE_MS - 3_600_000).length, 1);

clearState();
recordStale('C:/Old/Repo', [entry('a.ts')], T0);
recordStale('C:/New/Repo', [entry('b.ts')], T0 + MAX_AGE_MS + DAY);
check('a write removes the file of a repository whose entries all expired', [recordFiles().length, pathsOf(recordedStale('C:/New/Repo', T0 + MAX_AGE_MS + DAY))], [1, ['b.ts']]);

clearState();
recordStale('C:/Some/Repo', [entry('old.ts')], T0);
recordStale('C:/Some/Repo', [entry('new.ts')], T0 + MAX_AGE_MS - DAY);
recordStale('C:/Some/Repo', [entry('newer.ts')], T0 + MAX_AGE_MS + DAY);
check('a write drops only the expired entries of a repository', pathsOf(recordedStale('C:/Some/Repo', T0 + MAX_AGE_MS + DAY)), ['new.ts', 'newer.ts']);

// ---- RETAIN: the only way a path leaves.
clearState();
recordStale('C:/Some/Repo', [entry('a.ts'), entry('b.ts')], T0);
retainStale('C:/Some/Repo', recordedStale('C:/Some/Repo', T0).filter((item) => item.path === 'b.ts'));
check('retaining the survivors removes the others and keeps the first-seen time', recordedStale('C:/Some/Repo', T0), [stored('b.ts', 'blob-1', T0)]);
retainStale('C:/Some/Repo', []);
check('retaining nothing forgets the repository and removes its file', [recordedStale('C:/Some/Repo', T0), anyRecorded()], [[], false]);

// ---- ILL-FORMED AND TORN.
recordStale('C:/Some/Repo', [entry('a.ts')], T0);
overwriteRecords(JSON.stringify({ entries: [null, { path: 1 }, { path: 'no-blob', since: at(T0) }, { path: 'no-since', blob: 'b' }, { blob: 'b', since: at(T0) }, { path: 'bad-since', blob: 'b', since: 'yesterday' }, stored('ok.ts', 'b', T0)] }));
check('a record with junk entries yields only the well-formed ones', pathsOf(recordedStale('C:/Some/Repo', T0)), ['ok.ts']);
overwriteRecords(JSON.stringify({ entries: 'not a list' }));
check('a record whose entries are not a list reads as empty', recordedStale('C:/Some/Repo', T0), []);
overwriteRecords('{"toplevel":');
check('a torn record reads as nothing recorded', recordedStale('C:/Some/Repo', T0), []);
recordStale('C:/Some/Repo', [entry('after.ts')], T0);
check('recording over a torn record writes a clean one', pathsOf(recordedStale('C:/Some/Repo', T0)), ['after.ts']);

// ---- AN UNREADABLE FILE IS REMOVED ONLY WHEN IT IS OLD.
clearState();
recordStale('C:/Some/Repo', [entry('a.ts')], Date.now());
overwriteRecords('{"torn');
recordStale('C:/Other/Repo', [entry('b.ts')], Date.now());
check('a young unreadable file is left alone by rotation', recordFiles().length, 2);

const longAgo = new Date(Date.now() - MAX_AGE_MS - 60_000);

recordFiles().forEach((file) => utimesSync(file, longAgo, longAgo));
recordStale('C:/Third/Repo', [entry('c.ts')], Date.now());
check('an old unreadable file is removed by the next write', recordFiles().length, 2);

// ---- A JOURNAL IS NEVER A RECORD.
clearState();
mkdirSync(stateDirectory(), { recursive: true });
writeFileSync(path.join(stateDirectory(), 'errors.jsonl'), '{}\n');
check('only a journal in the state directory: nothing is recorded', anyRecorded(), false);
utimesSync(path.join(stateDirectory(), 'errors.jsonl'), longAgo, longAgo);
recordStale('C:/Whatever/Repo', [entry('a.ts')], Date.now());
check('rotation never removes an old journal', readdirSync(stateDirectory()).includes('errors.jsonl'), true);

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  commit-index-guard store selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
