#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `transcript-index/index.mjs`, the incremental per-transcript index. Every case runs
 * on a transcript CONSTRUCTED here in a temp directory, with `HOOK_STATE_DIR` pointed at another temp root
 * AFTER the module is imported (H1-d); no real transcript or state is read or written.
 *
 * THE STATE SPACE: what a record can carry (each write tool, a tool that is not a write, a malformed input, a
 * shell with and without cwd or timestamp, a result for a known and an unknown call, lines that are not
 * objects), what the file did since the last call (nothing, grew with a newer or equal mtime, grew with an
 * older mtime, shrank, same size with another mtime, a torn last line), what the cache holds (absent, current,
 * older version, corrupt, wrong path, offset beyond the file, missing arrays) and the bytes actually read
 * (measured through `onRead`, never inferred).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `index.mjs`, el índice incremental por transcript. Cada caso corre sobre un
 * transcript CONSTRUIDO aquí, con `HOOK_STATE_DIR` apuntando a otra raíz temporal DESPUÉS de importar el
 * módulo; no se lee ni escribe ningún transcript ni estado real. Espacio de estados: lo que lleva un
 * registro, lo que hizo el fichero desde la última llamada, lo que guarda la caché y los bytes realmente
 * leídos (medidos con `onRead`).
 */

import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { cachePath, INDEX_VERSION, indexTranscript } from './index.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** The message of what `action` throws, or `undefined`. @es El mensaje de lo que lanza `action`, o `undefined`. */
function thrownBy(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }

  return undefined;
}

const scratch = mkdtempSync(path.join(tmpdir(), 'transcript-index-'));
process.env.HOOK_STATE_DIR = path.join(scratch, 'state');
const BASE_SECOND = 1_700_000_000;
let counter = 0;

/** A fresh transcript path in its own directory. @es Una ruta de transcript nueva en su propio directorio. */
function freshFile(name = 't.jsonl') {
  counter += 1;
  const directory = path.join(scratch, `d${counter}`);
  mkdirSync(directory, { recursive: true });

  return path.join(directory, name);
}

const lines = (records) => records.map((record) => `${JSON.stringify(record)}\n`).join('');

/** Writes `text` and pins the mtime to `second`. @es Escribe `text` y fija la mtime a `second`. */
function put(file, text, second = BASE_SECOND) {
  writeFileSync(file, text);
  utimesSync(file, second, second);
}

/** Appends `text` and pins the mtime to `second`. @es Añade `text` y fija la mtime a `second`. */
function add(file, text, second = BASE_SECOND) {
  appendFileSync(file, text);
  utimesSync(file, second, second);
}

const stamp = (n) => `2026-10-05T10:00:${String(n).padStart(2, '0')}.000Z`;
const use = (n, id, name, input, cwd = 'C:/repo') => ({ type: 'assistant', timestamp: stamp(n), cwd, message: { content: [{ type: 'tool_use', id, name, input }] } });
const answer = (n, id) => ({ type: 'user', timestamp: stamp(n), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });

/** The part of an index two equal histories must share. @es La parte de un índice que deben compartir dos historias iguales. */
const content = ({ records, lastTimestamp, writes, shells, toolUseIds, offset }) => ({ records, lastTimestamp, writes, shells, toolUseIds, offset });

/** Runs `indexTranscript` counting the bytes read. @es Corre `indexTranscript` contando los bytes leídos. */
function run(file, options = {}) {
  let counted = 0;

  try {
    const result = indexTranscript(file, { ...options, onRead: (bytes) => { counted += bytes; } });

    return { ...result, counted };
  } catch (error) {
    failures.push(`indexTranscript threw — ${error.message}`);

    return { index: { records: -1, offset: -1, lastTimestamp: null, writes: [], shells: [], toolUseIds: [] }, mode: 'threw', bytesRead: -1, counted: -1 };
  }
}

/** The bytes the head fingerprint reads. @es Los bytes que lee la huella de cabecera. */
const headLength = (file) => Math.min(readFileSync(file).length, 4096);

const NEVER = () => { throw new Error('the file must not be read'); };

try {
  // --- what a record carries ---
  const census = freshFile();
  put(census, lines([
    use(1, 'u1', 'Write', { file_path: 'C:/repo/a.txt', content: 'x' }),
    use(2, 'u2', 'Edit', { file_path: 'C:/repo/b.txt' }),
    use(3, 'u3', 'MultiEdit', { file_path: 'C:/repo/c.txt' }),
    use(4, 'u4', 'NotebookEdit', { notebook_path: 'C:/repo/n.ipynb' }),
    use(5, 'u5', 'Read', { file_path: 'C:/repo/never.txt' }),
    use(6, 'u6', 'Write', { file_path: 42 }),
    use(7, 'u7', 'Bash', { command: 'git status', description: 'd' }, 'C:/other'),
    answer(9, 'u7'),
    answer(10, 'unknown-id'),
    use(11, 'u8', 'Bash', { command: 'ls' }),
    { type: 'assistant', timestamp: stamp(12), message: { content: [{ type: 'tool_use', id: 'u9', name: 'Bash', input: { command: 7 } }, null, 'text', { type: 'tool_use', name: 'Bash', input: { command: 'no id' } }] } },
    { type: 'assistant', message: { content: 'plain text' } },
    { type: 'attachment' },
    use(13, 'u10', 'PowerShell', { command: 'dir' }),
    { type: 'user', timestamp: stamp(14), message: { content: [{ type: 'tool_result', tool_use_id: 'unknown-id2', id: 'rx', name: 'Write', input: { file_path: 'C:/repo/ghost' } }] } },
    { type: 'assistant', timestamp: 5, message: { content: {} } }
  ]) + 'null\n5\n[]\n');
  const first = run(census);
  check('first call is a full read', first.mode, 'rebuilt');
  check('records counted are the objects only', first.index.records, 16);
  check('the four write tools are indexed, in order', first.index.writes.map(({ tool, path: file }) => [tool, file]), [['Write', 'C:/repo/a.txt'], ['Edit', 'C:/repo/b.txt'], ['MultiEdit', 'C:/repo/c.txt'], ['NotebookEdit', 'C:/repo/n.ipynb']]);
  check('a write carries its id and timestamp', first.index.writes[0], { id: 'u1', tool: 'Write', path: 'C:/repo/a.txt', timestamp: stamp(1) });
  check('a shell window carries command, cwd, first and last timestamp', first.index.shells[0], { id: 'u7', command: 'git status', cwd: 'C:/other', first: stamp(7), last: stamp(9) });
  check('a shell with no result ends where it began', first.index.shells[1], { id: 'u8', command: 'ls', cwd: 'C:/repo', first: stamp(11), last: stamp(11) });
  check('a shell whose command is not a string opens no window', first.index.shells.length, 2);
  check('a result for an unknown call changes nothing', first.index.shells.map((shell) => shell.last), [stamp(9), stamp(11)]);
  check('every tool_use id with a string id is kept, whatever the tool', first.index.toolUseIds, ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10']);
  check('only a Bash call opens a shell window, and a result block opens no call', [first.index.shells.length, first.index.writes.length], [2, 4]);
  check('the last timestamp is the last string timestamp of a record', first.index.lastTimestamp, stamp(14));
  check('the result reports the bytes it read', [first.bytesRead, first.bytesRead === first.counted], [Buffer.byteLength(readFileSync(census)) + headLength(census), true]);
  check('the index states its version and path', [first.index.version, first.index.path], [INDEX_VERSION, path.resolve(census)]);

  const bare = freshFile();
  put(bare, lines([{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'pwd' } }] } }, answer(3, 'b1'), { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1' }] } }]));
  const bareIndex = run(bare).index;
  check('a shell with no cwd and no timestamp holds nulls, a later timestamp closes it', bareIndex.shells[0], { id: 'b1', command: 'pwd', cwd: null, first: null, last: stamp(3) });
  check('a record with no timestamp does not erase the last one', bareIndex.lastTimestamp, stamp(3));

  // --- nothing happened ---
  const again = run(census, { readBytes: NEVER });
  check('an unchanged file reads 0 bytes', [again.mode, again.counted], ['unchanged', 0]);
  check('an unchanged file returns the same index', content(again.index), content(first.index));

  // --- growth reads only the appended bytes ---
  const growing = freshFile();
  put(growing, lines([use(1, 'g1', 'Bash', { command: 'echo ñ' })]));
  const before = run(growing);
  const extra = lines([answer(2, 'g1'), use(3, 'g2', 'Write', { file_path: 'C:/repo/ñ.txt' })]);
  add(growing, extra);
  const grown = run(growing);
  check('appending reads only the appended bytes, the one byte before the offset and the head bytes', [grown.mode, grown.counted], ['appended', Buffer.byteLength(extra) + 1 + headLength(growing)]);
  check('the appended result closes the earlier window and the write is added', [grown.index.shells[0]?.last, grown.index.writes.length, grown.index.records], [stamp(2), 1, 3]);
  check('the stored offset moved by the appended bytes', grown.index.offset, before.index.offset + Buffer.byteLength(extra));
  add(growing, lines([use(4, 'g3', 'Edit', { file_path: 'C:/repo/e.txt' })]), BASE_SECOND + 5);
  check('growth with a newer mtime is appended', run(growing).mode, 'appended');
  check('growth with the very same mtime is appended', (() => { add(growing, lines([use(5, 'g4', 'Edit', { file_path: 'C:/repo/f.txt' })]), BASE_SECOND + 5); return run(growing).mode; })(), 'appended');

  const whole = freshFile();
  put(whole, readFileSync(growing, 'utf8'));
  check('the incremental index equals the one built in a single pass', content(run(growing, { readBytes: NEVER }).index), content(run(whole).index));

  const step = freshFile();
  put(step, '');
  const steps = [use(1, 's1', 'Bash', { command: 'a' }), answer(2, 's1'), use(3, 's2', 'Write', { file_path: 'x' }), use(4, 's3', 'Bash', { command: 'b' }), answer(5, 's3')];
  let stepSecond = BASE_SECOND;
  let latest;
  for (const record of steps) {
    stepSecond += 1;
    add(step, lines([record]), stepSecond);
    latest = run(step).index;
  }
  const allAtOnce = freshFile();
  put(allAtOnce, lines(steps));
  check('indexing after every appended record equals one pass over all of them', content(latest), content(run(allAtOnce).index));

  // --- a file that did not just grow is rebuilt ---
  const shrinking = freshFile();
  put(shrinking, lines([use(1, 'r1', 'Write', { file_path: 'old1' }), use(2, 'r2', 'Write', { file_path: 'old2' })]));
  run(shrinking);
  put(shrinking, lines([use(3, 'r3', 'Write', { file_path: 'new' })]), BASE_SECOND + 10);
  const shrunk = run(shrinking);
  check('a shrunk file is re-indexed from 0', [shrunk.mode, shrunk.index.writes.map((write) => write.path), shrunk.index.records], ['rebuilt', ['new'], 1]);

  const older = freshFile();
  put(older, lines([use(1, 'o1', 'Write', { file_path: 'kept' })]), BASE_SECOND + 100);
  run(older);
  put(older, lines([use(2, 'o2', 'Write', { file_path: 'other' }), use(3, 'o3', 'Write', { file_path: 'longer' })]), BASE_SECOND);
  const olderRun = run(older);
  check('a larger file with an older mtime is a replacement, re-indexed from 0', [olderRun.mode, olderRun.index.writes.map((write) => write.path)], ['rebuilt', ['other', 'longer']]);

  const sameSize = freshFile();
  put(sameSize, lines([use(1, 'z1', 'Write', { file_path: 'aaa' })]), BASE_SECOND);
  run(sameSize);
  put(sameSize, lines([use(1, 'z1', 'Write', { file_path: 'bbb' })]), BASE_SECOND + 50);
  const sameRun = run(sameSize);
  check('the same size with another mtime is re-indexed', [sameRun.mode, sameRun.index.writes.map((write) => write.path)], ['rebuilt', ['bbb']]);

  // --- a different file that merely grew past the old one is not an append ---
  const swapped = freshFile();
  put(swapped, lines([use(1, 'w1', 'Write', { file_path: 'old1' }), use(2, 'w2', 'Write', { file_path: 'old2' })]), BASE_SECOND);
  const swappedBefore = run(swapped).index;
  put(swapped, lines([use(3, 'w3', 'Write', { file_path: 'new1' }), use(4, 'w4', 'Write', { file_path: 'new2' }), use(5, 'w5', 'Write', { file_path: 'new3' })]), BASE_SECOND + 60);
  const swappedRun = run(swapped);
  check('a larger file with a newer mtime and another head is rebuilt, the old writes do not survive', [swappedRun.mode, swappedRun.index.writes.map((write) => write.path)], ['rebuilt', ['new1', 'new2', 'new3']]);
  check('the head fingerprint covers the whole file when it is short', [swappedBefore.headBytes, swappedRun.index.headBytes], [Buffer.byteLength(lines([use(1, 'w1', 'Write', { file_path: 'old1' }), use(2, 'w2', 'Write', { file_path: 'old2' })])), headLength(swapped)]);

  const long = (n, id) => use(n, id, 'Bash', { command: `echo ${'x'.repeat(900)}` });
  const big = freshFile();
  put(big, lines([long(1, 'L1'), long(2, 'L2'), long(3, 'L3'), long(4, 'L4'), long(5, 'L5')]));
  const bigBefore = run(big).index;
  const bigExtra = lines([long(6, 'L6')]);
  add(big, bigExtra);
  const bigRun = run(big);
  check('an append to a file past 4096 bytes reads exactly the appended bytes, one byte before them and 4096 head bytes', [bigRun.mode, bigRun.counted, bigRun.index.headBytes], ['appended', Buffer.byteLength(bigExtra) + 1 + 4096, 4096]);
  check('the stored head is the full 4096 bytes after the first indexing of a big file', bigBefore.headBytes, 4096);

  const growsPast = freshFile();
  put(growsPast, lines([long(1, 'P1')]));
  const smallRun = run(growsPast);
  add(growsPast, lines([long(2, 'P2'), long(3, 'P3'), long(4, 'P4'), long(5, 'P5')]));
  const pastRun = run(growsPast);
  check('a file shorter than 4096 bytes that grows past it is still an append', [smallRun.index.headBytes < 4096, pastRun.mode, pastRun.index.records], [true, 'appended', 5]);
  check('the fingerprint is refreshed to the 4096 bytes now present', pastRun.index.headBytes, 4096);
  add(growsPast, lines([long(6, 'P6')]));
  check('the next append compares the refreshed head', [run(growsPast).mode, run(growsPast, { readBytes: NEVER }).mode], ['appended', 'unchanged']);
  const growsWhole = freshFile();
  put(growsWhole, readFileSync(growsPast, 'utf8'));
  check('the index that grew past 4096 equals the one built in one pass', content(run(growsPast, { readBytes: NEVER }).index), content(run(growsWhole).index));

  // --- the size and mtime rules still decide when the head is the same ---
  const base = [long(1, 'B1'), long(2, 'B2'), long(3, 'B3'), long(4, 'B4'), long(5, 'B5')];
  const write = (n, id, name) => use(n, id, 'Write', { file_path: name });
  const sameHead = (name, first, second, firstSecond, secondSecond) => {
    const file = freshFile(name);
    put(file, lines(first), firstSecond);
    run(file);
    put(file, lines(second), secondSecond);

    return run(file);
  };
  const pathsOf = (result) => [result.mode, result.index.writes.map((entry) => entry.path)];
  check('a shrunk file with the same head is rebuilt', pathsOf(sameHead('s1.jsonl', [...base, write(6, 'k1', 'old'), write(7, 'k2', 'old2')], [...base, write(6, 'k1', 'new')], BASE_SECOND, BASE_SECOND + 9)), ['rebuilt', ['new']]);
  check('the same size with another mtime and the same head is rebuilt', pathsOf(sameHead('s2.jsonl', [...base, write(6, 'k1', 'aaa')], [...base, write(6, 'k1', 'bbb')], BASE_SECOND, BASE_SECOND + 9)), ['rebuilt', ['bbb']]);
  check('a larger file with an older mtime and the same head is rebuilt', pathsOf(sameHead('s3.jsonl', [...base, write(6, 'k1', 'old')], [...base, write(6, 'k1', 'x'), write(7, 'k2', 'y')], BASE_SECOND + 100, BASE_SECOND)), ['rebuilt', ['x', 'y']]);

  // --- a torn last line waits ---
  const torn = freshFile();
  put(torn, lines([use(1, 't1', 'Write', { file_path: 'whole' })]));
  const tornBase = run(torn).index;
  const tail = JSON.stringify(use(2, 't2', 'Write', { file_path: 'later' }));
  add(torn, tail.slice(0, 25));
  const waiting = run(torn);
  check('a torn last line is not indexed and the offset stays', [waiting.index.writes.length, waiting.index.offset, waiting.index.records], [1, tornBase.offset, 1]);
  check('an unchanged torn file reads 0 bytes', run(torn, { readBytes: NEVER }).counted, 0);
  add(torn, `${tail.slice(25)}\n`);
  const completed = run(torn);
  check('the completed line is indexed once, by the next call', [completed.mode, completed.index.writes.map((write) => write.path), completed.index.records], ['appended', ['whole', 'later'], 2]);
  check('the completion reads the torn bytes again, the head bytes and nothing else', completed.counted, Buffer.byteLength(`${tail}\n`) + 1 + headLength(torn));

  // --- the cache ---
  const keyed = freshFile('same.jsonl');
  const other = freshFile('same.jsonl');
  check('two transcripts with one file name have two caches', cachePath(keyed) === cachePath(other), false);
  check('the cache lives under the state directory of the mechanism', cachePath(keyed).startsWith(path.join(process.env.HOOK_STATE_DIR, 'transcript-index')), true);
  const names = (() => { try { return readdirSync(path.dirname(cachePath(census))); } catch { return []; } })();
  check('the cache is one file per transcript and no temp file is left', [names.includes(path.basename(cachePath(census))), names.every((name) => name.endsWith('.json'))], [true, true]);

  const stale = freshFile();
  put(stale, lines([use(1, 'v1', 'Write', { file_path: 'real' })]));
  const current = run(stale).index;
  const plant = (text) => { mkdirSync(path.dirname(cachePath(stale)), { recursive: true }); writeFileSync(cachePath(stale), text); };
  const poisoned = (changes) => plant(JSON.stringify({ ...current, writes: [{ id: 'x', tool: 'Write', path: 'POISON', timestamp: null }], ...changes }));
  const rebuiltPaths = () => run(stale).index.writes?.map((write) => write.path);

  poisoned({ version: 1 });
  check('a cache written by version 1 (no head fingerprint) is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ head: 7 });
  check('a cache whose head fingerprint is not text is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ headBytes: current.size + 1 });
  check('a cache whose head covers more than the file is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ headBytes: -1 });
  check('a cache with a negative head length is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ headBytes: 1.5 });
  check('a cache with a fractional head length is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ version: INDEX_VERSION - 1 });
  check('a cache of an older version is rebuilt, not trusted', rebuiltPaths(), ['real']);
  poisoned({ version: INDEX_VERSION + 1 });
  check('a cache of a newer version is rebuilt too', rebuiltPaths(), ['real']);
  poisoned({ path: path.resolve(other) });
  check('a cache that names another transcript is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ offset: current.size + 5 });
  check('a cache whose offset lies beyond the file is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ offset: -1 });
  check('a cache with a negative offset is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ offset: 1.5 });
  check('a cache with a fractional offset is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ writes: undefined });
  check('a cache missing an array is rebuilt', rebuiltPaths(), ['real']);
  poisoned({ shells: 'no' });
  check('a cache whose shells are not an array is rebuilt', run(stale).index.shells, []);
  plant('{ not json');
  check('a corrupt cache file is rebuilt', rebuiltPaths(), ['real']);
  plant('null');
  check('a cache that is not an object is rebuilt', rebuiltPaths(), ['real']);
  check('a current cache is trusted', run(stale, { readBytes: NEVER }).mode, 'unchanged');

  // --- bad arguments speak both languages ---
  const missing = thrownBy(() => indexTranscript(path.join(scratch, 'nowhere.jsonl')));
  check('a missing transcript throws a bilingual message', [missing?.includes('does not exist'), missing?.includes('@es')], [true, true]);
  const directory = thrownBy(() => indexTranscript(scratch));
  check('a directory is refused with the same bilingual message', [directory?.includes('not a regular file'), directory?.includes('@es')], [true, true]);
  const argument = thrownBy(() => indexTranscript(''));
  check('an empty path is refused with a bilingual message', [argument?.includes('non-empty string'), argument?.includes('@es')], [true, true]);
  check('a non-string path is refused', thrownBy(() => indexTranscript(42))?.includes('non-empty string'), true);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`transcript-index selftest FAILED (${failures.length}). @es el selftest de transcript-index FALLÓ.`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`transcript-index selftest OK (${passed} checks). @es el selftest de transcript-index está OK (${passed} comprobaciones).`);
