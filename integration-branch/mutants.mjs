#!/usr/bin/env node
/**
 * Mutant campaign of the integration-branch declaration reader and the origin/HEAD sync: each mutant breaks
 * ONE decision and `selftest.mjs` must go red by a failed check, never by a crash (`crashKills: 'fail'`).
 * Uses the fleet's shared runner (read only); a missing runner exits 2 (NOT MEASURED), never a verdict.
 *
 * @es Campaña de mutantes del lector de la declaración de rama de integración y de la sincronización de
 * origin/HEAD: cada mutante rompe UNA decisión y `selftest.mjs` debe ponerse en rojo por un check fallido,
 * nunca por un crash. Sin runner compartido sale con 2 (NO MEDIDO), nunca un veredicto.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const EXIT_NOT_MEASURED = 2;

const DECLARATION = 'integration-branch/declaration.mjs';
const VERDICT = 'integration-branch/sync-verdict.mjs';
const REFS = 'integration-branch/git-refs.mjs';
const STATE = 'integration-branch/origin-head-state.mjs';
const SYNC = 'integration-branch/sync.mjs';

const MUTANTS = [
  // The declaration / La declaración
  ['fleet-kit.json is not read', DECLARATION, 'existsSync(fleetKit) ? fromFleetKit(fleetKit) : undefined', 'undefined'],
  ['a malformed fleet-kit.json is ignored', DECLARATION, 'throw new DeclarationUnreadable(file, `${error.message}`);', 'return undefined;'],
  ['a fleet-kit without the list does not fall through to the module', DECLARATION, " || !('integrationBranches' in parsed)", ''],
  ['an empty or non-list declaration is accepted', DECLARATION, 'if (!ok) throw', 'if (false) throw'],
  ['an empty list is accepted', DECLARATION, 'value.length > 0 && ', ''],
  ['a non-string entry is accepted', DECLARATION, "typeof entry === 'string' && ", ''],
  ['an empty branch name is accepted', DECLARATION, "typeof entry === 'string' && entry !== ''", "typeof entry === 'string'"],
  ['a project module that fails to import is accepted', DECLARATION, 'if (run.status !== 0) throw', 'if (false) throw'],
  ['the project module is not read', DECLARATION, '(existsSync(ownModule) ? fromOwnModule(ownModule) : undefined)', 'undefined'],
  ['the project module outranks fleet-kit', DECLARATION, 'fleetList ?? (existsSync(ownModule) ? fromOwnModule(ownModule) : undefined)', '(existsSync(ownModule) ? fromOwnModule(ownModule) : undefined) ?? fleetList'],
  ['the source is always fleet-kit', DECLARATION, "const source = fleetList === undefined ? ownModule : fleetKit;", 'const source = fleetKit;'],
  ['a repository declaring nothing reads as an empty declaration', DECLARATION, 'return branches === undefined ? undefined : { branches, source };', 'return { branches: branches ?? [], source };'],
  ['the unreadable error forgets its file', DECLARATION, 'this.file = file;', ''],
  ['the module reader asks for the wrong export', DECLARATION, 'm.INTEGRATION_BRANCHES ??', 'm.default ??'],

  // The verdict / El veredicto
  ['an equal branch is not in sync', VERDICT, "if (current === want) return 'in-sync';", "if (false) return 'in-sync';"],
  ['a different branch is in sync', VERDICT, "if (current === want) return 'in-sync';", "if (current !== want) return 'in-sync';"],
  ['a missing remote-tracking ref is set anyway', VERDICT, "return remoteRefExists ? 'set' : 'missing-remote-ref';", "return 'set';"],
  ['an existing remote-tracking ref is refused', VERDICT, "return remoteRefExists ? 'set' : 'missing-remote-ref';", "return 'missing-remote-ref';"],

  // The git readers / Los lectores de git
  ['the common dir is resolved against the process, not git', REFS, "'--path-format=absolute', ", ''],
  ['a bare repository counts as a main checkout', REFS, "path.basename(common) === '.git' ? path.dirname(common) : undefined", 'path.dirname(common)'],
  ['an origin/HEAD pointing outside the remote reads as a branch', REFS, 'target.startsWith(REMOTE_PREFIX) ? target.slice(REMOTE_PREFIX.length) : undefined', 'target.slice(REMOTE_PREFIX.length)'],
  ['a missing origin/HEAD reads as a branch', REFS, "{ timeoutMs: GIT_QUICK_TIMEOUT_MS }).stdout.trim();\n  return target.startsWith", "{ timeoutMs: GIT_QUICK_TIMEOUT_MS }).stdout.trim() || 'refs/remotes/origin/main';\n  return target.startsWith"],
  ['a missing remote-tracking ref reads as present', REFS, "'--quiet', `${REMOTE_PREFIX}${branch}`], { timeoutMs: GIT_QUICK_TIMEOUT_MS }).status === 0", "'--quiet', `${REMOTE_PREFIX}${branch}`], { timeoutMs: GIT_QUICK_TIMEOUT_MS }).status !== 0"],
  ['a local branch counts as a remote-tracking ref', REFS, '`${REMOTE_PREFIX}${branch}`], { timeoutMs', '`refs/heads/${branch}`], { timeoutMs'],
  ['origin/HEAD is never pointed', REFS, "gitOutput(clone, ['remote', 'set-head', REMOTE, branch], { timeoutMs: GIT_QUICK_TIMEOUT_MS });", 'void branch;'],

  // The state / El estado
  ['the last declared branch is the one wanted', STATE, 'declaration.branches[0]', 'declaration.branches.at(-1)'],
  ['origin/HEAD is read as unset', STATE, 'const current = originHeadBranch(main);', 'const current = undefined;'],
  ['the remote-tracking ref is assumed present', STATE, 'remoteBranchExists(main, want)', 'true'],
  ['a repository declaring nothing is governed', STATE, 'if (declaration === undefined) return { governed: false, main };', 'if (false) return { governed: false, main };'],
  ['a directory outside any repository is read as governed', STATE, 'if (main === undefined) return undefined;', 'if (main === undefined) return { governed: false, main };'],

  // The sync command / La orden de sincronización
  ['two arguments are accepted', SYNC, 'if (args.length !== 1) {', 'if (args.length < 1) {'],
  ['no argument is accepted', SYNC, 'if (args.length !== 1) {', 'if (args.length > 1) {'],
  ['a directory outside a repository is accepted', SYNC, 'if (state === undefined) {', 'if (false) {'],
  ['a repository declaring nothing is refused', SYNC, 'if (!state.governed) {', 'if (false) {'],
  ['a clone in sync is rewritten', SYNC, "if (verdict === 'in-sync') {", 'if (false) {'],
  ['a missing remote-tracking ref is not refused by the tool', SYNC, "if (verdict === 'missing-remote-ref') {", 'if (false) {'],
  ['origin/HEAD is not moved', SYNC, '    pointOriginHeadAt(main, want);\n', ''],
  ['an unset origin/HEAD is not tolerated', SYNC, 'const current = state.current ?? UNSET;', 'const current = state.current;'],
  ['a refusal exits 0', SYNC, 'const EXIT_REFUSED = 2;', 'const EXIT_REFUSED = 0;'],
  ['a failure of the tool is not reported', SYNC, 'speaker.dataError(error.message);', ''],
  ['the command does not run as the main process', SYNC, 'if (process.argv[1] !== undefined && path.resolve', 'if (false && path.resolve']
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(EXIT_NOT_MEASURED);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: ['integration-branch', 'hook-state', 'bilingual-output', 'worktree-landing'],
  selftest: 'integration-branch/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
