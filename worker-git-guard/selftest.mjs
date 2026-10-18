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
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';

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
for (const form of ['git commit -m "no-verify words"', 'git commit -m"no"', 'git commit -m -n', 'git commit -am x', 'git commit --amend -m x', 'git commit -m x -- a.txt', 'git commit -m x -- a.txt -n', 'git commit -F msg.txt', 'git commit -Fn', 'git commit -C HEAD', 'git commit --message --no-verify', 'git commit --no-edit', 'git commit --no- -m x', 'git commit -m "-n"']) allowed(form);

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
allowed('git commit -m "git read-tree --reset -u HEAD"');

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
allowed('git commit -m "never git reset or git checkout -- x or --no-verify"');
allowed("git commit -m 'git clean -fd'");
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

const headlines = ['git reset', 'git checkout main', 'git restore x', 'git clean -f', 'git commit -n', 'git push --no-verify', 'git read-tree -u HEAD', 'git checkout-index -f a', 'git update-index --force-remove a', 'git update-ref -d r', 'git symbolic-ref HEAD r'].map((command) => reasonOf(command).split('\n')[2]);

check('each family has its own text', new Set(headlines).size === 11, headlines.join(' | '));
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
