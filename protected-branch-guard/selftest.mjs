#!/usr/bin/env node
/**
 * Self-test for protected-branch-guard (owner rule «main y develop NUNCA se borran»).
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - THE PREMISE: on a repository built here, `git branch -d main` from a linked worktree really deletes a merged
 *     `main` (git refuses only the branch checked out in SOME worktree — so `main` must not be checked out anywhere),
 *     and `git branch --merged | xargs git branch -d` sweeps it the same way. The guard is not built on a claim
 *     nobody ran.
 *   - THE FORMS the rule names, for both branches: `git branch -d/-D/--delete` and a short cluster, `git branch
 *     -m/-M` (two names, and one name = the current branch, asked of git), `git push <remote> --delete/-d`,
 *     `:<b>`, `:refs/heads/<b>`, `+:<b>`, `--repo=`, `git update-ref -d refs/heads/<b>`, `gh api -X DELETE`,
 *     `--method DELETE`, `--method=DELETE`, `-XDELETE`.
 *   - HOW IT IS REACHED: `git -C`, `git -c`, launchers (`timeout`, `env`, `sudo`, `nohup`), `bash -c`, `$(...)`, a
 *     chain, a subshell, PowerShell (`git.exe`, `&`).
 *   - UNKNOWABLE names, refused: a variable, `xargs`, `update-ref --stdin`, `--mirror`, `--prune`, a `gh api DELETE`
 *     whose endpoint or method is a variable, `gh pr merge|close --delete-branch` (the head branch is not named).
 *   - EXACT MATCH near misses, allowed: `feature/main`, `main-fix`, `develop2`, `refs/heads/feature/main`,
 *     `origin/main` with `-r`, `:feature/main`, a rename TO main, `git push origin main`, `git branch main`,
 *     `git checkout main`, a `gh api` GET, `gh api -X DELETE` of another resource, `git update-ref refs/heads/main x`.
 *   - DATA: `echo`, a quoted commit message, a heredoc body, a comment.
 *   - THE OUTPUT: `deny`, bilingual with accents, the owner's rule, every offender, server-side protection named;
 *     fails open on a throwing decision, a non-shell tool, malformed JSON; the real process via stdin.
 *
 * @es Auto-test de protected-branch-guard. LA PREMISA (en un repo construido aquí, `git branch -d main` borra de
 * verdad un `main` fusionado, y el barrido con xargs también), LAS FORMAS de la regla, CÓMO se alcanzan, los nombres
 * ILEGIBLES (se rechazan), los casi-aciertos de COINCIDENCIA EXACTA (pasan), los DATOS y LA SALIDA.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { protectedBranchDeletions } from './branch-deletions.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
const SCRATCH = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'protected-branch-')));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

process.on('exit', () => rmSync(SCRATCH, { recursive: true, force: true }));

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

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
const call = (tool, command, cwd = SCRATCH) => ({ ...payloadFor(tool, command, { sessionId: 'protected-branch-selftest' }), cwd });
/** The verdict, or `{ escaped }` when a throw leaves `evaluate`: an escaped throw is a failed check, never a crash. @es El veredicto, o lo que escapó. */
const guarded = (raw, decision) => {
  try {
    return evaluate(raw, decision);
  } catch (error) {
    return { escaped: error.message };
  }
};
const verdictOf = (payload) => {
  const output = guarded(JSON.stringify(payload));

  return output?.escaped === undefined ? output?.hookSpecificOutput?.permissionDecision : `escaped: ${output.escaped}`;
};

function expect(verdict, command, label = command, tool = 'Bash') {
  const actual = verdictOf(call(tool, command));

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

// --- THE PREMISE, on a repository built here ----------------------------------------------------------------
{
  const main = path.join(SCRATCH, 'premise');
  const linked = path.join(SCRATCH, 'premise-linked');

  mkdirSync(main);
  git(main, 'init', '--quiet', '--initial-branch=main');
  git(main, 'config', 'user.email', 'selftest@example.invalid');
  git(main, 'config', 'user.name', 'selftest');
  writeFileSync(path.join(main, 'f.txt'), 'one\n');
  git(main, 'add', 'f.txt');
  git(main, 'commit', '--quiet', '-m', 'initial');
  git(main, 'branch', 'develop');
  git(main, 'switch', '--quiet', '-c', 'integration');
  git(main, 'worktree', 'add', '--quiet', linked, '-b', 'worker');
  git(linked, 'branch', '-d', 'main');
  check('premise: git branch -d main from a linked worktree deletes a merged main nobody has checked out', git(main, 'branch', '--list', 'main') === '');

  const swept = spawnSync('bash', ['-c', 'git branch --merged | grep -v "[*+]" | xargs git branch -d'], { cwd: linked, env: cleanEnv, encoding: 'utf8' });

  check('premise: a merged-branch sweep through xargs deletes develop too', swept.status === 0 && git(main, 'branch', '--list', 'develop') === '', `${String(swept.status)} ${swept.stderr} ${String(swept.error)}`);
}

// --- THE FORMS, for both protected branches -----------------------------------------------------------------
for (const branch of ['main', 'develop']) {
  for (const command of [
    `git branch -d ${branch}`,
    `git branch -D ${branch}`,
    `git branch --delete ${branch}`,
    `git branch -df ${branch}`,
    `git branch -d feature/x ${branch}`,
    `git branch -m ${branch} old-${branch}`,
    `git branch -M ${branch} renamed`,
    `git push origin --delete ${branch}`,
    `git push --delete origin ${branch}`,
    `git push origin -d ${branch}`,
    `git push origin :${branch}`,
    `git push origin :refs/heads/${branch}`,
    `git push origin +:${branch}`,
    `git push origin feature/x :${branch}`,
    `git push --repo=origin --delete ${branch}`,
    `git push -o ci.skip origin --delete ${branch}`,
    `git update-ref -d refs/heads/${branch}`,
    `git update-ref -m "drop it" --delete refs/heads/${branch}`,
    `gh api -X DELETE repos/owner/repo/git/refs/heads/${branch}`,
    `gh api --method DELETE /repos/owner/repo/git/refs/heads/${branch}`,
    `gh api --method=DELETE repos/{owner}/{repo}/git/refs/heads/${branch}`,
    `gh api -XDELETE repos/o/r/git/refs/heads/${branch}`,
    `gh api -X delete repos/o/r/git/refs/heads/${branch}?x=1`
  ]) {
    expect('deny', command);
  }
}

// --- HOW IT IS REACHED --------------------------------------------------------------------------------------
for (const command of [
  'git -C /some/repo branch -D main',
  'git -c core.x=y push origin --delete develop',
  'timeout 60 git push origin :main',
  'env -i git branch -D develop',
  'sudo git branch -D main',
  'nohup git push origin --delete main',
  'bash -c "git branch -D main"',
  'echo $(git push origin :develop)',
  'git fetch && git branch -D main',
  'git status; git push origin --delete develop',
  '(cd sub && git branch -d main)'
]) {
  expect('deny', command);
}

expect('deny', 'git branch -D main', 'PowerShell, bare', 'PowerShell');
expect('deny', 'git.exe push origin --delete develop', 'PowerShell, git.exe', 'PowerShell');
expect('deny', '& git branch -D main', 'PowerShell, call operator', 'PowerShell');
expect('deny', 'git status; gh api -X DELETE repos/o/r/git/refs/heads/main', 'PowerShell, gh api after ;', 'PowerShell');

// --- A RENAME OF THE CURRENT BRANCH asks git which branch that is ------------------------------------------
{
  const repo = path.join(SCRATCH, 'current');

  mkdirSync(repo);
  git(repo, 'init', '--quiet', '--initial-branch=develop');
  expect('deny', `git -C ${repo} branch -m renamed`, 'renaming the current branch when it is develop');
  git(repo, 'switch', '--quiet', '--orphan', 'feature/main');
  expect('allow', `git -C ${repo} branch -m renamed`, 'renaming the current branch when it is feature/main');
  check('the current branch is asked of the directory git acts in', protectedBranchDeletions('git branch -m x', 'bash', '/a', { currentBranchOf: (directory) => (directory === '/a/b' ? 'main' : undefined) }).length === 0 && protectedBranchDeletions('git -C b branch -m x', 'bash', '/a', { currentBranchOf: (directory) => (directory === path.resolve('/a/b') ? 'main' : undefined) }).length === 1);
  check('a rename of the current branch in a directory that cannot be followed is unknowable', protectedBranchDeletions('cd "$D" && git branch -m x', 'bash', '/a', { currentBranchOf: () => undefined })[0]?.unknowable === 'current-branch');
}

// --- UNKNOWABLE NAMES are refused ---------------------------------------------------------------------------
for (const command of [
  'git branch -D $BRANCH',
  'git push origin --delete "$B"',
  'git push origin :$B',
  'git update-ref -d $REF',
  'git branch --merged | xargs git branch -d',
  'git for-each-ref --format=%(refname:short) refs/heads | xargs -n1 git branch -D',
  'printf "delete refs/heads/main\\n" | git update-ref --stdin',
  'git push --mirror backup',
  'git push --prune origin refs/heads/*:refs/heads/*',
  'gh api -X DELETE "$ENDPOINT"',
  'gh api -X $METHOD repos/o/r/git/refs/heads/main',
  'gh api -X DELETE repos/o/r/git/refs/heads/$B',
  'gh pr merge 12 --merge --delete-branch',
  'gh pr merge 12 -d',
  'gh pr merge 12 -sd',
  'gh pr close 12 --delete-branch',
  'gh pr close 12 -d'
]) {
  expect('deny', command, `unknowable: ${command}`);
}

// --- EXACT MATCH near misses, allowed -----------------------------------------------------------------------
for (const command of [
  'git branch -d feature/main',
  'git branch -D main-fix',
  'git branch -D develop2',
  'git branch -d mainline maindevelop',
  'git push origin --delete feature/main',
  'git push origin :feature/develop',
  'git push origin :refs/heads/feature/main',
  'git update-ref -d refs/heads/feature/main',
  'git update-ref -d refs/remotes/origin/main',
  'git branch -dr origin/main',
  'git branch -d -r origin/develop',
  'git branch -m old-name main',
  'git branch -c main copy-of-main',
  'git push origin main',
  'git push origin main:main',
  'git push origin develop:refs/heads/develop',
  'git branch main',
  'git branch --list main',
  'git checkout main',
  'git switch develop',
  'git update-ref refs/heads/main HEAD',
  'gh api repos/o/r/git/refs/heads/main',
  'gh api -X DELETE repos/o/r/issues/comments/1',
  'gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc',
  'gh api -X DELETE repos/o/r/git/refs/heads/feature/main',
  'git branch -d',
  'git push origin --delete',
  'gh pr merge 12 --squash',
  'gh pr close 12',
  'gh pr view 12 -d',
  'gh pr checkout develop',
  'gh pr view 12 --delete-branch',
  'gh pr merge 12 --body done',
  'git branch -dr main',
  'git push main --delete feature/x',
  'git push -o ci.skip main --delete feature/y',
  'printf "a\\n" | xargs git branch --list',
  'git branch --list | xargs git push origin'
]) {
  expect('allow', command, `near miss: ${command}`);
}

// --- DATA, not commands -------------------------------------------------------------------------------------
expect('allow', 'echo git branch -D main', 'echo mentions it');
expect('allow', 'git commit -m "never git push origin --delete main"', 'a quoted commit message');
expect('allow', 'cat <<EOF\ngit branch -D develop\nEOF', 'a heredoc body');
expect('allow', 'git status # git branch -D main', 'a comment');
expect('allow', 'Write-Output "git push origin :main"', 'a PowerShell string', 'PowerShell');

// --- THE OUTPUT ---------------------------------------------------------------------------------------------
const refusal = evaluate(JSON.stringify(call('Bash', 'git branch -D main && git push origin :$B')));
const text = refusal?.hookSpecificOutput?.permissionDecisionReason ?? '';
const spanishStarts = text.indexOf('  @es ');

check('refusal event is PreToolUse', refusal?.hookSpecificOutput?.hookEventName === 'PreToolUse');
check('refusal is bilingual: English, then " @es " Spanish with accents', spanishStarts > 0 && text.indexOf('REFUSED') < spanishStarts && text.includes('RECHAZÓ') && text.includes('POR QUÉ') && text.includes('protección'), text);
check('refusal quotes the owner\'s rule in both halves', text.slice(0, spanishStarts).includes('«main y develop NUNCA se borran»') && text.slice(spanishStarts).includes('«main y develop NUNCA se borran»'));
check('refusal names each offender and what it deletes', text.includes('git branch -D main: deletes the protected branch main') && text.includes('git push origin :$B: the branch is named by a variable') && text.includes('git branch -D main: borra la rama protegida main') && text.includes('la rama la nombra una variable'), text);
check('refusal names the protected set and the exact match', text.includes('(main, develop)') && text.includes('feature/main, main-fix or develop2'));
check('refusal says the real layer is server-side branch protection', text.includes('server-side branch protection') && text.includes('protección de ramas del servidor'));
check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

const stdinRefusal = evaluate(JSON.stringify(call('Bash', 'git branch --merged | xargs git branch -d')))?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('a stdin-fed deletion says its names arrive on standard input, in both languages', stdinRefusal.includes('arrive on standard input') && stdinRefusal.includes('llegan por la entrada estándar'), stdinRefusal);

const throwing = () => { throw new Error('boom'); };

check('a decision that throws fails open', guarded(JSON.stringify(call('Bash', 'git branch -D main')), throwing) === undefined);
check('a non-shell tool is not this guard\'s business', verdictOf({ ...call('Bash', 'git branch -D main'), tool_name: 'Read' }) === undefined);
check('a payload with no command passes', verdictOf({ ...call('Bash', 'x'), tool_input: {} }) === undefined);
check('malformed JSON passes (fails open)', evaluate('{not json') === undefined);

// --- THE SHIM: the real process, stdin in, stdout out -------------------------------------------------------
const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true });
const viaShim = run(JSON.stringify(call('Bash', 'git push origin --delete develop')));
const viaShimBom = run(`﻿${JSON.stringify(call('Bash', 'git branch -D main'))}`);
const viaShimSafe = run(JSON.stringify(call('Bash', 'git branch -D feature/main')));

check('shim: a deletion of develop is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'));
check('shim: a BOM-prefixed payload is denied too', viaShimBom.status === 0 && viaShimBom.stdout.includes('"deny"'));
check('shim: an unprotected deletion prints nothing, exit 0', viaShimSafe.status === 0 && viaShimSafe.stdout === '');

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
