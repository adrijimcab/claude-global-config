#!/usr/bin/env node
/**
 * The decisions of the selftest runner, each broken once, that `selftest.mjs` must catch. The campaign
 * runner and its rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`. A mutant is never deleted or softened to get a clean campaign: a
 * survivor is a missing assertion in the selftest.
 *
 * @es Las decisiones del runner de selftests, rotas una a una, que `selftest.mjs` debe cazar. Un mutante
 * nunca se borra ni se ablanda para limpiar la campaña: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DISCOVERY = 'selftest-runner/discovery.mjs';
const RUN = 'selftest-runner/run.mjs';
const STREAM = 'selftest-runner/stream.mjs';
const GATE = 'selftest-runner/lock-gate.mjs';
const WORDS = 'selftest-runner/messages.mjs';

const MUTANTS = [
  // Whether it may start: only under the full-chain lock / Si puede arrancar: solo bajo el lock de cadenas completas
  ['the gate is skipped, so the runner starts without the lock', RUN, 'if (!startedUnderLock(environment, holdsLock)) {', 'if (false) {'],
  ['the refusal exits green', RUN, 'return EXIT_NOT_MEASURED;\n  }\n  const plan', 'return EXIT_GREEN;\n  }\n  const plan'],
  ['the refusal exits like a red selftest', RUN, 'return EXIT_NOT_MEASURED;\n  }\n  const plan', 'return EXIT_RED;\n  }\n  const plan'],
  ['the refusal says nothing', RUN, "tell.complain('lock-required', { variable: LOCK_TOKEN_VARIABLE, command: lockedCommand(argv, parsed.root) });", 'void tell;'],
  ['the refusal prints no command', RUN, 'command: lockedCommand(argv, parsed.root) }', "command: '' }"],
  ['the refusal names the working directory as the tree to run', RUN, 'lockedCommand(argv, parsed.root)', 'lockedCommand(argv, process.cwd())'],
  ['the refusal names no variable', RUN, 'variable: LOCK_TOKEN_VARIABLE, command', "variable: '', command"],
  ['the selftests run through a fixed function whatever the caller hands in', RUN, 'await execute({', 'await runSelftests({'],
  ['the lock port defaults to one that always agrees', RUN, 'holdsLock = tokenHoldsLock,', 'holdsLock = () => true,'],
  ['the environment defaults to an empty one', RUN, 'environment = process.env,', 'environment = {},'],
  ['a missing token is passed to the lock port as if it were a value', GATE, 'typeof token === \'string\' && token !== \'\' && holdsLock(token) === true', 'holdsLock(token) === true'],
  ['an empty token is passed to the lock port', GATE, "token !== '' && ", ''],
  ['a token that is not text is passed to the lock port', GATE, "typeof token === 'string' && ", ''],
  ['an answer that is merely truthy counts as held', GATE, 'holdsLock(token) === true', 'holdsLock(token)'],
  ['the lock is never asked', GATE, 'holdsLock(token) === true', 'true'],
  ['the token is read from another variable', GATE, 'environment[LOCK_TOKEN_VARIABLE]', 'environment.OTHER_TOKEN'],
  ['the printed command names another chain', GATE, "const CHAIN = 'selftest-runner';", "const CHAIN = 'other-chain';"],
  ['the printed command drops the tree', GATE, ' --tree ${word(path.resolve(root).split(\'\\\\\').join(\'/\'))} --', ' --'],
  ['the printed tree keeps its backslashes', GATE, ".split('\\\\').join('/'))} --", ')} --'],
  ['the printed command drops the arguments', GATE, '${argv.map((argument) => ` ${word(argument)}`).join(\'\')}', ''],
  ['the printed command never quotes', GATE, 'PLAIN_WORD.test(text) ? text : `"${text}"`', 'text'],
  ['the printed command always quotes', GATE, 'PLAIN_WORD.test(text) ? text : `"${text}"`', '`"${text}"`'],
  ['the printed command runs another runner', GATE, "const SELFTEST_RUNNER = slashed('./run.mjs');", "const SELFTEST_RUNNER = slashed('./stream.mjs');"],
  ['the printed command runs the lock of another folder', GATE, "const LOCK_RUNNER = slashed('../full-chain-lock/run.mjs');", "const LOCK_RUNNER = slashed('../full-chain-lock/detach-chain.mjs');"],
  ['the refusal stops saying nothing was run', WORDS, ' Nothing was run. Run it through the lock: {command}', ' Run it through the lock: {command}'],
  ['the Spanish refusal stops saying nothing was run', WORDS, ' No se ejecutó nada. Ejecútalo por el lock: {command}', ' Ejecútalo por el lock: {command}'],
  // A placeholder dropped from ONE half of a message makes the table refuse to load (`bilingual-output/message.mjs`), which is the guard
  // of that case; mutants of that shape died by crash, so none is listed here.
  // @es Un marcador quitado de UNA mitad de un mensaje hace que la tabla se niegue a cargar, y esa es la guarda de ese caso; los mutantes de esa forma morían por crash, así que no se listan.

  // Which files are selftests / Qué ficheros son selftests
  ['the bare name `selftest.mjs` is no longer recognised', DISCOVERY, 'name === BARE_NAME || name.endsWith(SUFFIX)', 'name.endsWith(SUFFIX)'],
  ['the `.selftest.mjs` suffix is no longer recognised', DISCOVERY, 'name === BARE_NAME || name.endsWith(SUFFIX)', 'name === BARE_NAME'],
  ['any name that merely contains `selftest.mjs` matches, so `selftest.mjs.bak` runs', DISCOVERY, 'name === BARE_NAME || name.endsWith(SUFFIX)', 'name.includes(BARE_NAME)'],
  ['the bare name matches as a suffix, so `myselftest.mjs` runs', DISCOVERY, 'name === BARE_NAME ||', 'name.endsWith(BARE_NAME) ||'],
  ['an ignored directory accepts any name containing `selftest`, so its `.bak` copy runs', DISCOVERY, '(name) => isSelftestName(path.basename(name)) &&', "(name) => name.includes('selftest') &&"],
  ['an ignored directory is listed recursively, so a selftest deeper than its direct children runs', DISCOVERY, 'readdirSync(path.join(top, directory)).filter(', 'readdirSync(path.join(top, directory), { recursive: true }).filter('],
  ['a directory named like a selftest counts as one', DISCOVERY, 'return statSync(path.join(root, relative)).isFile();', 'return true;'],
  ['a tracked file missing from disk is dropped instead of reported RED', DISCOVERY, '    return true;\n  }\n}', '    return false;\n  }\n}'],
  // Which files git lists / Qué ficheros lista git
  ['tracked files are no longer listed', DISCOVERY, "'--cached', '--others', '--exclude-standard'", "'--others', '--exclude-standard'"],
  ['untracked, unignored files are no longer listed', DISCOVERY, "'--cached', '--others', '--exclude-standard'", "'--cached', '--exclude-standard'"],
  ['ignored files are listed as if they were part of the repository', DISCOVERY, "'--cached', '--others', '--exclude-standard'", "'--cached', '--others'"],
  ['ignored directories are no longer scanned, so a new mechanism directory goes unrun', DISCOVERY, '.filter((entry) => entry.endsWith(\'/\'))', '.filter(() => false)'],
  ['ignored directories are listed file by file, so none is scanned', DISCOVERY, "'--ignored', '--exclude-standard', '--directory'", "'--ignored', '--exclude-standard'"],
  ['a selftest of an ignored directory loses its UNTRACKED label in discovery', DISCOVERY, '{ path: directory + name, untracked: true }', '{ path: directory + name, untracked: false }'],
  // Which root / Qué raíz
  ['the root is not normalised to the top level, so a subdirectory root sees a partial tree', DISCOVERY, "git(['-C', resolved], resolved, 'rev-parse', '--show-toplevel').trim() : resolved;", 'resolved : resolved;'],
  ['a --git-dir is ignored, so a tooling tree its code repo ignores finds nothing', DISCOVERY, "const repository = gitDir === undefined ? ['-C', top] :", "const repository = true ? ['-C', top] :"],
  ['a --git-dir tree is normalised to its code repo, so the tooling repository is never asked', DISCOVERY, "const top = gitDir === undefined ?", 'const top = true ?'],
  ['the --git-dir repository lists every file on disk, ignored scratch copies included', DISCOVERY, "['--git-dir', path.resolve(gitDir), '--work-tree', top]", "['-C', top]"],
  ['the runner does not pass --git-dir to discovery', RUN, 'discoverSelftests(root, { gitDir })', 'discoverSelftests(root)'],
  ['the runner does not hand --git-dir to the sandbox environment of each selftest', RUN, 'tree: root, gitDir });', 'tree: root });'],
  ['the runner does not hand --git-dir to the run of each selftest', RUN, 'runOne({ root: discovered.root, gitDir, entry, timeoutMs, spawn, watchTree, childBudget })', 'runOne({ root: discovered.root, entry, timeoutMs, spawn, watchTree, childBudget })'],
  ['the command line drops --git-dir', RUN, '{ root: parsed.root, gitDir: parsed.gitDir, onLine: writeLineSync, concurrency: plan.concurrency, childBudget }', '{ root: parsed.root, onLine: writeLineSync, concurrency: plan.concurrency, childBudget }'],
  ['--git-dir is accepted without --root', RUN, "argv.length === 4 && argv[0] === '--root' && argv[2] === '--git-dir'", "argv.length === 4 && argv[2] === '--git-dir'"],
  ['any second option is taken as --git-dir, so a filter can be passed', RUN, "argv.length === 4 && argv[0] === '--root' && argv[2] === '--git-dir'", "argv.length === 4 && argv[0] === '--root'"],
  ['a git failure is not refused, so a non-repository reads as an empty listing', DISCOVERY, 'if (result.error || result.status !== 0) {', 'if (false) {'],
  // The verdict / El veredicto
  ['the verdict is green whatever ran', RUN, 'exitCode: green === discovered.entries.length && leaked.length === 0 ? EXIT_GREEN : EXIT_RED', 'exitCode: EXIT_GREEN'],
  ['a tree changed by the parallel batch leaves the run green', RUN, 'green === discovered.entries.length && leaked.length === 0 ?', 'green === discovered.entries.length ?'],
  ['the batch line is never printed, so a parallel leak is red without a reason', RUN, 'if (leaked.length > 0) emit(', 'if (false) emit('],
  ['a red selftest stops the run (fail-fast), so later selftests never run', RUN, 'index < discovered.entries.length && unreadable === undefined;', 'index < discovered.entries.length && unreadable === undefined && !outcomes.some((outcome) => outcome?.failure);'],
  // Running at once / Correr a la vez
  ['the pool runs one selftest at a time whatever the concurrency', RUN, 'Math.min(concurrency, discovered.entries.length)', '1'],
  ['the tree is read around each selftest even in parallel, so a write is blamed on its neighbours', RUN, 'const watchTree = concurrency === 1;', 'const watchTree = true;'],
  ['one at a time loses the per-selftest tree verdict', RUN, 'const watchTree = concurrency === 1;', 'const watchTree = false;'],
  ['a parallel run loses each selftest\'s own sandbox verdict', RUN, 'escapes: sandboxEscapes(sandbox) };', 'escapes: [] };'],
  ['lines are printed in the order selftests end, not the order they are listed', RUN, '        outcomes[index] = await runOne({', '        outcomes[next - 1 > reported ? reported : index] = await runOne({'],
  // How many at once / Cuántos a la vez
  ['SELFTEST_CONCURRENCY is ignored', RUN, "if (isWholeCount(requested)) return { ...base, concurrency: requested, bound: 'override' };", ''],
  ['SELFTEST_CONCURRENCY=0 is taken as is', RUN, 'const isWholeCount = (value) => Number.isInteger(value) && value >= 1;', 'const isWholeCount = (value) => Number.isInteger(value) && value >= 0;'],
  ['a fractional SELFTEST_CONCURRENCY is taken as is', RUN, 'const isWholeCount = (value) => Number.isInteger(value) && value >= 1;', 'const isWholeCount = (value) => value >= 1;'],
  ['SELFTEST_CONCURRENCY loses to the budget', RUN, 'if (isWholeCount(requested)) return', 'if (isWholeCount(requested) && budget >= machine) return'],
  ['the cores are capped at 8 again', RUN, 'const byCores = Math.max(1, cores - CORES_LEFT_FREE);', 'const byCores = Math.min(8, Math.max(1, cores - CORES_LEFT_FREE));'],
  ['the default leaves no core free', RUN, 'const CORES_LEFT_FREE = 2;', 'const CORES_LEFT_FREE = 0;'],
  ['the cores bound can be zero on a small machine', RUN, 'const byCores = Math.max(1, cores - CORES_LEFT_FREE);', 'const byCores = Math.max(0, cores - CORES_LEFT_FREE);'],
  ['the memory bound can be zero with no free memory', RUN, 'const byMemory = Math.max(1, Math.floor(', 'const byMemory = Math.max(0, Math.floor('],
  ['the memory is ignored', RUN, 'const machine = Math.min(byCores, byMemory);', 'const machine = byCores;'],
  ['the cores are ignored', RUN, 'const machine = Math.min(byCores, byMemory);', 'const machine = byMemory;'],
  ['the whole free memory is spent, not half', RUN, 'const MEMORY_SHARE = 0.5;', 'const MEMORY_SHARE = 1;'],
  ['the memory bound rounds up', RUN, 'Math.floor((freeBytes * MEMORY_SHARE)', 'Math.ceil((freeBytes * MEMORY_SHARE)'],
  ['the per-selftest peak is far below what was measured', RUN, 'export const PEAK_BYTES_PER_SUITE = 768 * 1024 * 1024;', 'export const PEAK_BYTES_PER_SUITE = 1024;'],
  ['the memory bound is named cores', RUN, "bound: byCores <= byMemory ? 'cores' : 'memory' };", "bound: 'cores' };"],
  ['a tie between cores and memory is named memory', RUN, "byCores <= byMemory ? 'cores'", "byCores < byMemory ? 'cores'"],
  // The budget between pools / El presupuesto entre pools
  ['CONCURRENCY_BUDGET is ignored', RUN, 'const budget = isWholeCount(given) ? given : machine;', 'const budget = machine;'],
  ['an invalid CONCURRENCY_BUDGET is taken as is', RUN, 'const budget = isWholeCount(given) ? given : machine;', 'const budget = Number.isNaN(given) ? machine : given;'],
  ['a budget below the machine value no longer caps the default', RUN, 'if (budget < machine) return', 'if (false) return'],
  ['a budget above the machine value raises the default', RUN, 'if (budget < machine) return', 'if (budget !== machine) return'],
  ['the variable the budget is read from is renamed', RUN, "export const CONCURRENCY_BUDGET_VARIABLE = 'CONCURRENCY_BUDGET';", "export const CONCURRENCY_BUDGET_VARIABLE = 'CONCURRENCY_BUDGET_X';"],
  ['the child budget rounds up', RUN, 'Math.max(1, Math.floor(budget / concurrency))', 'Math.max(1, Math.ceil(budget / concurrency))'],
  ['the child budget can be zero', RUN, 'Math.max(1, Math.floor(budget / concurrency))', 'Math.max(0, Math.floor(budget / concurrency))'],
  ['the child budget is not divided among the selftests run at once', RUN, 'Math.max(1, Math.floor(budget / concurrency))', 'Math.max(1, Math.floor(budget))'],
  ['the children get no budget', RUN, 'env[CONCURRENCY_BUDGET_VARIABLE] = String(childBudget);', ''],
  ['the default child budget is the whole budget', RUN, 'childBudget ??= childBudgetOf(plan.budget, concurrency);', 'childBudget ??= plan.budget;'],
  ['the default concurrency ignores the plan', RUN, 'concurrency ??= plan.concurrency;', 'concurrency ??= 1;'],
  ['the command line prints no header', RUN, 'writeLineSync(describeConcurrency(plan, childBudget));', ''],
  ['the header always names the cores', RUN, 'speaker.line(`concurrency-${bound}`', "speaker.line('concurrency-cores'"],
  ['a red selftest no longer prints its output', RUN, 'return [...lines, ...indent(failure.output)];', 'return lines;'],
  ['the summary counts every selftest as green', RUN, '{ green, total: discovered.entries.length }', '{ green: discovered.entries.length, total: discovered.entries.length }'],
  ['zero discovered selftests is a green run', RUN, 'if (discovered.entries.length === 0) {', 'if (false) {'],
  ['a discovery failure exits like a red selftest instead of not-measured', RUN, 'return { exitCode: EXIT_NOT_MEASURED, report: [error.message], notMeasured: error.message };', 'return { exitCode: EXIT_RED, report: [error.message], notMeasured: error.message };'],
  ['a selftest that ends without exit status 0 (a signal) is green', RUN, 'if (result.status === 0) return null;', 'if (result.status === 0 || result.status === null) return null;'],
  ['a timeout is no longer told apart from other failures', RUN, "if (result.error?.code === 'ETIMEDOUT') {", 'if (false) {'],
  ['the timeout is not passed to the child, so a selftest that outlives it is left to finish and reads as green', RUN, 'timeout: timeoutMs,', 'timeout: 0,'],
  ['a selftest missing from disk is run instead of reported missing', RUN, '    statSync(file);', '    void file;'],
  ['each selftest runs in the root instead of its own directory', RUN, 'cwd: path.dirname(file),', 'cwd: root,'],
  ['the UNTRACKED label is dropped from the report', RUN, "const label = entry.untracked ? ' UNTRACKED' : '';", "const label = '';"],
  // When a line appears / Cuándo aparece una línea
  ['no line is delivered through the hook, so nothing is seen before the end', RUN, '      onLine(line);\n', ''],
  ['only the summary line is delivered through the hook, so selftest lines wait for the end', RUN, '      onLine(line);', "      if (line.includes(' en verde')) onLine(line);"],
  ['the returned report loses the lines it delivered', RUN, '      report.push(line);\n', ''],
  ['the command line passes no hook, so it streams nothing', RUN, 'gitDir: parsed.gitDir, onLine: writeLineSync, concurrency', 'gitDir: parsed.gitDir, onLine: undefined, concurrency'],
  ['the command line runs one selftest at a time whatever it chose', RUN, 'onLine: writeLineSync, concurrency: plan.concurrency, childBudget });', 'onLine: writeLineSync, concurrency: 1, childBudget });'],
  ['a run that measured nothing explains itself on stdout', RUN, 'if (notMeasured !== undefined) speaker.dataError(notMeasured);', 'if (notMeasured !== undefined) speaker.data(notMeasured);'],
  ['a measured run prints a line on stderr', RUN, 'if (notMeasured !== undefined) speaker.dataError(notMeasured);', 'if (true) speaker.dataError(notMeasured);'],
  ['the usage refusal goes to stdout', RUN, "speaker.complain('usage');", "speaker.say('usage');"],
  // How a line is written / Cómo se escribe una línea
  ['the line is written without its newline', STREAM, "Buffer.from(`${line}\\n`, 'utf8')", "Buffer.from(`${line}`, 'utf8')"],
  ['a short write is taken as complete', STREAM, 'offset += write(fd, bytes, offset, bytes.length - offset);', 'write(fd, bytes, offset, bytes.length - offset);\n      offset = bytes.length;'],
  ['after a short write the line is written again from its start', STREAM, 'write(fd, bytes, offset, bytes.length - offset)', 'write(fd, bytes, 0, bytes.length)'],
  ['any error is retried, not only a full pipe', STREAM, "error?.code !== 'EAGAIN' || refusals > retries", 'refusals > retries'],
  ['a full pipe is raised at once instead of retried', STREAM, "error?.code !== 'EAGAIN' || refusals > retries", 'true'],
  ['a pipe that never drains is retried forever', STREAM, 'refusals > retries', 'false'],
  ['the retry bound is off by one', STREAM, 'refusals > retries', 'refusals >= retries'],
  ['the line goes to stderr instead of stdout', STREAM, 'fd = 1,', 'fd = 2,'],
  // Where a selftest runs and what is an escape: `sandbox.mutants.mjs`.
  // @es Dónde corre un selftest y qué es una fuga: `sandbox.mutants.mjs`.

  // What the operator can choose / Lo que puede elegir el operador
  ['an option after `--root <dir>` is accepted, so a filter can be passed', RUN, "if (argv.length === 2 && argv[0] === '--root') return { root: argv[1] };", "if (argv[0] === '--root') return { root: argv[1] };"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-runner', 'full-chain-lock', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'selftest-runner/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
