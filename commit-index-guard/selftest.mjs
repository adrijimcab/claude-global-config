#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `commit-index-guard` — the lint-staged stale-index incident (three Discovery reports).
 *
 * EVERY GIT STATE IS REAL. Each case builds a temporary repository with a REAL `pre-commit` hook that rewrites a
 * file and stages it, commits through real `git commit -- <paths>`, and reads the verdict from the guard on the
 * payload the harness sends. The `MM` the incident reported is asserted from `git status` itself before any
 * verdict is trusted, so a fixture that stopped reproducing the incident turns the run red.
 *
 * THE STATE SPACE THE DECISIONS RANGE OVER, each state exercised (`guard-that-cannot-go-red`):
 *   AFTER (guard.mjs)   a commit that left paths stale / a clean commit / a commit with `-o` / a commit with no
 *                       pathspec / a dry run / a commit named in `echo` / a non-commit / a non-repository / a git
 *                       error / a timeout / two stale paths / `git -C` from elsewhere / PowerShell / BOM / not JSON
 *   BEFORE (pre-commit) a sweeping commit with the paths stale / naming another path / naming the stale path /
 *                       `-a` / `-i` with and without the stale path / settled by `git add` / another repository /
 *                       nothing recorded / a git error / a dry run / `git -C` / a subdirectory / a mention
 *   WIRING  both guards in their manifests, their registrations, and the real payload through the dispatcher
 * The pure readers (option table, status records, quoting, texts) are proved in `parse.selftest.mjs` and the
 * per-repository record in `store.selftest.mjs`, both without git, so their mutation campaigns run in seconds.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `commit-index-guard`. Cada estado de git es REAL: un repositorio temporal con
 * un hook `pre-commit` REAL que reescribe un fichero y lo pone en stage, commit real con `-- <rutas>`, y el
 * veredicto sale de la guardia con el payload del harness. El `MM` del incidente se comprueba con `git status`
 * antes de confiar en un veredicto. Espacio de estados: DESPUÉS, ANTES y cableado. Los lectores puros están en
 * `parse.selftest.mjs` y el registro por repositorio en `store.selftest.mjs`, sin git, para que sus campañas de mutación corran en segundos.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

const stateRoot = isolateState('commit-index-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (file) => import(pathToFileURL(path.join(HERE, file)).href);
const { evaluate: after } = await load('guard.mjs');
const { evaluate: before } = await load('pre-commit.mjs');
const { runGit } = await load('index-state.mjs');
const { anyRecorded, recordStale, recordedStale } = await load('stale-store.mjs');
const { stateDirectory } = await load('diary.mjs');

const captured = JSON.parse(readFileSync(path.join(HERE, 'post-tool-use.captured.json'), 'utf8')).payload;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'commit-index-guard-'));
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
const status = (cwd) => git(cwd, 'status', '--porcelain=v1');

let counter = 0;

/** A repository with two files and, when `rewriting`, a real pre-commit hook that rewrites a.txt and stages it. @es Un repositorio real con un hook pre-commit que reescribe a.txt. */
function makeRepo({ rewriting = true } = {}) {
  counter += 1;

  const repo = path.join(scratch, `repo-${counter}`);

  mkdirSync(path.join(repo, 'sub'), { recursive: true });
  git(repo, 'init', '-q', '.');
  git(repo, 'config', 'user.email', 'selftest@example.invalid');
  git(repo, 'config', 'user.name', 'selftest');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(path.join(repo, 'a.txt'), 'a  \n');
  writeFileSync(path.join(repo, 'b.txt'), 'b\n');
  writeFileSync(path.join(repo, 'sub', 'c.txt'), 'c\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');

  if (rewriting) writeFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), "#!/bin/sh\nsed -i 's/ *$//' a.txt sub/c.txt\ngit add a.txt sub/c.txt\n");

  return repo;
}

/** Edits `files` and commits them with `-- <files>` through real git; returns the status afterwards. @es Edita y commitea con `-- <ficheros>`. */
function commitNamed(repo, files, flags = []) {
  for (const file of files) writeFileSync(path.join(repo, file), `${file} edited  \n`);

  git(repo, 'commit', '-q', '-m', 'work', ...flags, '--', ...files);

  return status(repo);
}

const post = (command, { cwd, tool = 'Bash', extra = {} } = {}) => ({ ...captured, hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { command }, cwd, ...extra });
const pre = (command, { cwd, tool = 'Bash' } = {}) => ({ ...captured, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd, tool_response: undefined });
const run = (evaluate, payload, options) => evaluate(typeof payload === 'string' ? payload : JSON.stringify(payload), options);
const noticeOf = (output) => output?.hookSpecificOutput?.additionalContext;
const denialOf = (output) => (output?.hookSpecificOutput?.permissionDecision === 'deny' ? output.hookSpecificOutput.permissionDecisionReason : undefined);
const journalLines = (name) => {
  try {
    return readFileSync(path.join(stateDirectory(), name), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
};
const clearState = () => rmSync(stateDirectory(), { recursive: true, force: true });

/** The record files of the state directory; empty when there is none, so a missing record fails a check instead of crashing. @es Los ficheros de registro; vacío si no hay. */
const recordFileNames = () => {
  try {
    return readdirSync(stateDirectory()).filter((name) => name.startsWith('stale-'));
  } catch {
    return [];
  }
};
const overwriteRecords = (text) => recordFileNames().forEach((name) => writeFileSync(path.join(stateDirectory(), name), text));

/** A dispatcher answer as an object, or `undefined` when it printed nothing. @es La respuesta del dispatcher como objeto, o `undefined`. */
const answerOf = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// ---- THE FIXTURE REPRODUCES THE INCIDENT: a real hook, a real `commit -- a.txt`, and git itself says MM.
const incident = makeRepo();

check('the incident reproduces: git status shows MM on the committed path', commitNamed(incident, ['a.txt']), 'MM a.txt\n');

// ---- AFTER: the notice.
const notice = noticeOf(run(after, post('git commit -m work -- a.txt', { cwd: incident })));

check('AFTER a stale commit: a notice is given', typeof notice, 'string');
check('the notice names the stale path', notice?.includes('a.txt [MM]'), true);
check('the notice is in English first, then @es', notice?.indexOf('COMMIT-INDEX GUARD') < notice?.indexOf('@es COMMIT-INDEX GUARD'), true);
check('the notice offers `git add -- a.txt` as the next step', notice?.includes('git add -- a.txt'), true);
check('the notice offers committing it as its own change', notice?.includes('git commit -m "<type(scope): description>" -- a.txt'), true);
check('the notice offers reviewing the diff', notice?.includes('git diff -- a.txt'), true);
check('the notice says nothing is discarded, in both languages', notice?.includes('do NOT restore') && notice?.includes('NO uses restore'), true);
check('the notice never suggests discarding', ['git restore a', 'git checkout --', 'git reset --hard', 'git clean'].some((verb) => notice?.includes(verb)), false);
check('the notice is a PostToolUse additionalContext', run(after, post('git commit -m work -- a.txt', { cwd: incident }))?.hookSpecificOutput?.hookEventName, 'PostToolUse');
check('the stale path is recorded for the next commit', recordedStale(git(incident, 'rev-parse', '--show-toplevel').trim()).map((entry) => entry.path), ['a.txt']);
check('the guard changed nothing in the repository', status(incident), 'MM a.txt\n');

// ---- AFTER: the silent states.
const clean = makeRepo({ rewriting: false });

commitNamed(clean, ['a.txt']);
check('AFTER a clean commit: silent', run(after, post('git commit -m work -- a.txt', { cwd: clean })), undefined);

const only = makeRepo();

writeFileSync(path.join(only, 'a.txt'), 'only edit  \n');
git(only, 'commit', '-q', '-m', 'work', '-o', 'a.txt');
check('AFTER `-o`: the stale path is reported', noticeOf(run(after, post('git commit -o a.txt -m work', { cwd: only })))?.includes('a.txt [MM]'), true);

const bare = makeRepo();

commitNamed(bare, ['a.txt']);
check('AFTER a commit naming no pathspec: nothing is judged', run(after, post('git commit -m work', { cwd: bare })), undefined);
check('AFTER a dry run: nothing is judged', run(after, post('git commit --dry-run -m work -- a.txt', { cwd: bare })), undefined);
check('AFTER a commit only MENTIONED in echo: silent', run(after, post('echo "git commit -m work -- a.txt"', { cwd: bare })), undefined);
check('AFTER a heredoc body that mentions a commit: silent', run(after, post('cat <<EOF\ngit commit -m work -- a.txt\nEOF', { cwd: bare })), undefined);
check('AFTER git status: silent', run(after, post('git status', { cwd: bare })), undefined);
check('AFTER the recorded real payload (git --version): silent', run(after, captured), undefined);
check('AFTER a payload that is not JSON: silent', run(after, 'not json'), undefined);
check('AFTER a BOM-prefixed payload: still read', noticeOf(run(after, `\ufeff${JSON.stringify(post('git commit -m work -- a.txt', { cwd: bare }))}`)) !== undefined, true);
check('AFTER a tool that runs no shell: silent', run(after, post('git commit -m work -- a.txt', { cwd: bare, tool: 'Read' })), undefined);

// ---- AFTER: where the commit ran, and the other shell.
const elsewhere = makeRepo();

commitNamed(elsewhere, ['a.txt']);
check('AFTER `git -C <repo>` from another directory: the repository named is measured', noticeOf(run(after, post(`git -C "${elsewhere.split('\\').join('/')}" commit -m work -- a.txt`, { cwd: scratch })))?.includes('a.txt [MM]'), true);
check('AFTER PowerShell: measured too', noticeOf(run(after, post(`git commit -m work -- a.txt`, { cwd: elsewhere, tool: 'PowerShell' })))?.includes('a.txt [MM]'), true);

const two = makeRepo();

commitNamed(two, ['a.txt', 'sub/c.txt']);
const twoNotice = noticeOf(run(after, post('git commit -m work -- a.txt sub/c.txt', { cwd: two })));

check('AFTER two stale paths: both are named', twoNotice?.includes('a.txt [MM]') && twoNotice?.includes('sub/c.txt [MM]'), true);
check('AFTER two stale paths: the next step names both', twoNotice?.includes('git add -- a.txt sub/c.txt'), true);

// ---- AFTER: it never blocks, and says why when git did not answer.
clearState();
check('AFTER a non-repository: silent', run(after, post('git commit -m work -- a.txt', { cwd: scratch })), undefined);
check('a non-repository journals why git did not answer', journalLines('errors.jsonl').some((line) => line.step === 'status' && line.reason.includes('@es')), true);

clearState();
const failingGit = () => ({ ok: false, reason: 'git status failed: timed out after 5000 ms @es git status falló: agotó 5000 ms' });

check('AFTER a git timeout: silent', run(after, post('git commit -m work -- a.txt', { cwd: incident }), { git: failingGit }), undefined);
check('a git timeout is journaled with its reason', journalLines('errors.jsonl').map((line) => line.reason), ['git status failed: timed out after 5000 ms @es git status falló: agotó 5000 ms']);

clearState();
check('AFTER a git port that throws: silent', run(after, post('git commit -m work -- a.txt', { cwd: incident }), { git: () => { throw new Error('boom'); } }), undefined);
check('a throw is journaled', journalLines('errors.jsonl').map((line) => line.step), ['evaluate']);

// git answers the status but cannot name the repository root: the stale paths are still reported, nothing is recorded, the reason is journaled.
clearState();
const rootlessGit = (args) => (args[0] === 'status' ? { ok: true, stdout: `1 MM N... 100644 100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} a.txt\0` } : { ok: false, reason: 'git rev-parse failed: no root @es git rev-parse falló: sin raíz' });
const rootlessNotice = noticeOf(run(after, post('git commit -m work -- a.txt', { cwd: incident }), { git: rootlessGit }));

check('AFTER a repository root git cannot name: the stale path is still reported', rootlessNotice?.includes('a.txt [MM]'), true);
check('AFTER a repository root git cannot name: nothing is recorded and the reason is journaled', [anyRecorded(), journalLines('errors.jsonl').map((line) => line.step)], [false, ['rev-parse']]);

const timedOut = runGit(['status'], { cwd: incident, timeoutMs: 1 });

check('runGit reports a timeout as a value in both languages', [timedOut.ok, timedOut.reason?.includes('timed out'), timedOut.reason?.includes('@es')], [false, true, true]);
check('runGit reports a git failure as a value', runGit(['status'], { cwd: scratch }).ok, false);
check('runGit passes arguments as an array: a path with a space and a quote is one argument', runGit(['rev-parse', '--git-dir', '--', "x y'z"], { cwd: incident }).ok !== undefined, true);

// ---- BEFORE: the refusal of the next sweeping commit.
clearState();
const stale = makeRepo();

commitNamed(stale, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: stale }));
check('BEFORE: the repository is MM and recorded', [status(stale), anyRecorded()], ['MM a.txt\n', true]);

const refusal = denialOf(run(before, pre('git commit -m next', { cwd: stale })));

check('BEFORE a commit with no pathspec: refused', typeof refusal, 'string');
check('the refusal names the stale path', refusal?.includes('a.txt [MM]'), true);
check('the refusal is in English first, then @es', refusal?.indexOf('COMMIT-INDEX GUARD REFUSED') < refusal?.indexOf('@es COMMIT-INDEX GUARD RECHAZÓ'), true);
check('the refusal gives the exact next steps', refusal?.includes('git add -- a.txt') && refusal?.includes('-- a.txt'), true);
check('the refusal never suggests discarding', ['git restore a', 'git checkout --', 'git reset --hard'].some((verb) => refusal?.includes(verb)), false);
check('a refusal is journaled with its paths', journalLines('refusals.jsonl').map((line) => line.paths), [['a.txt']]);
check('the refusal is a PreToolUse answer', run(before, pre('git commit -m next', { cwd: stale }))?.hookSpecificOutput?.hookEventName, 'PreToolUse');
check('BEFORE a commit naming ANOTHER path: allowed (git ignores the rest of the index)', run(before, pre('git commit -m next -- b.txt', { cwd: stale })), undefined);
check('BEFORE a commit naming the stale path: allowed', run(before, pre('git commit -m next -- a.txt', { cwd: stale })), undefined);
check('BEFORE `-o` naming the stale path: allowed', run(before, pre('git commit -o a.txt -m next', { cwd: stale })), undefined);
check('BEFORE `-a`: allowed (it re-stages every tracked path)', run(before, pre('git commit -am next', { cwd: stale })), undefined);
check('BEFORE `--all`: allowed', run(before, pre('git commit --all -m next', { cwd: stale })), undefined);
check('BEFORE `-i` without the stale path: refused (it also commits the staged index)', typeof denialOf(run(before, pre('git commit -i b.txt -m next', { cwd: stale }))), 'string');
check('BEFORE `--include` without the stale path: refused', typeof denialOf(run(before, pre('git commit --include b.txt -m next', { cwd: stale }))), 'string');
check('BEFORE `-i` WITH the stale path: allowed', run(before, pre('git commit -i a.txt -m next', { cwd: stale })), undefined);
check('BEFORE a dry run: allowed', run(before, pre('git commit --dry-run -m next', { cwd: stale })), undefined);
check('BEFORE a commit only MENTIONED in echo: allowed', run(before, pre('echo "git commit -m next"', { cwd: stale })), undefined);
check('BEFORE `git -C <repo>` from another directory: refused', typeof denialOf(run(before, pre(`git -C "${stale.split('\\').join('/')}" commit -m next`, { cwd: scratch }))), 'string');
check('BEFORE PowerShell: refused too', typeof denialOf(run(before, pre('git commit -m next', { cwd: stale, tool: 'PowerShell' }))), 'string');
check('BEFORE a non-commit command: allowed', run(before, pre('git status', { cwd: stale })), undefined);
check('BEFORE a BOM-prefixed payload: still judged', typeof denialOf(run(before, `\ufeff${JSON.stringify(pre('git commit -m next', { cwd: stale }))}`)), 'string');
check('BEFORE a payload that is not JSON: allowed', run(before, 'not json'), undefined);

const otherClean = makeRepo({ rewriting: false });

check('BEFORE a bare commit in ANOTHER repository: allowed (the record is per repository)', run(before, pre('git commit -m next', { cwd: otherClean })), undefined);

const subdirectory = path.join(stale, 'sub');

check('BEFORE a bare commit from a subdirectory of the stale repository: refused', typeof denialOf(run(before, pre('git commit -m next', { cwd: subdirectory }))), 'string');
check('BEFORE naming the stale path relative to a subdirectory: allowed', run(before, pre('git commit -i ../a.txt -m next', { cwd: subdirectory })), undefined);

// ---- BEFORE: the record is measured again, never trusted.
git(stale, 'add', '--', 'a.txt');
check('BEFORE after `git add` settled the path: allowed', run(before, pre('git commit -m next', { cwd: stale })), undefined);
check('a settled record is removed', anyRecorded(), false);

clearState();
let gitCalls = 0;

check('BEFORE with nothing recorded: allowed', run(before, pre('git commit -m next', { cwd: stale }), { git: () => { gitCalls += 1; return { ok: false, reason: 'asked' }; } }), undefined);
check('BEFORE with nothing recorded: git is never asked', gitCalls, 0);

clearState();
const justNotice = makeRepo();

commitNamed(justNotice, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: justNotice }));
check('BEFORE a git error: allowed', run(before, pre('git commit -m next', { cwd: justNotice }), { git: failingGit }), undefined);
check('a git error before a commit is journaled', journalLines('errors.jsonl').some((line) => line.reason.includes('@es')), true);
check('BEFORE a git port that throws: allowed', run(before, pre('git commit -m next', { cwd: justNotice }), { git: () => { throw new Error('boom'); } }), undefined);

clearState();
recordStale(git(justNotice, 'rev-parse', '--show-toplevel').trim(), [{ path: 'a.txt', code: 'MM', blob: 'recorded-blob' }]);

const statusFails = (args, options) => (args[0] === 'status' ? { ok: false, reason: 'git status failed: x @es git status falló: x' } : runGit(args, options));

check('BEFORE a status that fails: allowed, and the reason is journaled as a status failure', [run(before, pre('git commit -m next', { cwd: justNotice }), { git: statusFails }), journalLines('errors.jsonl').map((line) => line.step)], [undefined, ['status']]);

clearState();
recordStale('C:/Any/Repo', [{ path: 'a.txt', code: 'MM', blob: 'recorded-blob' }]);
check('BEFORE a repository root git cannot name: allowed, and the reason is journaled', [run(before, pre('git commit -m next', { cwd: justNotice }), { git: () => ({ ok: false, reason: 'git rev-parse failed: x @es git rev-parse falló: x' }) }), journalLines('errors.jsonl').map((line) => line.step)], [undefined, ['rev-parse']]);

// A record whose paths are only modified in the worktree (` M`) is not a sweep hazard: allowed and forgotten.
clearState();
const worktreeOnly = makeRepo({ rewriting: false });
const topOfWorktreeOnly = git(worktreeOnly, 'rev-parse', '--show-toplevel').trim();

writeFileSync(path.join(worktreeOnly, 'a.txt'), 'changed after the commit\n');
recordStale(topOfWorktreeOnly, [{ path: 'a.txt', code: ' M', blob: 'recorded-blob' }]);
check('BEFORE a path that is only modified in the worktree: allowed', run(before, pre('git commit -m next', { cwd: worktreeOnly })), undefined);
check('BEFORE that record is forgotten once it is no longer MM', anyRecorded(), false);

// A torn record reads as nothing recorded, so it never blocks a commit.
clearState();
const torn = makeRepo();

commitNamed(torn, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: torn }));
overwriteRecords('{"toplevel":');
check('the torn record is the one that was recorded', recordFileNames().length, 1);
check('BEFORE a torn record: allowed', run(before, pre('git commit -m next', { cwd: torn })), undefined);

// ---- MORE AFTER.
clearState();
const cleanAgain = makeRepo({ rewriting: false });

commitNamed(cleanAgain, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: cleanAgain }));
check('AFTER a clean commit: nothing is recorded', anyRecorded(), false);

const twoCommits = makeRepo();

commitNamed(twoCommits, ['a.txt', 'sub/c.txt']);

const lineNotice = noticeOf(run(after, post('git commit -m one -- a.txt && git commit -m two -- sub/c.txt', { cwd: twoCommits })));

check('AFTER two commits in one line: the paths of both are measured', lineNotice?.includes('a.txt [MM]') && lineNotice?.includes('sub/c.txt [MM]'), true);

clearState();
check('AFTER a cd that cannot be followed: silent', run(after, post('cd "$UNKNOWN" && git commit -m work -- a.txt', { cwd: incident })), undefined);
check('AFTER a cd that cannot be followed: the reason is journaled', journalLines('errors.jsonl').map((line) => line.step), ['directory']);

// ---- MORE BEFORE.
clearState();
const directoryRepo = makeRepo();

commitNamed(directoryRepo, ['sub/c.txt']);
run(after, post('git commit -m work -- sub/c.txt', { cwd: directoryRepo }));
check('BEFORE `-i` naming the DIRECTORY that holds the stale path: allowed', run(before, pre('git commit -i sub -m next', { cwd: directoryRepo })), undefined);
check('BEFORE `-i` naming the stale file itself: allowed', run(before, pre('git commit -i sub/c.txt -m next', { cwd: directoryRepo })), undefined);
check('BEFORE `-i` naming a path that only shares a prefix with the directory: refused', typeof denialOf(run(before, pre('git commit -i su -m next', { cwd: directoryRepo }))), 'string');

// An MM elsewhere, in a repository nothing recorded, is none of this guard's business even while another repository has a record.
const unrecorded = makeRepo();

commitNamed(unrecorded, ['a.txt']);
check('BEFORE an unrecorded repository that is MM while another repository has a record: allowed', run(before, pre('git commit -m next', { cwd: unrecorded })), undefined);

// A record shrinks to what is still stale.
clearState();
const shrinking = makeRepo();
const topOfShrinking = git(shrinking, 'rev-parse', '--show-toplevel').trim();

commitNamed(shrinking, ['a.txt', 'sub/c.txt']);
run(after, post('git commit -m work -- a.txt sub/c.txt', { cwd: shrinking }));
git(shrinking, 'add', '--', 'a.txt');

const shrunkRefusal = denialOf(run(before, pre('git commit -m next', { cwd: shrinking })));

check('BEFORE one of two settled: refused for the other only', [shrunkRefusal?.includes('sub/c.txt [MM]'), shrunkRefusal?.includes('a.txt [')], [true, false]);
check('the record shrinks to the path still stale', recordedStale(topOfShrinking).map((entry) => entry.path), ['sub/c.txt']);

// A cd that cannot be followed is not judged against the process directory.
const here = process.cwd();

process.chdir(shrinking);
check('BEFORE a cd that cannot be followed: allowed, never judged against the process directory', run(before, pre('cd "$UNKNOWN" && git commit -m next', { cwd: shrinking })), undefined);
process.chdir(here);

// ---- THE SEQUENCES THE JUDGES NAMED, each on real repositories.
const topOf = (repo) => git(repo, 'rev-parse', '--show-toplevel').trim();
const pathsRecorded = (repo) => recordedStale(topOf(repo)).map((entry) => entry.path).sort();

// (1) Two successive pathspec commits: the second must not make the first forgotten.
clearState();
const successive = makeRepo();

commitNamed(successive, ['a.txt']);
run(after, post('git commit -m one -- a.txt', { cwd: successive }));
commitNamed(successive, ['b.txt']);
run(after, post('git commit -m two -- b.txt', { cwd: successive }));
check('two successive commits: the record holds the first commit\'s path (b.txt has no hook, so it is not stale)', pathsRecorded(successive), ['a.txt']);

const successiveHook = path.join(successive, '.git', 'hooks', 'pre-commit');

writeFileSync(successiveHook, "#!/bin/sh\nsed -i 's/ *$//' a.txt b.txt sub/c.txt\ngit add a.txt b.txt sub/c.txt\n");
commitNamed(successive, ['sub/c.txt']);
run(after, post('git commit -m three -- sub/c.txt', { cwd: successive }));
check('two successive stale commits: both paths are recorded', pathsRecorded(successive), ['a.txt', 'sub/c.txt']);
git(successive, 'add', '--', 'sub/c.txt');

const sweptFirst = denialOf(run(before, pre('git commit -m next', { cwd: successive })));

check('after the second path is staged, a bare commit is still refused for the FIRST path', [sweptFirst?.includes('a.txt [MM]'), sweptFirst?.includes('sub/c.txt [')], [true, false]);

// (2) Two directories of one repository in one line.
clearState();
const twoDirectories = makeRepo();

commitNamed(twoDirectories, ['a.txt', 'sub/c.txt']);
run(after, post('git commit -m one -- a.txt && cd sub && git commit -m two -- c.txt', { cwd: twoDirectories }));
check('two directories of one repository in one line: both are recorded', pathsRecorded(twoDirectories), ['a.txt', 'sub/c.txt']);

// (3) A partial stage changes the index blob and settles the path, even though it is still MM.
clearState();
const partial = makeRepo();

commitNamed(partial, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: partial }));
check('partial stage: the path is recorded as stale', pathsRecorded(partial), ['a.txt']);

const patch = 'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a.txt edited  \n+a.txt edited   \n';
const patchFile = path.join(scratch, 'partial.patch');

writeFileSync(patchFile, patch);
git(partial, 'apply', '--cached', '--whitespace=nowarn', patchFile);
check('partial stage: git still says MM', status(partial), 'MM a.txt\n');
check('partial stage: a bare commit is allowed, the new staged content is deliberate', run(before, pre('git commit -m next', { cwd: partial })), undefined);
check('partial stage: the record no longer holds the path', pathsRecorded(partial), []);

// (4) A moved path is followed to its new name.
clearState();
const moved = makeRepo();

commitNamed(moved, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: moved }));
git(moved, 'mv', 'a.txt', 'moved.txt');

const movedRefusal = denialOf(run(before, pre('git commit -m next', { cwd: moved })));

check('rename: a bare commit is refused naming the NEW path with its current status', [movedRefusal?.includes('moved.txt [AM]'), movedRefusal?.includes('- a.txt')], [true, false]);
check('rename: the record holds the new name and not the old one', pathsRecorded(moved), ['moved.txt']);
check('rename: the first-seen time survives the move', recordedStale(topOf(moved)).length, 1);
git(moved, 'add', '--', 'moved.txt');
check('rename: staging the new name settles it', [run(before, pre('git commit -m next', { cwd: moved })), pathsRecorded(moved)], [undefined, []]);

clearState();
const movedAway = makeRepo();

commitNamed(movedAway, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: movedAway }));
git(movedAway, 'rm', '-q', '-f', '--cached', '--', 'a.txt');
check('a recorded path removed from the index with no new name settles: nothing is followed, nothing is refused', [run(before, pre('git commit -m next', { cwd: movedAway })), pathsRecorded(movedAway)], [undefined, []]);

clearState();
const movedGitFails = makeRepo();

commitNamed(movedGitFails, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: movedGitFails }));
git(movedGitFails, 'mv', 'a.txt', 'moved.txt');

let statusCalls = 0;
const wholeRepositoryFails = (args, options) => {
  if (args[0] === 'status' && args.at(-1) === '--') {
    statusCalls += 1;
    return { ok: false, reason: 'git status failed: x @es git status falló: x' };
  }

  return runGit(args, options);
};

check('rename: when the whole-repository read fails the commit is allowed and the reason journaled', [run(before, pre('git commit -m next', { cwd: movedGitFails }), { git: wholeRepositoryFails }), statusCalls, journalLines('errors.jsonl').map((line) => line.step)], [undefined, 1, ['status']]);

// (5) --pathspec-from-file, in both forms, and the other ways to commit only what is named.
clearState();
const fromFile = makeRepo();

writeFileSync(path.join(fromFile, 'list.txt'), 'a.txt\n');
writeFileSync(path.join(fromFile, 'a.txt'), 'a.txt edited  \n');
git(fromFile, 'commit', '-q', '-m', 'work', '--pathspec-from-file=list.txt');

const fusedNotice = noticeOf(run(after, post('git commit -m work --pathspec-from-file=list.txt', { cwd: fromFile })));

check('pathspec file, fused form: the paths of the file are measured', fusedNotice?.includes('a.txt [MM]'), true);
check('pathspec file, fused form: the path is recorded', pathsRecorded(fromFile), ['a.txt']);

clearState();
check('pathspec file, separated form: the file name is not a path and its entries are measured', noticeOf(run(after, post('git commit -m work --pathspec-from-file list.txt', { cwd: fromFile })))?.includes('a.txt [MM]'), true);
check('pathspec file, separated form: the path is recorded', pathsRecorded(fromFile), ['a.txt']);
check('pathspec file: the file name itself is never measured as a path', recordedStale(topOf(fromFile)).some((entry) => entry.path === 'list.txt'), false);

writeFileSync(path.join(fromFile, 'nul.lst'), 'a.txt\0');
clearState();
check('pathspec file with NUL separators', noticeOf(run(after, post('git commit -m work --pathspec-from-file=nul.lst --pathspec-file-nul', { cwd: fromFile })))?.includes('a.txt [MM]'), true);

clearState();
check('pathspec file that cannot be read: silent, and the reason is journaled', [run(after, post('git commit -m work --pathspec-from-file=missing.lst', { cwd: fromFile })), journalLines('errors.jsonl').map((line) => line.step)], [undefined, ['pathspec-file']]);
check('pathspec file from standard input: silent, journaled', [run(after, post('git commit -m work --pathspec-from-file=-', { cwd: fromFile })), journalLines('errors.jsonl').length], [undefined, 2]);

clearState();
run(after, post('git commit -m work -- a.txt', { cwd: fromFile }));
check('pathspec file: the stale path is recorded again for the next commit', pathsRecorded(fromFile), ['a.txt']);
check('BEFORE `--pathspec-from-file=` (fused): not a sweep, allowed', run(before, pre('git commit -m next --pathspec-from-file=other.txt', { cwd: fromFile })), undefined);
check('BEFORE `--pathspec-from-file` (separated): not a sweep, allowed', run(before, pre('git commit -m next --pathspec-from-file other.txt', { cwd: fromFile })), undefined);
check('BEFORE `--amend -o` with no path: not a sweep, allowed', run(before, pre('git commit --amend -o -m next', { cwd: fromFile })), undefined);
check('BEFORE `--only` with no path: not a sweep, allowed', run(before, pre('git commit --only -m next', { cwd: fromFile })), undefined);
check('BEFORE `--onl` abbreviated: not a sweep, allowed', run(before, pre('git commit --onl -m next', { cwd: fromFile })), undefined);
check('BEFORE `--incl b.txt` abbreviated: a sweep, refused', typeof denialOf(run(before, pre('git commit --incl b.txt -m next', { cwd: fromFile }))), 'string');
check('BEFORE `--inc b.txt` abbreviated: a sweep, refused', typeof denialOf(run(before, pre('git commit --inc b.txt -m next', { cwd: fromFile }))), 'string');
check('BEFORE `--al` (ambiguous, git refuses it): not read as --all, so a bare commit is refused', typeof denialOf(run(before, pre('git commit --al -m next', { cwd: fromFile }))), 'string');
check('BEFORE `--all` spelled `--no-al`... an unknown word consumes nothing: a bare commit is refused', typeof denialOf(run(before, pre('git commit --no-al -m next', { cwd: fromFile }))), 'string');
check('BEFORE the value of `-U 3` is not a path: the commit still names nothing and is refused', typeof denialOf(run(before, pre('git commit -p -U 3 -m next', { cwd: fromFile }))), 'string');

// (6) A notice for a path that is only ` M` after the commit is given but never recorded.
clearState();
const looseWorktree = makeRepo({ rewriting: false });

commitNamed(looseWorktree, ['a.txt']);
writeFileSync(path.join(looseWorktree, 'a.txt'), 'edited again after the commit\n');
check('AFTER a path modified only in the worktree: the notice is given', noticeOf(run(after, post('git commit -m work -- a.txt', { cwd: looseWorktree })))?.includes('a.txt [ M]'), true);
check('AFTER a path modified only in the worktree: nothing is recorded', anyRecorded(), false);

// (7) Only the MM paths are recorded: a commit of two paths where one is MM and the other is modified afterwards.
clearState();
const mixed = makeRepo();

commitNamed(mixed, ['a.txt', 'sub/c.txt']);
writeFileSync(path.join(mixed, 'sub', 'c.txt'), 'edited after the commit\n');
git(mixed, 'add', '--', 'sub/c.txt');
writeFileSync(path.join(mixed, 'sub', 'c.txt'), 'edited again, only in the worktree\n');
check('mixed: a.txt is MM and so is c.txt after a staged edit and a worktree edit', status(mixed), 'MM a.txt\nMM sub/c.txt\n');

const mixedClean = makeRepo({ rewriting: false });

commitNamed(mixedClean, ['a.txt']);
writeFileSync(path.join(mixedClean, 'a.txt'), 'only the worktree\n');
commitNamed(mixedClean, ['b.txt']);
writeFileSync(path.join(mixedClean, 'b.txt'), 'only the worktree again\n');
clearState();
check('mixed: a path modified only in the worktree is reported and not recorded', [noticeOf(run(after, post('git commit -m work -- a.txt b.txt', { cwd: mixedClean })))?.includes('b.txt [ M]'), anyRecorded()], [true, false]);

// A mixed measure on ONE repository: one MM path and one ` M` path. Only the MM path is recorded.
clearState();
const oneEach = makeRepo();

commitNamed(oneEach, ['a.txt']);
writeFileSync(path.join(oneEach, 'b.txt'), 'b edited after\n');
check('mixed: one MM path and one worktree-only path', status(oneEach), 'MM a.txt\n M b.txt\n');
run(after, post('git commit -m work -- a.txt b.txt', { cwd: oneEach }));
check('mixed: only the MM path is recorded', pathsRecorded(oneEach), ['a.txt']);

// (8) The same blob is not enough: when the worktree is made equal to the stale staged content the path is no longer a disagreement.
clearState();
const restored = makeRepo();

commitNamed(restored, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: restored }));
writeFileSync(path.join(restored, 'a.txt'), git(restored, 'show', ':a.txt'));
check('restored worktree: git says the staged change is deliberate (M in the first column only)', status(restored), 'M  a.txt\n');
check('restored worktree: a bare commit is allowed although the index blob is the recorded one', run(before, pre('git commit -m next', { cwd: restored })), undefined);
check('restored worktree: the record is forgotten', pathsRecorded(restored), []);

// (9) The commands the guard sends to git, seen through the port.
clearState();
const sent = [];
const spy = (args, options) => {
  sent.push(args);

  return runGit(args, options);
};
const spied = makeRepo();

commitNamed(spied, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: spied }), { git: spy });
check('git is asked for the status of the committed paths only, as an argument array', sent[0], ['status', '--porcelain=v2', '-z', '--find-renames', '--untracked-files=no', '--', 'a.txt']);
check('git is then asked for the repository root', sent[1], ['rev-parse', '--show-toplevel']);

sent.length = 0;
git(spied, 'mv', 'a.txt', 'moved.txt');
run(before, pre('git commit -m next', { cwd: spied }), { git: spy });
check('the refusal asks the root, the recorded paths, then the whole repository for a path that went missing', sent.map((args) => args.slice(0, 1).concat(args.at(-1) === '--' ? ['whole'] : args.slice(-1))), [['rev-parse', '--show-toplevel'], ['status', 'a.txt'], ['status', 'whole']]);
check('the whole-repository read keeps the rename flag and the untracked flag', sent[2], ['status', '--porcelain=v2', '-z', '--find-renames', '--untracked-files=no', '--']);

// A path with nothing to record costs one git call, and a plain refusal costs two.
clearState();
sent.length = 0;
run(after, post('git commit -m work -- a.txt', { cwd: looseWorktree }), { git: spy });
check('AFTER a path that is only modified in the worktree: git is asked once, for the status', sent.map((args) => args[0]), ['status']);

clearState();
const plain = makeRepo();

commitNamed(plain, ['a.txt']);
run(after, post('git commit -m work -- a.txt', { cwd: plain }));
sent.length = 0;
check('BEFORE a plain refusal: git is asked for the root and for the recorded paths, nothing more', [typeof denialOf(run(before, pre('git commit -m next', { cwd: plain }), { git: spy })), sent.map((args) => args[0])], ['string', ['rev-parse', 'status']]);

sent.length = 0;
check('BEFORE a repository with no record while another has one: git is asked only for the root', [run(before, pre('git commit -m next', { cwd: otherClean }), { git: spy }), sent.map((args) => args[0])], [undefined, ['rev-parse']]);

rmSync(path.join(plain, 'a.txt'));
check('BEFORE the refusal shows the current status of the path, not the recorded one', denialOf(run(before, pre('git commit -m next', { cwd: plain })))?.includes('a.txt [MD]'), true);

// ---- WIRING: both guards run from their manifests, for the tools they decide, and the REAL payload works through the dispatcher.
const manifestsDirectory = path.join(HERE, '..', 'hook-dispatch', 'manifests');
const manifestOf = (name) => JSON.parse(readFileSync(path.join(manifestsDirectory, name), 'utf8'));
const registrationOf = (name) => JSON.parse(readFileSync(path.join(HERE, name), 'utf8'));

check('the PostToolUse manifest lists the notice guard', manifestOf('posttooluse-shell.json').guards.includes('../../commit-index-guard/guard.mjs'), true);
check('the PreToolUse manifest lists the refusal guard', manifestOf('pretooluse-shell.json').guards.includes('../../commit-index-guard/pre-commit.mjs'), true);
check('the notice guard is registered for PostToolUse on Bash and PowerShell', registrationOf('guard.mjs.hook-registration.json').registrations, [{ event: 'PostToolUse', matcher: 'Bash|PowerShell' }]);
check('the refusal guard is registered for PreToolUse on Bash and PowerShell', registrationOf('pre-commit.mjs.hook-registration.json').registrations, [{ event: 'PreToolUse', matcher: 'Bash|PowerShell' }]);

const dispatched = (manifest, payload, root) => execFileSync('node', [path.join(HERE, '..', 'hook-dispatch', 'dispatch.mjs'), path.join(manifestsDirectory, manifest)], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: root }, timeout: 60_000 });

const wired = makeRepo();

commitNamed(wired, ['a.txt']);

const throughPost = dispatched('posttooluse-shell.json', post('git commit -m work -- a.txt', { cwd: wired }), stateRoot);

check('through the dispatcher: the real-shaped PostToolUse payload yields the notice', answerOf(throughPost)?.hookSpecificOutput?.additionalContext?.includes('a.txt [MM]'), true);

const throughPre = dispatched('pretooluse-shell.json', pre('git commit -m next', { cwd: wired }), stateRoot);

check('through the dispatcher: the next bare commit is DENIED', [answerOf(throughPre)?.hookSpecificOutput?.permissionDecision, answerOf(throughPre)?.hookSpecificOutput?.permissionDecisionReason?.includes('COMMIT-INDEX GUARD REFUSED')], ['deny', true]);
check('through the dispatcher: the recorded real payload of `git --version` is silent', dispatched('posttooluse-shell.json', captured, stateRoot).includes('COMMIT-INDEX'), false);

const total = passed + failures.length;

for (const failure of failures) console.log(`FAIL  ${failure}`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  commit-index-guard selftest: ${passed}/${total}`);
process.exit(failures.length === 0 ? 0 : 1);
