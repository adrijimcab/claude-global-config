#!/usr/bin/env node
/**
 * Self-test for worker-git-guard (2026-10 incidents 25, 25b, 31: workers discarded work, moved HEAD, or skipped
 * the commit hooks).
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - WHO CALLS: a subagent by `agent_id`; one known only by its transcript directory; the main session
 *     (always allowed).
 *   - WHICH FAMILY, each with a refused form and its nearest allowed form: reset, checkout/switch, restore,
 *     clean, commit `--no-verify`/`-n`, push `--no-verify`, and the plumbing forms read-tree `-u`/`--reset`,
 *     checkout-index `-f`/`-a`, update-index `--force-remove`, update-ref `-d`, symbolic-ref writes (and the
 *     read-only plumbing that stays allowed).
 *   - HOW IT IS REACHED: `git -C`, chains, `$(...)`, `bash -c`, subshell, PowerShell spellings.
 *   - DATA, not commands: echo, quoted messages, heredoc, comment, PowerShell string and here-string.
 *   - NEAR MISSES: other subcommands, `stash` (another guard), `--amend`, `-m"no"`.
 *   - THE SHAPE OF THE OUTPUT and the shim.
 *
 * @es Auto-test del worker-git-guard. Estados: quién llama, cada familia con su forma rechazada y la más
 * cercana permitida, cómo se alcanza, lo que es DATO, casi-aciertos y la forma de la salida.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { isolateState } from '../hook-state/locations.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';
import { GIT_TIMEOUT_MS, listUntracked, untrackedUnderCommits } from './untracked-pathspec.mjs';

// The guard journals what it could not check; a selftest must never write the live journal. @es El guard anota lo que no pudo comprobar; un selftest nunca escribe el journal vivo.
const STATE_ROOT = isolateState('worker-git-guard');

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard.mjs');
const CWD = realpathSync.native(os.tmpdir());

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

/** A subagent payload. @es Un payload de subagente. */
const asSubagent = (tool, command) => ({ ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd: CWD });

/** A main-session payload. @es Un payload de sesión principal. */
function asMain(tool, command) {
  const { agent_id: _agentId, agent_type: _agentType, ...rest } = asSubagent(tool, command);

  return rest;
}

/** A subagent known only by its transcript directory. @es Un subagente conocido solo por su transcript. */
const asTranscriptOnlySubagent = (tool, command) => ({ ...asMain(tool, command), transcript_path: 'C:/Users/x/.claude/projects/p/s1/subagents/agent-abc.jsonl' });

const verdictOf = (payload) => evaluate(JSON.stringify(payload))?.hookSpecificOutput?.permissionDecision;

function expect(verdict, payload, label) {
  const actual = verdictOf(payload);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

const denied = (command) => expect('deny', asSubagent('Bash', command), command);
const allowed = (command) => expect('allow', asSubagent('Bash', command), command);

// --- WHO CALLS ----------------------------------------------------------------------------------
expect('deny', asSubagent('Bash', 'git reset --soft HEAD~1'), 'subagent by agent_id');
expect('deny', asTranscriptOnlySubagent('Bash', 'git reset --soft HEAD~1'), 'subagent known only by its transcript directory');
expect('allow', asMain('Bash', 'git reset --soft HEAD~1'), 'main session, reset');
expect('allow', asMain('Bash', 'git checkout -- a.txt'), 'main session, checkout');
expect('allow', asMain('PowerShell', 'git commit --no-verify -m x'), 'main session, PowerShell no-verify');
expect('allow', asMain('Bash', 'git push --no-verify'), 'main session, push no-verify');

// --- FAMILY 1: reset ----------------------------------------------------------------------------
for (const form of ['git reset', 'git reset -q', 'git reset --soft abc123', 'git reset --hard', 'git reset --mixed HEAD~2', 'git reset -- a.txt']) denied(form);
allowed('git restore --staged -- a.txt');

// --- FAMILY 2: checkout and switch --------------------------------------------------------------
for (const form of ['git checkout -- a.txt', 'git checkout main', 'git checkout -b other', 'git checkout .', 'git switch main', 'git switch -c other']) denied(form);
allowed('git status');
allowed('git branch --show-current');

// --- FAMILY 3: restore --------------------------------------------------------------------------
for (const form of ['git restore -- x', 'git restore x', 'git restore .', 'git restore --worktree x', 'git restore -W x', 'git restore --staged --worktree x', 'git restore -SW x', 'git restore --source=HEAD~1 x', 'git restore -s HEAD x']) denied(form);
for (const form of ['git restore --staged x', 'git restore --staged -- a b', 'git restore -S x', 'git restore --staged .']) allowed(form);

// --- FAMILY 4: clean ----------------------------------------------------------------------------
for (const form of ['git clean -f', 'git clean -fd', 'git clean -xdf', 'git clean --force', 'git clean -df -e keep', 'git clean -nf']) denied(form);
for (const form of ['git clean -n', 'git clean --dry-run', 'git clean -nd', 'git clean -e foo -n', 'git clean -e f', 'git clean -n -e -f']) allowed(form);

// --- FAMILY 5: commit --no-verify / -n ----------------------------------------------------------
for (const form of ['git commit --no-verify -m x', 'git commit -n -m x', 'git commit -nm x', 'git commit -anm x', 'git commit -q --no-verify -m "wip: x"', 'git commit -m x --no-verify', 'git commit -m x -n', 'git commit --no-verif -m x', 'git commit --no-v -m x']) denied(form);
for (const form of ['git commit -m "no-verify words" -- p.txt', 'git commit -m"no" -- p.txt', 'git commit -m -n -- p.txt', 'git commit --amend -m x -- p.txt', 'git commit -m x -- a.txt', 'git commit -m x -- a.txt -n', 'git commit -F msg.txt -- p.txt', 'git commit -Fn -- p.txt', 'git commit -C HEAD -- p.txt', 'git commit --message --no-verify -- p.txt', 'git commit --no-edit -- p.txt', 'git commit --no- -m x -- p.txt', 'git commit -m "-n" -- p.txt']) allowed(form);

// --- FAMILY 12: commit must name its paths after -- (Discovery -11 report: a rejected commit left files staged,
// the next commit swept them in under the wrong message, twice) -----------------------------------
for (const form of ['git add a b && git commit -m x', 'git commit -m x', 'git commit -am x', 'git commit -a -m x', 'git commit --all -m x', 'git commit -m x --all', 'git commit -F msg.txt', 'git commit --amend --no-edit', 'git commit -m x --', 'git commit -m x a.txt', 'git commit -m x -o a.txt', 'git commit -qam x', 'git commit -aF msg.txt -- a.txt', 'git commit -m "-a"', 'git commit --d -m x', 'git commit --all -m x -- a', 'git commit -a -m x -- a', 'git commit --no-verify -m x -- a', 'git commit -n -m x -- a']) denied(form);
for (const form of ['git commit -m "<msg>" -- a b', 'git commit -m x -- a.txt', 'git commit -F msg.txt -- a.txt b.txt', 'git commit -q -m x -- a', 'git commit -m x -- --all', 'git commit -m x --only -- a', 'git commit --allow-empty -m x -- a','git commit --dry-run', 'git commit -m x --dry-run', 'git commit --dry-run -a', 'git commit --dr -m x', 'git commit -m "-a" -- p.txt', 'git commit -m x -- a.txt -a', 'git commit -m x -- a.txt --all']) allowed(form);
expect('deny', asSubagent('PowerShell', 'git add a; git commit -m x'), 'PowerShell, commit without paths');
expect('deny', asSubagent('PowerShell', 'git.exe commit -am "x"'), 'PowerShell, -am');
expect('allow', asSubagent('PowerShell', 'git commit -m "x" -- a b'), 'PowerShell, commit with paths');
expect('allow', asMain('Bash', 'git commit -am x'), 'main session, commit -am');
expect('allow', asMain('PowerShell', 'git commit -m x'), 'main session, commit without paths');
denied('git -C C:/some/worktree commit -m x');
denied('GIT_AUTHOR_NAME=x git commit -m x');
denied('env X=1 git commit -am x');
denied('bash -c "git commit -m x"');
denied('echo $(git commit -am x)');
denied('(cd sub && git commit -m x)');
denied('git status | cat; git commit -m x');
allowed('git -C C:/some/worktree commit -m x -- a');
allowed('bash -c "git commit -m x -- a"');
allowed('echo git commit -am x');

// --- FAMILY 6: push --no-verify -----------------------------------------------------------------
for (const form of ['git push --no-verify', 'git push origin main --no-verify', 'git push --no-verify https://example.invalid/r.git', 'git push --no-verif']) denied(form);
for (const form of ['git push', 'git push origin main', 'git push -n', 'git push --dry-run', 'git push origin feat/no-verify']) allowed(form);

// --- FAMILY 7: read-tree that writes the tree or discards the index (b100 report) ----------------
for (const form of ['git read-tree --reset -u HEAD', 'git read-tree -u HEAD', 'git read-tree -m -u HEAD', 'git read-tree -mu HEAD', 'git read-tree -um HEAD', 'git read-tree --reset HEAD', 'git read-tree --res HEAD', 'git read-tree --prefix sub/ -u HEAD', 'git read-tree -u -- HEAD']) denied(form);
for (const form of ['git read-tree HEAD', 'git read-tree -m HEAD', 'git read-tree --empty', 'git read-tree --prefix=sub/ HEAD', 'git read-tree --prefix -u HEAD', 'git read-tree --index-output /tmp/i HEAD', 'git read-tree --index-output -u HEAD', 'git read-tree --exclude-per-directory -u HEAD','git read-tree --re HEAD', 'GIT_INDEX_FILE=/tmp/idx git read-tree HEAD']) allowed(form);

// --- FAMILY 8: checkout-index that overwrites files ---------------------------------------------
for (const form of ['git checkout-index -f a.txt', 'git checkout-index --force a.txt', 'git checkout-index -a', 'git checkout-index --all', 'git checkout-index -fa', 'git checkout-index -qaf', 'git checkout-index --fo a', 'git checkout-index --al', 'git checkout-index -u -a']) denied(form);
for (const form of ['git checkout-index a.txt', 'git checkout-index -q a.txt', 'git checkout-index --prefix out/ a.txt', 'git checkout-index --prefix -f a.txt', 'git checkout-index --stage -a a.txt', 'git checkout-index --no-create a.txt', 'git checkout-index -- -f', 'git checkout-index --temp a.txt']) allowed(form);

// --- FAMILY 9: update-index --force-remove ------------------------------------------------------
for (const form of ['git update-index --force-remove a.txt', 'git update-index --force-r a.txt', 'git update-index --add --force-remove a.txt']) denied(form);
for (const form of ['git update-index --refresh', 'git update-index --really-refresh', 'git update-index --add a.txt', 'git update-index --remove a.txt', 'git update-index --cacheinfo 100644,abc,a.txt', 'git update-index --force-write-index', 'git update-index --force-untracked-cache', 'git update-index --no-force-remove a', 'git update-index --force-w', 'git update-index --force-']) allowed(form);

// --- FAMILY 10: update-ref -d -------------------------------------------------------------------
for (const form of ['git update-ref -d refs/heads/x', 'git update-ref -d refs/heads/x abc', 'git update-ref -m why -d refs/heads/x', 'git update-ref -dm why refs/heads/x', 'git update-ref --no-deref -d HEAD', 'git update-ref refs/heads/x abc', 'git update-ref HEAD abc', 'git update-ref -m why refs/heads/x abc', 'git update-ref -m -d refs/heads/x abc', 'git update-ref refs/heads/x abc old', 'git update-ref refs/heads/x -- -d', 'git update-ref -- refs/heads/x abc', 'git update-ref --stdin', 'git update-ref --stdin -z', 'git update-ref --std', 'git update-ref -z --stdin --batch-updates']) denied(form);
for (const form of ['git update-ref -h', 'git update-ref -m why refs/heads/x', 'git update-ref -m -d refs/heads/x', 'git update-ref --no-stdin', 'git update-ref --create-reflog', 'git update-ref', 'git update-index --index-info', 'git rev-parse refs/heads/x']) allowed(form);

// --- FAMILY 11: symbolic-ref that repoints or deletes -------------------------------------------
for (const form of ['git symbolic-ref HEAD refs/heads/other', 'git symbolic-ref -m why HEAD refs/heads/other', 'git symbolic-ref -d HEAD', 'git symbolic-ref --delete HEAD', 'git symbolic-ref --del HEAD', 'git symbolic-ref -q -d refs/remotes/origin/HEAD', 'git symbolic-ref -- HEAD refs/heads/other']) denied(form);
for (const form of ['git symbolic-ref HEAD', 'git symbolic-ref --short HEAD', 'git symbolic-ref -q HEAD', 'git symbolic-ref -m HEAD', 'git symbolic-ref -m why HEAD', 'git symbolic-ref --no-recurse HEAD', 'git symbolic-ref -- HEAD']) allowed(form);

// --- Read-only plumbing stays allowed -----------------------------------------------------------
for (const form of ['git ls-files', 'git cat-file -p HEAD', 'git rev-parse HEAD', 'git ls-tree HEAD', 'git diff-index HEAD', 'git diff-index --cached HEAD', 'git update-index --refresh -q']) allowed(form);

// --- Plumbing reached the same ways as porcelain ------------------------------------------------
denied('git -C C:/some/worktree read-tree --reset -u HEAD');
denied('git -c core.x=1 checkout-index -fa');
denied('GIT_INDEX_FILE=/tmp/i git read-tree -u HEAD');
denied('env GIT_DIR=x git update-ref -d refs/heads/y');
denied('git status && git read-tree --reset -u HEAD');
denied('bash -c "git read-tree --reset -u HEAD"');
denied('echo $(git symbolic-ref HEAD refs/heads/z)');
expect('deny', asSubagent('PowerShell', 'git read-tree --reset -u HEAD'), 'PowerShell, read-tree');
expect('deny', asSubagent('PowerShell', 'git -C C:\\wt checkout-index -a'), 'PowerShell, -C path');
expect('deny', asSubagent('PowerShell', '$env:GIT_INDEX_FILE="x"; git.exe update-index --force-remove a'), 'PowerShell, env then git.exe');
expect('deny', asSubagent('PowerShell', '& git update-ref -d refs/heads/x'), 'PowerShell, call operator');
expect('deny', asSubagent('PowerShell', "git read-tree '--reset' -u HEAD"), 'PowerShell, single-quoted option');
expect('allow', asSubagent('PowerShell', 'git read-tree HEAD'), 'PowerShell, bare read-tree');
expect('allow', asMain('Bash', 'git read-tree --reset -u HEAD'), 'main session, read-tree');
denied('git read-tree "--reset" -u HEAD');
denied("git read-tree '--reset' -u HEAD");
allowed('echo git read-tree --reset -u HEAD');
allowed('git commit -m "git read-tree --reset -u HEAD" -- p.txt');

// --- OUT OF SCOPE (measured incidents only) -----------------------------------------------------
for (const form of ['git stash', 'git rebase main', 'git cherry-pick abc', 'git log', 'git add -A', 'git fetch --all', 'git branch -D x', 'git worktree list']) allowed(form);

// --- HOW IT IS REACHED --------------------------------------------------------------------------
denied('git -C C:/some/worktree reset --soft HEAD~1');
denied('git -c user.name=x checkout main');
denied('git add -A && git reset -q');
denied('git status; git clean -fd');
denied('git status || git restore x');
denied('echo $(git reset)');
denied('bash -c "git commit --no-verify -m x"');
denied('(cd sub && git checkout -- a)');
denied('git status | cat; git push --no-verify');
expect('deny', asSubagent('PowerShell', 'git reset'), 'PowerShell, bare reset');
expect('deny', asSubagent('PowerShell', 'git status; git checkout -- a.txt'), 'PowerShell, after ;');
expect('deny', asSubagent('PowerShell', '& git clean -fd'), 'PowerShell, call operator');
expect('deny', asSubagent('PowerShell', 'git.exe commit --no-verify -m x'), 'PowerShell, git.exe');
expect('deny', asSubagent('PowerShell', 'git commit -nm "x"'), 'PowerShell, -nm cluster');
expect('allow', asSubagent('PowerShell', 'git restore --staged x'), 'PowerShell, restore --staged');

// --- DATA, NOT COMMANDS -------------------------------------------------------------------------
allowed('echo git reset --hard');
allowed('git commit -m "never git reset or git checkout -- x or --no-verify" -- p.txt');
allowed("git commit -m 'git clean -fd' -- p.txt");
allowed('cat <<EOF\ngit reset --hard\ngit commit --no-verify\nEOF');
allowed('git status # git checkout main');
expect('allow', asSubagent('PowerShell', 'Write-Output "git reset --hard"'), 'PowerShell string');
expect('allow', asSubagent('PowerShell', "@'\ngit push --no-verify\n'@ | Out-Null"), 'PowerShell here-string');
allowed('ls reset');

// --- THE SHAPE OF THE OUTPUT --------------------------------------------------------------------
const reasonOf = (command) => evaluate(JSON.stringify(asSubagent('Bash', command)))?.hookSpecificOutput?.permissionDecisionReason ?? '';
const refusal = evaluate(JSON.stringify(asSubagent('Bash', 'git reset -q')));
const text = reasonOf('git reset -q');

check('refusal event is PreToolUse', refusal?.hookSpecificOutput?.hookEventName === 'PreToolUse');
check('refusal is bilingual: English then " @es " Spanish', text.includes('REFUSED') && text.includes('  @es ') && text.indexOf('REFUSED') < text.indexOf('@es'));
check('refusal keeps the Spanish accents', text.includes('RECHAZÓ') && text.includes('POR QUÉ'));
check('refusal names the offending command', reasonOf('git reset --soft zz-unique-marker').includes('git reset --soft zz-unique-marker'));
check('reset refusal names the alternative restore --staged in both halves', text.slice(0, text.indexOf('  @es ')).includes('git restore --staged') && text.slice(text.indexOf('  @es ')).includes('git restore --staged'));
check('checkout refusal says the orchestrator owns branches', reasonOf('git checkout main').includes('orchestrator'));
check('restore refusal names the allowed --staged form', reasonOf('git restore x').includes('--staged'));
check('clean refusal names the dry run', reasonOf('git clean -fd').includes('--dry-run'));
check('commit refusal names commitlint and the pre-commit hook', reasonOf('git commit -nm x').includes('commitlint') && reasonOf('git commit -nm x').includes('pre-commit'));
check('push refusal names the pre-push hook', reasonOf('git push --no-verify').includes('pre-push'));

check('read-tree refusal names the safe route in both halves', ['git read-tree -u HEAD'].every((c) => { const t = reasonOf(c); return t.includes('commit your work in progress') && t.includes('commiteá tu trabajo a medias') && t.includes('GIT_INDEX_FILE'); }));
check('checkout-index refusal names the safe route', reasonOf('git checkout-index -f a').includes('commit your work in progress'));
check('update-index refusal names the safe route', reasonOf('git update-index --force-remove a').includes('commit your work in progress'));
check('update-ref refusal says to commit or ask the orchestrator, and names rev-parse for reads', reasonOf('git update-ref -d refs/heads/x').includes('ask the orchestrator') && reasonOf('git update-ref -d refs/heads/x').includes('git rev-parse <ref>') && reasonOf('git update-ref -d refs/heads/x').includes('pedile al orquestador'));
check('symbolic-ref refusal names the allowed read', reasonOf('git symbolic-ref HEAD refs/heads/x').includes('--short HEAD') && reasonOf('git symbolic-ref HEAD refs/heads/x').includes('orchestrator creates the branches'));

const noPathsReason = reasonOf('git add a b && git commit -m x');

check('commit-without-paths refusal shows the safe form in both halves', noPathsReason.includes('git commit -m "<msg>" -- <path> <path>') && noPathsReason.includes('git commit -m "<msg>" -- <ruta> <ruta>'));
check('commit-without-paths refusal says to run git status --porcelain after a rejected commit, in both halves', noPathsReason.split('git status --porcelain').length === 3);
check('commit-without-paths refusal names the staged sweep and -a', noPathsReason.includes('staged') && noPathsReason.includes('-a'));
check('the no-verify refusal still wins over the paths rule', reasonOf('git commit -nm x').includes('commitlint'));

const headlines = ['git reset', 'git checkout main', 'git restore x', 'git clean -f', 'git commit -n', 'git push --no-verify', 'git read-tree -u HEAD', 'git checkout-index -f a', 'git update-index --force-remove a', 'git update-ref -d r', 'git symbolic-ref HEAD r', 'git commit -m x'].map((command) => reasonOf(command).split('\n')[2]);

check('each family has its own text', new Set(headlines).size === 12, headlines.join(' | '));
check('the first offending invocation is the one named', reasonOf('git reset -q && git clean -fd').includes('git reset -q') && !reasonOf('git reset -q && git clean -fd').split('\n')[0].includes('git clean'));

/** The verdict when the decision throws; a throw that escapes is a failed check. @es El veredicto cuando la decisión lanza. */
function verdictWhenDecisionThrows() {
  try {
    return evaluate(JSON.stringify(asSubagent('Bash', 'git reset')), () => { throw new Error('boom'); });
  } catch (error) {
    return { escaped: error.message };
  }
}

check('an internal failure of the decision fails open', verdictWhenDecisionThrows() === undefined);
check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));
check("a non-shell tool is not this guard's business", verdictOf({ ...asSubagent('Bash', 'git reset'), tool_name: 'Read' }) === undefined);
check('a payload with no command passes', verdictOf({ ...asSubagent('Bash', 'x'), tool_input: {} }) === undefined);
check('malformed JSON passes (fails open)', evaluate('{not json') === undefined);

// --- FAMILY 13: a commit whose pathspec covers an UNTRACKED file (Discovery report: 26b7227b imported a file
// that landed only in 0235cc85; `git commit -- <dir>` silently leaves out an untracked file under <dir>) ------
const SCRATCH = mkdtempSync(path.join(realpathSync.native(os.tmpdir()), 'wgg-untracked-'));

process.once('exit', () => rmSync(SCRATCH, { recursive: true, force: true }));

/** Runs git in `directory` for the fixture, never through a shell. @es Corre git en `directory` para el fixture, sin shell. */
function git(directory, ...args) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });

  if (result.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${result.stderr}`);
}

/** A file written under `repo`, its folders created. @es Un fichero escrito bajo `repo`, con sus carpetas. */
function put(repo, relative, content = 'x\n') {
  mkdirSync(path.dirname(path.join(repo, relative)), { recursive: true });
  writeFileSync(path.join(repo, relative), content);
}

const REPO = path.join(SCRATCH, 'repo');
const NOT_A_REPO = path.join(SCRATCH, 'plain');

mkdirSync(REPO);
mkdirSync(NOT_A_REPO);
git(REPO, 'init', '-q');
git(REPO, 'config', 'user.email', 'selftest@example.invalid');
git(REPO, 'config', 'user.name', 'selftest');
put(REPO, '.gitignore', '*.log\n');
put(REPO, 'mixed/old.txt');
put(REPO, 'clean/tracked.txt');
put(REPO, 'ignoring/tracked.txt');
git(REPO, 'add', '--', '.gitignore', 'mixed/old.txt', 'clean/tracked.txt', 'ignoring/tracked.txt');
git(REPO, 'commit', '-q', '-m', 'init', '--no-verify');
put(REPO, 'mixed/new.txt');
put(REPO, 'ignoring/noise.log');
put(REPO, 'solo.txt');
for (let number = 1; number <= 12; number += 1) put(REPO, `many/f${String(number).padStart(2, '0')}.txt`);

/** A subagent payload that runs in `cwd`. @es Un payload de subagente que corre en `cwd`. */
const inDirectory = (tool, command, cwd) => ({ ...asSubagent(tool, command), cwd });
const untrackedReason = (command, cwd = REPO, tool = 'Bash') => evaluate(JSON.stringify(inDirectory(tool, command, cwd)))?.hookSpecificOutput?.permissionDecisionReason ?? '';
const untrackedVerdict = (command, cwd = REPO, tool = 'Bash') => verdictOf(inDirectory(tool, command, cwd));
const journalLines = () => {
  try {
    return readFileSync(path.join(STATE_ROOT, 'worker-git-guard', 'unchecked.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
};

check('a directory pathspec over an untracked file is refused', untrackedVerdict('git commit -m x -- mixed') === 'deny');
check('the refusal lists the untracked path and says to git add it first, in both halves', (() => { const text = untrackedReason('git commit -m x -- mixed'); const english = text.slice(0, text.indexOf('  @es ')); const spanish = text.slice(text.indexOf('  @es ')); return english.includes('mixed/new.txt') && english.includes('git add -- mixed/new.txt') && spanish.includes('mixed/new.txt') && spanish.includes('git add -- mixed/new.txt') && text.includes('REFUSED') && text.includes('RECHAZÓ'); })());
check('the refusal also offers naming the files precisely', untrackedReason('git commit -m x -- mixed').includes('name'));
check('the refusal does not list the tracked file', !untrackedReason('git commit -m x -- mixed').includes('mixed/old.txt'));
check('a fully tracked directory passes', untrackedVerdict('git commit -m x -- clean') === undefined);
check('an ignored untracked file passes', untrackedVerdict('git commit -m x -- ignoring') === undefined);
check('a named untracked file is refused too', untrackedVerdict('git commit -m x -- solo.txt') === 'deny');
check('a glob pathspec over an untracked file is refused', untrackedVerdict('git commit -m x -- "mixed/*.txt"') === 'deny');
check('a second path of the pathspec is checked, not only the first', untrackedVerdict('git commit -m x -- clean mixed') === 'deny');
check('an untracked file elsewhere in the repo is not in this pathspec, so it passes', untrackedVerdict('git commit -m x -- clean/tracked.txt') === undefined);
check('PowerShell is checked too', untrackedVerdict('git commit -m "x" -- mixed', REPO, 'PowerShell') === 'deny');
check('a message that only mentions the directory is not a pathspec', untrackedVerdict('git commit -m mixed -- clean') === undefined);
check('--dry-run stages and commits nothing, so it passes', untrackedVerdict('git commit --dry-run -m x -- mixed') === undefined);
check('the main session is unaffected', verdictOf({ ...asMain('Bash', 'git commit -m x -- mixed'), cwd: REPO }) === undefined);
check('the refusal lists at most 10 paths and counts the rest', (() => { const text = untrackedReason('git commit -m x -- many'); const [english] = text.split('  @es '); return english.includes('many/f10.txt') && !english.includes('many/f11.txt') && english.includes('12 in all') && text.includes('12 en total'); })());
check('git -C resolves the repository from a directory that is not one', untrackedVerdict(`git -C "${REPO}" commit -m x -- mixed`, NOT_A_REPO) === 'deny');
check('git -C to a clean directory from a directory that is not a repo passes', untrackedVerdict(`git -C "${REPO}" commit -m x -- clean`, NOT_A_REPO) === undefined);
check('a relative git -C is resolved against the payload cwd', untrackedVerdict('git -C repo commit -m x -- mixed', SCRATCH) === 'deny');
check('a cd in the line moves where the pathspec is read', untrackedVerdict(`cd "${REPO}" && git commit -m x -- mixed`, NOT_A_REPO) === 'deny');
check('the first untracked commit of a chain is the one refused', untrackedReason(`git commit -m a -- clean && git commit -m b -- mixed`).includes('mixed/new.txt'));

const before = journalLines().length;
const outsideAnyRepo = untrackedVerdict('git commit -m x -- mixed', NOT_A_REPO);
const unchecked = journalLines().slice(before);

check('a git failure (not a repository) is allowed', outsideAnyRepo === undefined);
check('a git failure is journaled as unchecked, with the reason and the directory', unchecked.length === 1 && unchecked[0].verdict === 'unchecked' && typeof unchecked[0].reason === 'string' && unchecked[0].reason.length > 0 && unchecked[0].cwd === NOT_A_REPO, JSON.stringify(unchecked));
check('a timeout of git is a failure to check: allowed and journaled', (() => {
  const start = journalLines().length;
  const timedOut = () => ({ error: 'git ls-files timed out after 5000 ms' });
  const output = evaluate(JSON.stringify(inDirectory('Bash', 'git commit -m x -- mixed', REPO)), undefined, timedOut);

  return output === undefined && journalLines().slice(start).some((entry) => entry.verdict === 'unchecked' && entry.reason?.includes('timed out') === true);
})());
check('a runner that throws fails open, journaled', (() => {
  const start = journalLines().length;

  try {
    const output = evaluate(JSON.stringify(inDirectory('Bash', 'git commit -m x -- mixed', REPO)), undefined, () => { throw new Error('boom'); });

    return output === undefined && journalLines().slice(start).some((entry) => entry.verdict === 'unchecked' && entry.reason?.includes('boom') === true);
  } catch {
    return false; // the throw escaped the guard: it did not fail open
  }
})());
check('the journal of a miss names the directory git was asked in, not the payload cwd', (() => {
  const start = journalLines().length;

  untrackedVerdict(`git -C "${NOT_A_REPO}" commit -m x -- mixed`, REPO);

  return journalLines().slice(start).some((entry) => entry.verdict === 'unchecked' && entry.cwd === NOT_A_REPO);
})());
check('a commit the lexical rules refuse gets THEIR message even when its pathspec covers untracked files', (() => {
  const start = journalLines().length;
  const text = untrackedReason('git commit -n -m x -- mixed');

  return text.includes('commitlint') && !text.includes('untracked') && journalLines().length === start;
})());
check('the runner asks git for untracked, non-ignored files of exactly the pathspec, once, in the repository', (() => {
  const calls = [];
  const spy = (directory, pathspecs) => { calls.push({ directory, pathspecs }); return { files: [] }; };

  evaluate(JSON.stringify(inDirectory('Bash', `git -C "${REPO}" commit -m x -- clean mixed`, NOT_A_REPO)), undefined, spy);

  return calls.length === 1 && calls[0].directory === REPO && calls[0].pathspecs.join('|') === 'clean|mixed';
})());
check('a deny is not written to the unchecked journal (the dispatcher records it)', (() => {
  const start = journalLines().length;

  untrackedVerdict('git commit -m x -- many');

  return journalLines().length === start;
})());
check('a commit refused by the lexical rules never reaches git (no journal line)', (() => {
  const start = journalLines().length;

  untrackedVerdict('git commit -m x', NOT_A_REPO);

  return journalLines().length === start;
})());

put(REPO, 'spaced/a b.txt');
check('a path with whitespace is quoted in the git add the refusal proposes', untrackedReason('git commit -m x -- spaced').includes('git add -- "spaced/a b.txt"'));

// The module on its own, through its two ports (the git runner and the process runner). @es El módulo solo, por sus dos puertos.
const NO_FILES = () => ({ files: [] });
const directoriesAsked = (script, dialect = 'bash', cwd = REPO) => { const asked = []; untrackedUnderCommits(script, dialect, cwd, (directory) => { asked.push(directory); return { files: [] }; }); return asked; };

check('module: a commit with no pathspec is never sent to git (ls-files would list the whole repo)', directoriesAsked('git commit -m x').length === 0);
check('module: a line with no commit is never sent to git', directoriesAsked('git status -- mixed').length === 0);
check('module: a --dry-run is never sent to git, and neither is its abbreviation --dr', directoriesAsked('git commit --dry-run -- mixed').length === 0 && directoriesAsked('git commit --dr -- mixed').length === 0);
check('module: an option that only starts like --dry-run (--d) is not a dry run', directoriesAsked('git commit --d -- mixed').length === 1);
check('module: a path named like an option, after --, is still a pathspec to check', directoriesAsked('git commit -m x -- --dry-run').length === 1);
check('module: one git call per commit that has a pathspec', directoriesAsked('git commit -m a -- one && git commit -m b -- two').length === 2);
check('module: two -C options apply in order', directoriesAsked(`git -C "${SCRATCH}" -C repo commit -m x -- mixed`, 'bash', NOT_A_REPO).join('|') === REPO);
check('module: a directory the line moves to with an unfollowable cd is reported unchecked, git is not asked', (() => { const found = untrackedUnderCommits('cd "$SOMEWHERE" && git commit -m x -- d', 'bash', REPO, NO_FILES); return found.offender === undefined && found.unchecked.length === 1 && found.unchecked[0].reason.includes('cannot be followed') && found.unchecked[0].text.includes('git commit'); })());
check('module: an offender stops the walk; the misses before it are still reported', (() => { let call = 0; const found = untrackedUnderCommits('git commit -m a -- x && git commit -m b -- y && git commit -m c -- z', 'bash', REPO, () => { call += 1; return call === 1 ? { error: 'boom' } : { files: ['y/n.txt'] }; }); return call === 2 && found.offender?.files[0] === 'y/n.txt' && found.unchecked.length === 1 && found.unchecked[0].reason === 'boom'; })());
check('module: no untracked files and no error is a clean answer', (() => { const found = untrackedUnderCommits('git commit -m a -- x', 'bash', REPO, NO_FILES); return found.offender === undefined && found.unchecked.length === 0; })());

/** What `listUntracked` does with a process answer and which call it makes. @es Qué hace `listUntracked` con una respuesta y qué llamada hace. */
function listWith(answer) {
  const seen = {};
  const run = (command, args, options) => { seen.command = command; seen.args = args; seen.options = options; return answer; };

  return { result: listUntracked('/some/dir', ['a', 'b c'], run), seen };
}

const asked = listWith({ status: 0, stdout: 'one\0two words\0', stderr: '' });

check('listUntracked: runs git directly with the exact argument array', asked.seen.command === 'git' && asked.seen.args.join('\n') === ['ls-files', '--others', '--exclude-standard', '-z', '--', 'a', 'b c'].join('\n'));
check('listUntracked: runs in the given directory, without a shell, with a short timeout', asked.seen.options.cwd === '/some/dir' && !asked.seen.options.shell && asked.seen.options.timeout === GIT_TIMEOUT_MS && GIT_TIMEOUT_MS > 0 && GIT_TIMEOUT_MS <= 10000);
check('listUntracked: the NUL separated answer is split into paths, empty entries dropped', asked.result.files?.join('|') === 'one|two words');
check('listUntracked: a spawn timeout is an error that says it timed out', listWith({ error: Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }) }).result.error?.includes('timed out'));
check('listUntracked: a spawn failure is an error that says git could not run', listWith({ error: Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' }) }).result.error?.includes('could not run') && !listWith({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }).result.error.includes('timed out'));
check('listUntracked: a non-zero exit is an error carrying the first line of stderr', (() => { const { result } = listWith({ status: 128, stdout: '', stderr: 'fatal: not a git repository\nsecond line' }); return result.error?.includes('128') && result.error.includes('fatal: not a git repository') && !result.error.includes('second line') && result.files === undefined; })());

// --- THE SHIM -----------------------------------------------------------------------------------
const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true });
const viaShim = run(JSON.stringify(asSubagent('Bash', 'git reset')));
const viaShimBom = run(`\uFEFF${JSON.stringify(asSubagent('Bash', 'git reset'))}`);
const viaShimMain = run(JSON.stringify(asMain('Bash', 'git reset')));

check('shim: a subagent reset is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'));
check('shim: a BOM-prefixed payload is denied too', viaShimBom.status === 0 && viaShimBom.stdout.includes('"deny"'));
check('shim: the main session prints nothing, exit 0', viaShimMain.status === 0 && viaShimMain.stdout === '');

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
