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
  ['the event is not read from the fields', J, 'const { kind, blockId, toolUseId = null, inputDigest, reason, event } = fields;', 'const { kind, blockId, toolUseId = null, inputDigest, reason } = fields; const event = undefined;'],
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
  ['a record has no line end', J, '`${JSON.stringify(record)}\\n`', '`${JSON.stringify(record)}`'],
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
  ['the counter is not created before a write', J, 'mkdirSync(stateDir(mechanism), { recursive: true });\n  writeFileSync(', 'writeFileSync('],
  ['the temp file of the counter is left behind', J, 'renameSync(`${file}.tmp`, file);', "writeFileSync(file, readFileSync(`${file}.tmp`, 'utf8'));"],
  ['an increment writes a journal line', J, 'renameSync(`${file}.tmp`, file);', "renameSync(`${file}.tmp`, file);\n  appendFileSync(journalPath(mechanism), '{}\\n');"]
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
