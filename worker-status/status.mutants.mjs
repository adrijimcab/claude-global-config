#!/usr/bin/env node
/**
 * Mutant campaign of `report.mjs`, `status.mjs` and `messages.mjs`: each mutant reverts ONE decision and
 * `status.selftest.mjs` must go red by assertion. Exit 2 = NOT MEASURED (no shared runner).
 * @es Campaña de mutantes de `report.mjs`, `status.mjs` y `messages.mjs`. Salida 2 = NO MEDIDO.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const W = 'worker-status';

const MUTANTS = [
  // report.mjs
  ['an unknown id yields a report', `${W}/report.mjs`, 'if (record === undefined) return undefined;', ''],
  ['age is in milliseconds', `${W}/report.mjs`, '(now - tail.mtimeMs) / 1000', '(now - tail.mtimeMs)'],
  ['age can go negative', `${W}/report.mjs`, 'Math.max(0, Math.round((now - tail.mtimeMs) / 1000))', 'Math.round((now - tail.mtimeMs) / 1000)'],
  ['last write is not ISO', `${W}/report.mjs`, 'new Date(tail.mtimeMs).toISOString()', 'tail.mtimeMs'],
  ['processes are not truncated', `${W}/report.mjs`, 'commandLine.slice(0, FIELD_LIMIT)', 'commandLine'],
  ['processes are queried without a worktree', `${W}/report.mjs`, "worktree === undefined ? [] : processes(worktree)", 'processes(worktree ?? "")'],
  ['git is read for a vanished worktree', `${W}/report.mjs`, 'worktree !== undefined && existsSync(worktree) ? git(worktree) : undefined', 'worktree !== undefined ? git(worktree) : undefined'],
  ['the last record loses its tool', `${W}/report.mjs`, 'tool: tail.tool,', 'tool: undefined,'],
  ['the tool detail is not shown', `${W}/report.mjs`, "last.tool === undefined ? '' :", "true ? '' :"],
  ['the command is not shown', `${W}/report.mjs`, "last.command === undefined ? '' : `: ${last.command}`", "''"],
  ['the no-worktree line is missing', `${W}/report.mjs`, "report.worktree === undefined ? speaker.line('no-worktree') : speaker.line('worktree', { path: report.worktree })", "speaker.line('worktree', { path: report.worktree })"],
  ['unreadable git is silent', `${W}/report.mjs`, "git === undefined ? speaker.line('no-git') :", 'git === undefined ? speaker.line("age", { at: "", seconds: 0 }) :'],
  ['unknown ahead prints undefined', `${W}/report.mjs`, "ahead: git.ahead ?? '?'", 'ahead: git.ahead'],
  ['unknown base prints undefined', `${W}/report.mjs`, "base: git.base ?? '?'", 'base: git.base'],
  ['no-process line is missing', `${W}/report.mjs`, "if (report.worktree !== undefined && report.processes.length === 0) lines.push(speaker.line('no-process'));", ''],
  ['process lines are dropped', `${W}/report.mjs`, '...report.processes.map(({ pid, command }) => speaker.line(\'process\', { pid, command }))', ''],

  // status.mjs
  ['no id is accepted', `${W}/status.mjs`, 'if (id === undefined || (projectIndex !== -1 && projectDir === undefined)) {', 'if (false) {'],
  ['a dangling --project-dir is accepted', `${W}/status.mjs`, ' || (projectIndex !== -1 && projectDir === undefined)', ''],
  ['the project dir value can be the id', `${W}/status.mjs`, '&& index !== valueIndex', ''],
  ['an unknown id exits 0', `${W}/status.mjs`, "sink.error(speaker.line('unknown', { id }));\n    return 1;", "sink.error(speaker.line('unknown', { id }));\n    return 0;"],
  ['an unknown id is silent', `${W}/status.mjs`, "sink.error(speaker.line('unknown', { id }));", ''],
  ['usage is silent', `${W}/status.mjs`, "sink.error(speaker.line('usage'));", ''],
  ['--json is ignored', `${W}/status.mjs`, "argv.includes('--json') ?", 'false ?'],
  ['--json is always on', `${W}/status.mjs`, "argv.includes('--json') ?", 'true ?'],
  ['the project dir is not passed on', `${W}/status.mjs`, 'buildReport(id, { projectDir, ...deps })', 'buildReport(id, { ...deps })'],
  ['the CLI never sets the exit code', `${W}/status.mjs`, 'process.exitCode = run(process.argv.slice(2))', 'run(process.argv.slice(2))'],

];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(2);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: [W, 'agent-liveness', 'brief-tenancy', 'owner-language-guard', 'bilingual-output', 'hook-state', 'hook-caller'],
  selftest: `${W}/status.selftest.mjs`,
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
