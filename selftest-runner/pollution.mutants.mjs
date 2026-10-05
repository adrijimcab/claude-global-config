#!/usr/bin/env node
/**
 * The decisions of the pollution check, each broken once, that `pollution.selftest.mjs` must catch with an
 * assertion. The campaign runner and its rules live in `../mutation-proof/run-mutants.mjs`; a crash-only kill
 * counts as a survivor here (`crashKills: 'fail'`). A mutant is never deleted or softened to clear a
 * campaign: a survivor is a missing assertion in the selftest.
 *
 * @es Las decisiones de la comprobación de contaminación, rotas una a una, que `pollution.selftest.mjs` debe
 * cazar con una aserción. Un kill solo por crash cuenta como superviviente. Un mutante nunca se borra ni se
 * ablanda para limpiar la campaña: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const SNAPSHOT = 'selftest-runner/pollution-snapshot.mjs';
const MAIN = 'selftest-runner/pollution.mjs';
const CANDIDATES = 'selftest-runner/pollution-candidates.mjs';
const MESSAGES = 'selftest-runner/pollution-messages.mjs';

const MUTANTS = [
  // Which directories are watched / Qué directorios se vigilan
  ['the ignored listing no longer asks git for ignored paths, so no state directory is found', SNAPSHOT, "['status', '--ignored', '--porcelain', '-z']", "['status', '--porcelain', '-z']"],
  ['every git entry counts as ignored, so an untracked directory with a `state` child is watched', SNAPSHOT, 'entry.startsWith(IGNORED_PREFIX))', 'true)'],
  ['the ignored prefix is one character short, so every path keeps a leading space', SNAPSHOT, "const IGNORED_PREFIX = '!! ';", "const IGNORED_PREFIX = '!!';"],
  ['the trailing slash of an ignored directory is kept, so its paths come out doubled', SNAPSHOT, ".replace(TRAILING_SLASH, '')", ''],
  ['an ignored directory named `state` is not taken as the state directory itself', SNAPSHOT, 'path.posix.basename(entry) === STATE ? entry :', 'false ? entry :'],
  ['an ignored directory named `state` is read as a parent whose child is the state directory', SNAPSHOT, 'path.posix.basename(entry) === STATE ? entry :', 'path.posix.basename(entry) !== STATE ? entry :'],
  ['the `state` child of an ignored directory is not looked for', SNAPSHOT, '? entry : `${entry}/${STATE}`)', '? entry : entry)'],
  ['a candidate state path that is not a directory is kept in the population', SNAPSHOT, "return states.filter((relative) => isDirectory(path.join(home, ...relative.split('/'))));", 'return states;'],
  ['a hook\'s repository selectors are left in the environment git runs with', SNAPSHOT, 'for (const name of REPOSITORY_SELECTORS) delete clean[name];', ''],
  ['a git that fails is read as an empty listing', SNAPSHOT, 'if (result.error || result.status !== 0) throw new SnapshotError', 'if (false) throw new SnapshotError'],
  ['the empty tail of the NUL-separated output becomes an entry', SNAPSHOT, ".split('\\0').filter((entry) => entry !== '');", ".split('\\0');"],
  // What a watched file looks like / Cómo se ve un fichero vigilado
  ['a file is told apart by size alone', SNAPSHOT, 'return `${stat.size}:${stat.mtimeMs}`;', 'return `${stat.size}`;'],
  ['a file is told apart by mtime alone', SNAPSHOT, 'return `${stat.size}:${stat.mtimeMs}`;', 'return `${stat.mtimeMs}`;'],
  ['a directory never carries its mtime, so a file added inside an untracked directory goes unseen', SNAPSHOT, "directoryTime ? `dir:${stat.mtimeMs}` : 'dir'", "'dir'"],
  ['a missing path is not given a signature, so a deleted tracked file crashes the snapshot', SNAPSHOT, "if (stat === undefined) return 'absent';", ''],
  ['a state directory is recorded without its own entry', SNAPSHOT, 'into.set(relative, signatureOf(directory));', ''],
  ['a link inside a state directory is entered, so its target counts as state', SNAPSHOT, 'if (entry.isDirectory()) walk(', 'if (entry.isDirectory() || entry.isSymbolicLink()) walk(',],
  ['files of a state directory are not recorded', SNAPSHOT, 'else into.set(child, signatureOf(path.join(directory, entry.name)));', ''],
  // The main checkout / El checkout principal
  ['renames are paired by git, so the old path is read as a new entry', SNAPSHOT, ", '-z', '--no-renames']", ", '-z']"],
  ['the status letters are dropped from a checkout entry, so staging a dirty file goes unseen', SNAPSHOT, '`${entry.slice(0, 2)}|${signatureOf(', '`${signatureOf('],
  ['the content signature is dropped from a checkout entry, so touching a dirty file goes unseen', SNAPSHOT, 'signatureOf(path.join(checkout, entry.slice(3)), true)', 'signatureOf(path.join(checkout, entry.slice(3)))'],
  ['the path of a checkout entry is cut one character early', SNAPSHOT, '[entry.slice(3), ', '[entry.slice(2), '],
  ['the checkout defaults to the temp root instead of the home', SNAPSHOT, 'checkout = home, tempDir', 'checkout = tmpdir(), tempDir'],
  ['the temp root defaults to the home instead of the system temp directory', SNAPSHOT, 'tempDir = tmpdir()', 'tempDir = home'],
  // How snapshots are compared / Cómo se comparan las instantáneas
  ['an added path is not reported', MAIN, 'if (!before.has(changed)) found.push', 'if (false) found.push'],
  ['a changed signature is not reported', MAIN, 'else if (before.get(changed) !== signature)', 'else if (false)'],
  ['a removed path is not reported', MAIN, 'if (!after.has(changed)) found.push', 'if (false) found.push'],
  ['every area reports every kind of difference, so a pre-existing temp entry that goes away is a leftover', MAIN, '.filter(({ change }) => kinds.includes(change));', '.filter(() => true);'],
  ['the state area stops reporting removals', MAIN, "after.state, ['added', 'changed', 'removed']", "after.state, ['added', 'changed']"],
  ['the state area stops reporting changes', MAIN, "after.state, ['added', 'changed', 'removed']", "after.state, ['added', 'removed']"],
  ['the checkout area stops reporting removals', MAIN, "after.checkout, ['added', 'changed', 'removed']", "after.checkout, ['added', 'changed']"],
  ['the checkout area stops reporting changes', MAIN, "after.checkout, ['added', 'changed', 'removed']", "after.checkout, ['added', 'removed']"],
  ['the temp root also reports removals', MAIN, "after.temp, ['added']", "after.temp, ['added', 'removed']"],
  ['the temp root also reports changes', MAIN, "after.temp, ['added']", "after.temp, ['added', 'changed']"],
  ['the temp root reports nothing', MAIN, "after.temp, ['added']", 'after.temp, []'],
  ['the changes come in discovery order, not sorted', MAIN, '].sort((left, right) => `${left.area}/${left.path}`.localeCompare(`${right.area}/${right.path}`));', '];'],
  // Around a run / Alrededor de una corrida
  ['the second snapshot is taken before the run', MAIN, 'const result = run();\n  const changes = compareSnapshots(before, snapshotOf(options));', 'const changes = compareSnapshots(before, snapshotOf(options));\n  const result = run();'],
  ['the first snapshot is compared with itself', MAIN, 'compareSnapshots(before, snapshotOf(options))', 'compareSnapshots(before, before)'],
  ['the locator scan runs on a green run too', MAIN, 'changes.length === 0 ? [] :', 'false ? [] :'],
  ['an injected locator is ignored', MAIN, '(options.locate ?? locateHomedirUses)(', 'locateHomedirUses('],
  ['the watched directories are not reported', MAIN, 'stateDirs: before.stateDirs', 'stateDirs: []'],
  // The command line / La línea de comandos
  ['a command line without `--` is run as if it had one', MAIN, 'if (split === -1 || command.length === 0) return null;', 'if (command.length === 0) return null;'],
  ['a `--` with no command after it is run', MAIN, 'if (split === -1 || command.length === 0) return null;', 'if (split === -1) return null;'],
  ['options are read one at a time instead of in pairs', MAIN, 'at += 2', 'at += 1'],
  ['an unknown option is accepted', MAIN, 'if (!Object.hasOwn(OPTIONS, argv[at]) ||', 'if ('],
  ['an option with no value takes the `--` as its value', MAIN, '|| at + 1 === split) return null;', ') return null;'],
  ['`--temp` names a different setting', MAIN, "'--temp': 'tempDir'", "'--temp': 'tmpDir'"],
  ['`--checkout` names a different setting', MAIN, "'--checkout': 'checkout'", "'--checkout': 'checkoutDir'"],
  ['the environment home wins over `--home`', MAIN, '{ home: claudeHome(), ...parsed.options, env }', '{ ...parsed.options, home: claudeHome(), env }'],
  ['the usage goes to the output stream', MAIN, "speaker.complain('usage');", "speaker.say('usage');"],
  ['a command that cannot start is run on as if it had measured something', MAIN, 'if (outcome.result.error) {', 'if (false) {'],
  ['a command that cannot start is explained on the output stream', MAIN, "speaker.complain('not-measured',", "speaker.say('not-measured',"],
  ['a command that ended well is announced as failed', MAIN, 'if (outcome.result.status !== 0) speaker.say', 'if (outcome.result.status === 0) speaker.say'],
  ['a failing command is never announced', MAIN, 'if (outcome.result.status !== 0) speaker.say', 'if (false) speaker.say'],
  ['an unexpected error is swallowed as "not measured"', MAIN, 'if (!(error instanceof SnapshotError)) throw error;', ''],
  ['a snapshot failure is explained on the output stream', MAIN, 'speaker.dataError(error.message);', 'speaker.data(error.message);'],
  ['the command output is hidden from the operator', MAIN, "{ stdio: 'inherit', windowsHide: true }", "{ stdio: 'ignore', windowsHide: true }"],
  ['the command line of a script run is read one argument late', MAIN, 'main(process.argv.slice(2))', 'main(process.argv.slice(3))'],
  ['a script run never runs the check', MAIN, 'if (process.argv[1] &&', 'if (false &&'],
  ['an import runs the check as if it were a script run', MAIN, '=== fileURLToPath(import.meta.url)', '!== fileURLToPath(import.meta.url)'],
  ['a RED run exits with the green code', MAIN, 'const EXIT_RED = 1;', 'const EXIT_RED = 0;'],
  ['a not-measured run exits with the red code', MAIN, 'const EXIT_NOT_MEASURED = 2;', 'const EXIT_NOT_MEASURED = 1;'],
  // What is printed / Qué se imprime
  ['the population line reports the wrong count', MAIN, 'count: stateDirs.length', 'count: 0'],
  ['every change is flagged as a candidate', MAIN, 'if (change.candidate) speaker.say', 'if (true) speaker.say'],
  ['the candidate line names the wrong mechanism', MAIN, "{ mechanism: change.path.split('/')[0] }", "{ mechanism: change.path.split('/')[1] }"],
  ['a run with changes prints the green verdict', MAIN, "changes.length === 0 ? 'green' : 'red'", "changes.length === 0 ? 'red' : 'green'"],
  ['the red verdict counts the wrong number of paths', MAIN, '{ count: changes.length }', '{ count: 0 }'],
  ['a run with changes exits green', MAIN, 'changes.length === 0 ? EXIT_GREEN : EXIT_RED', 'EXIT_GREEN'],
  ['a Spanish half loses its accent', MESSAGES, "es: 'ROJO CONTAMINACIÓN:", "es: 'ROJO CONTAMINACION:"],
  // The locator scan, a lead and never a verdict / El escáner, una pista y nunca un veredicto
  ['a bare `homedir` import counts as a use', CANDIDATES, "const NEEDLE = 'homedir()';", "const NEEDLE = 'homedir';"],
  ['tracked files are not scanned', CANDIDATES, "'--cached', '--others'", "'--others'"],
  ['untracked files are not scanned', CANDIDATES, "'--cached', '--others'", "'--cached'"],
  ['ignored files are scanned', CANDIDATES, "'--others', '--exclude-standard'", "'--others'"],
  ['only `.js` files are scanned', CANDIDATES, "'*.mjs'", "'*.js'"],
  ['the uses come in git order, not sorted', CANDIDATES, ".filter((name) => name !== '').sort())", ".filter((name) => name !== ''))"],
  ['a tracked file the run deleted is read anyway', CANDIDATES, 'return existsSync(file) ?', 'return true ?'],
  ['the line number starts at zero', CANDIDATES, 'line: index + 1', 'line: index'],
  ['the mechanism is the second path segment', CANDIDATES, "mechanism: file.split('/')[0]", "mechanism: file.split('/')[1]"],
  ['every change is annotated as a candidate', CANDIDATES, 'candidate: mechanisms.has(change.path.split(\'/\')[0])', 'candidate: true'],
  ['a change is matched to a candidate by its second segment', CANDIDATES, "mechanisms.has(change.path.split('/')[0])", "mechanisms.has(change.path.split('/')[1])"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-runner', 'hook-state', 'bilingual-output', 'selftest-fixtures'],
  selftest: 'selftest-runner/pollution.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
