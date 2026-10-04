#!/usr/bin/env node
/**
 * The decisions of `hook-state/jsonl-tail.mjs`, each broken once, that `jsonl-tail.selftest.mjs` must catch.
 * The runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant
 * that only crashes the selftest count as a survivor.
 *
 * Not mutated, on purpose: the statements whose replacement hangs the reader instead of changing an answer
 * (`buffer.subarray(0, got)` makes every read at the end of the file non-empty, so the loop never ends), and
 * `data.subarray(at + 1)` to `data.subarray(at)`, which leaves an empty line that the parse skips: the same
 * answer, so it is not a decision.
 *
 * @es Las decisiones de `jsonl-tail.mjs`, rotas una a una, que `jsonl-tail.selftest.mjs` debe detectar. Un
 * mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`). Sin mutar, a
 * propósito: lo que al cambiarse cuelga el lector en vez de cambiar una respuesta (`buffer.subarray(0, got)`),
 * y `data.subarray(at + 1)` por `data.subarray(at)`, que deja una línea vacía que el parseo omite: misma
 * respuesta, no es una decisión.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const J = 'hook-state/jsonl-tail.mjs';

const MUTANTS = [
  // --- the bound ---
  ['the default chunk is 64 MiB, so a small tail reads the whole file', J, 'DEFAULT_CHUNK_BYTES = 64 * 1024;', 'DEFAULT_CHUNK_BYTES = 64 * 1024 * 1024;'],
  ['the backward read starts at the beginning of the file', J, 'Math.max(0, end - chunkBytes)', '0'],
  ['the backward read can start before the beginning', J, 'Math.max(0, end - chunkBytes)', 'end - chunkBytes'],
  ['the backward read does not stop once n records are found', J, 'while (end > 0 && found.length < n) {', 'while (end > 0) {'],
  ['the reader does not report the bytes it read', J, 'onRead(got);', ''],
  ['every read starts at the beginning of the file', J, 'readSync(fd, buffer, 0, length, start)', 'readSync(fd, buffer, 0, length, 0)'],

  // --- lastRecords: the lines ---
  ['more than n records are returned from one chunk', J, 'at >= 0 && found.length < n; at -= 1', 'at >= 0; at -= 1'],
  ['the records come back newest first', J, 'return found.reverse();', 'return found;'],
  ['the older chunk is joined before the carried line', J, 'Buffer.concat([readChunk(fd, start, end - start, onRead), carry])', 'Buffer.concat([carry, readChunk(fd, start, end - start, onRead)])'],
  ['the partial first line of a chunk is dropped instead of carried', J, 'carry = start > 0 ? lines.shift() : Buffer.alloc(0);', 'carry = Buffer.alloc(0);'],
  ['the first line of the file is treated as partial', J, 'carry = start > 0 ? lines.shift() : Buffer.alloc(0);', 'carry = lines.shift();'],
  ['a corrupt or torn line throws instead of being skipped', J, 'catch {\n    return undefined;', 'catch (error) {\n    throw error;'],
  ['a falsy record is dropped from the last records', J, 'if (parsed !== undefined) found.push(parsed.value);', 'if (parsed !== undefined && parsed.value) found.push(parsed.value);'],

  // --- readFrom: the alignment ---
  ['an offset past the end is not read from the start', J, 'const from = offset > size ? 0 : offset;', 'const from = offset;'],
  ['an offset at the end is read from the start', J, 'const from = offset > size ? 0 : offset;', 'const from = offset >= size ? 0 : offset;'],
  ['offset 0 is checked for a newline before it', J, 'from > 0 && readChunk(fd, from - 1, 1, onRead)[0] !== NEWLINE;', 'readChunk(fd, from - 1, 1, onRead)[0] !== NEWLINE;'],
  ['the offset is never re-aligned', J, 'let skipping = from > 0 && readChunk(fd, from - 1, 1, onRead)[0] !== NEWLINE;', 'let skipping = false;'],
  ['the offset is always re-aligned', J, 'let skipping = from > 0 && readChunk(fd, from - 1, 1, onRead)[0] !== NEWLINE;', 'let skipping = true;'],
  ['the byte before the offset must be a newline to re-align', J, 'readChunk(fd, from - 1, 1, onRead)[0] !== NEWLINE;', 'readChunk(fd, from - 1, 1, onRead)[0] === NEWLINE;'],
  ['the re-alignment looks at the offset byte, not the one before it', J, 'readChunk(fd, from - 1, 1, onRead)', 'readChunk(fd, from, 1, onRead)'],
  ['a chunk with no newline ends the re-alignment', J, 'if (at === -1) continue;', ''],
  ['the re-alignment drops one byte too many', J, 'data.subarray(at + 1)', 'data.subarray(at + 2)'],
  ['the re-alignment never ends', J, '        skipping = false;\n', ''],

  // --- readFrom: the lines and the new offset ---
  ['the position advances by the chunk size, not the bytes read', J, 'position += chunk.length;', 'position += chunkBytes;'],
  ['the carried partial line is joined after the next chunk', J, 'Buffer.concat([carry, data])', 'Buffer.concat([data, carry])'],
  ['the unterminated last line is consumed', J, 'splitLines(buffer.subarray(0, last))', 'splitLines(buffer)'],
  ['the partial line is lost at a chunk boundary', J, 'carry = buffer.subarray(last + 1);', 'carry = Buffer.alloc(0);'],
  ['the offset includes the unterminated last line', J, 'offset: skipping ? from : position - carry.length', 'offset: skipping ? from : position'],
  ['the offset moves to the end while still re-aligning', J, 'offset: skipping ? from : position - carry.length', 'offset: position - carry.length'],
  ['a falsy record is dropped from readFrom', J, 'if (parsed !== undefined) records.push(parsed.value);', 'if (parsed !== undefined && parsed.value) records.push(parsed.value);']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state'],
  selftest: 'hook-state/jsonl-tail.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
