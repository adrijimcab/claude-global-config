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

const MUTANTS = [
  // Which files are selftests / Qué ficheros son selftests
  ['the bare name `selftest.mjs` is no longer recognised', DISCOVERY, 'name === BARE_NAME || name.endsWith(SUFFIX)', 'name.endsWith(SUFFIX)'],
  ['the `.selftest.mjs` suffix is no longer recognised', DISCOVERY, 'name === BARE_NAME || name.endsWith(SUFFIX)', 'name === BARE_NAME'],
  ['any name that merely contains `selftest.mjs` matches, so `selftest.mjs.bak` runs', DISCOVERY, 'name === BARE_NAME || name.endsWith(SUFFIX)', 'name.includes(BARE_NAME)'],
  ['the bare name matches as a suffix, so `myselftest.mjs` runs', DISCOVERY, 'name === BARE_NAME ||', 'name.endsWith(BARE_NAME) ||'],
  ['an ignored directory accepts any name containing `selftest`, so its `.bak` copy runs', DISCOVERY, '(name) => isSelftestName(name) &&', "(name) => name.includes('selftest') &&"],
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
  ['a red selftest stops the run (fail-fast), so later selftests never run', RUN, 'report.push(...indent(failure.output));', 'report.push(...indent(failure.output));\n    break;'],
  ['a red selftest no longer prints its output', RUN, 'report.push(...indent(failure.output));', ''],
  ['the summary counts every selftest as green', RUN, '`${green}/${discovered.entries.length} green`', '`${discovered.entries.length}/${discovered.entries.length} green`'],
  ['zero discovered selftests is a green run', RUN, 'if (discovered.entries.length === 0) {', 'if (false) {'],
  ['a discovery failure exits like a red selftest instead of not-measured', RUN, 'return { exitCode: EXIT_NOT_MEASURED, report: [error.message] };', 'return { exitCode: EXIT_RED, report: [error.message] };'],
  ['a selftest that ends without exit status 0 (a signal) is green', RUN, 'if (result.status === 0) return null;', 'if (result.status === 0 || result.status === null) return null;'],
  ['a timeout is no longer told apart from other failures', RUN, "if (result.error?.code === 'ETIMEDOUT') {", 'if (false) {'],
  ['a selftest missing from disk is run instead of reported missing', RUN, '    statSync(file);', '    void file;'],
  ['each selftest runs in the root instead of its own directory', RUN, 'cwd: path.dirname(file),', 'cwd: root,'],
  ['the UNTRACKED label is dropped from the report', RUN, "const label = entry.untracked ? ' UNTRACKED' : '';", "const label = '';"],
  // What the operator can choose / Lo que puede elegir el operador
  ['an option after `--root <dir>` is accepted, so a filter can be passed', RUN, "if (argv.length === 2 && argv[0] === '--root') return { root: argv[1] };", "if (argv[0] === '--root') return { root: argv[1] };"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-runner', 'mutation-proof'],
  selftest: 'selftest-runner/selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
