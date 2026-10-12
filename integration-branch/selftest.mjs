#!/usr/bin/env node
/**
 * Self-test for the integration-branch declaration and the origin/HEAD sync. Every repository is CONSTRUCTED
 * in the system temp directory (a bare remote and a clone of it, plus a linked worktree), never a real clone.
 *
 * THE STATE SPACE, enumerated from what the tools decide:
 *   - THE DECLARATION: fleet-kit list; the project module; fleet-kit wins; a fleet-kit without the list falls
 *     through; nothing declared; a malformed file; an empty list; a module that throws; a non-list export.
 *   - THE VERDICT (want, current, remote-tracking ref): equal; different with the ref; different without the
 *     ref; no origin/HEAD at all, with and without the ref.
 *   - THE SYNC: drift fixed; already in sync (nothing written, second run identical); the declared branch has
 *     no remote-tracking ref (refused, nothing created, nothing pushed); a near-miss prefix of an existing
 *     branch; a missing origin/HEAD; a linked worktree path; a repository declaring nothing; an unreadable
 *     declaration; not a repository; a wrong command line.
 *
 * @es Auto-test de la declaración de rama de integración y de la sincronización de origin/HEAD. Cada
 * repositorio se CONSTRUYE en el directorio temporal (un remoto bare, un clon suyo y un worktree enlazado),
 * nunca un clon real. Se recorren todos los estados que deciden las herramientas.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('integration-branch');

const { DeclarationUnreadable, readIntegrationDeclaration } = await import('./declaration.mjs');
const { syncVerdict } = await import('./sync-verdict.mjs');
const { originHeadBranch, remoteBranchExists } = await import('./git-refs.mjs');
const { originHeadState } = await import('./origin-head-state.mjs');

const SYNC = path.join(import.meta.dirname, 'sync.mjs');
const CHILD_TIMEOUT_MS = 60_000;
const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'integration-branch-')));

let passed = 0;
const failures = [];

function check(condition, name) {
  if (condition) passed += 1;
  else failures.push(name);
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
}

function git(cwd, ...args) {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
}

const put = (base, relative, content) => {
  mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
  writeFileSync(path.join(base, relative), content, 'utf8');
};

let counter = 0;

/** A bare remote with `main`, `feature/meet` and `develop`, and a clone of it whose origin/HEAD is `main`. */
function repository(declared) {
  counter += 1;
  const home = path.join(root, `case-${counter}`);
  const remote = path.join(home, 'remote.git');
  const seed = path.join(home, 'seed');
  const clone = path.join(home, 'clone');
  mkdirSync(home);
  git(home, 'init', '-q', '--bare', '-b', 'main', remote);
  git(home, 'init', '-q', '-b', 'main', seed);
  git(seed, 'config', 'user.email', 't@example.invalid');
  git(seed, 'config', 'user.name', 'tester');
  put(seed, 'a.txt', 'a\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-q', '-m', 'seed');
  git(seed, 'remote', 'add', 'origin', remote);
  for (const branch of ['feature/meet', 'develop']) git(seed, 'branch', branch);
  git(seed, 'push', '-q', 'origin', 'main', 'feature/meet', 'develop');
  git(home, 'clone', '-q', remote, clone);
  if (declared !== undefined) put(clone, '.claude/fleet-kit.json', JSON.stringify({ integrationBranches: declared }));
  return { home, remote, clone };
}

const sync = (...args) => {
  const run = spawnSync(process.execPath, [SYNC, ...args], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
  return { code: run.status, out: run.stdout, err: run.stderr };
};

const bilingual = (text) => text.includes(' @es ');
const refsOf = (cwd) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes');

// ── The declaration: one reader ──────────────────────────────────────────────────────────────────
const MODULE = '.claude/integrate/integration-branches.mjs';
const declare = (relative, content) => {
  counter += 1;
  const dir = path.join(root, `declaration-${counter}`);
  put(dir, relative, content);
  return dir;
};

const fleet = declare('.claude/fleet-kit.json', '{"integrationBranches":["feature/meet","develop"]}');
const fleetRead = readIntegrationDeclaration(fleet);
check(JSON.stringify(fleetRead?.branches) === '["feature/meet","develop"]' && fleetRead.source === path.join(fleet, '.claude/fleet-kit.json'), 'fleet-kit list is read in order, naming its file');
const moduleOnly = declare(MODULE, "export const INTEGRATION_BRANCHES = Object.freeze(['develop', 'main']);\n");
const moduleRead = readIntegrationDeclaration(moduleOnly);
check(JSON.stringify(moduleRead?.branches) === '["develop","main"]' && moduleRead.source === path.join(moduleOnly, MODULE), 'the project module is read, naming its file');
const both = declare('.claude/fleet-kit.json', '{"integrationBranches":["feature/meet"]}');
put(both, MODULE, "export const INTEGRATION_BRANCHES = ['develop'];\n");
check(readIntegrationDeclaration(both)?.branches[0] === 'feature/meet', 'fleet-kit outranks the project module');
const noList = declare('.claude/fleet-kit.json', '{"landingGuard":{"mode":"enforce"}}');
put(noList, MODULE, "export const INTEGRATION_BRANCHES = ['develop'];\n");
check(readIntegrationDeclaration(noList)?.branches[0] === 'develop', 'a fleet-kit without the list falls through to the module');
check(readIntegrationDeclaration(declare('unrelated.txt', 'x')) === undefined, 'a repository declaring nothing reads as undefined');

const unreadable = (name, relative, content) => {
  const dir = declare(relative, content);
  try {
    readIntegrationDeclaration(dir);
    check(false, `${name} throws`);
  } catch (error) {
    check(error instanceof DeclarationUnreadable && error.message.includes(path.join(dir, relative)) && bilingual(error.message), `${name} throws DeclarationUnreadable naming the file, bilingual`);
  }
};
unreadable('a malformed fleet-kit.json', '.claude/fleet-kit.json', '{ not json');
unreadable('an empty list', '.claude/fleet-kit.json', '{"integrationBranches":[]}');
unreadable('a list with a non-string entry', '.claude/fleet-kit.json', '{"integrationBranches":["develop",3]}');
unreadable('a list with an empty name', '.claude/fleet-kit.json', '{"integrationBranches":[""]}');
unreadable('a module that throws', MODULE, 'throw new Error("boom");\n');
unreadable('a module exporting a non-list', MODULE, "export const INTEGRATION_BRANCHES = 'develop';\n");

// ── The verdict ──────────────────────────────────────────────────────────────────────────────────
check(syncVerdict({ want: 'develop', current: 'develop', remoteRefExists: true }) === 'in-sync', 'verdict: equal is in sync');
check(syncVerdict({ want: 'develop', current: 'develop', remoteRefExists: false }) === 'in-sync', 'verdict: equal is in sync even if the ref probe said no');
check(syncVerdict({ want: 'develop', current: 'main', remoteRefExists: true }) === 'set', 'verdict: different with the ref is set');
check(syncVerdict({ want: 'develop', current: 'main', remoteRefExists: false }) === 'missing-remote-ref', 'verdict: different without the ref is missing-remote-ref');
check(syncVerdict({ want: 'develop', current: undefined, remoteRefExists: true }) === 'set', 'verdict: no origin/HEAD with the ref is set');
check(syncVerdict({ want: 'develop', current: undefined, remoteRefExists: false }) === 'missing-remote-ref', 'verdict: no origin/HEAD without the ref is missing-remote-ref');

// ── The git readers ──────────────────────────────────────────────────────────────────────────────
const probe = repository(['feature/meet', 'develop']);
check(originHeadBranch(probe.clone) === 'main', 'origin/HEAD target is read as a branch name');
check(remoteBranchExists(probe.clone, 'feature/meet') === true, 'a branch with a slash has its remote-tracking ref');
check(remoteBranchExists(probe.clone, 'feature') === false, 'a prefix of an existing branch has none');
check(remoteBranchExists(probe.clone, 'nowhere') === false, 'an unknown branch has none');
git(probe.clone, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
check(originHeadBranch(probe.clone) === undefined, 'a missing origin/HEAD reads as undefined');

// ── The state ────────────────────────────────────────────────────────────────────────────────────
const stateRepo = repository(['feature/meet', 'develop']);
const state = originHeadState(stateRepo.clone);
check(state?.verdict === 'set' && state.want === 'feature/meet' && state.current === 'main' && state.main === stateRepo.clone && state.source === path.join(stateRepo.clone, '.claude/fleet-kit.json'), 'state: a drifted clone reads want, current, main, source and verdict set');
check(originHeadState(repository(undefined).clone)?.governed === false, 'state: a clone declaring nothing is not governed');
check(originHeadState(path.join(root, 'not-a-repo')) === undefined, 'state: a directory that is not a repository reads as undefined');

// ── The sync ─────────────────────────────────────────────────────────────────────────────────────
const drifted = repository(['feature/meet', 'develop']);
const remoteBefore = git(drifted.remote, 'for-each-ref', '--format=%(refname) %(objectname)');
const fixed = sync(drifted.clone);
check(fixed.code === 0 && originHeadBranch(drifted.clone) === 'feature/meet', `sync points origin/HEAD at the declared first branch (exit ${fixed.code}): ${fixed.err}`);
check(bilingual(fixed.out) && fixed.out.includes('feature/meet') && fixed.out.includes('main'), 'sync says what it changed, from and to, bilingual');
check(git(drifted.remote, 'for-each-ref', '--format=%(refname) %(objectname)') === remoteBefore, 'sync never touches the remote');
const refsAfterFirst = refsOf(drifted.clone);
const again = sync(drifted.clone);
check(again.code === 0 && refsOf(drifted.clone) === refsAfterFirst && bilingual(again.out) && !again.out.includes('moved'), `sync is idempotent: second run changes nothing (exit ${again.code})`);

const worktreeBase = repository(['develop']);
const linked = path.join(worktreeBase.home, 'linked');
git(worktreeBase.clone, 'worktree', 'add', '-q', '-b', 'work', linked);
const viaWorktree = sync(linked);
check(viaWorktree.code === 0 && originHeadBranch(worktreeBase.clone) === 'develop', `sync run from a linked worktree reads the main checkout's declaration and fixes the shared ref (exit ${viaWorktree.code}): ${viaWorktree.err}`);

const noHead = repository(['develop']);
git(noHead.clone, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
check(sync(noHead.clone).code === 0 && originHeadBranch(noHead.clone) === 'develop', 'sync recreates a missing origin/HEAD');

const localOnly = repository(['unpublished', 'develop']);
git(localOnly.clone, 'branch', 'unpublished');
const refsLocal = refsOf(localOnly.clone);
const remoteLocal = git(localOnly.remote, 'for-each-ref', '--format=%(refname) %(objectname)');
const refused = sync(localOnly.clone);
check(refused.code === 2 && refsOf(localOnly.clone) === refsLocal && originHeadBranch(localOnly.clone) === 'main', `sync refuses a declared branch with no remote-tracking ref and changes nothing (exit ${refused.code})`);
check(refused.err.includes('refs/remotes/origin/unpublished') && refused.err.includes('fetch') && refused.err.includes('push') && bilingual(refused.err), `the refusal names the missing ref and the owner's fetch or push decision, bilingual: ${refused.err}`);
check(git(localOnly.remote, 'for-each-ref', '--format=%(refname) %(objectname)') === remoteLocal, 'the refusal pushes nothing');

const nearMiss = repository(['feature']);
check(sync(nearMiss.clone).code === 2 && originHeadBranch(nearMiss.clone) === 'main', 'a prefix of an existing branch is not that branch: refused');

const alreadyMain = repository(['main']);
const noChange = sync(alreadyMain.clone);
check(noChange.code === 0 && originHeadBranch(alreadyMain.clone) === 'main' && bilingual(noChange.out), 'a clone already on the declared branch is reported in sync');

const ungoverned = repository(undefined);
const nothing = sync(ungoverned.clone);
check(nothing.code === 0 && originHeadBranch(ungoverned.clone) === 'main' && bilingual(nothing.out), 'a repository declaring nothing is left alone, exit 0, said bilingual');

const broken = repository(undefined);
put(broken.clone, '.claude/fleet-kit.json', '{ not json');
const brokenRun = sync(broken.clone);
check(brokenRun.code === 2 && brokenRun.err.includes(path.join(broken.clone, '.claude/fleet-kit.json')) && originHeadBranch(broken.clone) === 'main', 'an unreadable declaration is refused naming the file, nothing changed');

const plain = path.join(root, 'plain');
mkdirSync(plain);
const notRepo = sync(plain);
check(notRepo.code === 2 && bilingual(notRepo.err), 'a directory that is not a repository is refused, bilingual');
check(sync().code === 2 && bilingual(sync().err), 'no argument prints the usage and exits 2');
check(sync('a', 'b').code === 2, 'two arguments are refused');

rmSync(root, { recursive: true, force: true });
const total = passed + failures.length;
console.log(`${passed}/${total} assertions passed @es ${passed}/${total} aserciones correctas`);
if (failures.length > 0) console.log(`FAILED: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
