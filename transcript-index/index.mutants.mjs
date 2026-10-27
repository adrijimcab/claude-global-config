#!/usr/bin/env node
/**
 * The decisions of `transcript-index/index.mjs`, each broken once, that `index.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * Not mutated, on purpose: `findLast` to `find` (call ids are unique, so both answer the same), and the
 * `${process.pid}` in the temporary name (it only avoids two writers sharing a temporary file).
 *
 * @es Las decisiones de `index.mjs`, rotas una a una, que `index.selftest.mjs` debe detectar. Un mutante que
 * solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`). Sin mutar, a propósito:
 * `findLast` por `find` (los ids de llamada son únicos, ambos responden igual) y el `${process.pid}` del
 * nombre temporal (solo evita que dos escritores compartan fichero temporal).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const I = 'transcript-index/index.mjs';

const MUTANTS = [
  // --- what the file did since the last call ---
  ['an unchanged file is read again', I, "if (cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return 'unchanged';", "if (cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return 'append';"],
  ['a file is unchanged when only its size matches', I, 'cached.size === stat.size && cached.mtimeMs === stat.mtimeMs', 'cached.size === stat.size'],
  ['a file is unchanged when only its mtime matches', I, 'cached.size === stat.size && cached.mtimeMs === stat.mtimeMs', 'cached.mtimeMs === stat.mtimeMs'],
  ['growth is read again from 0', I, "? 'append' : 'rebuild';", "? 'rebuild' : 'rebuild';"],
  ['every change is an append', I, "? 'append' : 'rebuild';", "? 'append' : 'append';"],
  ['a shrunk file is appended to the old index', I, 'stat.size > cached.size && stat.mtimeMs', 'stat.size !== cached.size && stat.mtimeMs'],
  ['the same size is taken for growth', I, 'stat.size > cached.size && stat.mtimeMs', 'stat.size >= cached.size && stat.mtimeMs'],
  ['an older mtime is taken for growth', I, 'stat.size > cached.size && stat.mtimeMs >= cached.mtimeMs', 'stat.size > cached.size'],
  ['an equal mtime is not growth', I, 'stat.mtimeMs >= cached.mtimeMs', 'stat.mtimeMs > cached.mtimeMs'],
  ['no cache means an append', I, "if (cached === null) return 'rebuild';", "if (cached === null) return 'append';"],
  ['a rebuild keeps the old records', I, "const state = plan === 'append' ? cached.state : fold.initial();", 'const state = cached?.state ?? fold.initial();'],
  ['an append starts again from 0 over the old records', I, "readFrom(file, plan === 'append' ? cached.offset : 0,", 'readFrom(file, 0,'],
  ['a rebuild starts from the old offset', I, "readFrom(file, plan === 'append' ? cached.offset : 0,", "readFrom(file, cached?.offset ?? 0,"],
  ['the mode always says appended', I, "plan === 'append' ? 'appended' : 'rebuilt');", "'appended');"],
  ['the bytes read are not counted', I, 'bytesRead += bytes;', ''],
  ['the caller is not told about reads', I, 'onRead?.(bytes);', ''],

  // --- what is stored ---
  ['the stored offset is the end of the file, torn tail included', I, 'mtimeMs: stat.mtimeMs, offset, headBytes', 'mtimeMs: stat.mtimeMs, offset: stat.size, headBytes'],
  ['the stored size is not kept', I, 'path: path.resolve(file), size: stat.size,', 'path: path.resolve(file), size: 0,'],
  ['the stored mtime is not kept', I, 'mtimeMs: stat.mtimeMs, offset, headBytes', 'mtimeMs: 0, offset, headBytes'],
  ['the index is not saved', I, '  saveCache(file, fold, cache);\n', ''],
  ['the cache is written but never moved into place', I, '  renameSync(temporary, target);\n', ''],
  ['two transcripts with one file name share a cache', I, "update(`${path.resolve(file)}\\n${fold.name}`)", "update(`${path.basename(file)}\\n${fold.name}`)"],
  ['two folds of one transcript share a cache', I, "update(`${path.resolve(file)}\\n${fold.name}`)", "update(`${path.resolve(file)}`)"],

  // --- what a cache must hold to be trusted ---
  ['a cache of another version is trusted', I, 'cached.version === INDEX_VERSION && ', ''],
  ['a cache of another transcript is trusted', I, ' && cached.path === path.resolve(file)', ''],
  ['a negative offset is trusted', I, 'cached.offset >= 0', 'true'],
  ['an offset beyond the file is trusted', I, ' && cached.offset <= cached.size', ''],
  ['a fractional offset is trusted', I, 'Number.isInteger(cached.offset)', "typeof cached.offset === 'number'"],
  ['a cache with a missing array is trusted', I, " && ARRAYS.every((name) => Array.isArray(state[name]))", ''],
  ['a cache whose state the fold rejects is trusted', I, ' && fold.isState(cached.state)', ''],
  ['a cache of another fold is trusted', I, ' && cached.fold === fold.name', ''],
  ['a cache of another fold version is trusted', I, ' && cached.foldVersion === fold.version', ''],
  ['a cache with no state object is trusted', I, "isState: (state) => state !== null && typeof state === 'object' && ARRAYS", 'isState: (state) => ARRAYS'],
  ['a cache that is not an object is trusted', I, "cached !== null && typeof cached === 'object' && ", ''],
  ['a corrupt cache throws', I, "} catch {\n    return null;\n  }\n  const usable", "} catch (error) {\n    throw error;\n  }\n  const usable"],

  // --- what a record contributes ---
  ['a Read is indexed as a write', I, "NotebookEdit: 'notebook_path' };", "NotebookEdit: 'notebook_path', Read: 'file_path' };"],
  ['Write is not a write tool', I, "Write: 'file_path', ", ''],
  ['Edit is not a write tool', I, "Write: 'file_path', Edit: 'file_path', MultiEdit", 'Write: \'file_path\', MultiEdit'],
  ['MultiEdit is not a write tool', I, "MultiEdit: 'file_path', ", ''],
  ['NotebookEdit reads the wrong field', I, "NotebookEdit: 'notebook_path'", "NotebookEdit: 'file_path'"],
  ['a write whose path is not a string is indexed', I, 'field !== undefined && isText(block.input?.[field])', 'field !== undefined'],
  ['a write is indexed without its timestamp', I, 'tool: block.name, path: block.input[field], timestamp }', 'tool: block.name, path: block.input[field], timestamp: null }'],
  ['a tool_use with no string id is indexed', I, '  if (!isText(block.id)) return;\n\n', ''],
  ['only some tool_use ids are kept', I, 'state.toolUseIds.push(block.id);', "if (block.name === 'Bash') state.toolUseIds.push(block.id);"],
  ['a tool other than Bash opens a shell window', I, "block.name === 'Bash' && isText", 'isText'],
  ['a shell whose command is not a string opens a window', I, "block.name === 'Bash' && isText(block.input?.command)", "block.name === 'Bash'"],
  ['the shell cwd is not recorded', I, 'cwd: isText(record.cwd) ? record.cwd : null', 'cwd: null'],
  ['a missing cwd is recorded as undefined', I, 'cwd: isText(record.cwd) ? record.cwd : null', 'cwd: record.cwd'],
  ['a shell window opens without its first timestamp', I, 'first: timestamp, last: timestamp }', 'first: null, last: timestamp }'],
  ['a shell window opens with no last timestamp', I, 'first: timestamp, last: timestamp }', 'first: timestamp, last: null }'],
  ['a result does not close its window', I, 'if (window !== undefined) window.last = timestamp;', ''],
  ['a result moves the window start instead of its end', I, 'window.last = timestamp;', 'window.first = timestamp;'],
  ['a result without a timestamp erases the window end', I, "block?.type === 'tool_result' && timestamp !== null", "block?.type === 'tool_result'"],
  ['a result closes the first window instead of the one with its id', I, 'state.shells.findLast((shell) => shell.id === block.tool_use_id)', 'state.shells.at(0)'],
  ['a tool_use is read from tool_result blocks too', I, "if (block?.type === 'tool_use') absorbToolUse", "if (block?.type === 'tool_use' || block?.type === 'tool_result') absorbToolUse"],
  ['the records are not counted', I, '    state.records += 1;\n', ''],
  ['a line that is not an object is counted', I, "    if (record === null || typeof record !== 'object' || Array.isArray(record)) return;\n\n", ''],
  ['an array line is taken for a record', I, " || Array.isArray(record)) return;", ') return;'],
  ['a record without a timestamp erases the last timestamp', I, 'if (timestamp !== null) state.lastTimestamp = timestamp;', 'state.lastTimestamp = timestamp;'],
  ['the last timestamp is never kept', I, 'if (timestamp !== null) state.lastTimestamp = timestamp;', ''],
  ['a non-string timestamp is kept', I, 'const timestamp = isText(record.timestamp) ? record.timestamp : null;', 'const timestamp = record.timestamp ?? null;'],
  ['message content that is not an array is read', I, 'Array.isArray(record.message?.content) ? record.message.content : []', 'record.message?.content ?? []'],

  // --- the head fingerprint ---
  ['the head is never compared, so a replacement is appended to', I, "    if (digestOf(head.subarray(0, cached.headBytes)) !== cached.head) plan = 'rebuild';\n", ''],
  ['the head comparison is inverted', I, '!== cached.head) plan', '=== cached.head) plan'],
  ['the whole current head is compared, not the part that existed', I, 'digestOf(head.subarray(0, cached.headBytes))', 'digestOf(head)'],
  ['the head bytes are not counted as read', I, '      onRead(got);\n', ''],
  ['the head is 1024 bytes', I, 'const HEAD_BYTES = 4096;', 'const HEAD_BYTES = 1024;'],
  ['the head is 8192 bytes', I, 'const HEAD_BYTES = 4096;', 'const HEAD_BYTES = 8192;'],
  ['the head is the whole file', I, 'Math.min(stat.size, HEAD_BYTES)', 'stat.size'],
  ['the fingerprint is not refreshed after an append', I, 'headBytes: head.length, head: digestOf(head), state }', 'headBytes: cached?.headBytes || head.length, head: cached?.head || digestOf(head), state }'],
  ['a rebuild stores no fingerprint', I, 'head ??= readBytesAt(file, 0, headLength, io);', 'head ??= Buffer.alloc(0);'],
  ['an older cache version is trusted', I, 'export const INDEX_VERSION = 3;', 'export const INDEX_VERSION = 2;'],
  ['a negative head length is trusted', I, 'cached.headBytes >= 0', 'true'],
  ['a head length beyond the file is trusted', I, ' && cached.headBytes <= cached.size', ''],
  ['a fractional head length is trusted', I, 'Number.isInteger(cached.headBytes)', "typeof cached.headBytes === 'number'"],
  ['a head fingerprint that is not text is trusted', I, ' && isText(cached.head)', ''],

  // --- any fold and the unterminated last line ---
  ['a fold is not handed the line text', I, 'onRecord: (record, line) => fold.absorb(state, record, line)', 'onRecord: (record) => fold.absorb(state, record)'],
  ['the unterminated tail is absorbed even when not asked', I, 'state: unterminated ? withUnterminated(', 'state: true ? withUnterminated('],
  ['the unterminated tail is never absorbed', I, 'state: unterminated ? withUnterminated(', 'state: false ? withUnterminated('],
  ['the unterminated tail is absorbed into the cached state itself', I, '  const copy = structuredClone(state);\n', '  const copy = state;\n'],
  ['the unterminated tail is read from the start of the file', I, 'readBytesAt(file, offset, size - offset, io)', 'readBytesAt(file, 0, size, io)'],
  ['a tail that does not parse is absorbed as text', I, "  } catch {\n    return state;\n  }\n  const copy", "  } catch {\n    record = text;\n  }\n  const copy"],
  ['the tail is looked for even when the offset is at the end', I, '  if (offset >= size) return state;\n', ''],
  ['the tail bytes are not reported as read', I, 'readBytesAt(file, offset, size - offset, io)', 'readBytesAt(file, offset, size - offset, { readBytes: io.readBytes, onRead: () => {} })'],

  ['a cache that cannot be written fails the answer', I, "  } catch {\n    // A cache that cannot be written", "  } catch (error) {\n    throw error;\n    // A cache that cannot be written"],

  // --- the argument ---
  ['an empty path is accepted', I, "if (!isText(file) || file.length === 0) throw", "if (!isText(file)) throw"],
  ['a non-string path is accepted', I, "if (!isText(file) || file.length === 0) throw", "if (file.length === 0) throw"],
  ['a directory is accepted as a transcript', I, '  if (!stat.isFile()) throw new Error(bilingual(\'unreadable-transcript\', { file }));\n', ''],
  ['a missing transcript throws the raw error', I, "  } catch {\n    throw new Error(bilingual('unreadable-transcript', { file }));", "  } catch (error) {\n    throw error;"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['transcript-index', 'hook-state', 'bilingual-output'],
  selftest: 'transcript-index/index.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
