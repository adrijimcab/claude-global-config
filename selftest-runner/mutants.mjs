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
const LEAKS = 'selftest-runner/leaks.mjs';

const MUTANTS = [
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
  ['the root is not normalised to the top level, so a subdirectory root sees a partial tree', DISCOVERY, "const top = git(path.resolve(root), 'rev-parse', '--show-toplevel').trim();", 'const top = path.resolve(root);'],
  ['a git failure is not refused, so a non-repository reads as an empty listing', DISCOVERY, 'if (result.error || result.status !== 0) {', 'if (false) {'],
  // The verdict / El veredicto
  ['the verdict is green whatever ran', RUN, 'exitCode: green === discovered.entries.length ? EXIT_GREEN : EXIT_RED', 'exitCode: EXIT_GREEN'],
  ['a red selftest stops the run (fail-fast), so later selftests never run', RUN, 'emit(...indent(failure.output));', 'emit(...indent(failure.output));\n    break;'],
  ['a red selftest no longer prints its output', RUN, 'emit(...indent(failure.output));', ''],
  ['the summary counts every selftest as green', RUN, '`${green}/${discovered.entries.length} green`', '`${discovered.entries.length}/${discovered.entries.length} green`'],
  ['zero discovered selftests is a green run', RUN, 'if (discovered.entries.length === 0) {', 'if (false) {'],
  ['a discovery failure exits like a red selftest instead of not-measured', RUN, 'return { exitCode: EXIT_NOT_MEASURED, report: [error.message] };', 'return { exitCode: EXIT_RED, report: [error.message] };'],
  ['a selftest that ends without exit status 0 (a signal) is green', RUN, 'if (result.status === 0) return null;', 'if (result.status === 0 || result.status === null) return null;'],
  ['a timeout is no longer told apart from other failures', RUN, "if (result.error?.code === 'ETIMEDOUT') {", 'if (false) {'],
  ['the timeout is not passed to the child, so a selftest that outlives it is left to finish and reads as green', RUN, 'timeout: timeoutMs,', 'timeout: 0,'],
  ['a selftest missing from disk is run instead of reported missing', RUN, '    statSync(file);', '    void file;'],
  ['each selftest runs in the root instead of its own directory', RUN, 'cwd: path.dirname(file),', 'cwd: root,'],
  ['the UNTRACKED label is dropped from the report', RUN, "const label = entry.untracked ? ' UNTRACKED' : '';", "const label = '';"],
  // When a line appears / Cuándo aparece una línea
  ['no line is delivered through the hook, so nothing is seen before the end', RUN, '      onLine(line);\n', ''],
  ['only the summary line is delivered through the hook, so selftest lines wait for the end', RUN, '      onLine(line);', "      if (line.endsWith(' green')) onLine(line);"],
  ['the returned report loses the lines it delivered', RUN, '      report.push(line);\n', ''],
  ['the command line passes no hook, so it streams nothing', RUN, '{ root: parsed.root, onLine: writeLineSync }', '{ root: parsed.root, onLine: undefined }'],
  ['a run that measured nothing explains itself on stdout', RUN, 'if (exitCode === EXIT_NOT_MEASURED) console.error(', 'if (exitCode === EXIT_NOT_MEASURED) console.log('],
  ['a measured run prints its report a second time on stderr', RUN, 'if (exitCode === EXIT_NOT_MEASURED) console.error(', 'if (true) console.error('],
  // How a line is written / Cómo se escribe una línea
  ['the line is written without its newline', STREAM, "Buffer.from(`${line}\\n`, 'utf8')", "Buffer.from(`${line}`, 'utf8')"],
  ['a short write is taken as complete', STREAM, 'offset += write(fd, bytes, offset, bytes.length - offset);', 'write(fd, bytes, offset, bytes.length - offset);\n      offset = bytes.length;'],
  ['after a short write the line is written again from its start', STREAM, 'write(fd, bytes, offset, bytes.length - offset)', 'write(fd, bytes, 0, bytes.length)'],
  ['any error is retried, not only a full pipe', STREAM, "error?.code !== 'EAGAIN' || refusals > retries", 'refusals > retries'],
  ['a full pipe is raised at once instead of retried', STREAM, "error?.code !== 'EAGAIN' || refusals > retries", 'true'],
  ['a pipe that never drains is retried forever', STREAM, 'refusals > retries', 'false'],
  ['the retry bound is off by one', STREAM, 'refusals > retries', 'refusals >= retries'],
  ['the line goes to stderr instead of stdout', STREAM, 'fd = 1,', 'fd = 2,'],

  // Where a selftest's state goes / Dónde va el estado de un selftest
  ['the child is not given a state home of its own, so it writes wherever it resolves', RUN, '    env: { ...process.env, [STATE_ROOT_VARIABLE]: stateHome },\n', ''],
  ['every selftest shares one state home', RUN, "const stateHome = mkdtempSync(path.join(tmpdir(), 'selftest-state-'));", "const stateHome = path.join(tmpdir(), 'selftest-state-shared');"],
  ['the state home is left behind', RUN, '    rmSync(stateHome, { recursive: true, force: true });\n', ''],
  // What is a leak / Qué es una fuga
  ['a selftest that leaked but exited 0 is green', RUN, 'if (failure === null && leaks.length === 0) {', 'if (failure === null) {'],
  ['the leaked paths are not printed', RUN, "      emit(...leaks.map((leak) => `    ${leak.change} ${leak.path}`));\n", ''],
  ['a leak is not named as one in the RED line', RUN, "const leaked = leaks.length === 0 ? '' : ', leaked into the live state';", "const leaked = '';"],
  ['the second snapshot is the first one again', RUN, 'return { failure, leaks: leaksBetween(before, snapshotLiveState(root)) };', 'return { failure, leaks: leaksBetween(before, before) };'],
  ['the snapshot is taken after the selftest, so nothing differs', RUN, '    const before = snapshotLiveState(root);\n    const failure = exitOf({ root, entry, timeoutMs, spawn, stateHome });', '    const failure = exitOf({ root, entry, timeoutMs, spawn, stateHome });\n    const before = snapshotLiveState(root);'],
  ['the Claude home is not watched', LEAKS, 'const homes = [claudeHome(), path.resolve(treeRoot)];', 'const homes = [path.resolve(treeRoot)];'],
  ['the tree under test is not watched', LEAKS, 'const homes = [claudeHome(), path.resolve(treeRoot)];', 'const homes = [claudeHome()];'],
  ["the runner's own HOOK_STATE_DIR is not watched", LEAKS, '  if (process.env[STATE_ROOT_VARIABLE]) directories.push(stateRoot());\n', ''],
  ['a link out of the live state is followed', LEAKS, "import { lstatSync, readdirSync } from 'node:fs';", "import { statSync as lstatSync, readdirSync } from 'node:fs';"],
  ['only the top of a state directory is recorded', LEAKS, '  for (const name of readdirSync(directory)) record(path.join(directory, name), into);\n', ''],
  ['a rewrite at the same size is not a change', LEAKS, 'return `${stats.size}:${stats.mtimeMs}`;', 'return `${stats.size}`;'],
  ['a created file is not a leak', LEAKS, "    if (!before.has(entry)) leaks.push({ path: entry, change: 'created' });\n    else if", '    if (!before.has(entry)) continue;\n    else if'],
  ['a changed file is not a leak', LEAKS, "    else if (before.get(entry) !== signature) leaks.push({ path: entry, change: 'changed' });\n", ''],
  ['a removed file is not a leak', LEAKS, "    if (!after.has(entry)) leaks.push({ path: entry, change: 'removed' });", '    void entry;'],
  ['the leaks are not sorted', LEAKS, 'return leaks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));', 'return leaks;'],

  // What the operator can choose / Lo que puede elegir el operador
  ['an option after `--root <dir>` is accepted, so a filter can be passed', RUN, "if (argv.length === 2 && argv[0] === '--root') return { root: argv[1] };", "if (argv[0] === '--root') return { root: argv[1] };"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-runner', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'selftest-runner/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
