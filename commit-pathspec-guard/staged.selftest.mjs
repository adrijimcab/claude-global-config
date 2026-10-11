#!/usr/bin/env node
/**
 * Self-test for committing exactly what is staged (`staged-set.mjs` decisions and `commit-staged.mjs`
 * sequence), against CONSTRUCTED git repositories: real `git`, a real index, a real commit, never one of
 * the declared backup repos.
 *
 * THE STATE SPACE, from what a shared index can hold at the moment of commit:
 *   - staged set EQUALS the declaration (allow), including the case that motivated the tool: a file whose
 *     staged hunk is mine and whose other hunk is unstaged, which must leave the unstaged hunk alone;
 *   - staged set LARGER than the declaration (another actor's path) -> refuse, index untouched;
 *   - staged set SMALLER (a declared path not staged), nothing staged, nothing declared -> refuse;
 *   - spelling: `./x` and backslashes equal git's forward-slash name;
 *   - forwarded commit arguments: only a message; `-a`, `--only`, `--amend`, a pathspec, a clustered `-am`
 *     are refused;
 *   - measurement failures: a failed index listing is not an empty index;
 *   - the RACE: a path staged by another actor between the check and the commit -> the commit exists and
 *     the tool exits non-zero naming it;
 *   - the CLI: no arguments, an unknown repo, and that IMPORTING the module commits nothing.
 *
 * @es Auto-test de commitear exactamente lo que está en stage, contra repositorios git CONSTRUIDOS: git de
 * verdad, índice de verdad, commit de verdad, nunca uno de los repos de respaldo declarados. Espacio de
 * estados: índice igual a la declaración (incluido el hunk propio con el otro sin stage), mayor, menor, sin
 * nada en stage, sin nada declarado, grafías de ruta, argumentos reenviables, fallo de medición, la CARRERA
 * y el CLI.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { commitStaged } from './commit-staged.mjs';
import { commitArgumentsProblem, compareStagedSet, normalizeRepoPath, parseCommitStagedArguments } from './staged-set.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
  }
}

const sandbox = mkdtempSync(join(tmpdir(), 'commit-staged-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(sandbox, { recursive: true, force: true }));

/** Runs git in `directory` with a fixed identity; returns `{ ok, stdout, stderr }`, never throws. @es Ejecuta git con identidad fija. */
function gitResult(directory, args, input) {
  const result = spawnSync('git', ['-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', '-C', directory, ...args], { encoding: 'utf8', input });

  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const gitOut = (directory, ...args) => execFileSync('git', ['-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', '-C', directory, ...args], { encoding: 'utf8' });

const TEN_LINES = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);
const withLine = (lines, index, text) => lines.map((line, at) => (at === index ? text : line));
const asFile = (lines) => `${lines.join('\n')}\n`;

/** A constructed repository with three committed files. @es Un repositorio construido con tres ficheros commiteados. */
function buildRepository(label) {
  const directory = join(sandbox, label);

  mkdirSync(join(directory, 'sub'), { recursive: true });
  gitOut(directory, 'init', '-q', '-b', 'main');
  writeFileSync(join(directory, 'a.txt'), asFile(TEN_LINES), 'utf8');
  writeFileSync(join(directory, 'b.txt'), 'b\n', 'utf8');
  writeFileSync(join(directory, 'sub', 'd.txt'), 'd\n', 'utf8');
  gitOut(directory, 'add', '-A');
  gitOut(directory, 'commit', '-q', '-m', 'chore: fixture');

  return { directory, repo: { name: `fixture-${label}`, run: (args) => gitResult(directory, args) } };
}

/** Stages `content` for `file` WITHOUT touching the worktree copy. @es Pone `content` en stage sin tocar el árbol de trabajo. */
function stageContent(directory, file, content) {
  const written = gitResult(directory, ['hash-object', '-w', '--stdin'], content);

  gitOut(directory, 'update-index', '--cacheinfo', `100644,${written.stdout.trim()},${file}`);
}

const headSubject = (directory) => gitOut(directory, 'log', '-1', '--format=%s').trim();
const commitCount = (directory) => Number(gitOut(directory, 'rev-list', '--count', 'HEAD').trim());
const stagedNames = (directory) => gitOut(directory, 'diff', '--cached', '--name-only').split('\n').filter(Boolean);
const unstagedNames = (directory) => gitOut(directory, 'diff', '--name-only').split('\n').filter(Boolean);
const committedNames = (directory) => gitOut(directory, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean);

const MESSAGE = ['-m', 'feat(x): staged hunk'];

console.log('1. the pure decisions');

check('1.1 a path is normalized: backslashes and a leading ./', normalizeRepoPath('.\\sub\\d.txt') === 'sub/d.txt' && normalizeRepoPath('./a.txt') === 'a.txt');
check('1.2 equal sets compare ok, order and repeats irrelevant', compareStagedSet(['b', 'a', 'a'], ['a', 'b']).ok === true);
check('1.3 an undeclared staged path is refused and named', (() => { const result = compareStagedSet(['a', 'other'], ['a']); return result.ok === false && result.unexpected.join() === 'other' && result.reason?.includes('other'); })());
check('1.4 a declared path that is not staged is refused and named', (() => { const result = compareStagedSet(['a'], ['a', 'gone']); return result.ok === false && result.missing.join() === 'gone'; })());
check('1.5 an EMPTY index is refused (nothing to commit), for its own reason', (() => { const result = compareStagedSet([], ['a']); return result.ok === false && result.reason?.includes('nothing is staged'); })());
check('1.6 a FAILED listing is not an empty index', (() => { const result = compareStagedSet(undefined, ['a']); return result.ok === false && result.reason?.includes('could not be measured'); })());
check('1.7 every refusal carries both languages', [compareStagedSet(['a', 'x'], ['a']), compareStagedSet([], ['a']), compareStagedSet(undefined, ['a'])].every((result) => result.reason?.includes('@es')));

check('1.8 argv: --repo plus --expect paths and the commit arguments after --', (() => { const parsed = parseCommitStagedArguments(['--repo', 'r', '--expect', 'a', '--expect', './b', '--', '-m', 'msg']); return parsed.repoName === 'r' && parsed.expected.join() === 'a,b' && parsed.commitArguments.join() === '-m,msg'; })());
check('1.9 argv: nothing declared is refused (it is the bare commit)', parseCommitStagedArguments(['--repo', 'r', '--', '-m', 'msg']).problem !== undefined);
check('1.10 argv: no repo is refused', parseCommitStagedArguments(['--expect', 'a', '--', '-m', 'msg']).problem !== undefined);
check('1.11 argv: an unknown option is refused', parseCommitStagedArguments(['--repo', 'r', '--expect', 'a', '--force', 'x']).problem !== undefined);
check('1.12 argv: an option with no value is refused, including when the next word is another option', parseCommitStagedArguments(['--repo']).problem !== undefined && parseCommitStagedArguments(['--repo', '--expect', '--expect', 'a', '--', '-m', 'x']).problem !== undefined);

check('1.13 a message is forwardable in every spelling', [['-m', 'x'], ['--message', 'x'], ['--message=x'], ['-F', 'f'], ['--file=f']].every((args) => commitArgumentsProblem(args) === undefined));
check('1.14 -a and --all are refused (they sweep the worktree)', ['-a', '--all'].every((flag) => commitArgumentsProblem(['-m', 'x', flag]) !== undefined));
check('1.15 --only, -o, -i, --include are refused (they commit worktree content)', ['--only', '-o', '-i', '--include'].every((flag) => commitArgumentsProblem(['-m', 'x', flag]) !== undefined));
check('1.16 --amend is refused', commitArgumentsProblem(['-m', 'x', '--amend']) !== undefined);
check('1.17 a pathspec after -- is refused', commitArgumentsProblem(['-m', 'x', '--', 'a.txt']) !== undefined);
check('1.18 a clustered -am is refused rather than parsed for a hidden a', commitArgumentsProblem(['-am', 'x']) !== undefined);
check('1.19 no message at all is refused, and so is a flag that is not a message', commitArgumentsProblem([]) !== undefined && commitArgumentsProblem(['--no-verify']) !== undefined);
check('1.20 -m with no value is refused', commitArgumentsProblem(['-m']) !== undefined);

console.log('2. the sequence, against constructed repositories');

// THE MOTIVATING CASE: a.txt holds a STAGED hunk (line 2) and an UNSTAGED hunk (line 9) of another session.
const stagedHunk = asFile(withLine(TEN_LINES, 1, 'line 2 (mine, staged)'));
const bothHunks = asFile(withLine(withLine(TEN_LINES, 1, 'line 2 (mine, staged)'), 8, 'line 9 (theirs, unstaged)'));
const motivating = buildRepository('motivating');

writeFileSync(join(motivating.directory, 'a.txt'), bothHunks, 'utf8');
stageContent(motivating.directory, 'a.txt', stagedHunk);

const before = commitCount(motivating.directory);
const committedHunk = commitStaged({ repo: motivating.repo, expected: ['a.txt'], commitArguments: MESSAGE });

check('2.1 staged == declared -> exit 0 and the commit exists', committedHunk.status === 0 && committedHunk.committed === true && commitCount(motivating.directory) === before + 1);
check('2.2 the commit holds exactly the declared path', committedNames(motivating.directory).join() === 'a.txt');
check('2.3 the commit holds the STAGED hunk only', gitOut(motivating.directory, 'show', 'HEAD:a.txt') === stagedHunk);
check('2.4 the other session\'s UNSTAGED hunk is still in the worktree, still unstaged', unstagedNames(motivating.directory).join() === 'a.txt' && stagedNames(motivating.directory).length === 0);
check('2.5 `commit -- a.txt` would have committed the worktree content, which is why this tool exists', (() => {
  const control = buildRepository('control');

  writeFileSync(join(control.directory, 'a.txt'), bothHunks, 'utf8');
  stageContent(control.directory, 'a.txt', stagedHunk);
  gitOut(control.directory, 'commit', '-q', '-m', 'control', '--', 'a.txt');

  return gitOut(control.directory, 'show', 'HEAD:a.txt') === bothHunks;
})());

// ANOTHER ACTOR'S path staged beside mine.
const larger = buildRepository('larger');

writeFileSync(join(larger.directory, 'a.txt'), stagedHunk, 'utf8');
writeFileSync(join(larger.directory, 'b.txt'), 'b changed by someone else\n', 'utf8');
gitOut(larger.directory, 'add', 'a.txt', 'b.txt');

const refusedLarger = commitStaged({ repo: larger.repo, expected: ['a.txt'], commitArguments: MESSAGE });

check('2.6 staged LARGER than declared -> refused, nothing committed', refusedLarger.status === 1 && refusedLarger.committed === false && commitCount(larger.directory) === 1);
check('2.7 the refusal names the undeclared path and is bilingual', refusedLarger.message?.includes('b.txt') && refusedLarger.message?.includes('@es'));
check('2.8 the index is untouched by the refusal (both paths still staged)', stagedNames(larger.directory).join() === 'a.txt,b.txt');

// A declared path that is not staged.
const smaller = buildRepository('smaller');

writeFileSync(join(smaller.directory, 'a.txt'), stagedHunk, 'utf8');
gitOut(smaller.directory, 'add', 'a.txt');

const refusedSmaller = commitStaged({ repo: smaller.repo, expected: ['a.txt', 'b.txt'], commitArguments: MESSAGE });

check('2.9 staged SMALLER than declared -> refused, nothing committed', refusedSmaller.status === 1 && refusedSmaller.committed === false && commitCount(smaller.directory) === 1);
check('2.10 the refusal names the missing path', refusedSmaller.message?.includes('b.txt'));

const empty = buildRepository('empty');
const refusedEmpty = commitStaged({ repo: empty.repo, expected: ['a.txt'], commitArguments: MESSAGE });

check('2.11 nothing staged -> refused, nothing committed', refusedEmpty.status === 1 && refusedEmpty.committed === false && commitCount(empty.directory) === 1);

// Spelling of the declaration.
const spelled = buildRepository('spelled');

writeFileSync(join(spelled.directory, 'sub', 'd.txt'), 'd changed\n', 'utf8');
gitOut(spelled.directory, 'add', 'sub/d.txt');

const acceptedSpelling = commitStaged({ repo: spelled.repo, expected: ['.\\sub\\d.txt'], commitArguments: MESSAGE });

check('2.12 a backslash / ./ spelling of a staged path equals git\'s name', acceptedSpelling.status === 0 && committedNames(spelled.directory).join() === 'sub/d.txt');

// Forwarded arguments are checked BEFORE anything is read or written.
const sweeping = buildRepository('sweeping');

writeFileSync(join(sweeping.directory, 'a.txt'), stagedHunk, 'utf8');
gitOut(sweeping.directory, 'add', 'a.txt');
writeFileSync(join(sweeping.directory, 'b.txt'), 'b changed unstaged\n', 'utf8');

const refusedAll = commitStaged({ repo: sweeping.repo, expected: ['a.txt'], commitArguments: ['-a', ...MESSAGE] });

check('2.13 `-a` is refused even though the declaration matches the index, and the unstaged file is not swept', refusedAll.status === 1 && refusedAll.committed === false && commitCount(sweeping.directory) === 1 && unstagedNames(sweeping.directory).join() === 'b.txt');

// Measurement failure: a failed index listing must not read as an empty (or clean) index.
const unmeasured = commitStaged({ repo: { name: 'broken', run: () => ({ ok: false, stdout: '', stderr: 'fatal' }) }, expected: ['a.txt'], commitArguments: MESSAGE });

check('2.14 a FAILED index listing refuses as unmeasured and commits nothing', unmeasured.status === 1 && unmeasured.committed === false && unmeasured.message?.includes('could not be measured'));

// git itself refusing the commit.
const failing = buildRepository('failing');

writeFileSync(join(failing.directory, 'a.txt'), stagedHunk, 'utf8');
gitOut(failing.directory, 'add', 'a.txt');

const refusedByGit = commitStaged({ repo: failing.repo, expected: ['a.txt'], commitArguments: ['-m', ''] });

check('2.15 a commit git itself refuses (empty message) reports failure and leaves the index staged', refusedByGit.status === 1 && refusedByGit.committed === false && commitCount(failing.directory) === 1 && stagedNames(failing.directory).join() === 'a.txt');

// THE RACE: another actor stages a path after the check and before the commit lands.
const racing = buildRepository('racing');

writeFileSync(join(racing.directory, 'a.txt'), stagedHunk, 'utf8');
gitOut(racing.directory, 'add', 'a.txt');

let raced = false;
const racingRepo = {
  name: 'racing',
  run: (args) => {
    if (args[0] === 'commit' && !raced) {
      raced = true;
      writeFileSync(join(racing.directory, 'b.txt'), 'staged by another actor in the gap\n', 'utf8');
      gitOut(racing.directory, 'add', 'b.txt');
    }

    return gitResult(racing.directory, args);
  }
};
const racedResult = commitStaged({ repo: racingRepo, expected: ['a.txt'], commitArguments: MESSAGE });

check('2.16 the RACE: the commit exists but the tool exits non-zero and says so', racedResult.status === 1 && racedResult.committed === true && racedResult.message?.includes('DOES NOT HOLD EXACTLY'));
check('2.17 the race message names the extra path and says nothing was pushed, in both languages', racedResult.message?.includes('b.txt') && racedResult.message?.includes('Nothing was pushed') && racedResult.message?.includes('No se hizo push'));
check('2.18 the race really did sweep the extra path (so the post-check is not vacuous)', committedNames(racing.directory).includes('b.txt'));

console.log('3. the CLI');

const cli = (...args) => spawnSync(process.execPath, [join(HERE, 'commit-staged.mjs'), ...args], { encoding: 'utf8' });
const noArguments = cli();
const unknownRepo = cli('--repo', 'not-a-declared-repo', '--expect', 'a.txt', '--', '-m', 'x');
const nothingDeclared = cli('--repo', '~/.claude', '--', '-m', 'x');

check('3.1 no arguments -> exit 1 and a bilingual refusal', noArguments.status === 1 && noArguments.stderr.includes('REFUSED') && noArguments.stderr.includes('@es'));
check('3.2 an undeclared repo name -> exit 1, naming the declared ones', unknownRepo.status === 1 && unknownRepo.stderr.includes('~/.claude') && unknownRepo.stderr.includes('b100-am-ui/.claude'));
check('3.3 a declared repo with NOTHING declared -> exit 1 (the bare commit, refused)', nothingDeclared.status === 1 && nothingDeclared.stderr.includes('declare at least one'));
// A consumer that only IMPORTS the module must not run the CLI: with no entry-point guard the CLI would
// refuse (no arguments) and exit 1 on import. @es Quien solo IMPORTA el módulo no debe ejecutar el CLI.
const importer = join(sandbox, 'import-only.mjs');

writeFileSync(importer, `import ${JSON.stringify(pathToFileURL(join(HERE, 'commit-staged.mjs')).href)};
console.log('imported');
`, 'utf8');

const imported = spawnSync(process.execPath, [importer], { encoding: 'utf8' });

check('3.4 importing the module runs nothing: no output, no refusal, exit 0', imported.status === 0 && imported.stdout.trim() === 'imported' && imported.stderr === '');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
