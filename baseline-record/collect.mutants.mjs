#!/usr/bin/env node
/**
 * The decisions of `baseline-record/collect.mjs` and of the `record.mjs` entry point, each broken once, that
 * `collect.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`;
 * `crashKills: 'fail'` makes a mutant that only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `collect.mjs` y del punto de entrada `record.mjs`, rotas una a una, que
 * `collect.selftest.mjs` debe detectar. Un mutante que solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const C = 'baseline-record/collect.mjs';
const R = 'baseline-record/record.mjs';

const MUTANTS = [
  // --- the latency command ---
  ['replay is not called in latency mode', C, "[replay, 'latency', '--manifest'", "[replay, '--manifest'"],
  ['the manifest is not passed', C, "'--manifest', manifest, ", ''],
  ['the run count is not passed', C, "'--runs', String(runs), ", ''],
  ['the projects root is not passed', C, "'--projects-root', projectsRoot, ", ''],
  ['the payload directory is not passed', C, "'--cwd', cwd, ", ''],
  ['the repos are not passed', C, "...repos.flatMap((repo) => ['--repo', `${repo.name}|${repo.worktree}|${repo.gitDir}`])", ''],
  ['a repo is passed without its git dir', C, '`${repo.name}|${repo.worktree}|${repo.gitDir}`', '`${repo.name}|${repo.worktree}`'],
  ['a repo is passed without its work tree', C, '`${repo.name}|${repo.worktree}|${repo.gitDir}`', '`${repo.name}||${repo.gitDir}`'],
  ['the latency manifest is not the Stop one', C, "'manifests', 'stop.json'", "'manifests', 'subagent-stop.json'"],
  ['the latency manifest is looked for in the home, not the fleet', C, "manifest: path.join(fleet, 'hook-dispatch'", "manifest: path.join(home, 'hook-dispatch'"],
  ['the real transcripts are looked for outside the home', C, "projectsRoot: path.join(home, 'projects')", 'projectsRoot'],
  ['the payload directory is the fleet', C, 'cwd: home, repos: scope', 'cwd: fleet, repos: scope'],
  ['the timeout is not given to the spawn', C, 'timeout: timeoutMs }', 'timeout: undefined }'],
  ['the timeout is not given to the run', C, 'timeoutMs: latencyTimeoutMs })', 'timeoutMs: undefined })'],
  ['the recorded command loses its interpreter', C, 'command: `node ${args.join', 'command: `${args.join'],
  ['the recorded command is not the one that ran', C, "command: `node ${args.join(' ')}`", "command: `node ${args[0]}`"],
  ['the exit code is not recorded', C, 'exitCode: run.status,', 'exitCode: 0,'],
  ['a failing replay is a measurement', C, 'measured: run.status === 0 && result', 'measured: result'],
  ['output that is not JSON is a measurement', C, 'run.status === 0 && result !== undefined', 'run.status === 0'],
  ['unparseable output is read as a result', C, 'result = undefined;', "result = {};"],
  ['the result is dropped', C, 'measured: run.status === 0 && result !== undefined, result }', 'measured: run.status === 0 && result !== undefined }'],

  // --- the record ---
  ['the schema is renamed', C, "schema: 'baseline-record/v1'", "schema: 'baseline-record/v2'"],
  ['the time is not the injected one', C, 'recordedAt: now()', 'recordedAt: new Date(0).toISOString()'],
  ['the budget is measured on the wrong project', C, 'project: b100, tmp }', 'project: discovery, tmp }'],
  ['the journals are read from the fleet', C, 'journals: journalCounts(home)', 'journals: journalCounts(fleet)'],
  ['the registry is read from the fleet', C, 'registry: registryCounts(home)', 'registry: registryCounts(fleet)'],
  ['the global tip is read from another directory', C, "{ name: '~/.claude', worktree: home, gitDir: path.join(home, '.git') }", "{ name: '~/.claude', worktree: fleet, gitDir: path.join(fleet, '.git') }"],
  ['the b100 tip is read through the project git dir', C, "worktree: path.join(b100, '.claude'), gitDir: backupGitDir", "worktree: path.join(b100, '.claude'), gitDir: path.join(b100, '.git')"],
  ['the b100 tip is read from the project, not its .claude', C, "worktree: path.join(b100, '.claude'), gitDir: backupGitDir", 'worktree: b100, gitDir: backupGitDir'],
  ['the product repos are read from the discovery directory', C, 'productRepos(projectsRoot)', 'productRepos(discovery)'],
  ['the discovery status is not limited to .claude', C, "pathspec: '.claude/'", 'pathspec: undefined'],
  ['the discovery status is read in the home', C, 'dir: discovery, pathspec', 'dir: home, pathspec'],
  ['the discovery inventory is of the repo, not its .claude', C, "dirInventory(path.join(discovery, '.claude'))", 'dirInventory(discovery)'],

  // --- completeness ---
  ['an unmeasured global budget is not a problem', C, "record.budget.global.measured ? [] : ['budget-global']", '[]'],
  ['an unmeasured project budget is not a problem', C, "record.budget.project.measured ? [] : ['budget-project']", '[]'],
  ['a measured global budget is a problem', C, "record.budget.global.measured ? [] : ['budget-global']", "record.budget.global.measured ? ['budget-global'] : []"],
  ['unreadable settings are not a problem', C, "record.registry.settings === 'unreadable' ? ['registry-settings'] : []", '[]'],
  ['a missing tip is not a problem', C, 'tip.tip === undefined', 'false'],
  ['a tip that exists is a problem', C, 'tip.tip === undefined', 'tip.tip !== undefined'],
  ['a missing tip is not named', C, '`tip:${tip.name}`', "'tip'"],
  ['a failed repo status is not a problem', C, '!repo.measured', 'false'],
  ['a repo with a dirty tree is a problem', C, '!repo.measured', 'repo.lines.length > 0'],
  ['a failed repo status is not named', C, '`repo:${repo.name}`', "'repo'"],
  ['a failed discovery status is not a problem', C, "record.discoveryClaude.porcelain.measured ? [] : ['discovery-status']", '[]'],
  ['an unmeasured latency is not a problem', C, "record.stopLatency.measured ? [] : ['stop-latency']", '[]'],
  ['the problems come out in another order', C, "...(record.stopLatency.measured ? [] : ['stop-latency'])", ''],

  // --- the entry point ---
  ['a run count option is not accepted', R, "'discovery', 'backup-git-dir', 'capture', 'replay', 'runs']", "'discovery', 'backup-git-dir', 'capture', 'replay']"],
  ['a capture script option is not accepted', R, "'backup-git-dir', 'capture', 'replay'", "'backup-git-dir', 'replay'"],
  ['misuse exits 1', R, 'process.exit(2)', 'process.exit(1)'],
  ['a refusal loses its Spanish half', R, ' @es RECHAZADO: argumentos inválidos (${error.message}). ${USAGE_ES}', ''],
  ['a refusal loses its accent', R, 'argumentos inválidos', 'argumentos invalidos'],
  ['a refusal loses its English usage', R, 'REFUSED: ${error.message}. ${USAGE_EN}', 'REFUSED: ${error.message}.'],
  ['the record is printed compact', R, 'JSON.stringify(record, null, 2)', 'JSON.stringify(record)'],
  ['the record goes to stderr', R, 'process.stdout.write(`${JSON.stringify', 'process.stderr.write(`${JSON.stringify'],
  ['the summary goes to stdout', R, 'process.stderr.write(`${renderSummary', 'process.stdout.write(`${renderSummary'],
  ['the summary lines are joined without a break', R, "renderSummary(record).join('\\n')", "renderSummary(record).join('')"],
  ['a complete record exits 1', R, 'problemsOf(record).length === 0 ? 0 : 1', 'problemsOf(record).length === 0 ? 1 : 0'],
  ['an incomplete record exits 0', R, 'problemsOf(record).length === 0 ? 0 : 1', '0'],
  ['an incomplete record exits 2', R, 'problemsOf(record).length === 0 ? 0 : 1', 'problemsOf(record).length === 0 ? 0 : 2'],
  ['the entry point ignores the options', R, 'options = optionsFrom(parseArgs({ args: process.argv.slice(2), options: OPTIONS }).values);', 'options = optionsFrom({});']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['baseline-record', 'journal-backup'],
  selftest: 'baseline-record/collect.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
