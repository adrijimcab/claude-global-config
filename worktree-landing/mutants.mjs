#!/usr/bin/env node
/**
 * The decisions of the worktree landing, each broken once, that `selftest.mjs` must catch. The campaign
 * runner and its rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`. A mutant is never deleted or softened to get a clean campaign: a
 * survivor is a missing assertion in the selftest.
 *
 * @es Las decisiones del aterrizaje de worktrees, rotas una a una, que `selftest.mjs` debe cazar. Un
 * mutante nunca se borra ni se ablanda para limpiar la campaña: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const ARGUMENTS = 'worktree-landing/arguments.mjs';
const COLLISIONS = 'worktree-landing/collisions.mjs';
const INTEGRATION = 'worktree-landing/integration-branch.mjs';
const LAND = 'worktree-landing/land.mjs';
const LEDGER_RETENTION = 'worktree-landing/ledger-retention.mjs';
const LIVE_LEDGER = 'worktree-landing/live-ledger.mjs';
const PRECONDITIONS = 'worktree-landing/preconditions.mjs';
const PUBLICATION = 'worktree-landing/publication.mjs';
const RED_REPORT = 'worktree-landing/red-report.mjs';
const REMOTE_POLICY = 'worktree-landing/remote-policy.mjs';
const TEST_COMMAND = 'worktree-landing/test-command.mjs';
const VERIFICATION = 'worktree-landing/verification.mjs';
const WORKING_TREE = 'worktree-landing/working-tree.mjs';
const SELFTEST = 'worktree-landing/selftest.mjs';

const MUTANTS = [
  // The selftest's own seams: a real npm never writes the user's ~/.npm / Las costuras del selftest: npm real nunca escribe el ~/.npm del usuario
  ['the suite\'s npm writes its debug logs and stamp into the user\'s cache', SELFTEST, 'process.env.npm_config_cache = NPM_CACHE;', ''],
  ['the suite\'s npm runs its update notifier against the registry', SELFTEST, "process.env.npm_config_update_notifier = 'false';", ''],
  // Which two checkouts / Qué dos checkouts
  ['the same checkout passed twice is accepted', PRECONDITIONS, 'if (topOf(worktree) === topOf(main)) {', 'if (false) {'],
  ['a separate clone is accepted as the worktree', PRECONDITIONS, 'if (commonOf(worktree) !== commonOf(main)) {', 'if (false) {'],
  // The worktree / El worktree
  ['an uncommitted worktree lands', PRECONDITIONS, 'if (uncommitted.length === 0) return;', 'if (true) return;'],
  ['untracked files are not seen as uncommitted work', WORKING_TREE, "'--untracked-files=all'", "'--untracked-files=no'"],
  ['ignored files are counted as uncommitted work', WORKING_TREE, "'--no-renames']", "'--no-renames', '--ignored']"],
  // The main checkout / El checkout principal
  ['a main checkout off the shared branch is accepted', PRECONDITIONS, 'if (current === branch) return;', 'if (true) return;'],
  ['a landed path dirty in the main checkout is accepted', PRECONDITIONS, 'if (dirty.length > 0) {', 'if (false) {'],
  ['any dirty path in the main checkout refuses, landed or not', COLLISIONS, 'const dirty = landed.filter((relative) => uncommitted.has(relative));', 'const dirty = [...uncommitted];'],
  ['a differing ignored file at a landed path is accepted', PRECONDITIONS, 'if (ignored.length > 0) {', 'if (false) {'],
  ['an identical ignored file counts as different', COLLISIONS, 'return onDisk !== landing;', 'return true;'],
  ['an empty landed path counts as occupied', COLLISIONS, "if (error?.code === 'ENOENT') return false;", "if (error?.code === 'ENOENT') return true;"],
  // The range / El rango
  ['a HEAD that does not contain the shared tip lands', PRECONDITIONS, 'if (contains(main, head, tip)) return;', 'if (true) return;'],
  ['the replay command cherry-picks the wrong range', PRECONDITIONS, 'cherry-pick ${base.stdout.trim()}..${head}', 'cherry-pick ${head}'],
  ['a HEAD that does not contain the remote tip lands', PRECONDITIONS, 'if (contains(main, head, remoteTip)) return remoteTip;', 'return remoteTip;'],
  ['a remote commit this repository lacks reads as contained', PRECONDITIONS, '`${ancestor}^{commit}`]).status !== 0) return false;', '`${ancestor}^{commit}`]).status !== 0) return true;'],
  // The verification / La verificación
  ['the verification runs in the main checkout, not the worktree', LAND, 'verifyWorktree(worktree, {', 'verifyWorktree(main, {'],
  ['a red verification lands', VERIFICATION, 'if (run.status === 0) return', 'if (run.status === 0 || run.status === EXIT_VERIFICATION_RED) return'],
  ['a not-measured verification exits like a red one', VERIFICATION, '    EXIT_REFUSED,\n  );', '    EXIT_VERIFICATION_RED,\n  );'],
  ['the red lines are not printed', VERIFICATION, '...redLines],\n      EXIT_VERIFICATION_RED,', '],\n      EXIT_VERIFICATION_RED,'],
  ['the green lines are printed as red', VERIFICATION, "line !== '' && !line.startsWith('GREEN ')", "line !== ''"],
  ['the runner output is read like a declared suite', VERIFICATION, 'if (!isDeclaredSuite) return [saved, ...runnerRedLinesOf(output)];\n', ''],
  ['a declared suite is read like the runner', VERIFICATION, 'redReportOf(output, test.anyNonZeroIsRed)', 'redReportOf(output, false)'],
  ['a declared suite that names no failure shows nothing', VERIFICATION, 'named.length > 0 ? named : suiteTailOf(output)', 'named'],
  ['a declared suite always shows its tail instead of its failures', VERIFICATION, 'named.length > 0 ? named : suiteTailOf(output)', 'suiteTailOf(output)'],
  ['the whole output is not saved on a red run', VERIFICATION, 'const saved = savedOutputLine(output);', "const saved = '';"],
  ['the saved file holds only the failure lines', VERIFICATION, 'const file = writeRedLog(output);', 'const file = writeRedLog(failureLinesOf(output).join(\'\\n\'));'],
  ['a failed save is not reported', VERIFICATION, 'catch (error) {\n    return `    The full output', 'catch (error) {\n    throw error;\n    return `    The full output'],
  ['a green run saves its output', VERIFICATION, 'if (run.status === 0) return `${test.label}: ${', 'if (run.status === 0) return `${test.label}${savedOutputLine(output)}: ${'],
  // What a red run names / Lo que nombra una corrida en rojo
  ['Karma FAILED lines are not picked', RED_REPORT, '\\bFAILED\\b|^\\s*TOTAL:', '^\\s*TOTAL:'],
  ['Karma TOTAL lines are not picked', RED_REPORT, '|^\\s*TOTAL:', ''],
  ['Playwright numbered failures are not picked', RED_REPORT, '|^\\s*\\d+\\) \\[', ''],
  ['Playwright failure marks are not picked', RED_REPORT, '|^\\s*✘', ''],
  ['the Playwright failed summary is not picked', RED_REPORT, '|^\\s*\\d+ (?:failed|flaky)\\b', ''],
  ['the progress counter is shown as a failure', RED_REPORT, ' && !PROGRESS_LINE.test(line)', ''],
  ['a repeated failure line is shown every time', RED_REPORT, ' && lines.indexOf(line) === index', ''],
  ['a stack line already shown as a failure is shown again', RED_REPORT, '.filter((line) => !failing.includes(line))', ''],
  ['no failure line is shown', RED_REPORT, '.slice(0, MAX_FAILURE_LINES)', '.slice(0, 0)'],
  ['the first error stack is not shown', RED_REPORT, '...stack]', ']'],
  ['the error message above the stack is dropped', RED_REPORT, 'frame - start < 2', 'frame - start < 0'],
  ['the stack frames are dropped', RED_REPORT, 'end - frame < MAX_STACK_FRAMES', 'end - frame < 0'],
  ['colour codes are kept', RED_REPORT, ".replace(COLOUR_CODES, '')", ''],
  ['the full output goes to another folder', RED_REPORT, "RED_LOGS_FOLDER = 'red-logs'", "RED_LOGS_FOLDER = 'logs'"],
  ['the full output goes to another mechanism', RED_REPORT, "stateDir('worktree-landing')", "stateDir('worktree-landing-logs')"],
  ['a declared suite failing with an exit other than 1 is not red', VERIFICATION, '(test.anyNonZeroIsRed && run.status !== null)', 'false'],
  ['the green summary does not name the test command', VERIFICATION, 'return `${test.label}: ${', 'return `${'],
  ['a missing test command is not refused', TEST_COMMAND, 'if (existsSync(runner)) {', 'if (true) {'],
  ['the declared unit suite is not read', TEST_COMMAND, 'const suite = declaredSuite(main);', 'const suite = undefined;'],
  ['the declared suite runs at the worktree root, not its directory', TEST_COMMAND, 'cwd: path.join(worktree, suite.directory)', 'cwd: worktree'],
  ['the declared suite runs in the main checkout, not the worktree', TEST_COMMAND, 'cwd: path.join(worktree, suite.directory)', 'cwd: path.join(main, suite.directory)'],
  ['a fleet-kit without unitSuite does not fall back to the runner', TEST_COMMAND, " || !('unitSuite' in parsed)", ''],
  ['a malformed fleet-kit.json is ignored by the test command', TEST_COMMAND, 'throw unreadable(file, error.message);', 'return undefined;'],
  ['a script name with shell metacharacters is accepted', TEST_COMMAND, "|| ![...script].every((character) => SCRIPT_CHARACTERS.includes(character))", ''],
  ['a suite directory outside the worktree is accepted', TEST_COMMAND, " || !staysInside(directory)", ''],
  ['the timeout is not passed to the test command', VERIFICATION, 'timeout: timeoutMs,', 'timeout: 0,'],
  ['a timeout is not told apart from other endings', VERIFICATION, "if (run.error?.code === 'ETIMEDOUT') {", 'if (false) {'],
  ['the preconditions are not asked again after the verification', LAND, 'const after = landingRangeOf(inputs);', 'const after = before;'],
  ['a range that moved during the verification lands', LAND, 'if (after.head === before.head && after.tip === before.tip) return;', 'return;'],
  // The publication / La publicación
  ['check mode publishes', LAND, 'if (check) {', 'if (false) {'],
  ['the landing merges instead of fast-forwarding', PUBLICATION, "'merge', '--ff-only',", "'merge', '--no-ff',"],
  ['the fast-forward is skipped', PUBLICATION, '  fastForward(main, head);\n', ''],
  ['the push is skipped', PUBLICATION, '  push({ main, branch, remote, head });\n', ''],
  ['the remote tip is not read back', PUBLICATION, '  confirmRemoteTip({ main, branch, remote, head });\n', ''],
  // The integration branch / La rama de integración
  ['a branch that is not the first declared one lands', INTEGRATION, 'if (branches[0] !== branch) {', 'if (false) {'],
  ['the LAST declared branch is taken as the integration branch', INTEGRATION, 'if (branches[0] !== branch) {', 'if (branches.at(-1) !== branch) {'],
  ['the integration check is not asked by the preconditions', PRECONDITIONS, 'const integration = requireIntegrationBranch({ main, branch });', "const integration = '';"],
  ['check mode always says it would publish', LAND, 'mayPublishTo({ main, remote })\n            ? `Publication', 'true\n            ? `Publication'],
  ['check mode always says it would land locally only', LAND, 'mayPublishTo({ main, remote })\n            ? `Publication', 'false\n            ? `Publication'],
  ['check mode names the wrong remote when it would publish', LAND, 'would publish to ${remote}.', 'would publish to origin.'],
  ['a repository with no source is refused', INTEGRATION, 'if (declaration === undefined) {', 'if (false) {'],
  ['an unreadable declaration is not turned into a refusal', INTEGRATION, 'if (error instanceof DeclarationUnreadable) throw', 'if (false) throw'],
  // The live ledger / El ledger vivo
  ['a lesson key missing from the tree is accepted', LEDGER_RETENTION, 'if (treeCount === undefined || treeCount < liveCount)', 'if (treeCount < liveCount)'],
  ['a lowered count is accepted', LEDGER_RETENTION, 'if (treeCount === undefined || treeCount < liveCount)', 'if (treeCount === undefined)'],
  ['an equal count is refused', LEDGER_RETENTION, '|| treeCount < liveCount)', '|| treeCount <= liveCount)'],
  ['a higher count in the tree is refused', LEDGER_RETENTION, '|| treeCount < liveCount)', '|| treeCount !== liveCount)'],
  ['a key written twice keeps its last count, not its highest', LEDGER_RETENTION, 'marker.count > (keys.get(marker.key) ?? 0)', 'true'],
  ['a line with no marker is read as a key', LEDGER_RETENTION, 'if (marker !== undefined && marker.count', 'if (marker.count'],
  ['an absent ledger file is read as a failure', LEDGER_RETENTION, "(text ?? '').split", '(text).split'],
  ['the ledgers are resolved for the wrong home', LIVE_LEDGER, 'home: path.dirname(real) }', 'home: real }'],
  ['an unreadable ledger configuration is not refused', LIVE_LEDGER, "throw new Refusal('ledger-configuration-unreadable'", "return [] || new Refusal('ledger-configuration-unreadable'"],
  ['a ledger outside the main checkout is read', LIVE_LEDGER, ".filter((relative) => !relative.startsWith('..'))", '.filter(() => true)'],
  ['a repository with no ledger file is governed', LIVE_LEDGER, "governed: files.some((relative) => existsSync(path.join(main, ...relative.split('/')))),", 'governed: true,'],
  ['a repository whose ledgers resolve is governed even with no ledger file', LIVE_LEDGER, "governed: files.some((relative) => existsSync(path.join(main, ...relative.split('/')))),", 'governed: files.length > 0,'],
  ['the live ledger is read from the tree, not the working copy', LIVE_LEDGER, 'live: keysOfLedgerTexts(files.map((relative) => liveText(main, relative))),', 'live: keysOfLedgerTexts(files.map((relative) => treeText(worktree, head, relative))),'],
  ['the tree ledger is read from the working copy, not the landed head', LIVE_LEDGER, 'tree: keysOfLedgerTexts(files.map((relative) => treeText(worktree, head, relative))),', 'tree: keysOfLedgerTexts(files.map((relative) => liveText(main, relative))),'],
  ['the ledger paths keep the platform separator in the git object name', LIVE_LEDGER, ".map((relative) => relative.split(path.sep).join('/'));", '.map((relative) => relative);'],
  ['a shrinking landing is accepted', PRECONDITIONS, 'if (shortfalls.length > 0) {', 'if (false) {'],
  ['a repository with no ledger is checked as governed', PRECONDITIONS, 'if (!governed) {', 'if (false) {'],
  ['the live-ledger check is not run', PRECONDITIONS, 'const ledger = requireLiveLedgerKept({ worktree, main, head });', "const ledger = '';"],
  ['the refusal does not name the keys', PRECONDITIONS, '      ...listed(lines),', '      ...listed([]),'],
  ['an absent tree count is printed as undefined', PRECONDITIONS, "tree ${treeCount ?? 'absent'} @es", 'tree ${treeCount} @es'],
  ['the second preconditions pass is not run', LAND, 'const after = landingRangeOf(inputs);', 'const after = before;'],
  ['the check report omits the live-ledger line', LAND, '          after.integration,\n          after.ledger,', '          after.integration,'],
  ['the landed report omits the live-ledger line', LAND, 'after.integration, after.ledger, ...(reap', 'after.integration, ...(reap'],
  // Where it publishes / Dónde publica
  ['every remote is published to', PUBLICATION, 'const publishes = mayPublishTo({ main, remote });', 'const publishes = true;'],
  ['the push runs whatever the policy says', PUBLICATION, 'if (publishes) {', 'if (true) {'],
  ['the owner push command is not returned', PUBLICATION, 'pushCommand: publishes ? undefined : `git -C "${main}" push ${remote} ${branch}`', 'pushCommand: undefined'],
  ['the push command names the wrong remote', PUBLICATION, 'push ${remote} ${branch}`', 'push ${branch} ${remote}`'],
  ['a local landing is reported as published', LAND, '`LANDED LOCALLY ${range}', '`LANDED ${range}'],
  ['the push command is not printed', LAND, '...(pushCommand === undefined ? [] :', '...(true ? [] :'],
  ['a remote with no configured url is published to', REMOTE_POLICY, 'urls.length > 0 && urls.every', 'urls.every'],
  ['one owner url is enough', REMOTE_POLICY, 'urls.every((url)', 'urls.some((url)'],
  ['the pushurl is ignored', REMOTE_POLICY, 'pushUrls.length > 0 ? pushUrls : configured(main, remote, \'url\')', 'configured(main, remote, \'url\')'],
  ['a longer path under the owner is accepted', REMOTE_POLICY, 'adrijimcab\\/[^/\\s]+$/i', 'adrijimcab\\/[^\\s]+$/i'],
  ['the owner name is case sensitive', REMOTE_POLICY, 'adrijimcab\\/[^/\\s]+$/i', 'adrijimcab\\/[^/\\s]+$/'],
  ['any owner-prefixed name is accepted', REMOTE_POLICY, 'adrijimcab\\/[^/\\s]+$/i', 'adrijimcab[^/\\s]*$/i'],
  ['the github host dot matches any character', REMOTE_POLICY, '@)?github\\.com\\/|ssh', '@)?github.com\\/|ssh'],
  ['plain http is accepted', REMOTE_POLICY, '(?:https:\\/\\/', '(?:https?:\\/\\/'],
  ['the ssh url form is not recognised', REMOTE_POLICY, '|ssh:\\/\\/git@github\\.com\\/', ''],
  ['the scp-like url form is not recognised', REMOTE_POLICY, '|git@github\\.com:)', ')'],
  // The command line / La línea de órdenes
  ['an unknown option is accepted', ARGUMENTS, 'if (key === undefined || key in inputs ||', 'if (key in inputs ||'],
  ['a repeated option is accepted', ARGUMENTS, '|| key in inputs ||', '||'],
  ['a missing option is accepted', ARGUMENTS, 'return missing.length === 0 ? inputs : { error: USAGE };', 'return inputs;'],
  ['the process exit ignores the outcome', LAND, '  return exitCode;\n}', '  return 0;\n}'],
  // The reaping of the landed worktree / El segado del worktree aterrizado
  ['a landing never reaps', LAND, '...(reap ? reaper({ worktree }).lines : [])', '...(false ? reaper({ worktree }).lines : [])'],
  ['a landing always reaps', LAND, '...(reap ? reaper({ worktree }).lines : [])', '...reaper({ worktree }).lines'],
  ['the reaper is given the main checkout', LAND, 'reaper({ worktree }).lines', 'reaper({ worktree: main }).lines'],
  ['reaping is on by default', LAND, 'check = false, reap = false, verifyTimeoutMs', 'check = false, reap = true, verifyTimeoutMs'],
  ['the --reap flag is not known', ARGUMENTS, "'--reap': 'reap' }", '}'],
  ['the command line reaps by default', ARGUMENTS, 'const inputs = { check: false, reap: false };', 'const inputs = { check: false, reap: true };'],
];

// Each mutant needs ONE failed assertion, so the selftest it runs may stop at the first (see the selftest).
// @es Cada mutante necesita UNA aserción fallida, así que su selftest puede parar en la primera.
process.env.WORKTREE_LANDING_SELFTEST_FAIL_FAST = '1';

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worktree-landing', 'integration-branch', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'worktree-landing/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
