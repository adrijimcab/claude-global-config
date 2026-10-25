#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `conflict-marker-guard`.
 *
 * THE STATE SPACE, each state built as a REAL git repository (git sandbox) with a REAL conflicted merge:
 *   index        markers staged after a real conflict / resolved and staged / unmerged and not yet staged /
 *                markers only on REMOVED lines (the fixing commit) / nothing staged
 *   marker data  Markdown `=======` alone, one `<<<<<<<` alone, eight-character runs, an added line `++ x`,
 *                a fixture folder, a file the change adds, markers inside a string literal
 *   step         rebase|merge|cherry-pick|am --continue, commit (refused) / status, add, abort, plain merge (never)
 *   spelling     `git -C`, `cd` before, chains, `;` after a check (the incident), PowerShell
 *   data         the step named in an echo, a commit message, a heredoc
 *   failures     no repository, missing directory, git error, git timeout (each ALLOWED and JOURNALED)
 *
 * @es PRUEBA DE DISCRIMINACIÓN. Cada estado es un repositorio git REAL con una fusión en conflicto REAL: marcas
 * en el índice, resuelto, sin fusionar, marcas solo en líneas BORRADAS, nada en stage; datos que parecen marca
 * (subrayado Markdown, una marca suelta, una línea `++ x`, carpeta de fixtures, fichero que el cambio añade,
 * cadena); cada paso; cada grafía; el paso nombrado como dato; y los fallos de git, que se PERMITEN y se REGISTRAN.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';

isolateState('conflict-marker-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (relative) => import(pathToFileURL(path.join(HERE, relative)).href);
const { payloadFor } = await load('../hook-payloads/payloads.mjs');
const { createGitSandbox } = await load('../selftest-fixtures/git-sandbox.mjs');
const { dialectOfTool } = await load('../shell-command/shell-command.mjs');
const { classify, ARCHIVE } = await load('../hook-state/rotate.mjs');
const { evaluate, refusalText } = await load('guard.mjs');
const { addedLinesByFile, conflictIn, isFixturePath, markerKindOf, numberedLines } = await load('markers.mjs');
const { GIT_TIMEOUT_MS, runGit, unmergedConflicts } = await load('probe.mjs');

let failures = 0;
let total = 0;

function report(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const slash = (value) => value.split('\\').join('/');
const cleanups = [];

// Every scratch directory is removed on EVERY exit. @es Todo directorio temporal se borra en CUALQUIER salida.
process.once('exit', () => {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      /* a cleanup that fails must not hide the verdict */
    }
  }
});

/** A repository with `f.txt` committed; `git(args)` and `write(name, text)` work inside it. @es Un repositorio con `f.txt` commiteado. */
function repository() {
  const sandbox = createGitSandbox({ parent: process.argv[2] ?? undefined });

  cleanups.push(sandbox.cleanup);

  const git = (args, cwd = sandbox.repoDir) => {
    const result = sandbox.git(args, { cwd });

    if (result.status !== 0 && !args.includes('merge')) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);

    return result;
  };
  const write = (name, text) => {
    mkdirSync(path.dirname(path.join(sandbox.repoDir, name)), { recursive: true });
    writeFileSync(path.join(sandbox.repoDir, name), text);
  };

  write('f.txt', 'a\nb\nc\n');
  git(['add', 'f.txt']);
  git(['commit', '-q', '-m', 'base']);

  return { ...sandbox, git, write, run: (args, { cwd }) => sandbox.git(args, { cwd }) };
}

/** A repository where merging `x` into `main` conflicts in `f.txt` (left UNMERGED). @es Un repositorio con una fusión en conflicto, sin fusionar. */
function conflicted(name = 'f.txt') {
  const repo = repository();

  if (name !== 'f.txt') {
    repo.write(name, 'a\nb\nc\n');
    repo.git(['add', name]);
    repo.git(['commit', '-q', '-m', 'seed']);
  }

  repo.git(['branch', 'x']);
  repo.write(name, 'a\nY\nc\n');
  repo.git(['commit', '-q', '-am', 'y']);
  repo.git(['switch', '-q', 'x']);
  repo.write(name, 'a\nX\nc\n');
  repo.git(['commit', '-q', '-am', 'x']);
  repo.git(['switch', '-q', 'main']);
  repo.git(['merge', 'x']);

  return repo;
}

/** The same conflict with the markers STAGED, as `git add f.txt` leaves it. @es El mismo conflicto con las marcas en stage. */
function staged() {
  const repo = conflicted();

  repo.git(['add', 'f.txt']);

  return repo;
}

const unmerged = conflicted();
const unmergedFixture = conflicted('src/fixtures/f.txt');
const markersStaged = staged();
const resolved = conflicted();

resolved.write('f.txt', 'a\nXY\nc\n');
resolved.git(['add', 'f.txt']);

// The fixing commit: HEAD carries the markers, the index REMOVES them.
const fixing = repository();

fixing.write('f.txt', 'a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\n');
fixing.git(['commit', '-q', '-am', 'carried the markers']);
fixing.write('f.txt', 'a\nb\nc\n');
fixing.git(['add', 'f.txt']);

/** A repository whose index holds `files` (`{ name: text }`) on top of the base commit. @es Un repositorio cuyo índice lleva `files`. */
function stagedWith(files, committed = {}) {
  const repo = repository();

  for (const [name, text] of Object.entries(committed)) {
    repo.write(name, text);
    repo.git(['add', name]);
  }

  if (Object.keys(committed).length > 0) repo.git(['commit', '-q', '-m', 'seed']);

  for (const [name, text] of Object.entries(files)) {
    repo.write(name, text);
    repo.git(['add', name]);
  }

  return repo;
}

const FULL = '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> x\n';
const lonely = (text) => `intro\n${text}\noutro\n`;

const underline = stagedWith({ 'doc.md': 'Title\n=======\ntext\n' }, { 'doc.md': 'Title\n' });
const openOnly = stagedWith({ 'doc.md': lonely('<<<<<<< HEAD') }, { 'doc.md': 'x\n' });
const longRuns = stagedWith({ 'doc.md': lonely('<<<<<<<<\n========\n>>>>>>>>') }, { 'doc.md': 'x\n' });
const plusPlus = stagedWith({ 'doc.md': '++ not a header\n=======\n' }, { 'doc.md': 'x\n' });
const inString = stagedWith({ 's.js': 'const marker = "<<<<<<< HEAD";\nconst end = ">>>>>>> x";\nconst mid = "=======";\n' }, { 's.js': '// seed\n' });
const fixtureFolder = stagedWith({ 'src/fixtures/conflict.txt': `seed\n${FULL}` }, { 'src/fixtures/conflict.txt': 'seed\n' });
const addedFixture = stagedWith({ 'new-conflict-example.txt': FULL });
const halfResolved = stagedWith({ 'g.txt': '=======\ntheirs\n>>>>>>> x\n' }, { 'g.txt': 'seed\n' });
const crlf = stagedWith({ 'g.txt': '<<<<<<< HEAD\r\nours\r\n=======\r\ntheirs\r\n>>>>>>> x\r\n' }, { 'g.txt': 'seed\r\n' });
const nested = stagedWith({ 'src/app/spec.ts': `seed\n${FULL}` }, { 'src/app/spec.ts': 'seed\n' });
const accented = stagedWith({ 'dir ñ/espec ificación.ts': `seed\n${FULL}` }, { 'dir ñ/espec ificación.ts': 'seed\n' });
const OLD_BLOCK = '<<<<<<< HEAD\nb\n=======\n>>>>>>> x\n';
const legacy = stagedWith({ 'old.txt': `${OLD_BLOCK}d\n` }, { 'old.txt': OLD_BLOCK });
const clean = repository();
const spaced = stagedWith({ 'f.txt': 'a\nb\nc\nd\n' });

const plainDirectory = unmerged.plainDir('plain');
const missingDirectory = path.join(unmerged.root, 'does-not-exist');

const payloadAt = (tool, cwd, command) => ({ ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd });
const bash = (cwd, command) => JSON.stringify(payloadAt('Bash', slash(cwd), command));

/** Runs the guard on `input` with the repository's own git runner. @es Corre la guardia con el ejecutor de git del repositorio. */
const decide = (repo, input) => evaluate(input, { run: repo.run });
const verdict = (output) => (output?.hookSpecificOutput?.permissionDecision === 'deny' ? 'deny' : 'allow');
const reasonOf = (output) => output?.hookSpecificOutput?.permissionDecisionReason ?? '';
const journalText = () => {
  try {
    return readFileSync(path.join(stateDir('conflict-marker-guard'), 'journal.jsonl'), 'utf8');
  } catch {
    return '';
  }
};

const STEPS = ['git rebase --continue', 'git merge --continue', 'git cherry-pick --continue', 'git am --continue', 'git commit -m "resolve"'];

// --- 1. a real conflict with markers staged is refused for every step that commits it.
for (const step of STEPS) {
  const output = decide(markersStaged, bash(markersStaged.repoDir, step));

  report(verdict(output) === 'deny', `REAL CONFLICT, markers staged: \`${step}\` is refused`);
  report(reasonOf(output).includes('  - f.txt:2 ('), `  ...and the refusal names f.txt and the line of the first marker (${step})`);
}

// --- 2. resolved, nothing staged, and removed markers pass every step.
for (const step of STEPS) {
  report(verdict(decide(resolved, bash(resolved.repoDir, step))) === 'allow', `RESOLVED and staged: \`${step}\` passes`);
  report(verdict(decide(clean, bash(clean.repoDir, step))) === 'allow', `nothing staged: \`${step}\` passes`);
  report(verdict(decide(fixing, bash(fixing.repoDir, step))) === 'allow', `the fixing commit (markers only on REMOVED lines): \`${step}\` passes`);
}

// --- 3. the incident: the add and the continue are ONE command line, so the index has no marker yet.
{
  const worktree = (command) => verdict(decide(unmerged, bash(unmerged.repoDir, command)));

  report(worktree('git commit -m x') === 'allow', 'UNMERGED and not staged: a bare commit passes (git itself refuses an unmerged commit)');
  report(worktree('git add -- f.txt && git rebase --continue') === 'deny', 'THE INCIDENT: `git add -- f.txt && git rebase --continue` over a worktree file with markers is refused');
  report(worktree('rg -c "^(<<<<<<<|=======|>>>>>>>)" f.txt; git add -- f.txt && git rebase --continue') === 'deny', 'THE INCIDENT, exact shape: a check chained with `;` before the add and the continue');
  report(worktree('git add -A && git commit -m x') === 'deny', 'add -A then commit is refused the same way');
  report(worktree('git rebase --continue') === 'allow', 'a continue WITHOUT an add on the same line leaves the unmerged file to git, which refuses it itself');
  report(worktree('git status && git add -- f.txt') === 'allow', 'an add alone commits nothing');
  report(verdict(decide(unmergedFixture, bash(unmergedFixture.repoDir, 'git add -A && git rebase --continue'))) === 'allow', 'an unmerged file under a fixtures folder is data for the add too');
  report(reasonOf(decide(unmerged, bash(unmerged.repoDir, 'git add -A && git commit -m x'))).split('  - f.txt:2').length === 3, 'a file unmerged at three stages is listed ONCE per language');
  report(verdict(decide(resolved, bash(resolved.repoDir, 'git add -- f.txt && git rebase --continue'))) === 'allow', 'add + continue over a RESOLVED file passes');
}

// --- 4. what is data and what is a marker.
{
  const allowed = (repo, label, step = 'git commit -m x') => report(verdict(decide(repo, bash(repo.repoDir, step))) === 'allow', `DATA passes: ${label}`);
  const denied = (repo, label, step = 'git commit -m x') => report(verdict(decide(repo, bash(repo.repoDir, step))) === 'deny', `MARKER refused: ${label}`);

  allowed(underline, 'a Markdown `=======` underline alone');
  allowed(openOnly, 'one `<<<<<<<` line alone');
  allowed(longRuns, 'runs of eight characters are not markers');
  allowed(plusPlus, 'an added line that begins with `++` is a line, and one marker kind alone');
  allowed(inString, 'markers inside string literals are not whole lines');
  allowed(fixtureFolder, 'a file under a fixtures folder');
  allowed(addedFixture, 'a file the change deliberately ADDS');
  allowed(legacy, 'markers already in HEAD, only CONTEXT of an unrelated edit next to them');
  denied(halfResolved, 'a half-resolved block (the opening line deleted, two kinds left)');
  denied(crlf, 'a CRLF file');
  denied(nested, 'a conflict in a nested source path');
  denied(accented, 'a conflict in a path with an accent and a space', 'git commit -m x');
  report(reasonOf(decide(accented, bash(accented.repoDir, 'git commit -m x'))).includes('dir ñ/espec ificación.ts:2'), '  ...and the refusal prints that path unquoted, with its accent and space');
  report(verdict(decide(spaced, bash(spaced.repoDir, 'git commit -m x'))) === 'allow', 'an ordinary staged change passes');
}

// --- 5. spellings that reach the repository.
{
  const elsewhere = slash(plainDirectory);
  const target = slash(markersStaged.repoDir);

  report(verdict(decide(markersStaged, bash(elsewhere, `git -C "${target}" commit -m x`))) === 'deny', '`git -C <repo> commit` from another directory is refused');
  report(verdict(decide(markersStaged, bash(elsewhere, `cd "${target}" && git commit -m x`))) === 'deny', '`cd <repo> && git commit` is refused');
  report(verdict(decide(markersStaged, bash(elsewhere, `git status && git -C "${target}" rebase --continue; echo done`))) === 'deny', 'a continue inside a longer chain is refused');
  report(verdict(decide(markersStaged, bash(target, `bash -c 'git commit -m x'`))) === 'deny', 'a commit inside bash -c is refused');
  report(verdict(decide(markersStaged, bash(target, `( git commit -m x )`))) === 'deny', 'a commit inside a subshell is refused');
  report(verdict(decide(markersStaged, JSON.stringify(payloadAt('PowerShell', markersStaged.repoDir, 'git rebase --continue')))) === 'deny', 'PowerShell is covered');
  report(verdict(decide(clean, bash(elsewhere, `git -C "${slash(clean.repoDir)}" commit -m x`))) === 'allow', '`git -C <clean repo> commit` passes');
  report(verdict(decide(markersStaged, bash(slash(clean.repoDir), `git -C "${target}" commit -m x`))) === 'deny', 'the repository is the one `-C` names, not the payload directory');
  report(verdict(decide(markersStaged, bash(target, `git -C "${slash(clean.repoDir)}" commit -m x`))) === 'allow', 'a clean `-C` repository passes although the payload directory is conflicted');
}

// --- 6. steps and words that are none of this guard's business.
{
  const quiet = (command) => report(verdict(decide(markersStaged, bash(markersStaged.repoDir, command))) === 'allow', `never refused: \`${command}\``);

  for (const command of ['git status', 'git rebase --abort', 'git rebase --skip', 'git merge x', 'git merge --abort', 'git add f.txt', 'git diff --cached', 'git log', 'git cherry-pick abc', 'git commit-tree HEAD', 'git rebase --continue-not', 'git notcommit']) quiet(command);

  const data = (label, command) => report(verdict(decide(markersStaged, bash(markersStaged.repoDir, command))) === 'allow', `DATA, not a command: ${label}`);

  data('an echo naming the step', 'echo "now run git rebase --continue"');
  data('a commit message naming the step', 'node -e "1" # git commit');
  data('a heredoc body naming the step', "cat <<'EOF' > note.txt\ngit rebase --continue\ngit commit -m x\nEOF");
  data('another executable', 'other-git commit -m x');
}

// --- 7. a git that cannot answer is ALLOWED and JOURNALED.
{
  const failOpen = (label, input, run) => {
    const before = journalText().length;
    let output;

    try {
      output = evaluate(input, { run });
    } catch (error) {
      report(false, `${label}: must not throw out of evaluate(): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);

      return;
    }

    const added = journalText().slice(before);

    report(verdict(output) === 'allow' && added.includes('"verdict":"fail-open"'), `FAIL-OPEN, journaled: ${label}`);

    return added;
  };

  failOpen('a directory that is no repository', bash(plainDirectory, 'git commit -m x'), unmerged.run);
  failOpen('a directory that does not exist', bash(missingDirectory, 'git commit -m x'), unmerged.run);

  const timedOut = failOpen('git timed out', bash(markersStaged.repoDir, 'git commit -m x'), () => ({ status: null, stdout: '', stderr: '', error: Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }) }));

  report(timedOut?.includes('ETIMEDOUT') === true, '  ...and the journal says WHY (the timeout)');

  const broken = failOpen('git exited non-zero', bash(markersStaged.repoDir, 'git commit -m x'), () => ({ status: 128, stdout: '', stderr: 'fatal: broken\n' }));

  report(broken?.includes('git exited 128') === true, '  ...and the journal says WHY (the exit code)');
  failOpen('the runner itself throws', bash(markersStaged.repoDir, 'git commit -m x'), () => {
    throw new Error('runner exploded');
  });
  failOpen('the line\'s own cd cannot be followed', bash(markersStaged.repoDir, 'cd "$SOMEWHERE" && git commit -m x'), unmerged.run);
  report(GIT_TIMEOUT_MS > 0 && GIT_TIMEOUT_MS <= 10000, 'the git timeout is short');
}

// --- 8. the refusal and the journal of a refusal.
{
  const before = journalText().length;
  const output = decide(markersStaged, bash(markersStaged.repoDir, 'git rebase --continue'));
  const reason = reasonOf(output);

  report(reason.includes('CONFLICT-MARKER GUARD REFUSED') && reason.includes('@es CONFLICT-MARKER GUARD RECHAZÓ'), 'the refusal carries English and its @es mirror');
  report(reason.indexOf('CONFLICT-MARKER GUARD REFUSED') < reason.indexOf('@es CONFLICT-MARKER GUARD RECHAZÓ'), 'English comes first');
  report(reason.includes('(<<<<<<< ======= >>>>>>>)'), 'the refusal says which marker kinds were found');
  report(reason.includes('resolve the conflict') && reason.includes('retry') && reason.includes('resolver el conflicto') && reason.includes('reintentar'), 'it says to resolve the conflict and retry, once per language');
  report(reason.includes('Medido') && reason.includes('commitearía') && reason.includes('olvidada'), 'the Spanish half keeps its accents');
  report(journalText().slice(before).includes('"verdict":"deny"'), 'a refusal is journaled');

  const many = refusalText({ text: 'git commit', directory: '/r', conflicts: Array.from({ length: 11 }, (_, index) => ({ path: `f${index}.txt`, line: 1, kinds: ['=======', '>>>>>>>'] })) });

  report(many.includes('... and 3 more') && many.includes('... y 3 más') && !many.includes('f10.txt'), 'a long list is cut at eight and counts the rest, once per language');
}

// --- 8b. what the guard asks git, and how often.
{
  const calls = [];
  const counting = (args, options) => {
    calls.push(args);

    return markersStaged.run(args, options);
  };

  evaluate(bash(clean.repoDir, 'git commit -m a && git commit -m b && git rebase --continue'), { run: (args, options) => {
    calls.push(args);

    return clean.run(args, options);
  } });
  report(calls.length === 1, 'ONE git call for the same repository, however many commit steps the line has');

  calls.length = 0;
  evaluate(bash(markersStaged.repoDir, 'cd "$SOMEWHERE" && git commit -m x'), { run: counting });
  report(calls.length === 0, 'a cd the parser cannot follow asks git nothing (never the process directory)');

  calls.length = 0;
  evaluate(bash(markersStaged.repoDir, 'git status'), { run: counting });
  report(calls.length === 0, 'a step that commits nothing asks git nothing');

  calls.length = 0;
  evaluate(bash(unmerged.repoDir, 'git add -A && git commit -m x'), { run: counting });
  report(calls.length === 2 && calls[0].includes('diff') && calls[1].includes('ls-files'), 'a line that stages asks the index and the unmerged files, two calls');

  report(verdict(decide(markersStaged, JSON.stringify({ ...payloadAt('Bash', markersStaged.repoDir, 'git commit -m x'), tool_name: 'NotAShellTool' }))) === 'allow', "a tool with no shell dialect is none of this guard's business");
  report(verdict(decide(markersStaged, `\uFEFF${bash(markersStaged.repoDir, 'git commit -m x')}`)) === 'deny', 'a payload with a byte-order mark is still read');

  const seen = [];
  const spy = (...args) => {
    seen.push(args);

    return { status: 0, stdout: '', stderr: '' };
  };

  runGit(['diff', '--cached'], { cwd: 'C:/somewhere' }, spy);

  const [executable, args, options] = seen[0];

  report(executable === 'git' && Array.isArray(args) && args.join(' ') === 'diff --cached' && options.cwd === 'C:/somewhere' && options.shell === undefined, 'runGit passes its arguments as an array to git, with no shell');
  report(options.timeout === GIT_TIMEOUT_MS && options.maxBuffer >= 16 * 1024 * 1024 && options.windowsHide === true && options.encoding === 'utf8', 'runGit bounds time and output and hides the window');

  const record = (stage, name) => `100644 abc123 ${stage}\t${name}`;
  const fakeLs = () => ({ status: 0, stdout: [record(1, 'f.txt'), record(2, 'f.txt'), record(3, 'f.txt'), record(1, 'big.txt'), record(1, 'src/fixtures/z.txt'), record(1, 'gone.txt'), ''].join('\0'), stderr: '' });
  const reads = [];
  let answer;

  try {
    answer = unmergedConflicts(fakeLs, 'C:/r', {
      size: (file) => (file.endsWith('big.txt') ? 6 * 1024 * 1024 : 10),
      read: (file) => {
        reads.push(path.basename(file));

        if (file.endsWith('gone.txt')) throw new Error('ENOENT');

        return FULL;
      }
    });
  } catch (error) {
    answer = { conflicts: [], thrown: error instanceof Error ? error.message : String(error) };
  }

  report(answer.thrown === undefined, `unmergedConflicts: an unreadable file does not abort the scan${answer.thrown === undefined ? '' : ` (${answer.thrown})`}`);
  report(answer.conflicts.length === 1 && answer.conflicts[0].path === 'f.txt', 'unmergedConflicts: three stages of one path are one conflict; a file over 5 MB, a fixtures path and an unreadable file add none');
  report(reads.join(',') === 'f.txt,gone.txt', 'unmergedConflicts reads each path once, skipping the oversized file and the fixtures path');
  report(unmergedConflicts(() => ({ status: 128, stdout: '', stderr: 'fatal: x' }), 'C:/r').failure?.includes('git exited 128') === true, 'unmergedConflicts: a git that fails is a failure, never "clean"');
}

// --- 9. the pure parts.
{
  report(['<<<<<<<', '<<<<<<< HEAD', '=======', '>>>>>>>', '>>>>>>> x', '=======\r'].every((line) => markerKindOf(line) !== undefined), 'markerKindOf: the three kinds, with and without a label, CRLF');
  report(['<<<<<<<<', '======== ', '=======x', '>>>>>>>>', ' <<<<<<<', '======= ', '<<<<<<<HEAD', ''].every((line) => markerKindOf(line) === undefined), 'markerKindOf: eight characters, trailing text, indentation and an empty line are not markers');
  report(conflictIn(numberedLines('a\n=======\nb\n')) === undefined, 'conflictIn: one kind alone is data');
  report(conflictIn(numberedLines('a\n=======\nb\n>>>>>>> x\n'))?.line === 2, 'conflictIn: two kinds are a conflict, at the first marker line');
  report(isFixturePath('a/fixtures/b.txt') && isFixturePath('a/__fixtures__/b.txt') && isFixturePath('selftest-fixtures/b.txt') && !isFixturePath('fixtures') && !isFixturePath('a/fixtures.txt') && !isFixturePath('src/app/b.txt'), 'isFixturePath: a folder segment, never a file name');

  const patch = ['diff --git a/n.txt b/n.txt', 'new file mode 100644', '--- /dev/null', '+++ b/n.txt', '@@ -0,0 +1 @@', '+n', 'diff --git a/d.txt b/d.txt', 'deleted file mode 100644', '--- a/d.txt', '+++ /dev/null', '@@ -1 +0,0 @@', '-d', 'diff --git a/x.txt b/x.txt', 'index 1..2 100644', '--- a/x.txt', '+++ b/x.txt', '@@ -1,2 +1,0 @@', '-gone', '-gone2', '@@ -5,0 +6,3 @@', '+++ twin header', '+two', '\\ No newline at end of file', '+three'].join('\n');
  const files = addedLinesByFile(patch);

  report(files.length === 2 && files[1].added.length === 3 && files[1].added[0].number === 6 && files[1].added[0].text === '++ twin header' && files[1].added[2].number === 8 && files[1].added[1].text === 'two' && files[1].added[2].text === 'three', 'addedLinesByFile: a `+++ ` body line is a line, numbers follow the hunk header, removed lines are not counted');
  report(files[0].isNew === true && files[0].path === 'n.txt' && files[1].isNew === false && files[1].path === 'x.txt', 'addedLinesByFile: `new file` marks the next file only, and a deleted file adds nothing');
}

// --- 10. the wiring, and two real processes (the stdout path and the crash path).
function runProcess(input, cwd) {
  try {
    return execFileSync('node', [path.join(HERE, 'guard.mjs')], { input, cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) } });
  } catch (error) {
    return `CRASH ${error.status}`;
  }
}

{
  const denied = runProcess(bash(markersStaged.repoDir, 'git commit -m x'), markersStaged.repoDir);
  const allowed = runProcess(bash(clean.repoDir, 'git commit -m x'), clean.repoDir);
  const garbage = runProcess('NOT JSON', clean.repoDir);

  report(denied.includes('"permissionDecision":"deny"') && denied.includes('f.txt:2'), 'a real process prints a deny that names the file and line');
  report(allowed === '' && garbage === '', 'a real process prints nothing for a clean repository and for a garbage payload');
}

try {
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const tools = String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|');
  const manifest = JSON.parse(readFileSync(path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-shell.json'), 'utf8'));

  for (const tool of tools) report(dialectOfTool(tool) !== undefined, `the registration names ${tool}, which the decision knows a dialect for`);
  report(tools.length === 2 && manifest.guards.includes('../../conflict-marker-guard/guard.mjs'), 'the PreToolUse shell manifest lists this guard');
  report(classify('conflict-marker-guard', 'journal.jsonl').kind === ARCHIVE, 'the journal has a rotation rule');
} catch (error) {
  report(false, `the wiring is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
