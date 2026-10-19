#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/journal.mjs`: v2 journal records and the per-mechanism fires counter.
 * Every case writes under a temp `HOOK_STATE_DIR`; the real home is never written (a probe at the end proves
 * nothing leaked into the fallback location).
 *
 * THE STATE SPACE: the four record kinds and kinds outside them (including inherited property names), each
 * required field missing or of the wrong type, the optional ones absent / present, ids from a clock that
 * advances / stands still / goes back / starts small, a journal that already holds lines, a counter that is
 * absent / one / corrupt, and a counter increment that must leave the journal untouched.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `journal.mjs`: registros v2 del journal y contador de disparos por
 * mecanismo. Todo se escribe bajo un `HOOK_STATE_DIR` temporal; el home real no se escribe nunca. Espacio de
 * estados: los cuatro tipos y tipos ajenos, cada campo obligatorio ausente o de tipo erróneo, ids con un reloj
 * que avanza / se detiene / retrocede / empieza pequeño, un journal con líneas previas, un contador ausente /
 * en uno / corrupto, y un incremento que no debe tocar el journal.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as journal from './journal.mjs';

const { KINDS, appendRecord, createIdGenerator, digestInput, firesPath, incrementFires, journalPath } = journal;
// Read through the namespace so a module without it fails a check, not the import. @es Por el espacio de nombres.
const uncountedPath = (mechanism) => journal.uncountedPath?.(mechanism) ?? '';

// Child mode of the concurrency proof: this same file, run with the flag, increments one counter N times.
// @es Modo hijo de la prueba de concurrencia: este mismo fichero, con la bandera, incrementa un contador N veces.
const INCREMENT_FLAG = '--increment';

if (process.argv[2] === INCREMENT_FLAG) {
  for (let turn = 0; turn < Number(process.argv[4]); turn += 1) incrementFires(process.argv[3]);

  process.exit(0);
}

const saved = { HOOK_STATE_DIR: process.env.HOOK_STATE_DIR, HOOK_CLAUDE_HOME: process.env.HOOK_CLAUDE_HOME };
const scratch = mkdtempSync(path.join(tmpdir(), 'journal-selftest-'));
const stateRoot = path.join(scratch, 'state');
const claudeRoot = path.join(scratch, 'claude');
process.env.HOOK_STATE_DIR = stateRoot;
process.env.HOOK_CLAUDE_HOME = claudeRoot;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function thrown(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }

  return undefined;
}

/** The value of `action`, or `threw: <message>`: the counter must never throw, so a throw fails a check. @es El valor, o `threw: <mensaje>`. */
function notThrown(action) {
  try {
    return action();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

/** The not-counted records of a mechanism. @es Los registros de disparos no contados de un mecanismo. */
const uncounted = (mechanism) => (existsSync(uncountedPath(mechanism)) ? readFileSync(uncountedPath(mechanism), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)) : []);

const lines = (mechanism) => (existsSync(journalPath(mechanism)) ? readFileSync(journalPath(mechanism), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)) : []);
const GOOD = { blockId: 'blk-1', toolUseId: 'toolu_1', inputDigest: digestInput('input') };
const CLOCK = Date.UTC(2026, 9, 4, 12, 0, 0);

try {
  check('the kinds are exactly decision, dismissal, false-positive-report and true-positive-report', [...KINDS].sort(), ['decision', 'dismissal', 'false-positive-report', 'true-positive-report']);

  // --- records ---
  for (const kind of KINDS) {
    const record = appendRecord('guard-a', { kind, ...GOOD }, { now: CLOCK });
    check(`${kind}: the record carries v2, its kind, the clock time and the three correlation fields`, [record.v, record.kind, record.ts, record.blockId, record.toolUseId, record.inputDigest], [2, kind, new Date(CLOCK).toISOString(), 'blk-1', 'toolu_1', GOOD.inputDigest]);
  }
  check('one record per kind was appended as one JSON line each, in order', lines('guard-a').map((record) => record.kind), [...KINDS]);
  check('the journal lives at <stateDir>/journal.jsonl under the temp root', journalPath('guard-a'), path.join(stateRoot, 'guard-a', 'journal.jsonl'));
  const returned = appendRecord('guard-b', { kind: 'decision', ...GOOD }, { now: CLOCK });
  check('the written line equals the returned record', lines('guard-b')[0], returned);
  check('the record id starts with the clock time it was given', returned.id.startsWith(CLOCK.toString(16).padStart(12, '0')), true);

  check('a later append keeps the earlier lines', (() => { appendRecord('guard-a', { kind: 'decision', ...GOOD }); return lines('guard-a').length; })(), 5);
  check('the record id is written to the journal line', typeof lines('guard-a')[4].id, 'string');

  for (const bad of ['block', 'Decision', 'toString', '__proto__', '', undefined, 3]) {
    const message = thrown(() => appendRecord('guard-c', { kind: bad, ...GOOD }));
    check(`a kind outside the four is refused: ${JSON.stringify(bad)}`, /Unknown journal record kind/.test(message ?? '') && /@es /.test(message ?? ''), true);
  }
  check('a refused kind writes nothing', lines('guard-c'), []);

  for (const field of ['blockId', 'inputDigest']) {
    for (const bad of [undefined, '', 3, null]) {
      check(`required field ${field} = ${JSON.stringify(bad)} is refused naming the field`, new RegExp(`"${field}"`).test(thrown(() => appendRecord('guard-c', { kind: 'decision', ...GOOD, [field]: bad })) ?? ''), true);
    }
  }
  check('toolUseId may be null (a Stop event has none)', appendRecord('guard-c', { kind: 'decision', ...GOOD, toolUseId: null }).toolUseId, null);
  check('toolUseId defaults to null', appendRecord('guard-c', { kind: 'decision', blockId: 'b', inputDigest: 'd' }).toolUseId, null);
  check('toolUseId of another type is refused', /"toolUseId"/.test(thrown(() => appendRecord('guard-c', { kind: 'decision', ...GOOD, toolUseId: 7 })) ?? ''), true);
  check('a reason is kept when given', appendRecord('guard-c', { kind: 'dismissal', ...GOOD, reason: 'mine' }).reason, 'mine');
  check('no reason key when none is given', 'reason' in appendRecord('guard-c', { kind: 'dismissal', ...GOOD }), false);
  check('a reason that is not a string is refused', /"reason"/.test(thrown(() => appendRecord('guard-c', { kind: 'dismissal', ...GOOD, reason: 4 })) ?? ''), true);
  check('an event is kept when given', appendRecord('guard-c', { kind: 'decision', ...GOOD, event: 'PreToolUse' }).event, 'PreToolUse');
  check('no event key when none is given', 'event' in appendRecord('guard-c', { kind: 'decision', ...GOOD }), false);
  check('an event that is not a string is refused', /"event"/.test(thrown(() => appendRecord('guard-c', { kind: 'decision', ...GOOD, event: 4 })) ?? ''), true);
  check('an event is written to the journal line', lines('guard-c').find((record) => record.event === 'PreToolUse')?.event, 'PreToolUse');
  check('a sampled flag and a seed are kept when given', ((record) => [record.sampled, record.seed])(appendRecord('guard-c', { kind: 'true-positive-report', ...GOOD, sampled: true, seed: 'abc' })), [true, 'abc']);
  check('a sampled flag of false is kept', appendRecord('guard-c', { kind: 'true-positive-report', ...GOOD, sampled: false }).sampled, false);
  check('no sampled or seed key when none is given', ((record) => ['sampled' in record, 'seed' in record])(appendRecord('guard-c', { kind: 'true-positive-report', ...GOOD })), [false, false]);
  check('a sampled flag that is not a boolean is refused', [1, 'true', null].map((bad) => /"sampled"/.test(thrown(() => appendRecord('guard-c', { kind: 'true-positive-report', ...GOOD, sampled: bad })) ?? '')), [true, true, true]);
  check('a seed that is not a string is refused', [1, true, null].map((bad) => /"seed"/.test(thrown(() => appendRecord('guard-c', { kind: 'true-positive-report', ...GOOD, seed: bad })) ?? '')), [true, true, true]);
  check('the sampled flag and the seed are written to the journal line', lines('guard-c').filter((record) => record.seed === 'abc').map((record) => record.sampled), [true]);
  check('a field outside the record shape is not written', 'secret' in appendRecord('guard-c', { kind: 'decision', ...GOOD, secret: 'x' }), false);
  check('a mechanism that is a path is refused', /@es /.test(thrown(() => appendRecord('../x', { kind: 'decision', ...GOOD })) ?? ''), true);

  // --- digest ---
  check('digestInput of a string is its sha256 hex', digestInput('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  check('digestInput of an object digests its JSON', thrown(() => digestInput({ a: 1 })) ?? digestInput({ a: 1 }), digestInput('{"a":1}'));
  check('two different inputs have two digests', digestInput('a') === digestInput('b'), false);

  // --- ids ---
  const times = [255, 4096, 65536, CLOCK, CLOCK + 1, CLOCK + 1000, CLOCK * 2];
  const newId = createIdGenerator();
  const ids = times.map((time) => newId(time));
  check('ids of an advancing clock sort in time order, small and large values alike', [...ids].sort(), ids);

  const fresh = newId(CLOCK * 4);
  const same = [newId(CLOCK * 4), newId(CLOCK * 4), newId(CLOCK * 4)];
  check('ids from a clock that stands still keep growing', [fresh, ...same].every((id, index, all) => index === 0 || all[index - 1] < id), true);
  check('a clock that goes back never yields a smaller id', newId(CLOCK * 4 - 5000) > same[2], true);

  const burst = Array.from({ length: 70000 }, () => newId(CLOCK * 5));
  check('70000 ids in one millisecond are strictly increasing', burst.every((id, index) => index === 0 || burst[index - 1] < id), true);
  const prefix = (ms) => ms.toString(16).padStart(12, '0');
  check('every id has the same width, across the whole burst', new Set([...ids, ...burst].map((id) => id.length)).size, 1);
  check('an id is 24 characters: 12 of time, 4 of sequence, 8 random', ids[0].length, 24);
  check('300 ids of one millisecond share that millisecond', new Set(burst.slice(0, 300).map((id) => id.slice(0, 12))).size, 1);
  check('the millisecond moves on by exactly one when the sequence is exhausted', [burst[65535].slice(0, 12), burst[65536].slice(0, 12)], [prefix(CLOCK * 5), prefix(CLOCK * 5 + 1)]);
  check('two generators at the same instant do not collide', createIdGenerator()(CLOCK) === createIdGenerator()(CLOCK), false);
  check('ids are unique across a burst', new Set(burst).size, burst.length);

  // --- fires counter ---
  check('the fires counter lives at <stateDir>/fires.json', firesPath('guard-f'), path.join(stateRoot, 'guard-f', 'fires.json'));
  check('the first increment is 1', incrementFires('guard-f'), 1);
  check('the second increment is 2', incrementFires('guard-f'), 2);
  check('the counter persists as JSON', JSON.parse(readFileSync(firesPath('guard-f'), 'utf8')).count, 2);
  check('an increment writes no journal line and creates no journal', [existsSync(journalPath('guard-f')), lines('guard-f').length], [false, 0]);

  appendRecord('guard-g', { kind: 'decision', ...GOOD });
  incrementFires('guard-g');
  check('an increment leaves the journal of that mechanism as it was', lines('guard-g').length, 1);
  check('an append leaves the counter of that mechanism as it was', (() => { appendRecord('guard-g', { kind: 'decision', ...GOOD }); return JSON.parse(readFileSync(firesPath('guard-g'), 'utf8')).count; })(), 1);
  check('counters of two mechanisms are independent', [incrementFires('guard-h'), incrementFires('guard-i')], [1, 1]);
  check('no temp file is left beside the counter', existsSync(`${firesPath('guard-f')}.tmp`), false);

  // --- concurrent increments: real child processes, one shared counter ---
  // @es Incrementos concurrentes: procesos hijos reales sobre un mismo contador.
  const CHILDREN = 6;
  const PER_CHILD = 40;
  const exits = await Promise.all(Array.from({ length: CHILDREN }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), INCREMENT_FLAG, 'guard-race', String(PER_CHILD)], { stdio: 'ignore' });

    child.on('close', resolve);
  })));

  const raced = uncounted('guard-race');

  check('every concurrent child finished cleanly', exits, Array(CHILDREN).fill(0));
  check('no concurrent increment was lost in silence: each one is counted or recorded as not counted', JSON.parse(readFileSync(firesPath('guard-race'), 'utf8')).count + raced.length, CHILDREN * PER_CHILD);
  check('every increment not counted in the race was refused only by the busy lock', raced.every((record) => /stayed locked/.test(record.reason)), true);
  check('nothing but the counter (and its not-counted record) is left beside it: no temp, no lock', readdirSync(path.dirname(firesPath('guard-race'))).filter((name) => name !== 'fires-uncounted.jsonl'), ['fires.json']);

  // A fixed temp name is a collision waiting to happen: a leftover under that name must not block an increment.
  // @es Un nombre temporal fijo es una colisión esperando: un resto con ese nombre no debe bloquear un incremento.
  mkdirSync(`${firesPath('guard-t')}.tmp`, { recursive: true });
  check('a leftover at the old fixed temp name does not block the increment', incrementFires('guard-t'), 1);

  // J-1: no failure of the counter aborts its caller. The call returns null, and the record says why.
  // @es J-1: ningún fallo del contador aborta a quien lo llama. La llamada devuelve null y el registro dice por qué.
  check('the not-counted record lives at <stateDir>/fires-uncounted.jsonl', uncountedPath('guard-f'), path.join(stateRoot, 'guard-f', 'fires-uncounted.jsonl'));

  // A failed publish must not leave its temp behind (the rename fails over a non-empty directory).
  // @es Una publicación fallida no deja su temporal (el renombrado falla sobre un directorio no vacío).
  const blocked = firesPath('guard-u');
  mkdirSync(path.join(blocked, 'inside'), { recursive: true });
  check('a rename that fails does not throw, and is recorded as not counted', [notThrown(() => incrementFires('guard-u', { readFile: () => '{"count":1}' })), uncounted('guard-u').length], [null, 1]);
  check('and leaves no temp and no lock behind', readdirSync(path.dirname(blocked)).sort(), ['fires-uncounted.jsonl', 'fires.json']);

  // A lock that stays held: the fire is not counted, the record says so in both languages, the holder's lock stays.
  // @es Un lock que sigue ocupado: la corrida no se cuenta, el registro lo dice en ambos idiomas, el lock ajeno queda.
  mkdirSync(path.dirname(firesPath('guard-v')), { recursive: true });
  writeFileSync(`${firesPath('guard-v')}.lock`, '');
  let busyWaits = 0;

  check('a counter locked by another process returns null, never throws', notThrown(() => incrementFires('guard-v', { lock: { attempts: 2, wait: () => { busyWaits += 1; } } })), null);
  check('the lock options of the caller are honoured (two attempts, two waits)', busyWaits, 2);
  check('the not-counted record names the mechanism and the busy counter, bilingual', ((record) => [record?.mechanism, record?.counted, /fires\.json/.test(record?.reason ?? ''), /stayed locked/.test(record?.reason ?? ''), / @es /.test(record?.reason ?? ''), / @es /.test(record?.message ?? ''), typeof record?.at])(uncounted('guard-v')[0]), ['guard-v', false, true, true, true, true, 'string']);
  check('and nothing was counted, the other lock stays', [existsSync(firesPath('guard-v')), existsSync(`${firesPath('guard-v')}.lock`)], [false, true]);

  let defaultWaits = 0;

  notThrown(() => incrementFires('guard-v', { lock: { wait: () => { defaultWaits += 1; } } }));
  check('J-1: the default wait budget of the counter is thirteen attempts', defaultWaits, 13);

  const started = Date.now();

  notThrown(() => incrementFires('guard-v'));
  const spent = Date.now() - started;

  check('J-1: with the real pause, a busy counter gives up after about 200 ms (more than 150, less than 350)', [spent > 150, spent < 350], [true, true]);

  mkdirSync(path.dirname(firesPath('guard-x')), { recursive: true });
  writeFileSync(firesPath('guard-x'), '{not json');
  check('a corrupt counter is not counted, recorded bilingual, and not overwritten', [notThrown(() => incrementFires('guard-x')), /fires\.json/.test(uncounted('guard-x').at(-1)?.reason ?? '') && /@es /.test(uncounted('guard-x').at(-1)?.reason ?? ''), readFileSync(firesPath('guard-x'), 'utf8')], [null, true, '{not json']);
  writeFileSync(firesPath('guard-x'), '{"count":"two"}');
  check('a counter whose count is not a number is refused', [notThrown(() => incrementFires('guard-x')), /not a valid counter/.test(uncounted('guard-x').at(-1)?.reason ?? '')], [null, true]);
  writeFileSync(firesPath('guard-x'), '{"count":-1}');
  check('a negative counter is refused', [notThrown(() => incrementFires('guard-x')), uncounted('guard-x').length], [null, 3]);
  writeFileSync(firesPath('guard-x'), 'null');
  check('a counter file holding null is refused as a counter', [notThrown(() => incrementFires('guard-x')), uncounted('guard-x').length], [null, 4]);

  rmSync(firesPath('guard-x'));
  mkdirSync(firesPath('guard-x'));
  check('a counter that cannot be read for a reason other than absence is not read as zero', [notThrown(() => incrementFires('guard-x')), uncounted('guard-x').at(-1)?.code], [null, 'EISDIR']);

  // The read failure is injected: a directory in place of the counter also fails the WRITE, which hides whether the read refused.
  // @es El fallo de lectura se inyecta: un directorio en lugar del contador también hace fallar la ESCRITURA, y eso oculta si la lectura rechazó.
  const denied = () => {
    throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
  };
  check('a counter that cannot be read (injected EACCES) is recorded with that error', [notThrown(() => incrementFires('guard-y', { readFile: denied })), uncounted('guard-y').at(-1)?.reason, uncounted('guard-y').at(-1)?.code], [null, 'permission denied', 'EACCES']);
  check('a counter that cannot be read is not replaced by one', existsSync(firesPath('guard-y')), false);

  // A state directory that cannot even be made: nothing can be recorded there, and still nothing throws.
  // @es Un directorio de estado que ni se puede crear: no se puede registrar nada allí, y aun así nada lanza.
  writeFileSync(path.join(stateRoot, 'guard-w'), 'a file where the directory should be');
  check('J-1: a counter whose directory cannot be made returns null, never throws', notThrown(() => incrementFires('guard-w')), null);
  const absent = () => {
    throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
  };
  check('a counter that is absent (injected ENOENT) reads as zero', incrementFires('guard-y', { readFile: absent }), 1);
  check('an injected reader is given the counter file', incrementFires('guard-z', { readFile: (file) => { check('the reader is asked for the counter of the mechanism', file, firesPath('guard-z')); return '{"count":41}'; } }), 42);

  // --- nothing leaked into the real locations ---
  check('nothing was written outside the temp roots', existsSync(path.join(claudeRoot, 'guard-a')), false);
} catch (error) {
  failures.push(`unexpected throw — ${error.message}`);
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
