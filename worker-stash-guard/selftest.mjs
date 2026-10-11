#!/usr/bin/env node
/**
 * Self-test for worker-stash-guard (2026-10-11 incident: two workers in linked worktrees shared one stash stack).
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - THE PREMISE: `refs/stash` is shared by all linked worktrees. Proved on a repository CONSTRUCTED here,
 *     so the guard is never built on a claim nobody ran.
 *   - WHO CALLS: a subagent by `agent_id`; a subagent by a transcript under `subagents` with no `agent_id`;
 *     the main session (neither signal). The main session is allowed every form.
 *   - WHICH VERB, as a subagent: bare, push, save, pop, apply, drop, clear, branch, `-u`; `list` and `show`
 *     read only and pass.
 *   - HOW IT IS REACHED: `git -C <dir>`, `git -c k=v`, a `&&` chain, a `;` chain, a `$(...)` substitution,
 *     `bash -c "..."`, a subshell, and the PowerShell spelling (`;`, call operator, `git.exe`).
 *   - DATA, not commands: `git stash` inside `echo`, a double-quoted and a single-quoted `-m` message, a
 *     heredoc body, a comment. All must pass for a subagent.
 *   - NEAR MISSES: `git stashed`, `git status`, `git stash-like`, `git commit` (the remedy itself), no
 *     `git` at all.
 *   - THE SHAPE OF THE OUTPUT: `deny`, English first, ` @es ` Spanish with accents, names the incident, names
 *     the remedy; a non-shell tool, a payload with no command, malformed JSON and a BOM-prefixed payload.
 *
 * @es Auto-test del worker-stash-guard. Estados: la PREMISA (`refs/stash` compartido, probada en un repo
 * construido aquí), quién llama (subagente por `agent_id`, por transcript, sesión principal), qué verbo, cómo
 * se alcanza (`-C`, cadenas, `$(...)`, `bash -c`, subshell, PowerShell), lo que es DATO (echo, mensajes,
 * heredoc, comentario), casi-aciertos (`git stashed`, `git status`) y la forma de la salida.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { evaluate } from './guard.mjs';
import { MESSAGES } from './refusal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARD = path.join(HERE, 'guard.mjs');
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

/** A subagent payload: the recording already carries an `agent_id`. @es Un payload de subagente. */
function asSubagent(tool, command) {
  return { ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd: CWD };
}

/** A main-session payload: the recording minus its subagent identity. @es Un payload de sesión principal. */
function asMain(tool, command) {
  const { agent_id: _agentId, agent_type: _agentType, ...rest } = asSubagent(tool, command);

  return rest;
}

/** A subagent known ONLY by its transcript directory. @es Un subagente conocido solo por su transcript. */
function asTranscriptOnlySubagent(tool, command) {
  return { ...asMain(tool, command), transcript_path: 'C:/Users/x/.claude/projects/p/s1/subagents/agent-abc.jsonl' };
}

const verdictOf = (payload) => evaluate(JSON.stringify(payload))?.hookSpecificOutput?.permissionDecision;

function expect(verdict, payload, label) {
  const actual = verdictOf(payload);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

// --- THE PREMISE, on a repository constructed here ----------------------------------------------
const root = mkdtempSync(path.join(os.tmpdir(), 'worker-stash-'));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

try {
  const main = path.join(root, 'main');
  const linked = path.join(root, 'linked');

  mkdirSync(main);
  git(main, 'init', '--quiet', '--initial-branch=main');
  git(main, 'config', 'user.email', 'selftest@example.invalid');
  git(main, 'config', 'user.name', 'selftest');
  git(main, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  writeFileSync(path.join(main, 'file.txt'), 'one\n');
  git(main, 'add', 'file.txt');
  git(main, 'commit', '--quiet', '-m', 'initial');
  git(main, 'worktree', 'add', '--quiet', linked, '-b', 'worker-branch');
  writeFileSync(path.join(linked, 'file.txt'), 'one\ntwo\n');
  git(linked, 'stash', 'push', '--quiet', '-m', 'made-in-the-linked-worktree');

  check('premise: a stash made in a linked worktree is listed from the main checkout', git(main, 'stash', 'list').includes('made-in-the-linked-worktree'));
} finally {
  rmSync(root, { recursive: true, force: true });
}

// --- WHO CALLS ----------------------------------------------------------------------------------
expect('deny', asSubagent('Bash', 'git stash'), 'subagent by agent_id, bare stash');
expect('deny', asTranscriptOnlySubagent('Bash', 'git stash'), 'subagent known only by its transcript directory');
expect('allow', asMain('Bash', 'git stash'), 'main session, bare stash');
expect('allow', asMain('Bash', 'git stash pop'), 'main session, pop');
expect('allow', asMain('PowerShell', 'git stash drop'), 'main session, PowerShell drop');

// --- WHICH VERB, as a subagent ------------------------------------------------------------------
for (const verb of ['push', 'push -m wip', 'save wip', 'pop', 'apply', 'apply stash@{1}', 'drop', 'clear', 'branch b', '-u', '--keep-index', 'create', 'store abc']) {
  expect('deny', asSubagent('Bash', `git stash ${verb}`), `subagent, git stash ${verb}`);
}

expect('allow', asSubagent('Bash', 'git stash list'), 'subagent may read the stack: list');
expect('allow', asSubagent('Bash', 'git stash show -p stash@{0}'), 'subagent may read the stack: show');

// --- HOW IT IS REACHED --------------------------------------------------------------------------
expect('deny', asSubagent('Bash', 'git -C C:/some/worktree stash pop'), 'through git -C');
expect('deny', asSubagent('Bash', 'git -c user.name=x stash'), 'through git -c');
expect('deny', asSubagent('Bash', 'git add -A && git stash'), 'after &&');
expect('deny', asSubagent('Bash', 'git status; git stash push'), 'after ;');
expect('deny', asSubagent('Bash', 'git status || git stash pop'), 'after ||');
expect('deny', asSubagent('Bash', 'echo $(git stash pop)'), 'inside $(...)');
expect('deny', asSubagent('Bash', 'bash -c "git stash"'), 'inside bash -c');
expect('deny', asSubagent('Bash', '(cd sub && git stash)'), 'inside a subshell');
expect('deny', asSubagent('Bash', 'git status | cat; git stash apply'), 'after a pipe and ;');
expect('deny', asSubagent('PowerShell', 'git stash'), 'PowerShell, bare');
expect('deny', asSubagent('PowerShell', 'git status; git stash pop'), 'PowerShell, after ;');
expect('deny', asSubagent('PowerShell', '& git stash push'), 'PowerShell, call operator');
expect('deny', asSubagent('PowerShell', 'git.exe stash drop'), 'PowerShell, git.exe');
expect('allow', asSubagent('PowerShell', 'git stash list'), 'PowerShell, list');

// --- DATA, NOT COMMANDS -------------------------------------------------------------------------
expect('allow', asSubagent('Bash', 'echo git stash pop'), 'echo mentions it');
expect('allow', asSubagent('Bash', 'git commit -m "do not git stash here"'), 'double-quoted commit message');
expect('allow', asSubagent('Bash', "git commit -m 'never run git stash pop'"), 'single-quoted commit message');
expect('allow', asSubagent('Bash', 'cat <<EOF\ngit stash pop\nEOF'), 'heredoc body');
expect('allow', asSubagent('Bash', 'git status # git stash pop'), 'comment');
expect('allow', asSubagent('PowerShell', 'Write-Output "git stash pop"'), 'PowerShell string');
expect('allow', asSubagent('PowerShell', "@'\ngit stash pop\n'@ | Out-Null"), 'PowerShell here-string');

// --- NEAR MISSES --------------------------------------------------------------------------------
expect('allow', asSubagent('Bash', 'git stashed'), 'git stashed is another word');
expect('allow', asSubagent('Bash', 'git stash-like'), 'git stash-like is another word');
expect('allow', asSubagent('Bash', 'git status'), 'git status');
expect('allow', asSubagent('Bash', 'git commit -m "wip" -- a.txt'), 'the remedy itself: a commit');
expect('allow', asSubagent('Bash', 'ls stash'), 'no git at all');
expect('allow', asSubagent('Bash', 'npm run stash'), 'a script named stash');

// --- THE SHAPE OF THE OUTPUT --------------------------------------------------------------------
const refusal = evaluate(JSON.stringify(asSubagent('Bash', 'git stash pop')));
const text = refusal?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('refusal event is PreToolUse', refusal?.hookSpecificOutput?.hookEventName === 'PreToolUse');
check('refusal is bilingual: English then " @es " Spanish', text.includes('REFUSED') && text.includes('  @es ') && text.indexOf('REFUSED') < text.indexOf('@es'));
check('refusal keeps the Spanish accents', text.includes('RECHAZÓ') && text.includes('POR QUÉ') && text.includes('está'));
const spanishStarts = text.indexOf('  @es ');
const [englishHalf, spanishHalf] = [text.slice(0, spanishStarts), text.slice(spanishStarts)];

for (const [name, half] of [['English', englishHalf], ['Spanish', spanishHalf]]) {
  check(`refusal names the shared-stack incident in the ${name} half`, half.includes('refs/stash') && half.includes('124b632f') && half.includes('lint-staged'));
}

check('refusal gives the working alternative: commit on the own branch', text.includes('git commit') && text.includes('OWN branch'));
const named = evaluate(JSON.stringify(asSubagent('Bash', 'git stash push -m zz-unique-marker')))?.hookSpecificOutput?.permissionDecisionReason ?? '';

check('refusal names the offending command', named.includes('git stash push -m zz-unique-marker'));
/** The verdict when the decision itself throws; a throw that escapes is a failed check, not a crash. @es El veredicto cuando la decisión lanza. */
function verdictWhenDecisionThrows() {
  try {
    return evaluate(JSON.stringify(asSubagent('Bash', 'git stash')), () => { throw new Error('boom'); });
  } catch (error) {
    return { escaped: error.message };
  }
}

check('an internal failure of the decision fails open', verdictWhenDecisionThrows() === undefined);
check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

check('a non-shell tool is not this guard\'s business', verdictOf({ ...asSubagent('Bash', 'git stash'), tool_name: 'Read' }) === undefined);
check('a payload with no command passes', verdictOf({ ...asSubagent('Bash', 'x'), tool_input: {} }) === undefined);
check('malformed JSON passes (fails open)', evaluate('{not json') === undefined);

// --- THE SHIM: the real process, stdin in, stdout out, with and without a BOM -------------------
const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', windowsHide: true });
const viaShim = run(JSON.stringify(asSubagent('Bash', 'git stash')));
const viaShimBom = run(`\uFEFF${JSON.stringify(asSubagent('Bash', 'git stash'))}`);
const viaShimMain = run(JSON.stringify(asMain('Bash', 'git stash')));

check('shim: a subagent stash is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'));
check('shim: a BOM-prefixed payload is denied too', viaShimBom.status === 0 && viaShimBom.stdout.includes('"deny"'));
check('shim: the main session prints nothing, exit 0', viaShimMain.status === 0 && viaShimMain.stdout === '');

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
