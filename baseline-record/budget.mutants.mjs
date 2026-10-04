#!/usr/bin/env node
/**
 * The decisions of `baseline-record/budget.mjs`, each broken once, that `budget.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `budget.mjs`, rotas una a una, que `budget.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const B = 'baseline-record/budget.mjs';

const MUTANTS = [
  // --- the figures ---
  ['the raw figure keeps its thousands separator out of the pattern', B, '([\\d,]+) raw characters', '(\\d+) raw characters'],
  ['the harness-counted figure keeps its thousands separator out of the pattern', B, 'harness-counted ([\\d,]+)', 'harness-counted (\\d+)'],
  ['the ceiling keeps its thousands separator out of the pattern', B, 'against ([\\d,]+)/', 'against (\\d+)/'],
  ['separators are not removed before the number is read', B, "Number(text.split(',').join(''))", 'Number(text)'],
  ['a report with no figures is not refused', B, 'if (figures === null) return undefined;', ''],
  ['the raw and harness figures are swapped', B, 'rawChars: number(figures[1]), harnessChars: number(figures[2])', 'rawChars: number(figures[2]), harnessChars: number(figures[1])'],
  ['the ceiling is the raw figure', B, 'ceiling: number(figures[3])', 'ceiling: number(figures[1])'],

  // --- the file rows ---
  ['a row needs no raw / counted separator, so per-file-limit rows read as files', B, '([\\d,]+) \\/ ([\\d,]+)\\s+', '([\\d,]+)(?: \\/ )?([\\d,]*)\\s+'],
  ['a row is no longer recognised by its separator', B, '([\\d,]+) \\/ ([\\d,]+)\\s+', '([\\d,]+) \\| ([\\d,]+)\\s+'],
  ['a row must start at column 0', B, '/^\\s+([\\d,]+)', '/^([\\d,]+)'],
  ['a non-matching line is kept as a row', B, '.filter((row) => row !== null)', ''],
  ['raw and counted sizes are swapped', B, 'raw: number(row[1]), counted: number(row[2])', 'raw: number(row[2]), counted: number(row[1])'],
  ['the file name is the counted size', B, 'file: row[3] }', 'file: row[2] }'],
  ['a trailing carriage return breaks the row', B, 'FILE_ROW.exec(line.trimEnd())', 'FILE_ROW.exec(line)'],
  ['lines are split on a carriage return only', B, "text.split('\\n')", "text.split('\\r')"],

  // --- the project share ---
  ['a sibling that shares the project name prefix counts as inside', B, "return !relative.startsWith('..') && !path.isAbsolute(relative);", 'return !path.isAbsolute(relative);'],
  ['a file on another drive counts as inside', B, "return !relative.startsWith('..') && !path.isAbsolute(relative);", "return !relative.startsWith('..');"],
  ['inside is judged the wrong way round', B, 'path.relative(parent, child)', 'path.relative(child, parent)'],
  ['the project share sums the counted size', B, 'sum + row.raw', 'sum + row.counted'],
  ['the project share starts above zero', B, 'sum + row.raw, 0)', 'sum + row.raw, 1)'],
  ['the project share counts every file', B, '.filter((row) => isInside(project, row.file))', ''],

  // --- the command ---
  ['the command runs the wrong subcommand', B, "[capture, 'budget', '--project', project]", "[capture, 'check', '--project', project]"],
  ['the project flag is dropped', B, "[capture, 'budget', '--project', project]", "[capture, 'budget', project]"],
  ['the command runs in the caller directory', B, '{ cwd, encoding', '{ encoding'],
  ['the recorded command loses its interpreter', B, 'command: `node ${capture} budget', 'command: `${capture} budget'],
  ['the recorded command loses its project', B, 'budget --project ${project}`', 'budget`'],
  ['the exit code is not recorded', B, 'command: `node ${capture} budget --project ${project}`, exitCode, measured', 'command: `node ${capture} budget --project ${project}`, exitCode: 0, measured'],

  // --- what counts as a measurement ---
  ['exit 1 (over the ceiling) is not a measurement', B, '(exitCode === 0 || exitCode === 1) &&', 'exitCode === 0 &&'],
  ['exit 0 (within the ceiling) is not a measurement', B, '(exitCode === 0 || exitCode === 1) &&', 'exitCode === 1 &&'],
  ['exit 2 (broken configuration) is a measurement', B, '(exitCode === 0 || exitCode === 1) &&', 'exitCode !== null &&'],
  ['a report with no figures is a measurement', B, ' && parsed !== undefined;', ';'],
  ['the exit code and the report must both fail to refuse', B, '(exitCode === 0 || exitCode === 1) && parsed', '(exitCode === 0 || exitCode === 1) || parsed'],
  ['the parsed figures are not on the record', B, 'measured, ...parsed,', 'measured,'],

  // --- the two measurements ---
  ['the global set is measured on the real project', B, 'measureBudget({ capture, project: neutral, cwd: neutral })', 'measureBudget({ capture, project, cwd: neutral })'],
  ['the global run stands in the temp directory itself', B, 'measureBudget({ capture, project: neutral, cwd: neutral })', 'measureBudget({ capture, project: neutral, cwd: tmp })'],
  ['the project run stands in the caller directory', B, 'measureBudget({ capture, project, cwd: neutral })', 'measureBudget({ capture, project, cwd: process.cwd() })'],
  ['the project is measured on the empty directory', B, 'measureBudget({ capture, project, cwd: neutral })', 'measureBudget({ capture, project: neutral, cwd: neutral })'],
  ['the neutral directory is left behind', B, 'rmSync(neutral, { recursive: true, force: true });', ''],
  ['the neutral directory is created outside the given temp root', B, "mkdtempSync(path.join(realpathSync.native(tmp), 'budget-neutral-'))", "mkdtempSync(path.join(path.dirname(realpathSync.native(tmp)), 'budget-neutral-'))"],
  ['the neutral directory keeps the spelling of the temp root (a short name counts the home twice)', B, 'path.join(realpathSync.native(tmp), ', 'path.join(tmp, ']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['baseline-record'],
  selftest: 'baseline-record/budget.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
