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
  ['an append starts from 0 and keeps the old records', I, "const index = plan === 'append' ? cached : emptyIndex(file);", "const index = cached ?? emptyIndex(file);"],
  ['a rebuild keeps the old records', I, "const index = plan === 'append' ? cached : emptyIndex(file);", 'const index = cached ?? emptyIndex(file);\n  if (plan === \'rebuild\') index.offset = 0;'],
  ['the mode always says appended', I, "mode: plan === 'append' ? 'appended' : 'rebuilt'", "mode: 'appended'"],
  ['the bytes read are not counted', I, 'bytesRead += bytes;', ''],
  ['the caller is not told about reads', I, 'onRead?.(bytes);', ''],

  // --- what is stored ---
  ['the stored offset is the end of the file, torn tail included', I, 'Object.assign(index, { size: stat.size, mtimeMs: stat.mtimeMs, offset });', 'Object.assign(index, { size: stat.size, mtimeMs: stat.mtimeMs, offset: stat.size });'],
  ['the stored size is not kept', I, 'Object.assign(index, { size: stat.size, mtimeMs: stat.mtimeMs, offset });', 'Object.assign(index, { size: 0, mtimeMs: stat.mtimeMs, offset });'],
  ['the stored mtime is not kept', I, 'Object.assign(index, { size: stat.size, mtimeMs: stat.mtimeMs, offset });', 'Object.assign(index, { size: stat.size, mtimeMs: 0, offset });'],
  ['the index is not saved', I, '  saveCache(file, index);\n', ''],
  ['the cache is written but never moved into place', I, '  renameSync(temporary, target);\n', ''],
  ['two transcripts with one file name share a cache', I, ".update(path.resolve(file))", ".update(path.basename(file))"],

  // --- what a cache must hold to be trusted ---
  ['a cache of another version is trusted', I, 'cached.version === INDEX_VERSION && ', ''],
  ['a cache of another transcript is trusted', I, ' && cached.path === path.resolve(file)', ''],
  ['a negative offset is trusted', I, 'cached.offset >= 0', 'true'],
  ['an offset beyond the file is trusted', I, ' && cached.offset <= cached.size', ''],
  ['a fractional offset is trusted', I, 'Number.isInteger(cached.offset)', "typeof cached.offset === 'number'"],
  ['a cache with a missing array is trusted', I, ' && ARRAYS.every((name) => Array.isArray(cached[name]))', ''],
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
  ['only some tool_use ids are kept', I, 'index.toolUseIds.push(block.id);', "if (block.name === 'Bash') index.toolUseIds.push(block.id);"],
  ['a tool other than Bash opens a shell window', I, "block.name === 'Bash' && isText", 'isText'],
  ['a shell whose command is not a string opens a window', I, "block.name === 'Bash' && isText(block.input?.command)", "block.name === 'Bash'"],
  ['the shell cwd is not recorded', I, 'cwd: isText(record.cwd) ? record.cwd : null', 'cwd: null'],
  ['a missing cwd is recorded as undefined', I, 'cwd: isText(record.cwd) ? record.cwd : null', 'cwd: record.cwd'],
  ['a shell window opens without its first timestamp', I, 'first: timestamp, last: timestamp }', 'first: null, last: timestamp }'],
  ['a shell window opens with no last timestamp', I, 'first: timestamp, last: timestamp }', 'first: timestamp, last: null }'],
  ['a result does not close its window', I, 'if (window !== undefined) window.last = timestamp;', ''],
  ['a result moves the window start instead of its end', I, 'window.last = timestamp;', 'window.first = timestamp;'],
  ['a result without a timestamp erases the window end', I, "block?.type === 'tool_result' && timestamp !== null", "block?.type === 'tool_result'"],
  ['a result closes the first window instead of the one with its id', I, 'index.shells.findLast((shell) => shell.id === block.tool_use_id)', 'index.shells.at(0)'],
  ['a tool_use is read from tool_result blocks too', I, "if (block?.type === 'tool_use') absorbToolUse", "if (block?.type === 'tool_use' || block?.type === 'tool_result') absorbToolUse"],
  ['the records are not counted', I, '  index.records += 1;\n', ''],
  ['a line that is not an object is counted', I, "  if (record === null || typeof record !== 'object' || Array.isArray(record)) return;\n\n", ''],
  ['an array line is taken for a record', I, " || Array.isArray(record)) return;", ') return;'],
  ['a record without a timestamp erases the last timestamp', I, 'if (timestamp !== null) index.lastTimestamp = timestamp;', 'index.lastTimestamp = timestamp;'],
  ['the last timestamp is never kept', I, 'if (timestamp !== null) index.lastTimestamp = timestamp;', ''],
  ['a non-string timestamp is kept', I, 'const timestamp = isText(record.timestamp) ? record.timestamp : null;', 'const timestamp = record.timestamp ?? null;'],
  ['message content that is not an array is read', I, 'Array.isArray(record.message?.content) ? record.message.content : []', 'record.message?.content ?? []'],

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
