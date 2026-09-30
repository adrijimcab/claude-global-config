#!/usr/bin/env node
/**
 * diff-coverage — grades exactly the lines and branches a branch's diff adds or changes, against a real,
 * complete coverage run, without blaming pre-existing debt elsewhere in the same files.
 *
 *   node ~/.claude/fleet-kit/diff-coverage/diff-coverage.mjs --worktree <dir> [--base <branch>] [--plan]
 *
 * Exit: 0 every changed line and branch covered (or nothing gradable) · 1 uncovered lines, printed as
 * `file:line` · 2 cannot grade (no config, coverage disabled, dirty tree, missing toolchain, incomplete
 * run) · 3 `--plan` printed, NO verdict.
 *
 * `--plan` is read-only: it diffs, classifies and checks every precondition, prints the exact command a
 * run would spawn, and spawns nothing.
 *
 * WHY A DIRTY TREE CANNOT BE GRADED. The diff is `merge-base..HEAD` — committed content. The test run
 * reads the WORKING tree. When they differ, the coverage describes a tree the diff does not, and a
 * "covered" could be earned by uncommitted code. So the run refuses; the plan reports it.
 *
 * The pure core (unified-zero diff parsing, lcov parsing, grading) is vendored byte-identical from the
 * b100 reference; this file adds only configuration, preconditions and the runner.
 *
 * @es diff-coverage — califica exactamente las líneas y ramas que añade o cambia el diff de una rama,
 * contra una corrida de cobertura real y completa, sin culpar deuda preexistente. `--plan` es solo
 * lectura: no lanza nada. Un árbol sucio no se puede calificar: el diff es contenido commiteado y la
 * corrida lee el árbol de trabajo.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { findConfig } from '../config/load-config.mjs';
import { isDisabled } from '../config/validate.mjs';
import { gitAsker, mustAsk, porcelainEntries } from '../lib/git.mjs';
import { runWhenMain } from '../lib/hook-io.mjs';
import { repositoryStateDir } from '../lib/state.mjs';
import { parseChangedLinesByFile } from '../vendor/diff-coverage/lib/diff-parse.mjs';
import { gradeChangedFiles } from '../vendor/diff-coverage/lib/grade.mjs';
import { parseLcov } from '../vendor/diff-coverage/lib/lcov-parse.mjs';
import { groupByProject } from './classify.mjs';
import { karmaRunProblem, ngTestArgs, runKarmaProject } from './karma/karma-run.mjs';
import { decideKarmaRun } from './karma/karma-summary.mjs';

export const EXIT = Object.freeze({ COVERED: 0, UNCOVERED: 1, CANNOT_GRADE: 2, PLAN: 3 });

const cannotGrade = (why) => ({ exitCode: EXIT.CANNOT_GRADE, message: `diff-coverage: cannot grade — ${why}` });

/** An lcov `SF:` path mapped to the repo-relative form the diff uses. @es Una ruta `SF:` a la forma relativa al repo. */
export const repoRelativeMapper = (top, workspace) => (raw) => (path.isAbsolute(raw) ? path.relative(top, raw).split(path.sep).join('/') : path.posix.join(workspace, raw));

/**
 * Everything the grader knows before running anything: config, base, diff, classification, the tree's
 * cleanliness, and each project's run problem. Pure reading.
 * @returns `{ refusal }` when grading is impossible from the start, else the plan.
 * @es Todo lo que el calificador sabe antes de correr nada. Solo lectura.
 */
export function planOf(worktree, requestedBase) {
  const found = findConfig(worktree);

  if (found === undefined) return { refusal: cannotGrade(`no .claude/fleet-kit.json governs ${worktree}`) };

  const { config, repository } = found;

  if (isDisabled(config.coverage)) return { refusal: cannotGrade(`coverage is not applicable to this repository: ${config.coverage.reason}`) };

  const ask = gitAsker(repository.top);
  const base = requestedBase ?? config.integrationBranches[0];
  const mergeBase = ask('merge-base', base, 'HEAD');

  if (mergeBase.status !== 0) return { refusal: cannotGrade(`the base "${base}" has no merge base with HEAD in ${repository.top}`) };

  const diff = mustAsk(ask, '-c', 'core.quotePath=false', 'diff', '--unified=0', '--no-color', mergeBase.stdout, 'HEAD');
  const { byProject, ungraded } = groupByProject(parseChangedLinesByFile(diff), config.coverage.projects);
  const projects = config.coverage.projects.filter((project) => byProject.has(project.name));
  const runProblems = new Map(projects.map((project) => [project.name, karmaRunProblem(path.join(repository.top, project.karma.workspace), project.karma)]));

  return { config, repository, base, mergeBase: mergeBase.stdout, head: mustAsk(ask, 'rev-parse', 'HEAD'), byProject, ungraded, projects, dirty: porcelainEntries(ask), runProblems };
}

/** The read-only report of a plan. @es El informe de solo lectura de un plan. */
export function planReport(plan) {
  const lines = [
    'diff-coverage PLAN — read-only, nothing was run, NO verdict',
    `  repository : ${plan.repository.top}`,
    `  base       : ${plan.base} (merge base ${plan.mergeBase})`,
    `  head       : ${plan.head}`,
    `  tree       : ${plan.dirty.length === 0 ? 'clean' : `DIRTY — ${plan.dirty.length} porcelain entries; a run would be refused`}`,
    `  ungraded   : ${plan.ungraded.length} changed file(s) outside every coverage project`
  ];

  for (const project of plan.projects) {
    const files = plan.byProject.get(project.name);
    const lineCount = [...files.values()].reduce((sum, changed) => sum + new Set(changed).size, 0);
    const problem = plan.runProblems.get(project.name);
    const workspaceDir = path.join(plan.repository.top, project.karma.workspace);

    lines.push(`  project ${project.name}: ${files.size} gradable file(s), ${lineCount} changed line(s)`);
    lines.push(`    would run: node ${ngTestArgs(workspaceDir, project.karma, '<run dir>/karma.graded.cjs').join(' ')}`);
    lines.push(`    runnable : ${problem === undefined ? 'yes' : `NO — ${problem}`}`);
  }

  if (plan.projects.length === 0) lines.push('  nothing gradable: a run would exit 0 without spawning anything');

  return lines.join('\n');
}

/** Grades one project: run, trust the run, then grade its changed lines. @es Califica un proyecto. */
function gradeProject(plan, project, runDir, runProject) {
  const workspaceDir = path.join(plan.repository.top, project.karma.workspace);
  const run = runProject({ workspaceDir, name: project.name, karma: project.karma, runDir });
  const trusted = decideKarmaRun(run);

  if (!trusted.ok) return { project: project.name, ok: false, reason: trusted.reason };

  const coverage = parseLcov(readFileSync(run.lcovPath, 'utf8'), repoRelativeMapper(plan.repository.top, project.karma.workspace));
  const { uncovered, missingFromCoverage } = gradeChangedFiles(plan.byProject.get(project.name), coverage);

  return { project: project.name, ok: true, uncovered, skipped: missingFromCoverage };
}

/** The verdict over every project's result. @es El veredicto sobre el resultado de cada proyecto. */
function verdictOf(results) {
  const failed = results.filter((result) => !result.ok);

  if (failed.length > 0) return cannotGrade(failed.map((result) => `[${result.project}] ${result.reason}`).join('; '));

  const uncovered = results.flatMap((result) => result.uncovered);
  const skipped = results.flatMap((result) => result.skipped);
  const skippedNote = skipped.length === 0 ? '' : `\n(skipped — never instrumented, e.g. codeCoverageExclude: ${skipped.join(', ')})`;

  if (uncovered.length > 0) return { exitCode: EXIT.UNCOVERED, message: `${uncovered.map((entry) => `${entry.file}:${entry.line} (${entry.reason})`).join('\n')}${skippedNote}`, uncovered };

  return { exitCode: EXIT.COVERED, message: `diff-coverage: every changed line and branch is covered.${skippedNote}` };
}

/**
 * The full decision for `worktree`.
 * @returns `{ exitCode, message }`.
 * @es La decisión completa para `worktree`.
 */
export function runDiffCoverage({ worktree, base, plan: planOnly = false, runProject = runKarmaProject, stateRoot }) {
  const plan = planOf(worktree, base);

  if (plan.refusal !== undefined) return plan.refusal;
  if (planOnly) return { exitCode: EXIT.PLAN, message: planReport(plan) };
  if (plan.projects.length === 0) return { exitCode: EXIT.COVERED, message: 'diff-coverage: no changed file is graded by any coverage project. Nothing to grade.' };
  if (plan.dirty.length > 0) return cannotGrade(`the tree has ${plan.dirty.length} porcelain entries; coverage of the working tree would not describe the committed diff`);

  const blocked = [...plan.runProblems].filter(([, problem]) => problem !== undefined);

  if (blocked.length > 0) return cannotGrade(blocked.map(([name, problem]) => `[${name}] ${problem}`).join('; '));

  const runDir = path.join(repositoryStateDir(plan.repository.mainCheckout, stateRoot), 'diff-coverage', `run-${Date.now()}-${process.pid}`);

  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });

  const results = plan.projects.map((project) => gradeProject(plan, project, runDir, runProject));

  writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify({ base: plan.base, mergeBase: plan.mergeBase, head: plan.head, results }, null, 2)}\n`);

  return verdictOf(results);
}

/** Reads `--name value` from argv. @es Lee `--name value` del argv. */
const option = (argv, name) => {
  const at = argv.indexOf(name);

  return at === -1 ? undefined : argv[at + 1];
};

function main() {
  const argv = process.argv.slice(2);
  const worktree = option(argv, '--worktree');

  if (worktree === undefined) {
    process.stdout.write('diff-coverage: --worktree <dir> is required\n');
    process.exitCode = EXIT.CANNOT_GRADE;

    return;
  }

  try {
    const { exitCode, message } = runDiffCoverage({ worktree: path.resolve(worktree), base: option(argv, '--base'), plan: argv.includes('--plan') });

    process.stdout.write(`${message}\n`);
    process.exitCode = exitCode;
  } catch (error) {
    process.stdout.write(`diff-coverage: malfunction, no verdict — ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT.CANNOT_GRADE;
  }
}

runWhenMain(import.meta.url, main);
