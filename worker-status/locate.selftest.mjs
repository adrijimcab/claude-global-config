#!/usr/bin/env node
/**
 * Proof of `locate.mjs` and `transcript.mjs` over a CONSTRUCTED subagent store and constructed transcripts.
 * @es Prueba de `locate.mjs` y `transcript.mjs` sobre un almacén de subagentes y transcripts CONSTRUIDOS.
 */

import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findAgent, worktreeOf } from './locate.mjs';
import { describeEntry, lastRecord } from './transcript.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'worker-locate-'));
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const assistant = (content) => JSON.stringify({ type: 'assistant', message: { content } });
const toolUse = (name, input) => ({ type: 'tool_use', id: 't', name, input });
const write = (file, lines) => writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');

try {
  // ── the store walk (constructed root) ──
  const root = path.join(scratch, 'projects');
  const subagents = path.join(root, 'proj-a', 'sess-1', 'subagents');

  mkdirSync(subagents, { recursive: true });
  writeFileSync(path.join(subagents, 'agent-abc.meta.json'), JSON.stringify({ description: 'd', worktreePath: 'C:\\wt\\one' }));
  write(path.join(subagents, 'agent-abc.jsonl'), [assistant([toolUse('Bash', { command: 'ls' })])]);

  check('findAgent: bare id found through the real store walk', findAgent('abc', { root })?.id, 'agent-abc');
  check('findAgent: prefixed id found', findAgent('agent-abc', { root })?.id, 'agent-abc');
  check('findAgent: unknown id is undefined', findAgent('zzz', { root }), undefined);
  check('findAgent: project dir filter keeps the matching project', findAgent('abc', { projectDir: path.join(root, 'proj-a') })?.id, 'agent-abc');
  check('findAgent: project dir filter drops other projects', findAgent('abc', { projectDir: path.join(root, 'proj-b') }), undefined);
  check('findAgent: injected records are used', findAgent('q', { records: [{ id: 'agent-q', project: 'p' }] })?.project, 'p');

  // ── worktreeOf ──
  const record = (worktreePath) => ({ worktreePath, transcript: 'x' });
  const brief = (text) => () => text;

  check('worktreeOf: the harness path wins over the brief', worktreeOf(record('C:\\wt\\one'), brief('TENANCY: C:/other')), 'C:\\wt\\one');
  check('worktreeOf: Windows path on a TENANCY line', worktreeOf(record(''), brief('hello\nTENANCY: you write only inside C:/wt/two now')), 'C:/wt/two');
  check('worktreeOf: backticked POSIX path', worktreeOf(record(''), brief('TENANCY: `/home/me/wt`,')), '/home/me/wt');
  check('worktreeOf: TENANCY line without an absolute path', worktreeOf(record(''), brief('TENANCY: none')), undefined);
  check('worktreeOf: a path outside a TENANCY line is ignored', worktreeOf(record(''), brief('work in C:/wt/three')), undefined);
  check('worktreeOf: TENANCY without a colon is ignored', worktreeOf(record(''), brief('TENANCY C:/wt/four')), undefined);

  // ── describeEntry ──
  check('describeEntry: Bash tool call', describeEntry(JSON.parse(assistant([toolUse('Bash', { command: 'npm test' })]))), { kind: 'assistant:tool_use', tool: 'Bash', command: 'npm test' });
  check('describeEntry: Read uses file_path', describeEntry(JSON.parse(assistant([toolUse('Read', { file_path: '/a/b' })]))).command, '/a/b');
  check('describeEntry: long command is truncated to 120 + ellipsis', describeEntry(JSON.parse(assistant([toolUse('Bash', { command: 'x'.repeat(300) })]))).command, `${'x'.repeat(120)}…`);
  check('describeEntry: tool call with no usable detail has no command', describeEntry(JSON.parse(assistant([toolUse('Bash', { command: 5 })]))).command, undefined);
  check('describeEntry: assistant text has no tool', describeEntry(JSON.parse(assistant([{ type: 'text', text: 'hi' }]))), { kind: 'assistant:text', tool: undefined, command: undefined });
  check('describeEntry: user tool_result', describeEntry({ type: 'user', message: { content: [{ type: 'tool_result' }] } }).kind, 'user:tool_result');
  check('describeEntry: user string prompt', describeEntry({ type: 'user', message: { content: 'hola' } }).kind, 'user:text');
  check('describeEntry: empty content', describeEntry({ type: 'user', message: {} }).kind, 'user:empty');
  check('describeEntry: bookkeeping entry is not a conversation record', describeEntry({ type: 'queue-operation' }), undefined);

  // ── lastRecord ──
  const file = path.join(scratch, 't.jsonl');

  write(file, [assistant([toolUse('Bash', { command: 'first' })]), assistant([toolUse('Bash', { command: 'last' })]), JSON.stringify({ type: 'queue-operation' }), '{broken']);
  check('lastRecord: skips bookkeeping and broken trailing lines', lastRecord(file).command, 'last');
  check('lastRecord: mtime is the file mtime', lastRecord(file).mtimeMs, statSync(file).mtimeMs);

  write(file, [assistant([toolUse('Bash', { command: 'before' })]), JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'r'.repeat(600 * 1024) }] } })]);
  check('lastRecord: window grows past a large tail entry to the record behind it', lastRecord(file).kind, 'user:tool_result');

  write(file, [assistant([toolUse('Bash', { command: 'deep' })]), ...Array.from({ length: 5 }, () => JSON.stringify({ type: 'queue-operation', pad: 'p'.repeat(100 * 1024) }))]);
  check('lastRecord: window grows past bookkeeping padding to the conversation record', lastRecord(file).command, 'deep');

  write(file, [JSON.stringify({ type: 'queue-operation' })]);
  check('lastRecord: no conversation record gives kind none', lastRecord(file).kind, 'none');

  let threw = false;

  try {
    lastRecord(path.join(scratch, 'missing.jsonl'));
  } catch {
    threw = true;
  }
  check('lastRecord: a missing file throws (the caller decides)', threw, true);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
