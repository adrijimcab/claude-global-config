#!/usr/bin/env node
/**
 * The decisions of `hook-state/journal.mjs`, each broken once, that `journal.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `journal.mjs`, rotas una a una, que `journal.selftest.mjs` debe detectar. Un
 * mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const J = 'hook-state/journal.mjs';

const MUTANTS = [
  // --- the four kinds ---
  ['the decision kind is not accepted', J, "'decision', ", ''],
  ['the true-positive-report kind is not accepted', J, ", 'true-positive-report'])", '])'],
  ['a fifth kind is accepted', J, "'true-positive-report'])", "'true-positive-report', 'block'])"],
  ['any kind is accepted', J, '!KINDS.has(kind)', 'false'],

  // --- the record shape ---
  ['the version is 1', J, 'v: 2,', 'v: 1,'],
  ['the time is the real clock, not the given one', J, 'ts: new Date(now).toISOString()', 'ts: new Date().toISOString()'],
  ['the id ignores the given clock', J, 'id: newId(now)', 'id: newId()'],
  ['a missing blockId is accepted', J, "typeof blockId !== 'string' || blockId === ''", 'false'],
  ['an empty blockId is accepted', J, "|| blockId === ''", ''],
  ['a missing inputDigest is accepted', J, "typeof inputDigest !== 'string' || inputDigest === ''", 'false'],
  ['an empty inputDigest is accepted', J, "|| inputDigest === ''", ''],
  ['a toolUseId of any type is accepted', J, "toolUseId !== null && typeof toolUseId !== 'string'", 'false'],
  ['the validator requires a toolUseId', J, 'function assertRecord({ kind, blockId, toolUseId = null,', 'function assertRecord({ kind, blockId, toolUseId,'],
  ['the record has no toolUseId default', J, 'const { kind, blockId, toolUseId = null,', 'const { kind, blockId, toolUseId,'],
  ['a reason of any type is accepted', J, "reason !== undefined && typeof reason !== 'string'", 'false'],
  ['the record always carries a reason key', J, '...(reason === undefined ? {} : { reason })', '...{ reason }'],
  ['an event of any type is accepted', J, "event !== undefined && typeof event !== 'string'", 'false'],
  ['the record always carries an event key', J, '...(event === undefined ? {} : { event })', '...{ event }'],
  ['the event is never written', J, '...(event === undefined ? {} : { event }), ', ''],
  ['the event is not read from the fields', J, 'inputDigest, reason, event, sampled, seed } = fields;', 'inputDigest, reason, sampled, seed } = fields; const event = undefined;'],
  ['a sampled flag of any type is accepted', J, "sampled !== undefined && typeof sampled !== 'boolean'", 'false'],
  ['a seed of any type is accepted', J, "seed !== undefined && typeof seed !== 'string'", 'false'],
  ['the sampled flag is never written', J, '...(sampled === undefined ? {} : { sampled }), ', ''],
  ['the seed is never written', J, '...(seed === undefined ? {} : { seed }), ', ''],
  ['the record always carries a sampled key', J, '...(sampled === undefined ? {} : { sampled })', '...{ sampled }'],
  ['the record always carries a seed key', J, '...(seed === undefined ? {} : { seed })', '...{ seed }'],
  ['a sampled flag of false is dropped', J, '...(sampled === undefined ? {} : { sampled })', '...(sampled ? { sampled } : {})'],
  ['the sampled flag is not read from the fields', J, 'reason, event, sampled, seed } = fields;', 'reason, event, seed } = fields; const sampled = undefined;'],
  ['the counter reader given is ignored', J, "text = readFile(file, 'utf8');", "text = readFileSync(file, 'utf8');"],
  ['the bad-field refusal names no field', J, "bilingual('bad-field', { field, expected })", "bilingual('bad-field', { field: 'x', expected })"],

  // --- ids ---
  ['the time of an id is not fixed width', J, "value.toString(16).padStart(width, '0')", "value.toString(16).padStart(1, '0')"],
  ['the time of an id is eight characters', J, 'ID_MS_WIDTH = 12', 'ID_MS_WIDTH = 8'],
  ['the sequence holds only two characters', J, 'ID_SEQ_WIDTH = 4', 'ID_SEQ_WIDTH = 2'],
  ['an id has no random part', J, "randomBytes(4).toString('hex')", "''"],
  ['an equal clock restarts the sequence', J, 'now > lastMs', 'now >= lastMs'],
  ['the last millisecond is never remembered', J, '      lastMs = now;\n', ''],
  ['a clock that goes back is written as it is', J, 'hex(lastMs, ID_MS_WIDTH)', 'hex(now, ID_MS_WIDTH)'],
  ['the sequence never counts up', J, 'sequence += 1;', 'sequence = 0;'],
  ['an exhausted sequence overflows its width', J, 'sequence >= ID_SEQ_LIMIT', 'sequence > ID_SEQ_LIMIT'],
  ['an exhausted sequence keeps the same millisecond', J, 'lastMs += 1;', 'lastMs += 0;'],

  // --- digest ---
  ['the digest is sha1', J, "createHash('sha256')", "createHash('sha1')"],
  ['an object is digested without JSON', J, "typeof input === 'string' ? input : JSON.stringify(input)", 'input'],

  // --- the journal ---
  ['the journal file has another name', J, "'journal.jsonl'", "'journal.json'"],
  ['every mechanism shares one journal', J, "path.join(stateDir(mechanism), 'journal.jsonl')", "path.join(stateDir('shared'), 'journal.jsonl')"],
  ['an append replaces the journal', J, 'appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}\\n`);', 'writeFileSync(journalPath(mechanism), `${JSON.stringify(record)}\\n`);'],
  ['a record has no line end', J, 'appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}\\n`);', 'appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}`);'],
  ['a not-counted record has no line end', J, 'appendFileSync(uncountedPath(mechanism), `${JSON.stringify(record)}\\n`);', 'appendFileSync(uncountedPath(mechanism), `${JSON.stringify(record)}`);'],
  ['the state directory is not created before an append', J, 'mkdirSync(stateDir(mechanism), { recursive: true });\n  appendFileSync(', 'appendFileSync('],
  ['an append counts a fire', J, 'appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}\\n`);', 'appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}\\n`); incrementFires(mechanism);'],

  // --- the fires counter ---
  ['the fires file has another name', J, "'fires.json'", "'fires.txt'"],
  ['an increment adds two', J, 'readCount(file, readFile) + 1', 'readCount(file, readFile) + 2'],
  ['an absent counter is an error', J, "error.code === 'ENOENT'", 'false'],
  ['any unreadable counter is read as zero', J, "if (error.code === 'ENOENT') return 0;", 'return 0;'],
  ['a corrupt counter is read as valid', J, 'parsed = JSON.parse(text);', 'parsed = { count: 0 };'],
  ['a counter that is not an integer is accepted', J, '!Number.isSafeInteger(parsed?.count)', 'false'],
  ['a negative counter is accepted', J, '|| parsed.count < 0', ''],
  ['the counter is not created before a write', J, 'mkdirSync(stateDir(mechanism), { recursive: true });\n\n    const outcome', 'const outcome'],
  ['the temp file of the counter is left behind', J, 'renameSync(temp, file);', "writeFileSync(file, readFileSync(temp, 'utf8'));"],
  ['an increment writes a journal line', J, 'renameSync(temp, file);', "renameSync(temp, file);\n      appendFileSync(journalPath(mechanism), '{}\\n');"],

  // --- the concurrency contract of the counter (audit R2) ---
  ['the increment runs without the lock', J, 'const outcome = withLock(`${file}.lock`, () => {', 'const outcome = ((_lockFile, work) => ({ held: true, value: work() }))(`${file}.lock`, () => {'],
  ['the lock has another name per call', J, 'withLock(`${file}.lock`,', 'withLock(`${file}.${process.pid}.lock`,'],
  ['the temp name is fixed again', J, "const temp = `${file}.${process.pid}.tmp`;", 'const temp = `${file}.tmp`;'],
  ['a failed publish leaves its temp behind', J, '        rmSync(temp, { force: true });\n\n        throw error;', '        throw error;'],
  ['a failed publish is swallowed', J, '        rmSync(temp, { force: true });\n\n        throw error;', '        rmSync(temp, { force: true });'],
  ['a counter locked by another process is silently not counted', J, 'if (!outcome.held) throw new Error(bilingual(\'fires-busy\', { file }));', 'if (!outcome.held) return 0;'],
  ['the busy refusal is English only', J, "bilingual('fires-busy', { file })", "'fires.json is locked'"],
  ['the lock options of the caller are ignored', J, '{ ...firesBudget(), ...lock }', '{ ...firesBudget() }'],

  // --- J-1: the counter never aborts its caller, and a run not counted is recorded ---
  ['the short wait budget of the counter is not applied', J, '{ ...firesBudget(), ...lock }', 'lock'],
  ['the counter waits forty attempts', J, 'const FIRES_ATTEMPTS = 13;', 'const FIRES_ATTEMPTS = 40;'],
  ['the counter pauses 50 ms between attempts', J, 'const FIRES_PAUSE_MS = 15;', 'const FIRES_PAUSE_MS = 50;'],
  ['L5: the budget is 400 ms', J, 'const FIRES_BUDGET_MS = 200;', 'const FIRES_BUDGET_MS = 400;'],
  ['L5: a budget has no deadline, so a shared one bounds each call apart', J, '      const left = deadline - now();', '      const left = FIRES_PAUSE_MS;'],
  ['L5: a budget sleeps its full pause past the deadline', J, 'sleep(Math.min(FIRES_PAUSE_MS, left));', 'sleep(FIRES_PAUSE_MS);'],
  ['L5: a budget keeps sleeping after its deadline', J, '      if (left > 0) sleep(', '      sleep('],
  ['L5: a budget ignores its total', J, 'const deadline = now() + totalMs;', 'const deadline = now() + FIRES_BUDGET_MS * 2;'],
  ['L5: a budget ignores the clock it is given', J, 'const deadline = now() + totalMs;', 'const deadline = Date.now() + totalMs;'],
  ['a run that cannot be counted aborts the caller', J, '    recordUncounted(mechanism, error);\n\n    return null;', '    throw error;'],
  ['a run that cannot be counted is not recorded', J, '    recordUncounted(mechanism, error);\n', ''],
  ['a run not counted returns zero, as if counted', J, '    return null;', '    return 0;'],
  ['the not-counted record says it was counted', J, 'counted: false', 'counted: true'],
  ['the not-counted record loses its reason', J, "reason: error instanceof Error ? error.message : String(error)", "reason: ''"],
  ['the not-counted record loses its code', J, 'code: error?.cause?.code ?? error?.code', 'code: undefined'],
  ['the not-counted record loses its mechanism', J, 'counted: false, reason', 'counted: false, mechanism: undefined, reason'],
  ['the not-counted message is English only', J, "message: bilingual('fires-uncounted', { mechanism })", "message: 'not counted'"],
  ['the not-counted record has another name', J, "'fires-uncounted.jsonl'", "'fires-uncounted.json'"],
  ['the not-counted record replaces the earlier ones', J, 'appendFileSync(uncountedPath(mechanism),', 'writeFileSync(uncountedPath(mechanism),'],
  ['a not-counted record that cannot be written aborts the caller', J, '  } catch {\n    // Nowhere left', '  } catch (error) {\n    throw error; // Nowhere left']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/journal.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
