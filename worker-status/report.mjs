/**
 * Assembles the status report of one subagent from the transcript store, its tail, the processes and the
 * git state of its worktree. Every source is injectable; nothing here prints.
 * @es Arma el informe de estado de un subagente. Toda fuente es inyectable; aquí no se imprime nada.
 */

import { existsSync } from 'node:fs';

import { findAgent, worktreeOf } from './locate.mjs';
import { speaker } from './messages.mjs';
import { processesNaming } from './processes.mjs';
import { FIELD_LIMIT, lastRecord } from './transcript.mjs';
import { gitState } from './worktree-git.mjs';

/** The report for `id`, or `undefined` when no such subagent exists. @es El informe del id, o `undefined`. */
export function buildReport(id, { projectDir, root, now = Date.now(), records, last = lastRecord, processes = processesNaming, git = gitState, readBrief } = {}) {
  const record = findAgent(id, { projectDir, root, records });

  if (record === undefined) return undefined;

  const tail = last(record.transcript);
  const worktree = worktreeOf(record, readBrief);

  return {
    id: record.id,
    transcript: record.transcript,
    lastWrite: new Date(tail.mtimeMs).toISOString(),
    ageSeconds: Math.max(0, Math.round((now - tail.mtimeMs) / 1000)),
    last: { kind: tail.kind, tool: tail.tool, command: tail.command },
    worktree,
    processes: worktree === undefined ? [] : processes(worktree).map(({ pid, commandLine }) => ({ pid, command: commandLine.slice(0, FIELD_LIMIT) })),
    git: worktree !== undefined && existsSync(worktree) ? git(worktree) : undefined
  };
}

/** The report as bilingual text lines. @es El informe como líneas de texto bilingües. */
export function renderLines(report) {
  const { last, git } = report;
  const detail = last.tool === undefined ? '' : ` ${last.tool}${last.command === undefined ? '' : `: ${last.command}`}`;
  const lines = [
    speaker.line('transcript', { path: report.transcript }),
    speaker.line('age', { at: report.lastWrite, seconds: report.ageSeconds }),
    speaker.line('last', { kind: last.kind, detail }),
    report.worktree === undefined ? speaker.line('no-worktree') : speaker.line('worktree', { path: report.worktree })
  ];

  if (report.worktree !== undefined) lines.push(git === undefined ? speaker.line('no-git') : speaker.line('git', { ...git, base: git.base ?? '?', ahead: git.ahead ?? '?' }));
  if (report.worktree !== undefined && report.processes.length === 0) lines.push(speaker.line('no-process'));

  return [...lines, ...report.processes.map(({ pid, command }) => speaker.line('process', { pid, command }))];
}
