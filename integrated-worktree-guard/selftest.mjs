#!/usr/bin/env node
/**
 * Self-test for integrated-worktree-guard, against git repositories and transcripts CONSTRUCTED here, never
 * the live ones.
 *
 * THE STATE SPACE, enumerated from the decision (`worktree-census.mjs`, `integration-base.mjs`, `guard.mjs`):
 *   - THE VERDICT of one linked worktree: integrated + clean + idle (REFUSE); integrated by fast-forward
 *     AND by cherry-pick (a different sha, the same patch: `git cherry` sees it, ancestry does not);
 *     unintegrated (allow); dirty with an untracked file (stranded); dirty with an IGNORED real directory
 *     (stranded: ignored files count as work); a clean worktree holding an ignored JUNCTION (removable, the
 *     link named apart, the junction's target never touched); held by a live actor (allow); locked, detached
 *     HEAD (skipped); the main checkout (never listed).
 *   - THE INTEGRATION BASE: the upstream; an upstream that is the branch's OWN remote copy (must not read as
 *     integrated); no upstream with a real default branch; no upstream with a ROOT-COMMIT default branch
 *     (skipped with the reason, as in `di_1700002_discovery_fe`); an upstream other than the default.
 *   - THE LIVENESS: the shared check over a fake agent store: a transcript written now (live) and one two
 *     hours old (idle); the directory the session stands in counts as held.
 *   - THE REPOSITORIES: from a transcript's `cwd`, a path-bearing tool input, a `git -C` target; NOT from a
 *     mention in `echo`; a path inside a linked worktree and one inside the main checkout are one repository;
 *     an unreadable transcript is reported.
 *   - THE OWNERSHIP: one main checkout, two sessions, three linked worktrees: a session that only read the main
 *     checkout is offered none; the creator (a `git worktree add`, with -C and a relative path) is offered what it
 *     created; a session that worked inside one is offered that one; a mention in `echo` creates nothing.
 *   - THE DECLARED OUTPUT: ignored mutation-proof scratch reads as clean; an undeclared ignored entry beside it,
 *     under it, or one that merely looks like it, still reads as work; the declared path matches the runner's.
 *   - THE TURN: refuses once per session and set; a new worktree changes the set; a new session is shown it
 *     again; `stop_hook_active`, a subagent and `SubagentStop` pass; stranded/skipped only: a non-blocking
 *     notice, once.
 *   - THE OUTPUT: bilingual, names each worktree and branch, the exact removal in order, the link precaution,
 *     and removes nothing itself (every directory still exists after the guard ran).
 *   - THE SHIM: the real process, stdin in, stdout out, with a BOM.
 *
 * @es Auto-test del integrated-worktree-guard contra repos y transcripts CONSTRUIDOS aquí. Estados: el
 * veredicto de cada worktree (integrado por ff y por cherry-pick, no integrado, varado por no seguido o por
 * ignorado, con junction, vivo, locked, desacoplado, el principal), la base de integración (upstream, copia
 * propia, rama por defecto real, rama por defecto raíz, upstream distinto), la vivacidad, los repos
 * derivados del transcript, la propiedad por worktree (la sesión que solo leyó el principal no es dueña de nada), la salida de proceso declarada (el scratch de mutation-proof es limpio, un ignorado sin declarar sigue siendo trabajo), el turno (una vez por conjunto), la salida y el shim real.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DECLARED_RUN_OUTPUT, isReceiptedInstall, undeclaredPartOf } from './declared-run-output.mjs';
import { RECEIPT } from '../worktree-install/own-install.mjs';
import { hashFile } from '../worktree-install/verdict-store.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { decide, evaluate, sharedLiveness } from './guard.mjs';
import { integrationBase } from './integration-base.mjs';
import { linkedWorktrees } from './linked-worktrees.mjs';
import { alreadyShown, markShown } from './noticed-sets.mjs';
import { noticeText, refusalText } from './report.mjs';
import { mainCheckoutOf, pathsOf, repositoriesWorkedIn } from './session-repositories.mjs';
import { censusOf } from './worktree-census.mjs';
import { workingTreeState } from './working-tree-state.mjs';

isolateState('integrated-worktree-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'integrated-worktree-')));

/** The census, or an empty list when it throws, so a broken census fails the checks instead of crashing the run. @es El censo, o lista vacía si lanza. */
function censusSafely(repository, dependencies) {
  try {
    return censusOf(repository, dependencies) ?? [];
  } catch {
    return [];
  }
}

/** The turn decision, or a marker when it throws, so a broken decision fails checks instead of crashing the run. @es La decisión del turno, o un marcador si lanza. */
function decideSafely(payload, dependencies) {
  try {
    return decide(payload, dependencies);
  } catch (error) {
    return { threw: error.message };
  }
}

/** A path with forward slashes, as the refusal prints it. @es Una ruta con barras normales, como la imprime el rechazo. */
const slash = (somePath) => somePath.replaceAll('\\', '/');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

/** A fresh clone of a bare origin, with identity and no hooks. @es Un clon de un origin bare, con identidad y sin hooks. */
function repository(name, defaultBranch) {
  const origin = path.join(root, `${name}-origin.git`);
  const clone = path.join(root, name);

  git(root, 'init', '--bare', '--quiet', `--initial-branch=${defaultBranch}`, origin);
  git(root, 'clone', '--quiet', origin, clone);
  git(clone, 'config', 'user.email', 'selftest@example.invalid');
  git(clone, 'config', 'user.name', 'selftest');
  git(clone, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));

  return clone;
}

function commit(directory, file, content, message) {
  writeFileSync(path.join(directory, file), content);
  git(directory, 'add', '--', file);
  git(directory, 'commit', '--quiet', '-m', message, '--', file);

  return git(directory, 'rev-parse', 'HEAD');
}

/** Adds a worktree on a new branch started at `start`. @es Añade un worktree en una rama nueva iniciada en `start`. */
function worktree(main, branch, start) {
  const directory = path.join(root, `wt-${branch.replaceAll('/', '-')}`);

  git(main, 'worktree', 'add', '--quiet', '-b', branch, directory, start);
  git(directory, 'config', 'user.email', 'selftest@example.invalid');
  git(directory, 'config', 'user.name', 'selftest');

  return directory;
}

try {
  // ---- repository A: the default branch `develop` is a real line -------------------------------
  const main = repository('repo-a', 'develop');

  commit(main, '.gitignore', 'node_modules\nbuild/\n', 'c1');
  commit(main, 'base.txt', 'base\n', 'c2');
  git(main, 'push', '--quiet', '-u', 'origin', 'develop');
  git(main, 'remote', 'set-head', 'origin', 'develop');

  /** Cherry-picks the tip of `branch` onto develop and publishes it: the same patch, a different sha. @es Cherry-pick de la punta de `branch` en develop. */
  let advances = 0;
  const integrateByCherryPick = (branch) => {
    // develop moves first, so the picked commit gets another parent and therefore another sha than the branch's own
    advances += 1;
    commit(main, `advance-${advances}.txt`, `${advances}
`, `advance ${advances}`);
    git(main, 'cherry-pick', git(main, 'rev-parse', branch));
    git(main, 'push', '--quiet', 'origin', 'develop');
  };

  const integrated = worktree(main, 'feat/int', 'origin/develop');
  const tipInt = commit(integrated, 'int.txt', 'int\n', 'int');

  git(main, 'merge', '--quiet', '--ff-only', 'feat/int');
  git(main, 'push', '--quiet', 'origin', 'develop');

  const picked = worktree(main, 'feat/picked', 'origin/develop');

  commit(picked, 'picked.txt', 'picked\n', 'picked');
  integrateByCherryPick('feat/picked');

  const dirty = worktree(main, 'feat/dirty', 'origin/develop');

  commit(dirty, 'dirty.txt', 'dirty\n', 'dirty');
  integrateByCherryPick('feat/dirty');
  writeFileSync(path.join(dirty, 'untracked-notes.txt'), 'not committed\n');

  const ignoredWork = worktree(main, 'feat/ignoredwork', 'origin/develop');

  commit(ignoredWork, 'ignoredwork.txt', 'x\n', 'ignoredwork');
  integrateByCherryPick('feat/ignoredwork');
  mkdirSync(path.join(ignoredWork, 'build'));
  writeFileSync(path.join(ignoredWork, 'build', 'deliverable.txt'), 'only copy\n');

  const live = worktree(main, 'feat/live', 'origin/develop');

  commit(live, 'live.txt', 'live\n', 'live');
  integrateByCherryPick('feat/live');

  const linked = worktree(main, 'feat/linked', 'origin/develop');

  commit(linked, 'linked.txt', 'linked\n', 'linked');
  integrateByCherryPick('feat/linked');

  const junctionTarget = path.join(root, 'shared-node-modules');

  mkdirSync(junctionTarget);
  writeFileSync(path.join(junctionTarget, 'precious.txt'), 'must survive\n');
  symlinkSync(junctionTarget, path.join(linked, 'node_modules'), 'junction');

  const locked = worktree(main, 'feat/locked', 'origin/develop');

  commit(locked, 'locked.txt', 'locked\n', 'locked');
  integrateByCherryPick('feat/locked');
  git(main, 'worktree', 'lock', locked);

  const unintegrated = worktree(main, 'feat/unint', 'origin/develop');

  commit(unintegrated, 'unint.txt', 'unint\n', 'unint');

  const backup = worktree(main, 'feat/backup', 'origin/develop');

  commit(backup, 'backup.txt', 'backup\n', 'backup');
  git(backup, 'push', '--quiet', '-u', 'origin', 'feat/backup');

  const gone = worktree(main, 'feat/gone', 'origin/develop');

  rmSync(gone, { recursive: true, force: true });

  const broken = worktree(main, 'feat/broken', 'origin/develop');

  rmSync(path.join(broken, '.git'), { force: true });
  writeFileSync(path.join(broken, '.git'),'gitdir: C:/nowhere/at/all\n');

  const detached = path.join(root, 'wt-detached');

  git(main, 'worktree', 'add', '--quiet', '--detach', detached, 'origin/develop');

  // ---- repository B: the default branch is a ROOT commit (the discovery repo's shape) ----------
  const main2 = repository('repo-b', 'main');

  commit(main2, 'README.md', 'readme\n', 'Initial commit');
  git(main2, 'push', '--quiet', '-u', 'origin', 'main');
  git(main2, 'remote', 'set-head', 'origin', 'main');

  const main3 = repository('repo-c', 'develop');

  commit(main3, 'a.txt', 'a\n', 'c1');
  git(main3, 'push', '--quiet', '-u', 'origin', 'develop');

  const noDefault = worktree(main3, 'feat/nodefault', 'develop');

  commit(noDefault, 'b.txt', 'b\n', 'c2');

  const lineBranch = worktree(main2, 'feature/line', 'main');

  commit(lineBranch, 'line.txt', 'line\n', 'line');
  git(lineBranch, 'push', '--quiet', '-u', 'origin', 'feature/line');

  const noUpstream = worktree(main2, 'feature/noup', 'main');

  commit(noUpstream, 'noup.txt', 'noup\n', 'noup');

  const followsLine = worktree(main2, 'feature/follows', 'origin/feature/line');

  // ---- the premise of the fixtures themselves ---------------------------------------------------
  check('fixture: feat/int tracks origin/develop, not a copy of itself', git(main, 'config', '--get', 'branch.feat/int.merge') === 'refs/heads/develop');
  check('fixture: feat/backup tracks its OWN remote copy', git(main, 'config', '--get', 'branch.feat/backup.merge') === 'refs/heads/feat/backup');
  check('fixture: the fast-forwarded tip is an ancestor of develop; the picked one is not', (() => {
    const ancestor = (sha) => spawnSync('git', ['merge-base', '--is-ancestor', sha, 'develop'], { cwd: main, env: cleanEnv }).status === 0;

    return ancestor(tipInt) && !ancestor(git(main, 'rev-parse', 'feat/picked'));
  })());

  // ---- linked worktrees -------------------------------------------------------------------------
  const listed = linkedWorktrees(main) ?? [];
  const listedPaths = listed.map((item) => path.resolve(item.path).toLowerCase());

  check('linked worktrees never include the main checkout', !listedPaths.includes(path.resolve(main).toLowerCase()));
  check('linked worktrees list every worktree that was added', listed.length === 12, `got ${listed.length}`);
  check('a locked worktree is flagged locked', listed.find((item) => item.branch === 'feat/locked')?.locked === true);
  check('a worktree whose directory is gone is flagged prunable', listed.find((item) => item.branch === 'feat/gone')?.prunable === true);
  check('a detached worktree has no branch', listed.find((item) => path.resolve(item.path) === path.resolve(detached))?.branch === undefined);
  check('a non-repository answers undefined, not an empty list', linkedWorktrees(path.join(root, 'nowhere')) === undefined);

  // ---- integration base -------------------------------------------------------------------------
  check('base: the upstream when it is not the branch\'s own copy', integrationBase(main, 'feat/int')?.base === 'origin/develop');
  check('base: an upstream that is the branch\'s own copy falls to origin\'s default', integrationBase(main, 'feat/backup').base === 'origin/develop');
  check('base: no upstream and a ROOT-commit default is skipped with a reason', (() => {
    const verdict = integrationBase(main2, 'feature/noup');

    return verdict.base === undefined && verdict.skip?.includes('root commit') === true && verdict.skip.includes(' @es ');
  })());
  check('base: no upstream and no default branch recorded by origin is skipped with that reason', integrationBase(main3, 'feat/nodefault')?.skip?.includes('records no default branch') === true);
  check('base: an upstream that is not the default is used, not main', integrationBase(main2, 'feature/follows').base === 'origin/feature/line');
  check('base: a branch whose own copy is the upstream, on a root default, is skipped', integrationBase(main2, 'feature/line')?.skip !== undefined);

  // ---- working tree state -----------------------------------------------------------------------
  check('state: a clean worktree has no work', (() => { const state = workingTreeState(integrated); return state.measured && state.work.length === 0; })());
  check('state: a staged rename is ONE entry and its origin path is not read as another', (() => {
    git(dirty, 'mv', 'dirty.txt', 'moved.txt');

    const state = workingTreeState(dirty);

    git(dirty, 'mv', 'moved.txt', 'dirty.txt');

    return state.work.length === 2 && state.work.includes('moved.txt') && !state.work.includes('dirty.txt');
  })());
  check('state: an untracked file is work', workingTreeState(dirty).work.includes('untracked-notes.txt'));
  check('state: an ignored REAL directory is work', workingTreeState(ignoredWork).work.some((entry) => entry.startsWith('build')));
  check('state: an ignored junction is a link, not work', (() => { const state = workingTreeState(linked); return state.work.length === 0 && state.links.some((entry) => entry.startsWith('node_modules')); })());
  check('state: a non-repository is not measured, never clean', (() => { try { return workingTreeState(path.join(root, 'nowhere')).measured === false; } catch { return false; } })());

  // ---- the census -------------------------------------------------------------------------------
  const liveSet = new Set([path.resolve(live).toLowerCase()]);
  const isLive = (worktreePath) => liveSet.has(path.resolve(worktreePath).toLowerCase());
  const verdicts = censusSafely(main, { isLive, owns: () => true });
  const kindOf = (directory) => verdicts.find((verdict) => path.resolve(verdict.path).toLowerCase() === path.resolve(directory).toLowerCase())?.kind;

  check('census: integrated by fast-forward, clean, idle -> removable', kindOf(integrated) === 'removable');
  check('census: integrated by cherry-pick (not an ancestor) -> removable', kindOf(picked) === 'removable');
  check('census: an unintegrated branch -> unintegrated', kindOf(unintegrated) === 'unintegrated');
  check('census: a branch whose only integration target is its own remote copy -> unintegrated', kindOf(backup) === 'unintegrated');
  check('census: an untracked file -> stranded', kindOf(dirty) === 'stranded');
  check('census: an ignored real directory -> stranded', kindOf(ignoredWork) === 'stranded');
  check('census: a live actor -> live', kindOf(live) === 'live');
  check('census: a clean worktree holding a junction -> removable, link named', (() => { const verdict = verdicts.find((item) => item.branch === 'feat/linked'); return verdict?.kind === 'removable' && verdict.links.length === 1; })());
  check('census: a locked worktree -> skipped', kindOf(locked) === 'skipped');
  check('census: a detached HEAD -> skipped', verdicts.find((verdict) => path.resolve(verdict.path).toLowerCase() === path.resolve(detached).toLowerCase())?.reason?.includes('detached') === true);
  check('census: a prunable worktree (directory gone) -> skipped', verdicts.find((verdict) => verdict.branch === 'feat/gone')?.reason?.includes('prunable') === true);
  check('census: a worktree whose status git cannot read -> skipped with that reason, never removable', verdicts.find((verdict) => verdict.branch === 'feat/broken')?.reason?.includes('could not read its status') === true);
  check('census: a failed git cherry -> skipped, never removable', (() => {
    const failing = censusSafely(main, { isLive, owns: () => true, readCherry: () => undefined });

    return failing.find((verdict) => verdict.branch === 'feat/int')?.reason?.includes('git cherry') === true && failing.every((verdict) => verdict.kind !== 'removable');
  })());
  check('census: the main checkout is never in the census', verdicts.every((verdict) => path.resolve(verdict.path).toLowerCase() !== path.resolve(main).toLowerCase()));
  check('census: an unlistable repository answers undefined', censusOf(path.join(root, 'nowhere'), { isLive, owns: () => true }) === undefined);

  const verdicts2 = censusSafely(main2, { isLive: () => false, owns: () => true });
  const kind2 = (branch) => verdicts2.find((verdict) => verdict.branch === branch)?.kind;

  check('census: no upstream on a root default -> skipped, with the reason', kind2('feature/noup') === 'skipped' && verdicts2.find((verdict) => verdict.branch === 'feature/noup')?.reason?.includes('root commit') === true);
  check('census: integrated into its OWN upstream (not main) -> removable', kind2('feature/follows') === 'removable' && verdicts2.find((verdict) => verdict.branch === 'feature/follows')?.base === 'origin/feature/line');
  check('census: a branch with commits only on its own remote copy over a root default -> skipped, never removable', kind2('feature/line') === 'skipped');

  // ---- liveness: the shared check over a fake agent store ---------------------------------------
  const store = path.join(root, 'projects');
  const subagents = path.join(store, 'proj', 'session', 'subagents');

  mkdirSync(subagents, { recursive: true });
  writeFileSync(path.join(subagents, 'agent-live.meta.json'), JSON.stringify({ worktreePath: integrated }));
  writeFileSync(path.join(subagents, 'agent-live.jsonl'), '{}\n');
  writeFileSync(path.join(subagents, 'agent-old.meta.json'), JSON.stringify({ worktreePath: picked }));
  writeFileSync(path.join(subagents, 'agent-old.jsonl'), '{}\n');

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  utimesSync(path.join(subagents, 'agent-old.jsonl'), twoHoursAgo, twoHoursAgo);

  const sharedLive = sharedLiveness(store);

  check('liveness: a transcript written now is a live actor', sharedLive(integrated) === true);
  check('liveness: a transcript two hours old is idle', sharedLive(picked) === false);
  check('liveness: a worktree no agent record names is idle', sharedLive(dirty) === false);

  // ---- repositories from a transcript -----------------------------------------------------------
  check('repo: a path inside the main checkout is that checkout', mainCheckoutOf(path.join(main, 'base.txt')) === main);
  check('repo: a path inside a linked worktree leads to the MAIN checkout', mainCheckoutOf(path.join(integrated, 'int.txt')).toLowerCase() === main.toLowerCase());
  check('repo: a path outside any repository is none', mainCheckoutOf(path.join(root, 'shared-node-modules')) === undefined);
  check('repo: pathsOf reads cwd, a tool input path and a git -C target', (() => {
    const record = { cwd: root, message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: path.join(main2, 'README.md') } }, { type: 'tool_use', name: 'Bash', input: { command: `git -C "${main}" status` } }] } };
    const paths = pathsOf(record).map((candidate) => path.resolve(candidate).toLowerCase());

    return paths.includes(path.resolve(root).toLowerCase()) && paths.includes(path.resolve(main2, 'README.md').toLowerCase()) && paths.includes(path.resolve(main).toLowerCase());
  })());
  check('repo: a git -C that is only MENTIONED names no path', (() => {
    const record = { message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `echo git -C "${main}" status` } }] }, cwd: root };

    return !pathsOf(record).map((candidate) => path.resolve(candidate).toLowerCase()).includes(path.resolve(main).toLowerCase());
  })());

  const transcript = path.join(root, 'transcript.jsonl');
  // This session works inside EVERY fixture worktree (ownership is per worktree) and also reads the main checkout;
  // the worktree whose .git points nowhere is left out, because it would read as a repository of its own.
  const touches = [main, main2, main3].flatMap((repo) => linkedWorktrees(repo) ?? []).filter((item) => item.branch !== 'feat/broken').map((item) => ({ type: 'tool_use', name: 'Read', input: { file_path: path.join(item.path, 'x.txt') } }));

  writeFileSync(transcript, `${JSON.stringify({ cwd: root, message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(integrated, 'int.txt') } }, { type: 'tool_use', name: 'Read', input: { file_path: path.join(main, 'base.txt') } }, { type: 'tool_use', name: 'Read', input: { file_path: path.join(picked, 'picked.txt') } }, ...touches] } })}\nnot json\n${JSON.stringify({ cwd: noUpstream })}\n`);

  const derived = repositoriesWorkedIn({ transcriptPath: transcript });

  check('repo: three repositories worked in are derived once each, as main checkouts', derived.transcriptRead && derived.repositories.length === 3 && [main, main2, main3].every((expected) => derived.repositories.some((repo) => repo.toLowerCase() === expected.toLowerCase())), JSON.stringify(derived));
  const big = path.join(root, 'big-transcript.jsonl');
  const padding = 'x'.repeat(700 * 1024);

  writeFileSync(big, `${[JSON.stringify({ pad: padding }), JSON.stringify({ cwd: main2, pad: padding }), JSON.stringify({ pad: padding })].join('\n')}\n`);
  check('repo: a record that straddles a read chunk is still read whole', (() => {
    const result = repositoriesWorkedIn({ transcriptPath: big });

    return result.transcriptRead && result.repositories.length === 1 && result.repositories[0].toLowerCase() === main2.toLowerCase();
  })());
  check('repo: an unreadable transcript is reported, the hook\'s own directories still count', (() => {
    const result = repositoriesWorkedIn({ transcriptPath: path.join(root, 'absent.jsonl'), directories: [main] });

    return result.transcriptRead === false && result.repositories.length === 1;
  })());

  // ---- the turn ---------------------------------------------------------------------------------
  const stateDir = path.join(root, 'state');
  const turn = (extra = {}, options = {}) => decideSafely({ session_id: 's1', cwd: root, transcript_path: transcript, ...extra }, { stateDir, isLive, ...options });
  const first = turn();

  check('turn: a removable worktree refuses the turn', first?.decision === 'block');

  const reason = first?.reason ?? '';

  check('turn: the refusal names every removable worktree and branch', [integrated, picked, linked, followsLine].every((directory) => reason.includes(slash(directory))) && reason.includes('feat/int') && reason.includes('feat/picked') && reason.includes('feature/follows'));
  check('turn: the English half also gives the branch deletion after the removal', (() => {
    const english = reason.slice(0, reason.indexOf('  @es '));

    return english.indexOf(`worktree remove "${slash(integrated)}"`) !== -1 && english.indexOf(`worktree remove "${slash(integrated)}"`) < english.indexOf('branch -D "feat/int"');
  })());
  check('turn: the refusal gives the exact removal, in order', reason.indexOf(`git -C "${slash(main)}" worktree remove "${slash(integrated)}"`) !== -1 && reason.indexOf(`worktree remove "${slash(integrated)}"`) < reason.indexOf(`branch -D "feat/int"`));
  check('turn: the refusal never lists live, unintegrated, dirty, locked or detached worktrees as removable', [live, unintegrated, backup, dirty, ignoredWork, locked, detached, noUpstream].every((directory) => !reason.includes(`worktree remove "${slash(directory)}"`)));
  check('turn: the refusal names the junction precaution', reason.includes('node_modules') && reason.includes('cmd /c rmdir'));
  check('turn: the refusal names stranded work apart, non-blocking', reason.includes('STRANDED WORK') && reason.includes(slash(dirty)));
  check('turn: the refusal states why a worktree was not judged', reason.includes('NOT JUDGED') && reason.includes('root commit'));
  check('turn: the refusal is bilingual, English first, with accents', reason.includes('INTEGRATED-WORKTREE GUARD') && reason.includes('  @es ') && reason.indexOf('Remove them') < reason.indexOf('@es') && reason.includes('están integrados') && reason.includes('Quítalos'));
  check('turn: nothing was removed by the guard', [integrated, picked, linked, followsLine, junctionTarget, path.join(junctionTarget, 'precious.txt')].every((entry) => existsSync(entry)));
  check('turn: the junction target survived the census (its content is intact)', readFileSync(path.join(junctionTarget, 'precious.txt'), 'utf8') === 'must survive\n');

  check('turn: the main checkout as the hook cwd names a repository but owns none of its worktrees', decideSafely({ session_id: 'cwd-only', cwd: main }, { stateDir: path.join(root, 'cwd-state'), isLive }) === undefined);
  check('turn: the same set in the same session passes (once per set)', turn() === undefined);
  check('turn: a new session is shown the set again', turn({ session_id: 's2' })?.decision === 'block');
  check('turn: stop_hook_active passes', turn({ session_id: 's3', stop_hook_active: true }) === undefined);
  check('turn: a subagent (agent_id) passes', turn({ session_id: 's4', agent_id: 'a1' }) === undefined);
  check('turn: a transcript under subagents passes', turn({ session_id: 's5', transcript_path: path.join(root, 'subagents', 'agent-x.jsonl') }) === undefined);
  check('turn: SubagentStop passes', turn({ session_id: 's6', hook_event_name: 'SubagentStop' }) === undefined);

  const standingInside = turn({ session_id: 's7', cwd: integrated });
  check('turn: the worktree this session stands in is never offered for removal', !(standingInside?.reason ?? '').includes(`worktree remove "${slash(integrated)}"`));

  const newest = worktree(main, 'feat/newest', 'origin/develop');

  commit(newest, 'newest.txt', 'newest\n', 'newest');
  integrateByCherryPick('feat/newest');
  appendFileSync(transcript, `${JSON.stringify({ cwd: newest })}${String.fromCharCode(10)}`);
  check('turn: a NEW removable worktree changes the set and refuses again in the same session', turn()?.decision === 'block');

  // only stranded + skipped: non-blocking notice once
  const quiet = path.join(root, 'quiet-transcript.jsonl');

  writeFileSync(quiet, `${JSON.stringify({ cwd: noUpstream })}\n`);

  const onlyNotes = (session) => decideSafely({ session_id: session, cwd: root, transcript_path: quiet }, { stateDir, isLive: (worktreePath) => path.resolve(worktreePath).toLowerCase() !== path.resolve(noUpstream).toLowerCase() ? true : false });
  const notice = onlyNotes('n1');

  check('notice: nothing removable but a worktree not judged -> a non-blocking systemMessage', notice?.decision === undefined && typeof notice?.systemMessage === 'string' && notice.systemMessage.includes('NOT JUDGED') && notice.systemMessage.includes('root commit'));
  check('notice: it is bilingual', notice?.systemMessage?.includes('  @es ') === true && notice.systemMessage.includes('NO JUZGADO'));
  check('notice: it fires once per set', onlyNotes('n1') === undefined);

  check('nothing to say: a session that worked in no repository is silent', decideSafely({ session_id: 'z1', cwd: path.join(root, 'nowhere'), transcript_path: path.join(root, 'absent.jsonl') }, { stateDir, isLive }) === undefined);

  // ---- ownership: ONE shared main checkout, two sessions, three linked worktrees ----------------
  // wtA: created by session A (a `git worktree add` in its transcript), integrated.
  // wtB: created by nobody visible, session B worked INSIDE it, integrated.
  // wtC: created by nobody in either transcript, integrated: nobody's, so nobody is offered it.
  const own = repository('repo-own', 'develop');

  commit(own, '.gitignore', 'scratch/\nnode_modules\n', 'own1');
  commit(own, 'base.txt', 'base\n', 'own2');
  git(own, 'push', '--quiet', '-u', 'origin', 'develop');
  git(own, 'remote', 'set-head', 'origin', 'develop');

  const integrateOwn = (branch, file) => {
    const directory = worktree(own, branch, 'origin/develop');

    commit(directory, file, `${file}\n`, branch);
    git(own, 'merge', '--quiet', '--ff-only', branch);
    git(own, 'push', '--quiet', 'origin', 'develop');

    return directory;
  };
  const wtA = integrateOwn('own/a', 'a.txt');
  const wtB = integrateOwn('own/b', 'b.txt');
  const wtC = integrateOwn('own/c', 'c.txt');
  const bash = (command) => ({ message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] }, cwd: own });
  const read = (file) => ({ message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: file } }] }, cwd: own });
  const transcriptOf = (name, records) => {
    const file = path.join(root, `${name}.jsonl`);

    writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);

    return file;
  };
  const sessionA = transcriptOf('session-a', [bash(`git -C "${own}" worktree add -b own/a "${wtA}" origin/develop`), read(path.join(own, 'base.txt'))]);
  const sessionB1 = transcriptOf('session-b1', [read(path.join(own, 'base.txt'))]);
  const sessionB2 = transcriptOf('session-b2', [read(path.join(own, 'base.txt')), { message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: path.join(wtB, 'b.txt') } }] }, cwd: own }]);
  const ownState = path.join(root, 'own-state');
  const idle = () => false;
  const offered = (session, transcriptPath) => {
    const output = decideSafely({ session_id: session, cwd: root, transcript_path: transcriptPath }, { stateDir: ownState, isLive: idle });
    const reasonOf = output?.reason ?? '';

    return [wtA, wtB, wtC].filter((directory) => reasonOf.includes(`worktree remove "${slash(directory)}"`));
  };

  check('ownership: a session that only READ a file in the main checkout is offered none of the worktrees', offered('own-b1', sessionB1).length === 0);
  check('ownership: the session that created a worktree is offered it, and only it', (() => { const names = offered('own-a', sessionA); return names.length === 1 && names[0] === wtA; })());
  check('ownership: a session that worked inside a worktree is offered it, and only it', (() => { const names = offered('own-b2', sessionB2); return names.length === 1 && names[0] === wtB; })());
  check('ownership: a worktree nobody created or worked in is offered to no session', ![sessionA, sessionB1, sessionB2].some((file, at) => offered(`own-c${at}`, file).includes(wtC)));
  check('declared output: the path declared here is the one the (vendored) mutation runner writes to', (() => {
    const runner = readFileSync(path.join(HERE, '..', 'mutation-proof', 'run-mutants.mjs'), 'utf8');
    const [declared] = DECLARED_RUN_OUTPUT;

    return runner.includes(`path.join(fleetRoot, ${declared.segments.map((segment) => `'${segment}'`).join(', ')})`);
  })());
  check('ownership: repositoriesWorkedIn answers per worktree', (() => {
    const ownsA = repositoriesWorkedIn({ transcriptPath: sessionA }).ownsWorktree;
    const ownsB1 = repositoriesWorkedIn({ transcriptPath: sessionB1 }).ownsWorktree;

    return ownsA(wtA) === true && ownsA(wtB) === false && ownsB1(wtA) === false && ownsB1(path.join(own, 'nothing')) === false;
  })());
  check('ownership: a worktree CREATED by a git worktree add with a relative path and -C is attributed', (() => {
    const owns = repositoriesWorkedIn({ transcriptPath: transcriptOf('session-rel', [{ ...bash(`git -C "${own}" worktree add -b own/a ../${path.basename(wtA)} origin/develop`), cwd: root }]) }).ownsWorktree;

    return owns(wtA) === true && owns(wtB) === false;
  })());
  check('ownership: git worktree remove and list create nothing', (() => {
    const owns = repositoriesWorkedIn({ transcriptPath: transcriptOf('session-remove', [bash(`git -C "${own}" worktree remove "${wtC}"`), bash(`git -C "${own}" worktree list`)]) }).ownsWorktree;

    return owns(wtC) === false;
  })());
  check('ownership: a worktree MENTIONED in an echo of git worktree add is not created by the session', repositoriesWorkedIn({ transcriptPath: transcriptOf('session-echo', [bash(`echo git -C "${own}" worktree add "${wtC}"`)]) }).ownsWorktree(wtC) === false);
  check('ownership: the census lists only the worktrees the question accepts', (() => {
    const verdicts = censusSafely(own, { isLive: idle, owns: (directory) => path.resolve(directory) === path.resolve(wtB) });

    return verdicts.length === 1 && path.resolve(verdicts[0].path) === path.resolve(wtB);
  })());

  // ---- declared process output: mutation-proof scratch ------------------------------------------
  const scratchOnly = worktree(own, 'own/scratch-only', 'origin/develop');
  const scratchMixed = worktree(own, 'own/scratch-mixed', 'origin/develop');
  const scratchOther = worktree(own, 'own/scratch-other', 'origin/develop');
  const scratchLookalike = worktree(own, 'own/scratch-lookalike', 'origin/develop');

  mkdirSync(path.join(scratchOnly, 'scratch', 'mutation-proof', 'mutant-1', 'deep'), { recursive: true });
  writeFileSync(path.join(scratchOnly, 'scratch', 'mutation-proof', 'mutant-1', 'deep', 'copy.mjs'), 'export {};\n');
  mkdirSync(path.join(scratchMixed, 'scratch', 'mutation-proof', 'mutant-1'), { recursive: true });
  writeFileSync(path.join(scratchMixed, 'scratch', 'mutation-proof', 'mutant-1', 'copy.mjs'), 'export {};\n');
  writeFileSync(path.join(scratchMixed, 'scratch', 'keep-me.txt'), 'the only copy\n');
  mkdirSync(path.join(scratchOther, 'scratch', 'other'), { recursive: true });
  writeFileSync(path.join(scratchOther, 'scratch', 'other', 'result.txt'), 'the only copy\n');
  mkdirSync(path.join(scratchLookalike, 'scratch', 'mutation-proof'), { recursive: true });
  writeFileSync(path.join(scratchLookalike, 'scratch', 'mutation-proof-notes.txt'), 'the only copy\n');

  const only = (directory) => ({ isLive: idle, owns: (candidate) => path.resolve(candidate) === path.resolve(directory) });

  check('declared output: a worktree whose only ignored entry is mutation-proof scratch holds no work', (() => { const state = workingTreeState(scratchOnly); return state.measured && state.work.length === 0; })());
  check('declared output: an undeclared ignored file beside the declared scratch is still work', (() => { const state = workingTreeState(scratchMixed); return state.work.length === 1 && state.work[0].endsWith('keep-me.txt'); })());
  check('declared output: an undeclared ignored directory under scratch is still work', workingTreeState(scratchOther).work.some((entry) => entry.startsWith('scratch/other')));
  check('declared output: a sibling whose name merely starts like the declared path is still work', workingTreeState(scratchLookalike).work.some((entry) => entry.endsWith('mutation-proof-notes.txt')));
  check('declared output: a directory that cannot be read beside the declared path is returned whole, as work', undeclaredPartOf(path.join(root, 'nowhere'), 'scratch/').join() === 'scratch/');
  check('declared output: a worktree holding only declared scratch is removable end to end', censusSafely(own, only(scratchOnly))[0]?.kind === 'removable');
  check('declared output: an undeclared ignored entry reads as stranded end to end', censusSafely(own, only(scratchOther))[0]?.kind === 'stranded');

  // ---- declared installer output: the worktree's OWN install, proven by its receipt -------------
  // `junctioned-node-modules-broke-vitest-coverage`: the own install is the default worktree tree, so a
  // node_modules that the receipt ties to the lockfile beside it is reproducible, not work; anything else is.
  // @es La instalación PROPIA, probada por su recibo, es reproducible y no trabajo; lo demás sí lo es.
  const ownInstall = (branch, receipt) => {
    const directory = worktree(own, branch, 'origin/develop');

    commit(directory, 'package-lock.json', '{"lockfileVersion":3}\n', 'lock');
    mkdirSync(path.join(directory, 'node_modules', 'left-pad'), { recursive: true });
    writeFileSync(path.join(directory, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n');
    if (receipt !== undefined) writeFileSync(path.join(directory, 'node_modules', RECEIPT), JSON.stringify(receipt(directory)));

    return directory;
  };
  const lockHash = (directory) => hashFile(path.join(directory, 'package-lock.json'));
  const receipted = ownInstall('own/install-receipted', (directory) => ({ lockfile: 'package-lock.json', lockfileHash: lockHash(directory) }));
  const unreceipted = ownInstall('own/install-unreceipted');
  const stale = ownInstall('own/install-stale', (directory) => ({ lockfile: 'package-lock.json', lockfileHash: lockHash(directory) }));
  const escaping = ownInstall('own/install-escaping', (directory) => ({ lockfile: '../package-lock.json', lockfileHash: lockHash(directory) }));

  commit(stale, 'package-lock.json', '{"lockfileVersion":3,"packages":{}}\n', 'lock moved on');

  check('installer output: an own install its receipt ties to the lockfile holds no work', (() => { const state = workingTreeState(receipted); return state.measured && state.work.length === 0; })());
  check('installer output: a node_modules with NO receipt is work', workingTreeState(unreceipted).work.some((entry) => entry.startsWith('node_modules')));
  check('installer output: a receipt whose lockfile moved on since the install is work', workingTreeState(stale).work.some((entry) => entry.startsWith('node_modules')));
  check('installer output: a receipt naming a PATH, not a bare file, is work', workingTreeState(escaping).work.some((entry) => entry.startsWith('node_modules')));
  check('installer output: only a folder named node_modules can be an install', isReceiptedInstall(receipted, ['scratch']) === false);
  check('installer output: a receipt with no hash is work', (() => { writeFileSync(path.join(unreceipted, 'node_modules', RECEIPT), JSON.stringify({ lockfile: 'package-lock.json' })); return isReceiptedInstall(unreceipted, ['node_modules']); })() === false);

  // ---- noticed sets -----------------------------------------------------------------------------
  const memory = path.join(root, 'memory');

  check('noticed: nothing is shown before it is recorded', alreadyShown(memory, 'a', 'x') === false);
  check('noticed: a recorded set is recognised for that session only', markShown(memory, 'a', 'x') && alreadyShown(memory, 'a', 'x') && !alreadyShown(memory, 'b', 'x') && !alreadyShown(memory, 'a', 'y'));
  check('noticed: only the 100 most recent sessions are kept', (() => {
    const bounded = path.join(root, 'bounded');

    for (let at = 0; at < 105; at += 1) markShown(bounded, `session-${at}`, 'x', at);

    return alreadyShown(bounded, 'session-104', 'x') && alreadyShown(bounded, 'session-5', 'x') && !alreadyShown(bounded, 'session-4', 'x');
  })());
  check('noticed: a state file that cannot be written reports failure', markShown(path.join(transcript, 'inside-a-file'), 'a', 'x') === false);

  // ---- the texts --------------------------------------------------------------------------------
  check('texts: braces inside a path are printed as they are', refusalText([{ path: 'C:/wt/{odd}', branch: 'b', base: 'origin/x', main: 'C:/m', links: [] }]).includes('C:/wt/{odd}'));
  check('texts: a notice with no stranded work renders', noticeText({ stranded: [], skipped: [] }).includes('@es'));

  // ---- the shim: the real process ---------------------------------------------------------------
  const shimState = path.join(root, 'shim-state');
  const payload = JSON.stringify({ session_id: 'shim', cwd: root, transcript_path: transcript });
  const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true, env: { ...process.env, HOOK_STATE_DIR: shimState } });
  const viaShim = run(payload);

  check('shim: a removable worktree prints a block on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"decision":"block"'));
  check('shim: the same session again prints nothing', run(payload).stdout === '');
  check('shim: a BOM-prefixed payload is understood', run(`\uFEFF${JSON.stringify({ session_id: 'shim-bom', cwd: root, transcript_path: transcript })}`).stdout.includes('"block"'));
  check('shim: garbage on stdin fails open, exit 0', (() => { const result = run('{nope'); return result.status === 0 && result.stdout === ''; })());
  check('evaluate: garbage fails open', evaluate('{nope') === undefined);
} finally {
  const junction = path.join(root, 'wt-feat-linked', 'node_modules');

  try {
    rmSync(junction);
  } catch {
    /* already gone */
  }

  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
