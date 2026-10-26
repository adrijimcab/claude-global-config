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
const failedNames = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  failedNames.push(name);
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
  // Contention ends a take one of two ways, both "another writer held it": through every attempt, or at the pause
  // where its wait budget ran out. Never a fault. @es La contienda termina una toma de dos formas, ambas «otro
  // escritor lo tenía»: en todos los intentos, o en la pausa donde se agotó su presupuesto. Nunca un fallo.
  check('every increment not counted in the race was refused only by the busy lock, through its attempts or its budget', raced.every((record) => /stayed locked|wait budget .* was spent/.test(record.reason)), true);
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

  // The only check on real time: it proves the DEFAULT sleeper really sleeps, which no injected one can. The lower
  // bound is the proof (the budget sleeps about 200 ms, so less than 150 means it did not sleep); load only makes a
  // run longer, so it cannot redden it. The upper bound only separates the 200 ms budget from the lock's own
  // default of 40 pauses of 50 ms (2 s): 1 s is five times the budget and half that default. How the budget is
  // spent is proved with an injected clock below, never here.
  // @es El único check con tiempo real: prueba que el durmiente POR DEFECTO duerme de verdad, algo que ninguno
  // inyectado puede. La cota inferior es la prueba (el presupuesto duerme unos 200 ms; menos de 150 es que no
  // durmió); la carga solo alarga una corrida, así que no la pone en rojo. La cota superior solo separa el
  // presupuesto de 200 ms del valor por defecto del lock, 40 pausas de 50 ms (2 s): 1 s es cinco veces el
  // presupuesto y la mitad de ese valor. Cómo se gasta el presupuesto se prueba abajo con un reloj inyectado.
  check('J-1: with the real pause, a busy counter really sleeps and gives up well before the lock default (more than 150 ms, less than 1 s)', [spent > 150, spent < 1_000], [true, true]);

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

  // The reporter of a hook that must not print: a line goes to <stateDir>/lock-faults.jsonl, and only when that
  // directory cannot take it, to stderr. @es El informante de un hook que no debe imprimir: la línea va a
  // lock-faults.jsonl, y solo si ese directorio no la admite, a stderr.
  const onStderr = (action) => {
    const written = [];
    const realWrite = process.stderr.write;

    process.stderr.write = (chunk) => {
      written.push(String(chunk));

      return true;
    };
    try {
      action();
    } finally {
      process.stderr.write = realWrite;
    }

    return written;
  };
  const faultsOf = (mechanism) => (existsSync(journal.lockFaultsPath?.(mechanism) ?? '') ? readFileSync(journal.lockFaultsPath(mechanism), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)) : []);
  const recorded = onStderr(() => journal.lockFaultsOf?.('guard-lf')('The lock L could not be released (EIO): d. @es No se pudo soltar el lock L (EIO): d.'));

  check('a lock fault of a hook that must not print is recorded at <stateDir>/lock-faults.jsonl, as it was told, and not printed', [journal.lockFaultsPath?.('guard-lf'), faultsOf('guard-lf').map((one) => [one.mechanism, one.message, typeof one.at]), recorded], [path.join(stateRoot, 'guard-lf', 'lock-faults.jsonl'), [['guard-lf', 'The lock L could not be released (EIO): d. @es No se pudo soltar el lock L (EIO): d.', 'string']], []]);
  check('a lock fault whose state directory cannot be made goes to stderr instead of being lost', onStderr(() => journal.lockFaultsOf?.('guard-w')('L @es L')), ['L @es L\n']);

  // L3: an increment that landed is counted once, even when releasing its lock fails afterwards.
  // @es L3: un incremento que llegó se cuenta una vez, aunque soltar su lock falle después.
  const releaseReports = [];
  const failingRelease = (one) => {
    if (one === `${firesPath('guard-r')}.lock`) throw Object.assign(new Error('EIO: injected'), { code: 'EIO' });
    rmSync(one, { force: true });
  };

  check('L3: an increment whose release fails returns its count and records no "not counted"', [notThrown(() => incrementFires('guard-r', { lock: { remove: failingRelease, report: (line) => releaseReports.push(line) } })), JSON.parse(readFileSync(firesPath('guard-r'), 'utf8')).count, uncounted('guard-r').length], [1, 1, 0]);
  check('L3: ...and the release failure is reported, bilingual', [releaseReports.length, /could not be released/.test(releaseReports[0] ?? ''), / @es /.test(releaseReports[0] ?? '')], [1, true, true]);

  // L5: one budget shared by several counters bounds them TOGETHER, so a Stop that counts two judges over two busy
  // counters waits about 200 ms in all, not 200 ms each. @es L5: un presupuesto compartido acota a varios contadores
  // JUNTOS: un Stop que cuenta dos jueces sobre dos contadores ocupados espera unos 200 ms en total.
  for (const busyOne of ['guard-s1', 'guard-s2']) {
    mkdirSync(path.dirname(firesPath(busyOne)), { recursive: true });
    writeFileSync(`${firesPath(busyOne)}.lock`, '');
  }

  // On the injected clock and sleeper, so the bound is read from what the budget slept, never from how long a
  // loaded machine took: one shared budget sleeps 200 ms for both (195 for the first, 5 for the second); a budget
  // per counter would sleep 390. @es Con el reloj y el durmiente inyectados, la cota se lee de lo que durmió el
  // presupuesto y nunca de lo que tardó una máquina cargada: compartido duerme 200 ms para ambos; uno por contador, 390.
  let sharedNow = 0;
  const sharedSlept = [];
  const budget = journal.firesBudget?.({ now: () => sharedNow, sleep: (ms) => { sharedSlept.push(ms); sharedNow += ms; } });
  const sharedOutcomes = ['guard-s1', 'guard-s2'].map((one) => notThrown(() => incrementFires(one, { lock: budget })));

  check('L5: two busy counters under one shared budget are both not counted, and sleep 200 ms together, not 200 each', [sharedOutcomes, sharedSlept.reduce((sum, ms) => sum + ms, 0), sharedSlept.every((ms) => ms <= 15)], [[null, null], 200, true]);

  // Once the shared budget is spent, a later counter stops at its first pause: against a stale lock whose removal
  // stays delete-pending it is recorded as not counted for the BUDGET, never as a lock that "could not be broken"
  // after attempts that never waited. On the virtual clock. @es Agotado el presupuesto compartido, un contador
  // posterior para en su primera pausa: ante un lock caducado cuyo borrado sigue pendiente se registra como no
  // contado por el PRESUPUESTO, nunca como «no se pudo romper» tras intentos que nunca esperaron.
  mkdirSync(path.dirname(firesPath('guard-s3')), { recursive: true });
  writeFileSync(`${firesPath('guard-s3')}.lock`, 'no owner');

  let spentNow = 0;
  let pausesOfS3 = 0;
  const spentBudget = journal.firesBudget?.({ now: () => spentNow, sleep: (ms) => { spentNow += ms; } });
  const pendingRemoval = (target) => {
    if (!target.endsWith('.breaker')) throw Object.assign(new Error('EPERM: injected'), { code: 'EPERM' });
    rmSync(target, { force: true });
  };

  notThrown(() => incrementFires('guard-s1', { lock: spentBudget }));
  const s3 = notThrown(() => incrementFires('guard-s3', { lock: { ...spentBudget, staleAfterMs: -1, platform: 'win32', remove: pendingRemoval, wait: () => { pausesOfS3 += 1; spentBudget.wait(); } } }));
  const s3Reason = uncounted('guard-s3').at(-1)?.reason ?? '';

  check('L5: after the shared budget is spent, a counter on a delete-pending stale lock stops at its first pause and is not counted for the budget, not as a fault', [s3, pausesOfS3, /wait budget .* was spent/.test(s3Reason), / @es /.test(s3Reason), /could not be broken/.test(s3Reason), existsSync(`${firesPath('guard-s3')}.lock`)], [null, 1, true, true, false, true]);

  let fakeNow = 0;
  const slept = [];
  const fake = journal.firesBudget?.({ now: () => fakeNow, sleep: (ms) => { slept.push(ms); fakeNow += ms; } });

  for (let turn = 0; turn < 20; turn += 1) fake?.wait();
  check('L5: a budget sleeps 15 ms at a time, never past its 200 ms, then not at all', [slept.reduce((sum, ms) => sum + ms, 0), slept.every((ms) => ms <= 15), slept.length, fake?.attempts], [200, true, 14, 13]);
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

// A red run is never anonymous: the details go to stderr, and the last line of stdout, which every runner shows,
// names each failing check. @es Una corrida roja nunca es anónima: el detalle va a stderr y la última línea de
// stdout, la que muestra todo runner, nombra cada check que falló.
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.log(`${failures.length} failed, ${passed} passed — FAILED: ${failedNames.join(' | ')}`);
  process.exit(1);
}

console.log(`${passed} passed`);
