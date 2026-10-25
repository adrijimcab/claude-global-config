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
import { isolateState, STATE_ROOT_VARIABLE } from '../hook-state/locations.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';
import { gitBoolean, parametersOf } from './line-config.mjs';
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

/** The refusal text a Bash command from a subagent gets, or ''. @es El texto de rechazo que recibe un comando Bash de un subagente. */
function reasonFor(command) {
  return evaluate(JSON.stringify(asSubagent('Bash', command)))?.hookSpecificOutput?.permissionDecisionReason ?? '';
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
for (const form of ['git commit -m "no-verify words" -- p.txt', 'git commit -m"no" -- p.txt', 'git commit -m -n -- p.txt', 'git commit --amend -m x -- p.txt', 'git commit -m x -- a.txt', 'git commit -m x -- a.txt -n', 'git commit -F msg.txt -- p.txt', 'git commit -Fn -- p.txt', 'git commit -C HEAD -- p.txt', 'git commit --message --no-verify -- p.txt', 'git commit --no-edit -- p.txt', 'git commit -m "-n" -- p.txt']) allowed(form);
// An AMBIGUOUS abbreviation that could be --no-verify counts as it (git rejects the command anyway, measured
// 2026-10-19: "ambiguous option: no-"). @es Una abreviatura AMBIGUA que podría ser --no-verify cuenta como tal.
for (const form of ['git commit --no- -m x -- p.txt', 'git commit --no-v -m x -- p.txt']) denied(form);

// --- C2: git's last-wins rule for negatable options (both judges, 2026-10-19) ----------------------
for (const form of ['git commit --dry-run --no-dry-run -m x', 'git commit --dry-run -m x --no-dry-run -a', 'git commit --dr --no-dr -m x', 'git commit --no-verify --verify -n -m x -- a', 'git commit --verify --no-verify -m x -- a', 'git push --verify --no-verify', 'git restore --staged --no-staged x', 'git clean -f --no-force -f']) denied(form);
for (const form of ['git commit --no-dry-run --dry-run -m x', 'git commit --no-verify --verify -m x -- a', 'git commit -n --verify -m x -- a', 'git commit -n --veri -m x -- a', 'git push --no-verify --verify', 'git restore --no-staged --staged x', 'git clean -f --no-force']) allowed(form);

// --- C6: commit -S and -u take only an ATTACHED optional value, so they never eat the next word ---------
for (const form of ['git commit -S -n -m x -- a', 'git commit -u -n -m x -- a', 'git commit -S -a -m x', 'git commit -m x -U 3 -a']) denied(form);
for (const form of ['git commit -S -m x -- a.txt', 'git commit -S -- a.txt', 'git commit -Skey -m x -- a', 'git commit -uno -m x -- a', 'git commit -Sn -m x -- a', 'git commit -m x -U -n -- a', 'git restore -U 3 -S x']) allowed(form);

// --- C7: long options that take a value are matched by their abbreviations too (judge B) --------------
for (const form of ['git commit --mes -- -a', 'git commit --mes -- -n', 'git commit --messag x', 'git commit --fil msg.txt', 'git commit --fil -- -a', 'git push --push-o -- --no-verify']) denied(form);
for (const form of ['git commit --mes x -- a', 'git commit --mes=x -- a', 'git commit --fil msg.txt -- a', 'git commit --tem t.txt -m x -- a']) allowed(form);

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

// --- C1: commit -i/--include commits everything staged plus the named paths (both judges) ------------
for (const form of ['git commit -i -m x -- a', 'git commit -im x -- a', 'git commit --include -m x -- a', 'git commit --inc -m x -- a', 'git commit -m x -i -- a', 'git commit -qi -m x -- a']) denied(form);
for (const form of ['git commit --include --no-include -m x -- a', 'git commit -o -m x -- a', 'git commit -m -i -- a']) allowed(form);

// --- C3: a pathspec that names no specific path is the same sweep (both judges) ---------------------
for (const form of ['git commit -m x -- .', 'git commit -m x -- ./', 'git commit -m x -- :/', 'git commit -m x -- "*"', 'git commit -m x -- "**"', 'git commit -m x -- ":(glob)**"', 'git commit -m x -- ":(top)"', 'git commit -m x -- ..', 'git commit -m x -- a .', 'git commit -m x -- ":!a.txt"', 'git commit -m x -- ":(exclude)a.txt"', 'git commit -m x -- $FILES', 'git commit -m x -- "$@"', 'git commit -m x -- ${FILES}', 'git commit -m x -- $(git ls-files)', 'git commit -m x -- $FILES $MORE']) denied(form);
for (const form of ['git commit -m x -- src', 'git commit -m x -- ./src/a.ts', 'git commit -m x -- ":(top)src"', 'git commit -m x -- "src/*.ts"', 'git commit -m x -- a ":!b"', 'git commit -m x -- .gitignore', 'git commit -m x -- @files']) allowed(form);
expect('deny', asSubagent('PowerShell', 'git commit -m x -- @files'), 'PowerShell, a splatted array names no specific path');
expect('deny', asSubagent('PowerShell', 'git commit -m x -- $env:FILES'), 'PowerShell, an environment variable names no specific path');
expect('deny', asSubagent('PowerShell', 'git commit -m x -- $files'), 'PowerShell, a variable names no specific path');
expect('allow', asSubagent('PowerShell', 'git commit -m x -- src/a.ts'), 'PowerShell, a literal path');
expect('deny', asSubagent('PowerShell', 'git commit -m x -- $PWD\\'), 'PowerShell, a variable followed only by a backslash names the directory it hides');

// --- A (third round): any pathspec word holding an expansion is unresolvable, its tail never trusted --------------
const UNRESOLVABLE = 'depends on a value the line does not show';
const unresolvableBash = (command) => check(`A: unresolvable: ${command}`, reasonFor(command).includes(UNRESOLVABLE) && reasonFor(command).includes('no muestra'));
const unresolvablePowerShell = (command) => check(`A: unresolvable (PowerShell): ${command}`, (evaluate(JSON.stringify(asSubagent('PowerShell', command)))?.hookSpecificOutput?.permissionDecisionReason ?? '').includes(UNRESOLVABLE));

for (const form of ['git commit -m x -- $FILES a.txt', 'git commit -m x -- $DIR/a.txt', 'git commit -m x -- "$PWD"/clean', 'git commit -m x -- ${D}/a', 'git commit -m x -- "$(pwd)/a"', 'git commit -m x -- `pwd`/a', 'git commit -m x -- a $B']) unresolvableBash(form);
for (const form of ['git commit -m x -- $dir\\a.ts', 'git commit -m x -- $PWD.Path', 'git commit -m x -- (Get-Location)', 'git commit -m x -- ${env:D}/a', 'git commit -m x -- a @rest']) unresolvablePowerShell(form);
denied('git commit -m x -- $(cat lists/a.txt)');
denied('git commit -m x -- `cat list`');
denied('git commit -Ka -m x -- a');
denied('git commit -qn -m x -- a');
denied('GIT_INDEX_FILE=/tmp/i git status; git read-tree HEAD');

// --- C9: an alias defined on the line with -c alias.<name>=... is expanded (judge B) ---------------
for (const form of ['git -c alias.ci="commit -a" ci -m x', 'git -c alias.ci="commit -am x" ci -- a', "git -c alias.x='!git reset --hard' x", 'git -c alias.r=reset r --hard', 'git -c alias.a=b -c alias.b=reset a', 'git -c alias.CI="commit --no-verify" ci -m x -- a', 'git -c alias.ci=commit ci -m x', 'git -c alias.ci="-C sub reset" ci', "git -c alias.s='!f() { git switch main; }; f' s"]) denied(form);
for (const form of ['git -c alias.ci="commit -m x" ci -- a.txt', 'git -c alias.st=status st', 'git -c alias.commit=reset commit -m x -- a', "git -c alias.x='!echo git reset' x", 'git -c alias.ci=commit -c alias.ci=status ci']) allowed(form);

// --- FAMILY 6: push --no-verify -----------------------------------------------------------------
for (const form of ['git push --no-verify', 'git push origin main --no-verify', 'git push --no-verify https://example.invalid/r.git', 'git push --no-verif']) denied(form);
for (const form of ['git push', 'git push origin main', 'git push -n', 'git push --dry-run', 'git push origin feat/no-verify']) allowed(form);

// --- FAMILY 7: read-tree that writes the tree or discards the index (b100 report) ----------------
for (const form of ['git read-tree --reset -u HEAD', 'git read-tree -u HEAD', 'git read-tree -m -u HEAD', 'git read-tree -mu HEAD', 'git read-tree -um HEAD', 'git read-tree --reset HEAD', 'git read-tree --res HEAD', 'git read-tree --prefix sub/ -u HEAD', 'git read-tree -u -- HEAD']) denied(form);
// C4: every read-tree into the LIVE index replaces it (a bare tree) or empties it (--empty, no tree; measured
// 2026-10-19: a bare `git read-tree` emptied a scratch index). An ambiguous --re may be --reset.
for (const form of ['git read-tree HEAD', 'git read-tree -m HEAD', 'git read-tree --empty', 'git read-tree', 'git read-tree --prefix=sub/ HEAD', 'git read-tree --prefix -u HEAD', 'git read-tree --exclude-per-directory -u HEAD', 'git read-tree --re HEAD', 'git read-tree --dry-run --no-dry-run HEAD', 'GIT_INDEX_FILE= git read-tree HEAD', 'GIT_INDEX_FILE=/tmp/i git read-tree --reset HEAD', 'git read-tree -h HEAD']) denied(form);
// C4 and C11: a temporary GIT_INDEX_FILE on the line, --index-output (measured: the live index stays byte-identical),
// -n/--dry-run, and -h leave the live index alone.
for (const form of ['git read-tree --index-output /tmp/i HEAD', 'git read-tree --index-output=/tmp/i HEAD', 'git read-tree --index-output -u HEAD', 'GIT_INDEX_FILE=/tmp/idx git read-tree HEAD', 'GIT_INDEX_FILE=/tmp/idx git read-tree --empty', 'env GIT_INDEX_FILE=/tmp/idx git read-tree -m HEAD', 'git read-tree -n HEAD', 'git read-tree --dry-run HEAD', 'git read-tree --dry -m HEAD', 'git read-tree -h']) allowed(form);
// R8: -n/--dry-run writes nothing, with -u and --reset too. @es -n no escribe nada, ni con -u ni con --reset.
for (const form of ['git read-tree -n -u HEAD', 'git read-tree -nu -m HEAD', 'git read-tree --dry-run --reset HEAD', 'git read-tree --reset -u -n HEAD']) allowed(form);
for (const form of ['git read-tree -n --no-dry-run -u HEAD', 'git read-tree --dry-run --no-dry-run --reset HEAD']) denied(form);

// --- R11: clean.requireForce=false on the line lets clean delete without -f -------------------------
for (const form of ['git -c clean.requireForce=false clean -d', 'git -c clean.requireforce=no clean', 'git -c clean.requireForce=0 clean -x', 'git -c clean.requireForce= clean', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=clean.requireForce GIT_CONFIG_VALUE_0=off git clean -d', 'git --config-env=clean.requireForce=RF clean', 'RF=false git --config-env clean.requireForce=RF clean', 'git -c clean.requireForce=false clean -n --no-dry-run']) denied(form);
for (const form of ['git -c clean.requireForce=false clean -n', 'git -c clean.requireForce=false clean --dry-run -d', 'git -c clean.requireForce=true clean -d', 'git -c clean.requireForce clean', 'RF=true git --config-env=clean.requireForce=RF clean', 'git clean -d']) allowed(form);
expect('deny', asSubagent('PowerShell', '$env:GIT_CONFIG_COUNT="1"; $env:GIT_CONFIG_KEY_0="clean.requireForce"; $env:GIT_CONFIG_VALUE_0="false"; git clean -d'), 'PowerShell, GIT_CONFIG_* set earlier on the line');

// --- R5: aliases set through --config-env and GIT_CONFIG_COUNT on the line are expanded too ---------
for (const form of ['A="reset --hard" git --config-env=alias.x=A x', 'A=reset git --config-env alias.x=A x', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=reset git x', 'export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=reset; git x', 'git --config-env=alias.x=UNSET_VARIABLE x', 'git -c alias.x=$CMD x', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.ci GIT_CONFIG_VALUE_0="commit -a" git ci -m x']) denied(form);
for (const form of ['A="commit -m x" git --config-env=alias.ci=A ci -- a.txt', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.st GIT_CONFIG_VALUE_0=status git st', 'export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=reset; unset GIT_CONFIG_COUNT; git x', 'git --config-env=alias.x=UNSET_VARIABLE status']) allowed(form);
expect('deny', asSubagent('PowerShell', '$env:A = "reset"; git --config-env=alias.x=A x'), 'PowerShell, --config-env reads $env: set earlier');
check('R5: an alias whose body the line hides gets its own refusal, in both halves', (() => { const text = reasonFor('git --config-env=alias.x=UNSET_VARIABLE x'); return text.includes('body the line does not show') && text.includes('cuerpo la línea no muestra'); })());

// --- R1: commit -p/--patch/--interactive commit everything staged besides the named paths -----------
for (const form of ['git commit -p -m x -- a', 'git commit --patch -m x -- a', 'git commit --interactive -m x -- a', 'git commit --pat -m x -- a', 'git commit -pm x -- a', 'git commit --inte -m x -- a']) denied(form);
for (const form of ['git commit -p --no-patch -m x -- a', 'git commit --interactive --no-interactive -m x -- a']) allowed(form);
check('R1: the commit-without-paths refusal names -p/--patch and --interactive in both halves', reasonFor('git commit -p -m x -- a').split('`-p`/`--patch`').length === 3 && reasonFor('git commit -p -m x -- a').split('`--interactive`').length === 3);
expect('allow', asSubagent('PowerShell', '$env:GIT_INDEX_FILE="C:\\t\\i"; git read-tree HEAD'), 'PowerShell, $env:GIT_INDEX_FILE= earlier on the line');
expect('allow', asSubagent('PowerShell', '$env:git_index_file = "C:\\t\\i"; git read-tree HEAD'), 'PowerShell, $env: name in any case, spaced');
expect('deny', asSubagent('PowerShell', 'git read-tree HEAD; $env:GIT_INDEX_FILE="C:\\t\\i"'), 'PowerShell, $env: set only AFTER the read-tree');
expect('deny', asSubagent('PowerShell', '$env:OTHER="x"; git read-tree HEAD'), 'PowerShell, another variable');

// --- FAMILY 8: checkout-index that overwrites files ---------------------------------------------
for (const form of ['git checkout-index -f a.txt', 'git checkout-index --force a.txt', 'git checkout-index -a', 'git checkout-index --all', 'git checkout-index -fa', 'git checkout-index -qaf', 'git checkout-index --fo a', 'git checkout-index --al', 'git checkout-index -u -a']) denied(form);
for (const form of ['git checkout-index a.txt', 'git checkout-index -q a.txt', 'git checkout-index --prefix out/ a.txt', 'git checkout-index --prefix -f a.txt', 'git checkout-index --stage -a a.txt', 'git checkout-index --no-create a.txt', 'git checkout-index -- -f', 'git checkout-index --temp a.txt']) allowed(form);

// --- FAMILY 9: update-index --force-remove ------------------------------------------------------
for (const form of ['git update-index --force-remove a.txt', 'git update-index --force-r a.txt', 'git update-index --add --force-remove a.txt']) denied(form);
for (const form of ['git update-index --refresh', 'git update-index --really-refresh', 'git update-index --add a.txt', 'git update-index --remove a.txt', 'git update-index --cacheinfo 100644,abc,a.txt', 'git update-index --force-write-index', 'git update-index --force-untracked-cache', 'git update-index --no-force-remove a', 'git update-index --force-w']) allowed(form);
// `--force-` is ambiguous and one candidate is --force-remove (git rejects it anyway). @es Ambigua, y una candidata es --force-remove.
for (const form of ['git update-index --force-', 'git update-index --force-remove a --no-force-remove b']) denied(form);

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
expect('deny', asSubagent('PowerShell', 'git read-tree HEAD'), 'PowerShell, bare read-tree on the live index');
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

check('read-tree refusal names the safe route in both halves', ['git read-tree -u HEAD'].every((c) => { const t = reasonOf(c); return t.includes('commit your work in progress') && t.includes('haga commit de su trabajo a medias') && t.includes('GIT_INDEX_FILE=<tmp> git read-tree <tree>') && t.includes('--index-output=<fichero>') && t.includes('--dry-run'); }));
check('read-tree refusal names the live index in both halves', reasonOf('git read-tree HEAD').includes('live index') && reasonOf('git read-tree HEAD').includes('índice vivo'));
check('read-tree refusal names the live index as the only refused path and never claims the git directory is off limits, in both halves', (() => { const t = reasonOf('git read-tree HEAD'); return t.includes('only the live index') && t.includes('`.git/index.tmp`') && t.includes('solo se') && t.includes('rechazan el propio índice vivo') && !t.includes('outside the git directory') && !t.includes('fuera del directorio de git'); })());
check('checkout-index refusal names the safe route', reasonOf('git checkout-index -f a').includes('commit your work in progress'));
check('update-index refusal names the safe route', reasonOf('git update-index --force-remove a').includes('commit your work in progress'));
check('update-ref refusal says to commit or ask the orchestrator, and names rev-parse for reads', reasonOf('git update-ref -d refs/heads/x').includes('ask the orchestrator') && reasonOf('git update-ref -d refs/heads/x').includes('git rev-parse <ref>') && reasonOf('git update-ref -d refs/heads/x').includes('pida ayuda al orquestador'));

// C5: the Spanish halves use a neutral register: no voseo imperative or pronoun anywhere in the table.
const VOSEO = ['ejecutá', 'commiteá', 'arreglá', 'informá', 'nombrá', 'devolvé', 'agregá', 'usá', 'pedile', 'tené', 'muevas', ' vos', ' tu ', ' tus '];
const spanishLines = Object.values(MESSAGES).flatMap((message) => message.es).join('\n');

check('C5: no Spanish refusal uses a voseo form', VOSEO.every((form) => !spanishLines.includes(form)), VOSEO.filter((form) => spanishLines.includes(form)).join(', '));
check('C5: the Spanish halves use the neutral imperative', spanishLines.includes('ejecute') && spanishLines.includes('haga commit') && spanishLines.includes('pida') && spanishLines.includes('use `git rev-parse'));
check('C1: the commit-without-paths refusal names -i/--include in both halves', reasonOf('git commit -i -m x -- a').split('-i`/`--include').length === 3);
check('C3: the commit-without-paths refusal names the whole-tree and variable forms in both halves', reasonOf('git commit -m x -- .').split('`$FILES`').length === 3);
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
// R10: the proposed git add names paths relative to the worker's shell cwd, single-quoted for that shell.
check('R10: a path with whitespace is single-quoted in the git add the refusal proposes', untrackedReason('git commit -m x -- spaced').includes("git add -- 'spaced/a b.txt'"));
put(REPO, "quote/it's.txt");
check("R10: bash closes and reopens the quote around an apostrophe", untrackedReason('git commit -m x -- quote').includes("git add -- 'quote/it'\\''s.txt'"));
check("R10: PowerShell doubles the apostrophe", untrackedReason('git commit -m "x" -- quote', REPO, 'PowerShell').includes("git add -- 'quote/it''s.txt'"));
check('R10: the path is relative to the shell cwd, not to the directory git -C moved to', untrackedReason('git -C .. commit -m x -- mixed', path.join(REPO, 'clean')).includes('git add -- ../mixed/new.txt'));

// --- C12: an earlier `git add` of the same && chain stages what it names, so it no longer counts as untracked ------
check('C12: git add -- <the untracked file> && git commit -- <its directory> passes', untrackedVerdict('git add -- mixed/new.txt && git commit -m x -- mixed') === undefined);
check('C12: git add -- <the directory> && git commit -- <it> passes', untrackedVerdict('git add -- mixed && git commit -m x -- mixed') === undefined);
check('C12: an add without -- also counts', untrackedVerdict('git add mixed/new.txt && git commit -m x -- mixed') === undefined);
check('C12: an add in another directory is resolved there', untrackedVerdict('cd mixed && git add -- new.txt && cd .. && git commit -m x -- mixed') === undefined);
check('C12: PowerShell && counts too', untrackedVerdict('git add -- mixed/new.txt && git commit -m "x" -- mixed', REPO, 'PowerShell') === undefined);
check('C12: an add joined by ; is not the same chain, refused', untrackedVerdict('git add -- mixed/new.txt; git commit -m x -- mixed') === 'deny');
check('C12: an add joined by || is not the same chain, refused', untrackedVerdict('git add -- mixed/new.txt || git commit -m x -- mixed') === 'deny');
check('C12: an add of another directory does not cover this one', untrackedVerdict('git add -- clean && git commit -m x -- mixed') === 'deny');
check('C12: an add on another drive does not cover this one', untrackedVerdict('git add -- Z:/elsewhere && git commit -m x -- mixed') === 'deny');
check('C12: an add AFTER the commit does not count', untrackedVerdict('git commit -m x -- mixed && git add -- mixed/new.txt') === 'deny');
check('C12: a dry-run add stages nothing, refused', untrackedVerdict('git add -n -- mixed/new.txt && git commit -m x -- mixed') === 'deny');
check('C12: a glob add is not read as literal paths, refused', untrackedVerdict('git add -- "mixed/*.txt" && git commit -m x -- mixed') === 'deny');
check('C12: an add of some files leaves the others untracked, and only those are listed', (() => { const text = untrackedReason('git add -- many/f01.txt && git commit -m x -- many'); return text.includes('11 in all') && !text.includes('many/f01.txt') && text.includes('many/f02.txt'); })());

// --- C10: --pathspec-from-file names explicit paths; its contents are checked like the words after -- -------------
const SPECS = path.join(SCRATCH, 'specs');

mkdirSync(SPECS);
writeFileSync(path.join(SPECS, 'mixed.lst'), 'mixed\n');
writeFileSync(path.join(SPECS, 'clean.lst'), 'clean\n');
writeFileSync(path.join(SPECS, 'crlf.lst'), 'clean\r\nmixed\r\n');
writeFileSync(path.join(SPECS, 'dot.lst'), '.\n');
writeFileSync(path.join(SPECS, 'empty.lst'), '');
writeFileSync(path.join(SPECS, 'nul.lst'), 'clean\0mixed\0');
put(REPO, 'specs/clean.lst', 'clean\n');

const spec = (name) => path.join(SPECS, name).split('\\').join('/');

check('C10: a pathspec file is allowed lexically when it names tracked paths', untrackedVerdict(`git commit -m x --pathspec-from-file=${spec('clean.lst')}`) === undefined);
check('C10: a pathspec file over an untracked file is refused, listing it', untrackedReason(`git commit -m x --pathspec-from-file=${spec('mixed.lst')}`).includes('mixed/new.txt'));
check('C10: the separate-word form and an abbreviation are read too', untrackedVerdict(`git commit -m x --pathspec-from-file ${spec('mixed.lst')}`) === 'deny' && untrackedVerdict(`git commit -m x --pathspec-f ${spec('mixed.lst')}`) === 'deny');
check('C10: CRLF lines are read as paths', untrackedVerdict(`git commit -m x --pathspec-from-file=${spec('crlf.lst')}`) === 'deny');
check('C10: --pathspec-file-nul splits on NUL', untrackedVerdict(`git commit -m x --pathspec-file-nul --pathspec-from-file=${spec('nul.lst')}`) === 'deny');
check('C10: a relative pathspec file is read from the directory the commit runs in', untrackedVerdict('git commit -m x --pathspec-from-file=specs/clean.lst') === undefined && untrackedVerdict(`git -C "${REPO}" commit -m x --pathspec-from-file=specs/clean.lst`, NOT_A_REPO) === undefined);
check('C10: a pathspec file naming the whole tree is refused as a commit without paths', untrackedReason(`git commit -m x --pathspec-from-file=${spec('dot.lst')}`).includes('must name its paths'));
check('C10: an empty pathspec file is refused as a commit without paths', untrackedReason(`git commit -m x --pathspec-from-file=${spec('empty.lst')}`).includes('must name its paths'));
check('C10: a missing pathspec file is refused, naming it, in both halves', (() => { const text = untrackedReason(`git commit -m x --pathspec-from-file=${spec('missing.lst')}`); return text.includes('cannot be read') && text.includes('no se puede leer') && text.split('missing.lst').length >= 4; })());
put(REPO, '-', 'clean\n');
check('C10: standard input is refused, even beside a file named -', untrackedReason('git commit -m x --pathspec-from-file=-').includes('cannot be read'));
check('C10: an absolute pathspec file after a cd the line cannot follow is still read', untrackedVerdict(`cd "$X" && git commit -m x --pathspec-from-file=${spec('clean.lst')}`) === undefined);
check('C10: a relative pathspec file after a cd the line cannot follow is refused', untrackedReason('cd "$X" && git commit -m x --pathspec-from-file=specs/clean.lst').includes('cannot be read'));
check('C10: --no-pathspec-from-file undoes it, so the commit has no paths', untrackedVerdict(`git commit -m x --pathspec-from-file=${spec('clean.lst')} --no-pathspec-from-file`) === 'deny');
check('C10: the file port is injectable and called with the resolved path', (() => { const asked = []; untrackedUnderCommits('git commit -m x --pathspec-from-file=l.txt', 'bash', REPO, () => ({ files: [] }), (file) => { asked.push(file); return 'clean\n'; }); return asked.length === 1 && asked[0] === path.join(REPO, 'l.txt'); })());

// --- C9 and C13 through the untracked check ---------------------------------------------------------------------
check('C9: a commit reached through a line alias is checked for untracked files', untrackedVerdict('git -c alias.ci="commit -m x" ci -- mixed') === 'deny');
check('C13: a relative -C after a cd the line cannot follow is unchecked, never asked in the process cwd', (() => { const found = untrackedUnderCommits('cd "$X" && git -C repo commit -m x -- mixed', 'bash', SCRATCH, () => ({ files: ['mixed/new.txt'] })); return found.offender === undefined && found.unchecked.length === 1; })());
check('C13: an absolute -C after a cd the line cannot follow is still checked', untrackedVerdict(`cd "$X" && git -C "${REPO}" commit -m x -- mixed`, NOT_A_REPO) === 'deny');

// --- R2: a pathspec that reaches the worktree root, resolved against the commit directory and the root ----------
const SUBDIRECTORY = path.join(REPO, 'clean');
const REPO_FWD = REPO.split('\\').join('/');
// E (third round): normalised as git does, a wildcard covering everything under its literal directories, and the
// Git Bash spelling `/c/...` of the root. @es Normalizado como git, un comodín cubre todo bajo sus directorios literales.
const MSYS_ROOT = REPO_FWD.replace(/^([A-Za-z]):/, (match, drive) => `/${drive.toLowerCase()}`);
const rootSweeps = ['.', './', '*', '?*', '[!.]*', '**', ':/', '":(top)"', '":(glob)**"', 'clean/..', 'clean/../', REPO_FWD, `${REPO_FWD}/`, ':!x', '":(exclude)x"', "'*.*'", "'*/..'", '"*.md"', 'clean/*/../..', MSYS_ROOT, `${MSYS_ROOT}/`, `${MSYS_ROOT}/*.txt`];

for (const form of ['"$PWD/"', '"$(git rev-parse --show-toplevel)/"', '$(pwd)/*']) check(`A: an expansion that may name the root is unresolvable: git commit -m x -- ${form}`, untrackedReason(`git commit -m x -- ${form}`).includes(UNRESOLVABLE));

// A sweep must get the paths refusal itself, not the untracked one the repository root would also earn.
// @es Un barrido debe recibir el rechazo de rutas, no el de ficheros sin seguimiento que la raíz también ganaría.
const sweepRefused = (command, cwd = REPO) => untrackedReason(command, cwd).includes('must name its paths');

for (const form of rootSweeps) check(`R2: refused at the root: git commit -m x -- ${form}`, sweepRefused(`git commit -m x -- ${form}`));
for (const form of ['..', '../', '../*', ':/', '":(top)"', ':/*', REPO_FWD]) check(`R2: refused from a subdirectory: git commit -m x -- ${form}`, sweepRefused(`git commit -m x -- ${form}`, SUBDIRECTORY));
for (const form of ['.', './', '*', '?*', '[!.]*', '":(top)clean"', SUBDIRECTORY.split('\\').join('/')]) check(`R2: allowed from a subdirectory, it names that subdirectory only: git commit -m x -- ${form}`, untrackedVerdict(`git commit -m x -- ${form}`, SUBDIRECTORY) === undefined);
for (const form of ['clean', 'clean/*', '":(top)clean"', '"clean/*.md"', `${MSYS_ROOT}/clean`, 'clean/sub/..', '":(literal)*"']) check(`R2: allowed at the root: git commit -m x -- ${form}`, untrackedVerdict(`git commit -m x -- ${form}`) !== 'deny' || untrackedReason(`git commit -m x -- ${form}`).includes('untracked'));
check('R2: a whole-root pathspec in a pathspec file is refused', (() => { writeFileSync(path.join(SPECS, 'root.lst'), `${REPO}\n`); return untrackedReason(`git commit -m x --pathspec-from-file=${spec('root.lst')}`).includes('must name its paths'); })());

// --- R3: an index file that is the live index, or that the line hides, is refused ---------------------------------
const WORKTREE = path.join(SCRATCH, 'linked');

git(REPO, 'worktree', 'add', '-q', '-b', 'linked', WORKTREE);

const LIVE = path.join(REPO, '.git', 'index').split('\\').join('/');
const LINKED_LIVE = path.join(REPO, '.git', 'worktrees', 'linked', 'index').split('\\').join('/');

for (const [command, cwd] of [['GIT_INDEX_FILE=.git/index git read-tree HEAD', REPO], [`GIT_INDEX_FILE=${LIVE} git read-tree HEAD`, REPO], ['GIT_INDEX_FILE=../.git/index git read-tree HEAD', SUBDIRECTORY], ['git read-tree --index-output=.git/index HEAD', REPO], ['git read-tree --index-output .git/index HEAD', SUBDIRECTORY], [`GIT_INDEX_FILE=${MSYS_ROOT}/.git/index git read-tree HEAD`, REPO], [`git read-tree --index-output=${MSYS_ROOT}/.git/index HEAD`, REPO],['GIT_INDEX_FILE="$(git rev-parse --git-path index)" git read-tree HEAD', REPO], ['GIT_INDEX_FILE=$TMP_INDEX git read-tree HEAD', REPO], [`GIT_INDEX_FILE=${LINKED_LIVE} git read-tree HEAD`, WORKTREE], [`GIT_DIR=${REPO_FWD}/.git GIT_INDEX_FILE=${LIVE} git read-tree HEAD`, NOT_A_REPO], ['cd "$X" && GIT_INDEX_FILE=i git read-tree HEAD', REPO]]) {
  check(`R3: refused: ${command}`, untrackedVerdict(command, cwd) === 'deny');
}

for (const [command, cwd] of [['GIT_INDEX_FILE=.git/index.tmp git read-tree HEAD', REPO], [`GIT_INDEX_FILE=${LIVE} git read-tree HEAD`, WORKTREE], ['git read-tree --index-output=../i HEAD', REPO], ['export GIT_INDEX_FILE=/tmp/i; git read-tree HEAD', REPO], ['git read-tree --index-output ../.git/index HEAD', SUBDIRECTORY]]) {
  check(`R3: allowed: ${command}`, untrackedVerdict(command, cwd) === undefined);
}

check('R3: export then unset clears it', untrackedVerdict('export GIT_INDEX_FILE=/tmp/i; unset GIT_INDEX_FILE; git read-tree HEAD') === 'deny');
for (const clearing of ['Remove-Item Env:GIT_INDEX_FILE', 'Remove-Item -Path Env:\\GIT_INDEX_FILE', '$env:GIT_INDEX_FILE = $null', "$env:GIT_INDEX_FILE = ''", '$env:GIT_INDEX_FILE=""']) {
  check(`R3: PowerShell, a variable cleared later on the line is cleared: ${clearing}`, untrackedVerdict(`$env:GIT_INDEX_FILE = "C:\\t\\i"; ${clearing}; git read-tree HEAD`, REPO, 'PowerShell') === 'deny');
}
check('R3: PowerShell, $env:X = $null clears a repository variable, so the commit is checked in its own repository', untrackedVerdict('$env:GIT_DIR = "C:\\nowhere"; $env:GIT_DIR = $null; git commit -m "x" -- mixed', REPO, 'PowerShell') === 'deny');
check('R3: PowerShell, a variable removed and set again counts', untrackedVerdict('Remove-Item Env:GIT_INDEX_FILE; $env:GIT_INDEX_FILE = "C:\\t\\i"; git read-tree HEAD', REPO, 'PowerShell') === undefined);

// --- R4: an earlier command of the line that may write files, before a commit that could cover them ---------------
for (const command of ['touch mixed/x.txt && git commit -m x -- mixed', 'echo a > mixed/y.txt && git commit -m x -- mixed', 'npm run gen && git commit -m x -- clean', 'cp a b && git commit -m x -- "clean/*.txt"','node gen.mjs; git commit -m x -- clean', 'git status > clean/s.txt && git commit -m x -- clean', 'git stash list && git mv a b && git commit -m x -- clean', `echo clean > ${spec('w.lst')} && git commit -m x --pathspec-from-file=${spec('w.lst')}`, `npm run gen && git commit -m x --pathspec-from-file=${spec('clean.lst')}`]) {
  check(`R4: refused as a commit after writes: ${command}`, untrackedReason(command).includes('commit in its own command'));
}
for (const command of ['npm run gen && git commit -m x -- clean/tracked.txt', 'git status && git commit -m x -- clean', 'cat clean/tracked.txt && git commit -m x -- clean', 'git status 2>&1 && git commit -m x -- clean', 'git log > /dev/null && git commit -m x -- clean', 'cd clean && git commit -m x -- .']) {
  check(`R4: allowed: ${command}`, untrackedVerdict(command) === undefined);
}
check('R4: PowerShell, an output file counts and $null does not', untrackedVerdict('Get-Date > clean/d.txt; git commit -m "x" -- clean', REPO, 'PowerShell') === 'deny' && untrackedVerdict('git status *> $null; git commit -m "x" -- clean', REPO, 'PowerShell') === undefined);
writeFileSync(path.join(SPECS, 'tracked.lst'), 'clean/tracked.txt\n');
check('R4: a pathspec file naming one tracked file passes on its own', untrackedVerdict(`git commit -m x --pathspec-from-file=${spec('tracked.lst')}`) === undefined);
check('R4: the same pathspec file rewritten earlier on the line is refused as a commit after writes', untrackedReason(`echo clean/tracked.txt > ${spec('tracked.lst')} && git commit -m x --pathspec-from-file=${spec('tracked.lst')}`).includes('commit in its own command'));
check('R4: the refusal names the writer and says to commit in its own command, in both halves', (() => { const text = untrackedReason('touch mixed/x.txt && git commit -m x -- mixed'); return text.includes('touch mixed/x.txt') && text.includes('commit in its own command') && text.includes('su propio comando'); })());

// --- R4: C-style quoted lines of a pathspec file are unquoted as git does --------------------------------------------
writeFileSync(path.join(SPECS, 'quoted.lst'), '"mixed/n\\145w.txt"\n');
writeFileSync(path.join(SPECS, 'escaped.lst'), '"spaced/a\\040b.txt"\n"clean/tracked.txt"\n');
writeFileSync(path.join(SPECS, 'quoted-nul.lst'), '"mixed"\0');
check('R4: a C-quoted pathspec line with an octal escape is unquoted', untrackedReason(`git commit -m x --pathspec-from-file=${spec('quoted.lst')}`).includes('mixed/new.txt'));
check('R4: an escaped space is unquoted', untrackedReason(`git commit -m x --pathspec-from-file=${spec('escaped.lst')}`).includes('spaced/a b.txt'));
check('R4: with --pathspec-file-nul the quotes stay literal', untrackedVerdict(`git commit -m x --pathspec-file-nul --pathspec-from-file=${spec('quoted-nul.lst')}`) === undefined);

// --- R6: the add exemption reads add's options through git's own table ---------------------------------------------
for (const command of ['git add -u -- mixed/new.txt && git commit -m x -- mixed', 'git add --update -- mixed/new.txt && git commit -m x -- mixed', 'git add --upd -- mixed/new.txt && git commit -m x -- mixed', 'git add -nv -- mixed/new.txt && git commit -m x -- mixed', 'git add --dry -- mixed/new.txt && git commit -m x -- mixed', 'git add -N -- mixed/new.txt && git commit -m x -- mixed', 'git add -p -- mixed/new.txt && git commit -m x -- mixed', `git add --pathspec-from-file=${spec('mixed.lst')} && git commit -m x -- mixed`]) {
  check(`R6: refused: ${command}`, untrackedVerdict(command) === 'deny');
}
for (const command of ['git add -A && git commit -m x -- mixed', 'git add --chmod=+x -- mixed/new.txt && git commit -m x -- mixed', 'git add --chmod +x mixed/new.txt && git commit -m x -- mixed', 'git add -v . && git commit -m x -- mixed', 'git add -n --no-dry-run -- mixed && git commit -m x -- mixed']) {
  check(`R6: allowed: ${command}`, untrackedVerdict(command) === undefined);
}

// --- R7: the repository the line points git at is forwarded to ls-files -----------------------------------------------
check('R7: --git-dir and --work-tree on the line are forwarded', untrackedVerdict(`git --git-dir=${REPO_FWD}/.git --work-tree=${REPO_FWD} commit -m x -- mixed`, NOT_A_REPO) === 'deny');
check('R7: GIT_DIR and GIT_WORK_TREE on the line are forwarded', untrackedVerdict(`GIT_DIR=${REPO_FWD}/.git GIT_WORK_TREE=${REPO_FWD} git commit -m x -- mixed`, NOT_A_REPO) === 'deny');
check('R7: the forwarded variables are resolved against the commit directory', (() => { let seen; untrackedUnderCommits('GIT_DIR=.git GIT_INDEX_FILE=i git commit -m x -- clean', 'bash', REPO, (directory, pathspecs, environment) => { seen = environment; return { files: [] }; }); return seen?.GIT_DIR === path.join(REPO, '.git') && seen?.GIT_INDEX_FILE === path.join(REPO, 'i') && seen?.GIT_WORK_TREE === undefined; })());
check('R7: a hidden GIT_DIR leaves the commit unchecked', (() => { const found = untrackedUnderCommits('GIT_DIR=$G git commit -m x -- clean', 'bash', REPO, () => ({ files: [] })); return found.offender === undefined && found.unchecked.length === 1; })());

// --- R9: a file whose name starts with two dots is inside its directory ------------------------------------------------
put(REPO, 'dots/..env');
check('R9: git add -- dots covers dots/..env', untrackedVerdict('git add -- dots && git commit -m x -- dots') === undefined);

// === THIRD ROUND (2026-10-25): every bypass both judges named, closed by its class ===============================
const psReason = (command, cwd = REPO) => evaluate(JSON.stringify(inDirectory('PowerShell', command, cwd)))?.hookSpecificOutput?.permissionDecisionReason ?? '';
const AFTER_WRITES = 'commit in its own command';

// --- B: earlier writers are an allowlist; `$x = cmd` runs cmd; diff, log and show write with --output -----------
for (const command of ['$x = New-Item clean/z.txt; git commit -m "x" -- clean', '$x = git diff --output=clean/o.txt; git commit -m "x" -- clean', '$x=gen; git commit -m "x" -- clean', '& $tool; git commit -m "x" -- clean']) check(`B: refused as after writes (PowerShell): ${command}`, psReason(command).includes(AFTER_WRITES));
for (const command of ["$x = 'a'; git commit -m \"x\" -- clean", '$x = git status; git commit -m "x" -- clean', '$x = $y; git commit -m "x" -- clean', '$n = 3; git commit -m "x" -- clean']) check(`B: allowed (PowerShell): ${command}`, untrackedVerdict(command, REPO, 'PowerShell') === undefined);
for (const command of ['git diff --output=clean/o.txt && git commit -m x -- clean', 'git log --output clean/o.txt && git commit -m x -- clean', 'git show --outp=clean/o.txt && git commit -m x -- clean', '$CMD && git commit -m x -- clean', 'git mv a b && git commit -m x -- clean']) check(`B: refused as after writes: ${command}`, untrackedReason(command).includes(AFTER_WRITES));
for (const command of ['git diff && git commit -m x -- clean', 'git log --oneline && git commit -m x -- clean', 'git show HEAD && git commit -m x -- clean', 'X=1 && git commit -m x -- clean']) check(`B: allowed: ${command}`, untrackedVerdict(command) === undefined);

// --- C: a selector touched outside the modelled forms makes the line unresolvable --------------------------------
for (const command of ['(export GIT_INDEX_FILE=/tmp/i); git read-tree HEAD', 'true && export GIT_INDEX_FILE=/tmp/i; git read-tree HEAD', 'false || export GIT_INDEX_FILE=/tmp/i; git read-tree HEAD', 'env -u GIT_DIR git commit -m x -- clean', 'env -i git commit -m x -- clean', 'unset ${!GIT_@}; git commit -m x -- clean', 'x=$(export GIT_DIR=y); git commit -m x -- clean', 'GIT_DIR=/tmp/g; git commit -m x -- clean', 'export GIT_DIR; git commit -m x -- clean', 'source env.sh; git commit -m x -- clean', 'eval "$SETUP"; git status', 'export GIT_CONFIG_COUNT=1 | cat; git clean -d', 'declare -x GIT_INDEX_FILE=/tmp/i; git read-tree HEAD']) unresolvableBash(command);
for (const command of ['Remove-Item Env:GIT_*; git commit -m x -- clean', "${env:GIT_INDEX_FILE} = 'C:\\t\\i'; git read-tree HEAD", "[Environment]::SetEnvironmentVariable('GIT_INDEX_FILE', 'C:\\t\\i'); git read-tree HEAD", "Set-Item Env:GIT_INDEX_FILE 'C:\\t\\i'; git read-tree HEAD", "if ($a) { $env:GIT_INDEX_FILE = 'C:\\t\\i' }; git read-tree HEAD", "& { $env:GIT_DIR = 'x' }; git commit -m x -- clean", "Get-Date && $env:GIT_DIR = 'x'; git commit -m x -- clean", 'Get-ChildItem Env: | Remove-Item; git commit -m x -- clean', 'Invoke-Expression $setup; git status']) unresolvablePowerShell(command);
for (const command of ['echo $GIT_DIR; git commit -m x -- clean', 'GIT_DIR=.git git commit -m x -- clean', 'export GIT_INDEX_FILE=/tmp/i && git read-tree HEAD', 'cd clean; export GIT_INDEX_FILE=/tmp/i; git read-tree HEAD']) check(`C: not a touch: ${command}`, !reasonFor(command).includes(UNRESOLVABLE) && !untrackedReason(command).includes(UNRESOLVABLE));
check('C: a --config-env variable is a selector too', reasonFor('(export A=reset); git --config-env=alias.x=A x').includes(UNRESOLVABLE));

// --- D: git's config quoting, its booleans, and a `!` alias's own options ----------------------------------------
check('D: GIT_CONFIG_PARAMETERS entries in both styles, with an escaped quote', JSON.stringify(parametersOf("'a.b=it'\\''s' 'c'='d' 'e' 'f'=")) === JSON.stringify(["a.b=it's", 'c=d', 'e', 'f']));
check('D: a malformed GIT_CONFIG_PARAMETERS does not parse', parametersOf("'open") === undefined && parametersOf('bare') === undefined);
for (const command of ["GIT_CONFIG_PARAMETERS=\"'clean.requireForce'='false'\" git clean -d", "GIT_CONFIG_PARAMETERS=\"'clean.requireforce=0'\" git clean -d", "GIT_CONFIG_PARAMETERS=\"'alias.ci'='commit -a'\" git ci -m x"]) denied(command);
for (const command of ['GIT_CONFIG_PARAMETERS=garbage git status', 'GIT_CONFIG_PARAMETERS="$P" git status', 'git -c "$K=1" status']) unresolvableBash(command);
allowed("GIT_CONFIG_PARAMETERS=\"'clean.requireForce'='true'\" git clean -d");
for (const value of ['00', '0x0', '0X00', '0k', '-0', '+0', 'OFF', 'No']) denied(`git -c clean.requireForce=${value} clean -d`);
for (const value of ['1', '0x1', '010', '1k', 'yes', '08', 'maybe']) allowed(`git -c clean.requireForce=${value} clean -d`);
check('D: gitBoolean follows git (base 0, units, invalid is undefined)', gitBoolean('0x0') === false && gitBoolean('010') === true && gitBoolean('2m') === true && gitBoolean('08') === undefined && gitBoolean('0x') === undefined && gitBoolean('') === false && gitBoolean('On') === true);
for (const command of ["git -c alias.x='!git -c clean.requireForce=false clean -d' x", 'git -c alias.x="-c clean.requireForce=false clean -d" x', "git -c clean.requireForce=false -c alias.x='!git clean -d' x"]) denied(command);
check('D: a ! alias body holding an expansion is unseen', reasonFor("git -c 'alias.x=!$X' x").includes('body the line does not show'));

// --- G: an earlier add counts only into the commit's own index, and is cancelled by a later unstage -------------
for (const command of ['GIT_INDEX_FILE=/tmp/other git add -- mixed/new.txt && git commit -m x -- mixed', 'git add -- mixed/new.txt && git restore --staged -- mixed/new.txt && git commit -m x -- mixed', 'git add -- mixed && git restore --staged -- mixed/new.txt && git commit -m x -- mixed', 'git add -- mixed/new.txt && git rm --cached -q -- mixed/new.txt && git commit -m x -- mixed', 'git add -- mixed/new.txt && git restore --staged && git commit -m x -- mixed']) check(`G: refused, the add does not cover the commit: ${command}`, untrackedReason(command).includes('covers untracked files') && untrackedReason(command).includes('`git add -- mixed/new.txt`'));
for (const command of ['git add -- mixed/new.txt && git restore --staged -- clean && git commit -m x -- mixed', 'git add -- mixed/new.txt && git rm --cached -n -- mixed/new.txt && git commit -m x -- mixed', 'GIT_INDEX_FILE=.git/index git add -- mixed/new.txt && git commit -m x -- mixed']) check(`G: allowed, the add still covers the commit: ${command}`, untrackedVerdict(command) === undefined);

// --- H: the suggested git add names every path; past 10 it is a pathspec file the guard writes -------------------
check('H: up to 10 paths the git add names them all inline', untrackedReason('git commit -m x -- mixed').includes('`git add -- mixed/new.txt`'));
check('H: past 10 paths the git add reads a NUL-separated pathspec file holding every one of them', (() => {
  const text = untrackedReason('git commit -m x -- many');
  const named = /git add --pathspec-file-nul --pathspec-from-file=([^`\s]+)/.exec(text)?.[1]?.replace(/^'|'$/g, '');

  if (named === undefined) return false;

  const listed = readFileSync(named, 'utf8').split('\0').filter(Boolean);

  return listed.length === 12 && listed.includes('many/f01.txt') && listed.includes('many/f12.txt') && text.split('--pathspec-from-file=').length === 3;
})());

// --- the branches each class adds, one case per branch ---------------------------------------------------------
for (const command of ['GIT_DIR=$G git commit -m x -- clean', 'GIT_INDEX_FILE=$I git commit -m x -- clean', 'git --git-dir=$G commit -m x -- clean', 'GIT_WORK_TREE=`pwd` git commit -m x -- clean', 'git read-tree --index-output=$X HEAD', 'GIT_CONFIG_COUNT=$N git status', 'git --config-env=$K=V status', '(export GIT_INDEX_FILE=/tmp/i; true); git read-tree HEAD']) unresolvableBash(command);
for (const command of ['git commit -m x -- a {b}', '[Environment]::SetEnvironmentVariable($n, $v); git status']) unresolvablePowerShell(command);
denied('git read-tree --index-output= HEAD');
denied('git -c "clean.requireForce= 0" clean -d');
for (const command of ['cat MYGIT_DIR_NOTES.txt && git commit -m x -- clean', 'cat GIT_DIRECTORY.md && git commit -m x -- clean', 'git commit -m "GIT_DIR" -- clean', 'GIT_DIR=x npm test; git commit -m x -- clean', 'env X=1 git commit -m x -- clean']) check(`C: not a touch: ${command}`, !reasonFor(command).includes(UNRESOLVABLE));
allowed('env -u X npm test');
check('C: a substitution inside a top-level export does not make the export conditional', untrackedVerdict('export GIT_INDEX_FILE=/tmp/i X=$(true); git read-tree HEAD') === undefined);
check('B: a fused PowerShell assignment of a literal runs no command', untrackedVerdict("$x='a'; git commit -m \"x\" -- clean", REPO, 'PowerShell') === undefined);
check('C: Remove-Item -Path Env:\\NAME is modelled, so setting it again counts', untrackedVerdict('Remove-Item -Path Env:\\GIT_INDEX_FILE; $env:GIT_INDEX_FILE = "C:\\t\\i"; git read-tree HEAD', REPO, 'PowerShell') === undefined);
check('C: $env:X = $null clears it, so the commit is checked in its own repository', psReason('$env:GIT_DIR = "C:\\nowhere"; $env:GIT_DIR = $null; git commit -m "x" -- mixed').includes('covers untracked files'));
for (const command of ['git add -- mixed/new.txt && git restore --staged --pathspec-from-file=x && git commit -m x -- mixed', 'git add -- mixed/new.txt && git -C "$X" restore --staged -- new.txt && git commit -m x -- mixed', `git add -- mixed/new.txt && cd "$X" && git restore --staged -- y && git -C "${REPO_FWD}" commit -m x -- mixed`, 'git add -- mixed/new.txt && git restore --staged -- mixed && git commit -m x -- mixed', `git -C "${NOT_A_REPO}" add -- x && git commit -m x -- mixed`]) check(`G: refused, the add does not cover the commit: ${command}`, untrackedReason(command).includes('covers untracked files'));
check('unresolvable: the refusal names the literal route in both halves', reasonFor('git commit -m x -- $F').includes('spell paths and values literally') && reasonFor('git commit -m x -- $F').includes('escriba las rutas y los valores de forma literal'));

/** The refusal of the 12-file commit with the guard's state in `root`. @es El rechazo del commit de 12 ficheros con el estado en `root`. */
function manyReasonWithState(root) {
  const saved = process.env[STATE_ROOT_VARIABLE];

  process.env[STATE_ROOT_VARIABLE] = root;

  try {
    return untrackedReason('git commit -m x -- many');
  } finally {
    process.env[STATE_ROOT_VARIABLE] = saved;
  }
}

check('H: the pathspec file path is single-quoted for the shell and spelled with forward slashes', (() => {
  const text = manyReasonWithState(path.join(SCRATCH, 'state with space'));
  const quoted = /--pathspec-from-file=('[^']*')/.exec(text)?.[1];

  return quoted !== undefined && !quoted.includes('\\') && readFileSync(quoted.slice(1, -1), 'utf8').split('\0').filter(Boolean).length === 12;
})());
check('H: when the pathspec file cannot be written, the git add names every path inline', (() => {
  writeFileSync(path.join(SCRATCH, 'not-a-directory'), 'x');

  const text = manyReasonWithState(path.join(SCRATCH, 'not-a-directory'));

  return text.includes('git add -- many/f01.txt') && text.includes('many/f12.txt`') && !text.includes('--pathspec-from-file=');
})());

// --- the runtime strings are bilingual ---------------------------------------------------------------------------
check('runtime: an unchecked commit is journaled with a bilingual reason', (() => { const start = journalLines().length; untrackedVerdict('cd "$X" && git commit -m x -- mixed'); return journalLines().slice(start).some((entry) => entry.reason.includes('cannot be followed') && entry.reason.includes(' @es ')); })());
check('runtime: the git adapter errors are bilingual', listWith({ status: 2, stdout: '', stderr: 'x' }).result.error.includes(' @es ') && listWith({ error: Object.assign(new Error('t'), { code: 'ETIMEDOUT' }) }).result.error.includes(' @es '));

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

  return { result: listUntracked('/some/dir', ['a', 'b c'], { GIT_DIR: '/g' }, run), seen };
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
