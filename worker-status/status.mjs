#!/usr/bin/env node
/**
 * `status.mjs <agent-id> [--project-dir <dir>] [--json]`: where a subagent of this machine stands, from its
 * transcript, its processes and its worktree. An unknown id exits 1 with a bilingual message.
 * @es Dónde está un subagente de esta máquina, según su transcript, sus procesos y su worktree. Un id
 * desconocido sale con 1 y un mensaje bilingüe.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { speaker } from './messages.mjs';
import { buildReport, renderLines } from './report.mjs';

/** Runs the CLI over `argv` (without node and script) and returns the exit code. @es Corre el CLI; devuelve la salida. */
export function run(argv, sink = console, deps = {}) {
  const projectIndex = argv.indexOf('--project-dir');
  const projectDir = projectIndex === -1 ? undefined : argv[projectIndex + 1];
  const valueIndex = projectIndex === -1 ? -1 : projectIndex + 1;
  const id = argv.find((arg, index) => !arg.startsWith('--') && index !== valueIndex);

  if (id === undefined || (projectIndex !== -1 && projectDir === undefined)) {
    sink.error(speaker.line('usage'));
    return 1;
  }

  const report = buildReport(id, { projectDir, ...deps });

  if (report === undefined) {
    sink.error(speaker.line('unknown', { id }));
    return 1;
  }

  sink.log(argv.includes('--json') ? JSON.stringify(report, null, 2) : renderLines(report).join('\n'));
  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exitCode = run(process.argv.slice(2));
