#!/usr/bin/env node
/**
 * The decisions of integrated-worktree-guard, each broken once, that `selftest.mjs` must catch. The runner
 * and its rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de integrated-worktree-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'integrated-worktree-guard/guard.mjs';
const CENSUS = 'integrated-worktree-guard/worktree-census.mjs';
const BASE = 'integrated-worktree-guard/integration-base.mjs';
const STATE = 'integrated-worktree-guard/working-tree-state.mjs';
const LISTING = 'integrated-worktree-guard/linked-worktrees.mjs';
const REPOS = 'integrated-worktree-guard/session-repositories.mjs';
const NOTICED = 'integrated-worktree-guard/noticed-sets.mjs';
const REPORT = 'integrated-worktree-guard/report.mjs';
const ADDED = 'integrated-worktree-guard/added-worktree-path.mjs';
const DECLARED = 'integrated-worktree-guard/declared-run-output.mjs';

const MUTANTS = [
  // --- the worktree's own install, declared by its receipt
  ['every node_modules is installer output', DECLARED, "  if (segments.at(-1) !== 'node_modules') return false;\n", ''],
  ['a stale receipt still declares the tree', DECLARED, '&& hashFile(path.join(worktree, ...segments.slice(0, -1), lockfile)) === receipt.lockfileHash;', ';'],
  ['a receipt naming a path is trusted', DECLARED, " || lockfile !== path.basename(lockfile) || lockfile.includes('/') || lockfile.includes('\\\\')) return false;", ') return false;'],
  ['the receipt is never consulted', DECLARED, '  if (isReceiptedInstall(worktree, segments)) return [];\n', ''],

  // --- the turn
  ['`stop_hook_active` is ignored, so a refusal can loop', GUARD, 'if (payload?.stop_hook_active === true) return undefined;', ''],
  ['a subagent\'s turn end is judged too', GUARD, "if (isSubagentCaller(payload) || payload?.hook_event_name === 'SubagentStop') return undefined;", "if (payload?.hook_event_name === 'SubagentStop') return undefined;"],
  ['SubagentStop is judged too', GUARD, "if (isSubagentCaller(payload) || payload?.hook_event_name === 'SubagentStop') return undefined;", 'if (isSubagentCaller(payload)) return undefined;'],
  ['the directory this session stands in may be offered for removal', GUARD, '(standingIn !== undefined && isInside(worktreePath, standingIn)) || isLive(worktreePath)', 'isLive(worktreePath)'],
  ['the liveness check is ignored, so a live actor\'s worktree is offered', GUARD, '(standingIn !== undefined && isInside(worktreePath, standingIn)) || isLive(worktreePath)', '(standingIn !== undefined && isInside(worktreePath, standingIn))'],
  ['the refusal repeats every turn (a shown set is forgotten)', GUARD, 'if (alreadyShown(stateDir, sessionId, fingerprint)) {', 'if (false) {'],
  ['a shown set is global, so a new session is never shown it', GUARD, "if (alreadyShown(stateDir, sessionId, fingerprint)) {", "if (alreadyShown(stateDir, 'any-session', fingerprint)) {"],
  ['the set is one constant, so a NEW worktree is never shown', GUARD, ".sort().join('\\n')", ".sort().join('').slice(0, 0)"],
  ['a failure to record the shown set still refuses (a possible loop)', GUARD, 'if (!markShown(stateDir, sessionId, fingerprint, now)) {', 'if (false) {'],
  ['a removable worktree only produces a notice, never a refusal', GUARD, 'if (removable.length > 0) {', 'if (false) {'],
  ['an empty fleet still speaks (the quiet exit is skipped)', GUARD, 'if (removable.length + stranded.length + skipped.length === 0) {', 'if (false) {'],
  ['the refusal drops the stranded and skipped notes', GUARD, 'refusalText(removable, { stranded, skipped })', 'refusalText(removable)'],

  // --- the census
  ['a locked worktree is judged', CENSUS, 'if (worktree.locked) return skipped(', 'if (false) return skipped('],
  ['a prunable worktree is judged', CENSUS, 'if (worktree.prunable) return skipped(', 'if (false) return skipped('],
  ['a detached HEAD is compared as if it were a branch', CENSUS, 'if (worktree.branch === undefined) return skipped(', 'if (false) return skipped('],
  ['liveness is not consulted', CENSUS, "if (isLive(worktree.path)) return { kind: 'live'", "if (false) return { kind: 'live'"],
  ['an unreadable status reads as clean', CENSUS, 'if (!state.measured) return skipped(', 'if (false) return skipped('],
  ['a single stranded entry is tolerated', CENSUS, 'if (state.work.length > 0) return', 'if (state.work.length > 1) return'],
  ['a worktree with no integration base is compared anyway', CENSUS, "if ('skip' in base) return skipped(base.skip);", ''],
  ['an unlistable cherry reads as integrated', CENSUS, 'if (cherry === undefined) return skipped(', 'if (false) return skipped('],
  ['a branch is integrated when it merely HAS commits (the + test is inverted)', CENSUS, 'line.startsWith(UNINTEGRATED_LINE)', "line.startsWith('-')"],
  ['integration is judged by ancestry instead of patch-id', CENSUS, "readCherry(mainRoot, base.base, worktree.branch)", "readGit(mainRoot, ['rev-list', '--left-right', `${base.base}...${worktree.branch}`])"],
  ['the links of a removable worktree are not reported', CENSUS, 'links: state.links }', 'links: [] }'],

  ['the census judges worktrees the session does not own', CENSUS, 'worktrees.filter((worktree) => owns(worktree.path))', 'worktrees'],
  ['the turn judges every worktree of a repository, owned or not', GUARD, 'owns: ownsWorktree', 'owns: () => true'],

  // --- the integration base
  ['an upstream that is the branch\'s own remote copy is trusted', BASE, 'isOwnCopy: merge === `${HEADS_PREFIX}${branch}`', 'isOwnCopy: false'],
  ['every upstream is distrusted, so the default is always used', BASE, 'if (upstream !== undefined && !upstream.isOwnCopy) {', 'if (false) {'],
  ['a root-commit default is compared against', BASE, 'if (parents === 1) {', 'if (parents === 99) {'],
  ['a missing origin default is compared against', BASE, 'if (defaultBranch === undefined || !resolves(repo, defaultBranch)) {', 'if (false) {'],

  // --- the working tree
  ['ignored files are not read, so ignored work is invisible', STATE, "['status', '--porcelain=v1', '--ignored', '-z']", "['status', '--porcelain=v1', '-z']"],
  ['every ignored entry is taken for a link', STATE, 'if (status === IGNORED && isLink(worktree, entry)) links.push(entry);', 'if (status === IGNORED) links.push(entry);'],
  ['a link is taken for work', STATE, "return lstatSync(path.join(worktree, entry.endsWith('/') ? entry.slice(0, -1) : entry)).isSymbolicLink();", 'return false;'],
  ['the origin of a rename is read as another entry', STATE, 'if (TWO_FIELD_STATUSES.has(status[0]) || TWO_FIELD_STATUSES.has(status[1])) at += 1;', ''],
  ['a failed status reads as clean', STATE, 'if (raw === undefined) return { measured: false };', ''],

  // --- the listing
  ['the main checkout is listed as removable', LISTING, '.slice(1)', '.slice(0)'],
  ['a locked worktree is not flagged', LISTING, "field === LOCKED_FIELD || field.startsWith(`${LOCKED_FIELD} `)", 'false'],
  ['a prunable worktree is not flagged', LISTING, "field === PRUNABLE_FIELD || field.startsWith(`${PRUNABLE_FIELD} `)", 'false'],

  // --- the repositories
  ['a linked worktree is its own repository, not its main checkout', REPOS, "return path.basename(commonDir) === '.git' ? path.dirname(commonDir) : commonDir;", 'return directory;'],
  ['a tool input path names no repository', REPOS, "const PATH_FIELDS = ['file_path', 'path', 'notebook_path', 'cwd'];", 'const PATH_FIELDS = [];'],
  ['a record\'s cwd names no repository', REPOS, "const paths = typeof record?.cwd === 'string' ? [record.cwd] : [];", 'const paths = [];'],
  ['a git -C target names no repository', REPOS, 'if (acting !== undefined && acting !== invocation.directory) directories.push(acting);', ''],
  ['a mention of git in a command is read as a command', REPOS, 'for (const invocation of gitInvocations(command, dialect, cwd)) {', 'for (const invocation of gitInvocations(`git ${command}`, dialect, cwd)) {'],
  ['a record straddling a read chunk is dropped', REPOS, 'pending = Buffer.concat([pending, buffer.subarray(0, read)]);', 'pending = buffer.subarray(0, read);'],
  ['a failed transcript read is reported as read', REPOS, '      transcriptRead = true;\n    } catch {\n      transcriptRead = false;', '      transcriptRead = true;\n    } catch {\n      transcriptRead = true;'],
  ['a repository is listed once per path that names it', REPOS, 'if (!seen.has(identityOf(located.main))) seen.set(identityOf(located.main), located.main);', 'seen.set(`${identityOf(located.main)}|${somePath}`, located.main);'],

  ['visiting the main checkout makes a session the owner of its worktrees', REPOS, 'ownsWorktree: (worktreePath) => inside.has(identityOf(path.resolve(worktreePath)))', 'ownsWorktree: (worktreePath) => seen.has(identityOf(mainCheckoutOf(worktreePath) ?? worktreePath))'],
  ['working inside a worktree does not make a session its owner', REPOS, 'if (located.linkedRoot !== undefined) inside.add(identityOf(located.linkedRoot));', ''],
  ['a worktree the session creates is not attributed to it', REPOS, 'if (added !== undefined) directories.push(added);', ''],
  ['the worktree root of a linked checkout is lost', REPOS, "linkedRoot: directory };", 'linkedRoot: undefined };'],

  // --- the worktree a git worktree add creates
  ['any git worktree subcommand is read as an add', ADDED, "args[0] !== 'add'", 'false'],
  ['a branch name given to -b is read as the path', ADDED, 'if (OPTIONS_WITH_VALUE.has(args[at])) at += 1;', 'if (OPTIONS_WITH_VALUE.has(args[at])) continue;'],
  ['-C is ignored when resolving the created path', ADDED, 'const base = invocationDirectory(invocation);', 'const base = invocation.directory;'],
  ['the created path is not resolved against the directory of the line', ADDED, 'return path.resolve(base, args[at]);', 'return args[at];'],

  // --- the declared process output
  ['every ignored entry under scratch is taken for declared output', DECLARED, "segments: ['scratch', 'mutation-proof']", "segments: ['scratch']"],
  ['the declared output is not recognised', DECLARED, 'if (startsWith(segments, declared)) return [];', ''],
  ['an entry that contains the declared path is not expanded', DECLARED, 'if (startsWith(declared, segments)) {', 'if (false) {'],
  ['an unreadable directory beside the declared output reads as clean', DECLARED, 'return [entry];\n      }', 'return [];\n      }'],
  ['ignored work is exempt from the declaration check', STATE, 'else if (status === IGNORED) work.push(...undeclaredPartOf(worktree, entry));', 'else if (status === IGNORED) work.push(entry);'],

  // --- the memory of shown sets
  ['every session is remembered, unbounded', NOTICED, '.slice(0, REMEMBERED_SESSIONS)', ''],
  ['the oldest sessions are the ones kept', NOTICED, 'Number(b.at ?? 0) - Number(a.at ?? 0)', 'Number(a.at ?? 0) - Number(b.at ?? 0)'],
  ['a failed write reports success', NOTICED, '    return false;\n  }\n}', '    return true;\n  }\n}'],

  // --- the text
  ['the junction precaution is left out', REPORT, 'if (item.links.length > 0) {', 'if (false) {'],
  ['the branch is not deleted', REPORT, "`    git -C \"{main${at}}\" branch -D \"{branch${at}}\"`);\n    es.push", "`    # {branch${at}}`);\n    es.push"],
  ['paths are shown with backslashes', REPORT, "String(somePath).replaceAll('\\\\', '/')", 'String(somePath)'],
  ['the Spanish half of the refusal loses its accents', REPORT, 'están integrados', 'estan integrados']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['integrated-worktree-guard', 'worktree-install', 'project-profile', 'toolchain-guard', 'git-port', 'mutation-proof', 'hook-state', 'hook-caller', 'agent-liveness', 'shell-command', 'cherry-pick-guard', 'bilingual-output', 'brief-tenancy'],
  selftest: 'integrated-worktree-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
