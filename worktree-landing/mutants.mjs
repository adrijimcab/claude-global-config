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
const PRECONDITIONS = 'worktree-landing/preconditions.mjs';
const PUBLICATION = 'worktree-landing/publication.mjs';
const REMOTE_POLICY = 'worktree-landing/remote-policy.mjs';
const VERIFICATION = 'worktree-landing/verification.mjs';
const WORKING_TREE = 'worktree-landing/working-tree.mjs';

const MUTANTS = [
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
  ['the red lines are not printed', VERIFICATION, '...redLinesOf(output)],\n      EXIT_VERIFICATION_RED,', '],\n      EXIT_VERIFICATION_RED,'],
  ['the green lines are printed as red', VERIFICATION, "line !== '' && !line.startsWith('GREEN ')", "line !== ''"],
  ['a missing test command is not refused', VERIFICATION, 'if (!existsSync(runner)) {', 'if (false) {'],
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
  ['a branch that is not the first declared one lands', INTEGRATION, 'if (list[0] !== branch) {', 'if (false) {'],
  ['the LAST declared branch is taken as the integration branch', INTEGRATION, 'if (list[0] !== branch) {', 'if (list.at(-1) !== branch) {'],
  ['the integration check is not asked by the preconditions', PRECONDITIONS, 'const integration = requireIntegrationBranch({ main, branch });', "const integration = '';"],
  ['fleet-kit.json is not read', INTEGRATION, 'existsSync(fleetKit) ? fromFleetKit(fleetKit) : undefined', 'undefined'],
  ['a malformed fleet-kit.json is ignored', INTEGRATION, 'throw unreadable(file, `${error.message}`);', 'return undefined;'],
  ['a fleet-kit without the list does not fall through to the module', INTEGRATION, " || !('integrationBranches' in parsed)", ''],
  ['an empty or non-list declaration is accepted', INTEGRATION, 'if (!ok) throw', 'if (false) throw'],
  ['a project module that fails to import is accepted', INTEGRATION, 'if (run.status !== 0) throw', 'if (false) throw'],
  ['check mode always says it would publish', LAND, 'mayPublishTo({ main, remote })\n            ? `Publication', 'true\n            ? `Publication'],
  ['check mode always says it would land locally only', LAND, 'mayPublishTo({ main, remote })\n            ? `Publication', 'false\n            ? `Publication'],
  ['check mode names the wrong remote when it would publish', LAND, 'would publish to ${remote}.', 'would publish to origin.'],
  ['the project module is not read', INTEGRATION, '(existsSync(ownModule) ? fromOwnModule(ownModule) : undefined)', 'undefined'],
  ['a repository with no source is refused', INTEGRATION, 'if (list === undefined) {', 'if (false) {'],
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
];

// Each mutant needs ONE failed assertion, so the selftest it runs may stop at the first (see the selftest).
// @es Cada mutante necesita UNA aserción fallida, así que su selftest puede parar en la primera.
process.env.WORKTREE_LANDING_SELFTEST_FAIL_FAST = '1';

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worktree-landing', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'worktree-landing/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
