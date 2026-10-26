#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/jsonl-tail.mjs`, the bounded reader of append-only JSONL files (the
 * journals and the session transcripts). Every case runs on a file CONSTRUCTED here in a temp directory that
 * is removed at the end; no real state is read.
 *
 * THE STATE SPACE: the file shapes (empty, smaller than N, a 50 MB file, CRLF endings, blank and corrupt
 * lines, a last line with no newline that is complete or torn, multi-byte UTF-8 cut by a chunk boundary), the
 * chunk size (the production default and every tiny size that cuts a character or a line), the offsets of
 * `readFrom` (0, the start of a line, the middle of a line, the middle of the unterminated last line, the end,
 * past the end), and the bytes actually read (measured through `onRead`, never inferred).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `jsonl-tail.mjs`, el lector acotado de ficheros JSONL de solo añadir. Cada
 * caso corre sobre un fichero CONSTRUIDO aquí, en un directorio temporal que se borra al final. Espacio de
 * estados: formas del fichero (vacío, menor que N, de 50 MB, CRLF, líneas vacías o corruptas, última línea sin
 * salto completa o rota, UTF-8 multibyte cortado por el borde de un trozo), el tamaño del trozo, los offsets de
 * `readFrom` y los bytes realmente leídos (medidos con `onRead`).
 */

import { appendFileSync, mkdtempSync, readFileSync, readSync as realReadSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { lastRecords, readFrom } from './jsonl-tail.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns; a throw is a failed check, never a crash of the selftest. @es Lo que devuelve `action`; un fallo es un check fallido, no una caída. */
function attempt(action, fallback) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return fallback;
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'jsonl-tail-'));
let counter = 0;

/** Writes `content` to a fresh file and returns its path. @es Escribe `content` en un fichero nuevo y devuelve su ruta. */
function fileWith(content) {
  counter += 1;
  const file = path.join(scratch, `f${counter}.jsonl`);
  writeFileSync(file, content);

  return file;
}

const rec = (i) => ({ i });
const lineOf = (record) => `${JSON.stringify(record)}\n`;
const range = (from, to) => Array.from({ length: to - from }, (_, k) => from + k);

try {
  // --- the 50 MB file: the last 20 equal a full parse, and far less than the file is read ---
  const big = path.join(scratch, 'big.jsonl');
  const pad = 'x'.repeat(80);
  let next = 0;
  for (let block = 0; block < 50; block += 1) {
    const parts = [];
    for (let k = 0; k < 11000; k += 1) {
      parts.push(`${JSON.stringify({ i: next, pad })}\n`);
      next += 1;
    }
    appendFileSync(big, parts.join(''));
  }
  const bigSize = statSync(big).size;
  check('big: the file is at least 50 MB', bigSize >= 50 * 1024 * 1024, true);
  const fullParse = readFileSync(big, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)).slice(-20);
  let bytesRead = 0;
  const tail = attempt(() => lastRecords(big, 20, { onRead: (bytes) => { bytesRead += bytes; } }), []);
  check('big: the last 20 equal the last 20 of a full parse', tail.map((record) => record.i), fullParse.map((record) => record.i));
  check('big: the records are whole', tail.every((record) => record.pad === pad), true);
  check('big: bytes were counted', bytesRead > 0, true);
  check('big: far less than the file is read (under 256 KiB of 50 MB)', bytesRead < 256 * 1024, true);

  let followBytes = 0;
  const follow = attempt(() => readFrom(big, bigSize - 400, { onRead: (bytes) => { followBytes += bytes; } }), { records: [], offset: -1 });
  check('big: readFrom near the end ends at the size with the last record', [follow.offset, follow.records.at(-1)?.i], [bigSize, fullParse.at(-1).i]);
  check('big: readFrom reads only the appended bytes', followBytes > 0 && followBytes <= 401, true);

  // --- lastRecords: shapes ---
  check('empty file: no record', attempt(() => lastRecords(fileWith(''), 5), ['x']), []);
  check('n larger than the file: every record, oldest first', attempt(() => lastRecords(fileWith(range(0, 3).map((i) => lineOf(rec(i))).join('')), 10), []), [rec(0), rec(1), rec(2)]);
  check('n smaller than the file: the last n, oldest first', attempt(() => lastRecords(fileWith(range(0, 6).map((i) => lineOf(rec(i))).join('')), 2), []), [rec(4), rec(5)]);
  check('n of zero: nothing', attempt(() => lastRecords(fileWith(lineOf(rec(1))), 0), ['x']), []);
  check('n below zero: nothing', attempt(() => lastRecords(fileWith(lineOf(rec(1))), -3), ['x']), []);
  check('a falsy record (0) is kept', attempt(() => lastRecords(fileWith('0\nfalse\n'), 5), []), [0, false]);

  const torn = `${lineOf(rec(1))}${lineOf(rec(2))}{"i":3,"pa`;
  check('torn last line (no newline, not JSON): skipped, the n counts complete ones', attempt(() => lastRecords(fileWith(torn), 2), []), [rec(1), rec(2)]);
  check('complete last line with no trailing newline: kept', attempt(() => lastRecords(fileWith(`${lineOf(rec(1))}{"i":2}`), 2), []), [rec(1), rec(2)]);
  check('blank and corrupt middle lines are skipped, not counted', attempt(() => lastRecords(fileWith(`${lineOf(rec(1))}\nnot json\n${lineOf(rec(2))}${lineOf(rec(3))}`), 2), []), [rec(2), rec(3)]);
  check('CRLF endings parse', attempt(() => lastRecords(fileWith('{"i":1}\r\n{"i":2}\r\n'), 2), []), [rec(1), rec(2)]);

  // --- the skipped-line count (onSkip): damage a caller can report ---
  // @es Recuento de líneas omitidas (onSkip): el daño que quien llama puede informar.
  const skippedBy = (read) => {
    let skipped = 0;

    attempt(() => read(() => { skipped += 1; }), undefined);

    return skipped;
  };
  const damaged = `${lineOf(rec(1))}not json\n\n   \n${lineOf(rec(2))}{"i":3,"ke`;

  check('lastRecords: a torn last line and a corrupt middle line are two skips, blank lines none', skippedBy((onSkip) => lastRecords(fileWith(damaged), 10, { onSkip })), 2);
  check('lastRecords: the same count at chunk 5', skippedBy((onSkip) => lastRecords(fileWith(damaged), 10, { onSkip, chunkBytes: 5 })), 2);
  check('lastRecords: a clean file skips nothing', skippedBy((onSkip) => lastRecords(fileWith(range(0, 4).map((i) => lineOf(rec(i))).join('')), 10, { onSkip })), 0);
  check('lastRecords: only the lines examined count (damage older than the n found is not read)', skippedBy((onSkip) => lastRecords(fileWith(`not json\n${lineOf(rec(1))}${lineOf(rec(2))}`), 2, { onSkip })), 0);
  check('lastRecords: the records are the same with and without onSkip', attempt(() => lastRecords(fileWith(damaged), 10, { onSkip: () => undefined }), []), attempt(() => lastRecords(fileWith(damaged), 10), ['x']));
  check('readFrom: a corrupt complete line is one skip; the unterminated tail is neither read nor counted', skippedBy((onSkip) => readFrom(fileWith(damaged), 0, { onSkip })), 1);
  check('readFrom: the records and offset are the same with and without onSkip', attempt(() => readFrom(fileWith(damaged), 0, { onSkip: () => undefined }), {}), attempt(() => readFrom(fileWith(damaged), 0), { x: 1 }));

  // --- multi-byte UTF-8 cut by a chunk boundary: every tiny chunk size, bytes cut, strings never ---
  const wide = [{ s: 'é€😀' }, { s: 'ñandú 😀 日本語' }, { s: '€€€' }];
  const wideFile = fileWith(wide.map(lineOf).join(''));
  for (const chunkBytes of [1, 2, 3, 4, 5, 7, 11, 16]) {
    check(`multi-byte at chunk ${chunkBytes}: decoded intact`, attempt(() => lastRecords(wideFile, 3, { chunkBytes }), []), wide);
    check(`multi-byte at chunk ${chunkBytes}: readFrom decoded intact`, attempt(() => readFrom(wideFile, 0, { chunkBytes }).records, []), wide);
  }
  const several = fileWith(range(0, 40).map((i) => lineOf({ i, pad: 'é'.repeat(i % 7) })).join(''));
  check('many records at chunk 5: the last 7 equal the default-chunk answer', attempt(() => lastRecords(several, 7, { chunkBytes: 5 }), []), attempt(() => lastRecords(several, 7), ['unread']));
  check('many records: the last 7 are the right ones', attempt(() => lastRecords(several, 7), []).map((record) => record.i), range(33, 40));

  // --- readFrom ---
  const three = `${lineOf(rec(1))}${lineOf(rec(2))}${lineOf(rec(3))}`;
  const l1 = lineOf(rec(1)).length;
  const l2 = l1 + lineOf(rec(2)).length;
  const threeFile = fileWith(three);
  check('offset 0: line 1 and everything after, the offset is the size', attempt(() => readFrom(threeFile, 0), {}), { records: [rec(1), rec(2), rec(3)], offset: three.length });
  check('offset at the start of a line (the byte before is a newline): that line is kept', attempt(() => readFrom(threeFile, l1), {}), { records: [rec(2), rec(3)], offset: three.length });
  check('offset in the middle of a line: the next complete line', attempt(() => readFrom(threeFile, l1 + 3), {}), { records: [rec(3)], offset: three.length });
  check('offset one byte before a newline: re-aligns past that newline', attempt(() => readFrom(threeFile, l2 - 1), {}), { records: [rec(3)], offset: three.length });
  check('offset at the end: nothing, the offset is kept', attempt(() => readFrom(threeFile, three.length), {}), { records: [], offset: three.length });
  check('offset past the end (the file was replaced): read again from 0', attempt(() => readFrom(threeFile, three.length + 99), {}), { records: [rec(1), rec(2), rec(3)], offset: three.length });
  check('empty file: no record, offset 0', attempt(() => readFrom(fileWith(''), 0), {}), { records: [], offset: 0 });
  for (const chunkBytes of [1, 2, 3, 5, 9]) {
    check(`mid-line offset at chunk ${chunkBytes}: same answer as one big read`, attempt(() => readFrom(threeFile, l1 + 3, { chunkBytes }), {}), { records: [rec(3)], offset: three.length });
    check(`offset 0 at chunk ${chunkBytes}: same answer as one big read`, attempt(() => readFrom(threeFile, 0, { chunkBytes }), {}), { records: [rec(1), rec(2), rec(3)], offset: three.length });
  }

  check('a falsy record (0) is kept by readFrom too', attempt(() => readFrom(fileWith('0\nfalse\n'), 0).records, []), [0, false]);
  // Whole-number lines make a cut-off line valid JSON, so a missing re-alignment cannot hide behind the parse.
  // @es Las líneas de un número hacen que una línea cortada sea JSON válido: sin realinear no se disimula con el parseo.
  const numbers = fileWith('1234567890\n77\n');
  for (const chunkBytes of [1, 2, 3, 4, 7, 64 * 1024]) {
    check(`number lines, offset 1 at chunk ${chunkBytes}: the cut-off line is not a record`, attempt(() => readFrom(numbers, 1, { chunkBytes }), {}), { records: [77], offset: 14 });
  }
  const unterminated = `${lineOf(rec(1))}{"i":2}`;
  check('a complete-looking last line with no newline is NOT consumed (the writer may still be writing)', attempt(() => readFrom(fileWith(unterminated), 0), {}), { records: [rec(1)], offset: l1 });
  check('mid-line offset inside the unterminated last line: nothing, the offset does not move', attempt(() => readFrom(fileWith(unterminated), l1 + 2), {}), { records: [], offset: l1 + 2 });
  check('mid-line offset in a long unterminated line, tiny chunks: nothing, the offset does not move', attempt(() => readFrom(fileWith(`${lineOf(rec(1))}${'a'.repeat(30)}`), l1 + 2, { chunkBytes: 4 }), {}), { records: [], offset: l1 + 2 });
  check('CRLF: the offset is after the last LF', attempt(() => readFrom(fileWith('{"i":1}\r\n{"i":2}\r\n'), 0), {}), { records: [rec(1), rec(2)], offset: 18 });
  check('a corrupt complete line is skipped and consumed', attempt(() => readFrom(fileWith(`${lineOf(rec(1))}garbage\n${lineOf(rec(2))}`), 0), {}), { records: [rec(1), rec(2)], offset: l1 + 8 + l1 });

  const growing = fileWith(`${lineOf(rec(1))}{"i":`);
  const first = attempt(() => readFrom(growing, 0), { records: [], offset: -1 });
  check('growing file, first read: the torn tail waits', first, { records: [rec(1)], offset: l1 });
  appendFileSync(growing, `2}\n${lineOf(rec(3))}`);
  check('growing file, second read from the returned offset: only the new records, the torn one now whole', attempt(() => readFrom(growing, first.offset), {}), { records: [rec(2), rec(3)], offset: l1 + lineOf(rec(2)).length + lineOf(rec(3)).length });
  // --- a file that changes under the reader: short reads, truncation, growth. The reader is injected, never timed ---
  // @es Un fichero que cambia bajo el lector: lecturas cortas, truncado, crecimiento. El lector se inyecta, nunca se cronometra.
  const calls = { count: 0 };
  /** A `readSync` that returns at most `maxPerCall` bytes and sees only the first `visible` bytes; it throws if called endlessly. @es Un `readSync` que devuelve como mucho `maxPerCall` bytes y solo ve los primeros `visible`; lanza si se le llama sin fin. */
  const readerOf = ({ maxPerCall = Infinity, visible = Infinity }) => {
    calls.count = 0;

    return (fd, buffer, offset, length, position) => {
      calls.count += 1;
      if (calls.count > 200) throw new Error('runaway reader: more than 200 reads');
      const want = Math.max(0, Math.min(length, maxPerCall, visible - position));

      return want === 0 ? 0 : realReadSync(fd, buffer, offset, want, position);
    };
  };
  const pairs = fileWith('11\n22\n33\n44\n');
  check('short reads (3 bytes per call): lastRecords still returns every record', attempt(() => lastRecords(pairs, 4, { chunkBytes: 8, readBytes: readerOf({ maxPerCall: 3 }) }), []), [11, 22, 33, 44]);
  check('short reads (3 bytes per call): readFrom still returns every record and the full offset', attempt(() => readFrom(pairs, 0, { chunkBytes: 8, readBytes: readerOf({ maxPerCall: 3 }) }), {}), { records: [11, 22, 33, 44], offset: 12 });
  check('short reads (3 bytes per call): readFrom re-aligns a mid-line offset', attempt(() => readFrom(pairs, 1, { chunkBytes: 8, readBytes: readerOf({ maxPerCall: 3 }) }), {}), { records: [22, 33, 44], offset: 12 });

  const truncated = readerOf({ visible: 10 });
  check('file truncated before the read (10 of 24 bytes visible): the complete records it had, the offset after them', attempt(() => readFrom(threeFile, 0, { chunkBytes: 10, readBytes: truncated }), {}), { records: [rec(1)], offset: 8 });
  check('file truncated: the loop ends at the first empty read, after exactly 2 reads', calls.count, 2);
  check('file emptied under readFrom: nothing, the offset does not move, no runaway', attempt(() => readFrom(threeFile, 0, { readBytes: readerOf({ visible: 0 }) }), {}), { records: [], offset: 0 });
  check('file emptied under lastRecords: nothing, no runaway', attempt(() => lastRecords(threeFile, 3, { readBytes: readerOf({ visible: 0 }) }), ['unread']), []);

  const grower = fileWith(three);
  let grown = false;
  const grew = attempt(() => readFrom(grower, 0, { chunkBytes: 10, onRead: () => { if (!grown) { grown = true; appendFileSync(grower, '5\n'); } } }), {});
  check('file that grows during the read: only the bytes present on entry, the new line waits', grew, { records: [rec(1), rec(2), rec(3)], offset: three.length });
  check('file that grew: the next call from the returned offset gets the new line', attempt(() => readFrom(grower, grew.offset), {}), { records: [5], offset: three.length + 2 });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
