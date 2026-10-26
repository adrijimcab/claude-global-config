#!/usr/bin/env node
/**
 * Self-test for `write-guard.mjs` and `tree-writes.mjs` (lesson `tree-written-during-its-full-chain`).
 *
 * THE STATE SPACE, enumerated from the decision:
 *   - THE PREMISE: each write shape of the incident (an edit of a tracked file, `git add`, `git commit`) changes what
 *     the selftest runner's tree detector (`selftest-runner/tree-status.mjs`) lists, proved on a repository built here.
 *   - THE INCIDENT, end to end: a REAL chain run through `run.mjs` in a linked worktree named land-backlog-1-6; while
 *     it runs, the Edit of checklists/master-backlog.md, its `git add`, its `git commit` and the chained form are
 *     refused; a script written under TEMP/claude passes (no detector reads it); once the chain ends, the same edit
 *     passes. The record of that chain names the session and the absolute tree.
 *   - LIVENESS: a lock whose owner pid is dead passes even while young; a record of another process than the lock's
 *     owner passes; no lock passes; a record with no tree, or a relative one, passes.
 *   - WHICH WRITES COUNT: every edit tool; redirections, `cp`, `tee`, `sed -i`, PowerShell `Set-Content`; each
 *     status-changing git verb, through `-C` and a `cd`; and NOT the read-only verbs, `stash list`, a mention in
 *     `echo`, an unresolvable target, a write outside the tree, a sibling sharing the tree's name as a prefix, a
 *     write inside a NESTED worktree under the tree, a `git -C` elsewhere, a non-writing tool.
 *   - THE OUTPUT: `deny`, bilingual, names chain, project, session, pid, tree and every target, says how to wait;
 *     fails open on a throwing lock reading, a throwing decision and malformed JSON; the real process via stdin.
 *
 * @es Auto-test de `write-guard.mjs` y `tree-writes.mjs`. LA PREMISA (cada forma de escritura del incidente cambia lo
 * que lista el detector del runner), EL INCIDENTE de punta a punta con una cadena REAL en un worktree
 * land-backlog-1-6, LA VIDA del lock (un pid muerto no bloquea), QUÉ ESCRITURAS CUENTAN y cuáles no (lectura,
 * menciones, árbol anidado, prefijo hermano) y LA SALIDA (bilingüe, nombra la cadena, falla abierto, el shim real).
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { payloadFor } from '../hook-payloads/payloads.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { treeChanges, treeStatus } from '../selftest-runner/tree-status.mjs';
import { MESSAGES } from './messages.mjs';
import { evaluate } from './write-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const GUARD = path.join(HERE, 'write-guard.mjs');
const CHILD = path.join(HERE, 'chain-child.fixture.mjs');

isolateState('full-chain-lock');

const STATE = stateDir('full-chain-lock');
const LOCK = path.join(STATE, 'chain.lock');
const HOLDER = path.join(STATE, 'holder.json');
const SCRATCH = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'fcl-write-guard-')));
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

/** An edit-tool payload. @es Un payload de herramienta de edición. */
const editCall = (tool, file, cwd) => ({ session_id: 'write-guard-selftest', tool_name: tool, cwd, tool_input: tool === 'NotebookEdit' ? { notebook_path: file, new_source: 'x' } : { file_path: file, content: 'x', old_string: 'a', new_string: 'b' } });

/** A shell payload, from the recording. @es Un payload de shell, desde la grabación. */
const shellCall = (tool, command, cwd) => ({ ...payloadFor(tool, command, { sessionId: 'write-guard-selftest' }), cwd });

const verdictOf = (payload, options) => evaluate(JSON.stringify(payload), options)?.hookSpecificOutput?.permissionDecision;

function expect(verdict, payload, label, options) {
  const actual = verdictOf(payload, options);

  check(`${verdict}: ${label}`, actual === (verdict === 'deny' ? 'deny' : undefined), `got ${String(actual)}`);
}

/** A repository with checklists/master-backlog.md committed, and a linked worktree named land-backlog-1-6. @es Un repo con el backlog commiteado y un worktree enlazado land-backlog-1-6. */
function incidentRepository(root) {
  const main = path.join(root, 'claude');
  const worktree = path.join(root, 'land-backlog-1-6');

  mkdirSync(path.join(main, 'checklists'), { recursive: true });
  git(root, 'init', '--quiet', '--initial-branch=master', main);
  git(main, 'config', 'user.email', 'selftest@example.invalid');
  git(main, 'config', 'user.name', 'selftest');
  git(main, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  writeFileSync(path.join(main, 'checklists', 'master-backlog.md'), '# backlog\n');
  git(main, 'add', 'checklists/master-backlog.md');
  git(main, 'commit', '--quiet', '-m', 'docs(backlog): start');
  git(main, 'worktree', 'add', '--quiet', worktree, '-b', 'land-backlog-1-6');

  return { main, worktree, backlog: path.join(worktree, 'checklists', 'master-backlog.md') };
}

const until = async (condition, label, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

// --- THE PREMISE: each incident write is an escape for the runner's tree detector ---------------------------
{
  const { worktree, backlog } = incidentRepository(path.join(SCRATCH, 'premise'));
  const kinds = [];
  let before = treeStatus(worktree);

  writeFileSync(backlog, '# backlog\n- P2-12\n');
  kinds.push(treeChanges(before, treeStatus(worktree)).map(({ change }) => change).join());
  before = treeStatus(worktree);
  git(worktree, 'add', 'checklists/master-backlog.md');
  kinds.push(treeChanges(before, treeStatus(worktree)).map(({ change }) => change).join());
  before = treeStatus(worktree);
  git(worktree, 'commit', '--quiet', '-m', 'docs(backlog): record P2-12');
  kinds.push(treeChanges(before, treeStatus(worktree)).map(({ change }) => change).join());

  check('premise: the edit, the git add and the git commit are each a tree escape (added, changed, removed)', kinds.join(' / ') === 'added / changed / removed', kinds.join(' / '));
}

// --- THE INCIDENT, end to end, under a REAL chain -------------------------------------------------------------
{
  const { worktree, backlog } = incidentRepository(path.join(SCRATCH, 'incident'));
  const claudeTemp = path.join(SCRATCH, 'TEMP', 'claude');
  const chain = spawn(process.execPath, [RUN, '--chain', 'selftest-runner', '--project', 'claude-global', '--', process.execPath, CHILD, 'hold', path.join(SCRATCH, 'chain.log'), 'C', '120000'], { cwd: path.join(worktree, 'checklists'), env: { ...cleanEnv, CLAUDE_CODE_SESSION_ID: 'session-of-2026-10-26' }, stdio: 'ignore', windowsHide: true });
  const ended = new Promise((resolve) => chain.once('close', resolve));

  try {
    await until(() => existsSync(HOLDER) && existsSync(path.join(SCRATCH, 'chain.log')), 'the chain to start');

    const refusal = evaluate(JSON.stringify(editCall('Edit', backlog, worktree)));
    const text = refusal?.hookSpecificOutput?.permissionDecisionReason ?? '';

    check('incident: the Edit of checklists/master-backlog.md under the running chain is refused', refusal?.hookSpecificOutput?.permissionDecision === 'deny', JSON.stringify(refusal));
    check('incident: the refusal names the chain, the harness session and the absolute tree the record now carries', text.includes('selftest-runner') && text.includes('session-of-2026-10-26') && text.includes(worktree) && text.includes(backlog), text);
    check('incident: the refusal names the runner pid', text.includes(`pid ${String(chain.pid)}`), text);
    expect('deny', shellCall('Bash', 'git add checklists/master-backlog.md', worktree), 'incident: its git add');
    expect('deny', shellCall('Bash', 'git commit -m "docs(backlog): record P2-12"', worktree), 'incident: its git commit');
    expect('deny', shellCall('Bash', 'git add checklists/master-backlog.md && git commit -m "docs(backlog): record P2-12"', worktree), 'incident: add and commit chained');
    expect('deny', editCall('Write', backlog, worktree), 'incident: a Write of the same file');
    expect('allow', editCall('Write', path.join(claudeTemp, 'probe.mjs'), worktree), 'incident: the script under TEMP/claude (no detector reads it)');
    expect('allow', shellCall('Bash', 'git status && git log --oneline -3', worktree), 'incident: reading the tree');
  } finally {
    chain.kill('SIGTERM');
    await ended;
  }

  check('incident: the chain released its lock when it ended', !existsSync(LOCK) && !existsSync(HOLDER));
  expect('allow', editCall('Edit', backlog, worktree), 'incident: the same edit once the chain has ended');
}

// --- LIVENESS, through the real lock files -------------------------------------------------------------------
const deadPid = (() => {
  for (let tries = 0; tries < 20; tries += 1) {
    const { pid } = spawnSync(process.execPath, ['-e', '0']);

    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return pid;
    }
  }

  throw new Error('no dead pid could be confirmed. @es no se pudo confirmar ningún pid muerto.');
})();
const TREE = path.join(SCRATCH, 'measured');
const recordOf = (pid, tree = TREE) => ({ session: 's', project: 'p', chain: 'c', tree, pid, startedAt: '2026-10-26T10:00:00.000Z', command: 'x' });

function plantLock(ownerPid, record) {
  mkdirSync(STATE, { recursive: true });
  writeFileSync(LOCK, `${String(ownerPid)}:planted`);
  writeFileSync(HOLDER, JSON.stringify(record));
}

mkdirSync(path.join(TREE, 'src'), { recursive: true });
const inTree = editCall('Edit', path.join(TREE, 'src', 'a.mjs'), TREE);

plantLock(process.pid, recordOf(process.pid));
expect('deny', inTree, 'liveness: a lock whose owner is alive and whose record is its own blocks');
plantLock(deadPid, recordOf(deadPid));
expect('allow', inTree, 'liveness: a YOUNG lock whose owner pid is dead does not block');
plantLock(process.pid, recordOf(process.pid + 1));
expect('allow', inTree, 'liveness: a record of another process than the lock owner does not block');
rmSync(STATE, { recursive: true, force: true });
expect('allow', inTree, 'liveness: no lock does not block');

const holding = (record) => ({ holderOf: () => record });

expect('allow', inTree, 'a record with no tree passes (written before the tree was recorded)', holding({ ...recordOf(1), tree: undefined }));
expect('allow', inTree, 'a record with a relative tree passes, even one that resolves onto the target', holding(recordOf(1, path.relative(process.cwd(), TREE))));

// --- WHICH WRITES COUNT ----------------------------------------------------------------------------------------
const live = holding(recordOf(4242));
const nested = path.join(TREE, '.claude', 'worktrees', 'agent-a');

mkdirSync(nested, { recursive: true });
writeFileSync(path.join(nested, '.git'), 'gitdir: elsewhere\n');
mkdirSync(path.join(SCRATCH, 'measured-sibling'), { recursive: true });

for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) expect('deny', editCall(tool, path.join(TREE, 'src', 'a.mjs'), SCRATCH), `${tool} inside the tree`, live);
expect('deny', editCall('Edit', 'src/a.mjs', TREE), 'a relative Edit resolved against a cwd inside the tree', live);
expect('deny', shellCall('Bash', 'echo x > src/a.mjs', TREE), 'a redirection inside the tree', live);
expect('deny', shellCall('Bash', `cp /etc/hostname ${path.join(TREE, 'b.txt')}`, SCRATCH), 'cp onto the tree', live);
expect('deny', shellCall('Bash', `echo x | tee ${path.join(TREE, 'c.txt')}`, SCRATCH), 'tee into the tree', live);
expect('deny', shellCall('Bash', "sed -i 's/a/b/' src/a.mjs", TREE), 'sed -i inside the tree', live);
expect('deny', shellCall('PowerShell', `Set-Content -Path ${path.join(TREE, 'd.txt')} -Value y`, SCRATCH), 'PowerShell Set-Content into the tree', live);
expect('deny', shellCall('Bash', `cd ${TREE} && echo x > e.txt`, SCRATCH), 'a redirection after cd into the tree', live);
expect('deny', editCall('Edit', path.join(TREE, '.claude', 'settings.json'), TREE), 'an ignored-looking path that is not a nested tree', live);

for (const verb of ['add -A', 'commit -m x', 'reset --hard', 'checkout -- a', 'switch b', 'restore a', 'rm a', 'mv a b', 'stash', 'stash pop', 'merge b', 'cherry-pick abc', 'revert abc', 'rebase b', 'pull', 'apply p.diff', 'am p.mbox', 'clean -fd']) {
  expect('deny', shellCall('Bash', `git ${verb}`, TREE), `git ${verb} inside the tree`, live);
}

expect('deny', shellCall('Bash', `git -C ${TREE} commit -m x`, SCRATCH), 'git -C <tree> commit from outside', live);
expect('deny', shellCall('Bash', `cd ${path.join(TREE, 'src')} && git add a.mjs`, SCRATCH), 'git add after cd into a subdirectory of the tree', live);
expect('deny', shellCall('PowerShell', 'git commit -m x', TREE), 'PowerShell git commit inside the tree', live);
expect('deny', shellCall('Bash', 'bash -c "git commit -m x"', TREE), 'git commit inside bash -c', live);

for (const reading of ['git status', 'git log --oneline', 'git diff', 'git show HEAD', 'git stash list', 'git stash show -p', 'git fetch', 'git rev-parse HEAD', 'git branch --list']) {
  expect('allow', shellCall('Bash', reading, TREE), `${reading} only reads`, live);
}

expect('allow', shellCall('Bash', 'echo "git commit -m x"', TREE), 'a mention of git commit in echo', live);
expect('allow', shellCall('Bash', 'echo x > "$LOG_FILE"', TREE), 'an unresolvable target is allowed, as both other lexer callers allow it', live);
expect('allow', editCall('Edit', path.join(SCRATCH, 'elsewhere.txt'), TREE), 'an Edit outside the tree', live);
expect('allow', editCall('Edit', path.join(SCRATCH, 'measured-sibling', 'a.txt'), TREE), 'a sibling whose name starts with the tree name', live);
expect('allow', editCall('Edit', path.join(nested, 'src', 'x.mjs'), TREE), 'an Edit inside a NESTED worktree under the tree', live);
expect('allow', shellCall('Bash', 'git commit -m x', nested), 'a git commit inside a nested worktree', live);
expect('allow', shellCall('Bash', `git -C ${SCRATCH} commit -m x`, TREE), 'git -C elsewhere from a cwd inside the tree', live);
expect('allow', { ...editCall('Edit', path.join(TREE, 'a'), TREE), tool_name: 'Read' }, 'a tool that writes nothing', live);

// --- THE OUTPUT -------------------------------------------------------------------------------------------------
const denied = evaluate(JSON.stringify(shellCall('Bash', `echo x > ${path.join(TREE, 'one.txt')} && git commit -m x`, TREE)), live);
const text = denied?.hookSpecificOutput?.permissionDecisionReason ?? '';
const spanishStarts = text.indexOf(' @es ');

check('refusal event is PreToolUse', denied?.hookSpecificOutput?.hookEventName === 'PreToolUse');
check('refusal is bilingual: English, then " @es " Spanish with accents', spanishStarts > 0 && text.includes('REFUSED') && text.includes('RECHAZÓ') && text.includes('sesión') && text.indexOf('REFUSED') < spanishStarts, text);
check('refusal names every target with how it writes', text.includes(`${path.join(TREE, 'one.txt')} (a shell redirection)`) && text.includes(`${TREE} (git commit)`), text);
check('refusal names chain, project, session, pid, start and tree', ['c of project p', 'session s', 'pid 4242', '2026-10-26T10:00:00.000Z', `measuring ${TREE}`].every((part) => text.includes(part)), text);
check('refusal says how to wait without polling, and that it lifts by itself', text.includes('DO NOT POLL') && text.includes('lifts by itself') && text.includes('SIN SONDEAR'), text);
check('refusal carries the measured incident in both halves', text.slice(0, spanishStarts).includes('2026-10-26') && text.slice(spanishStarts).includes('2026-10-26'));
check('the message table has no bilingual problems', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

const throwing = () => { throw new Error('boom'); };

/** The verdict, or `{ escaped }` when a throw leaves `evaluate`: an escaped throw is a failed check, never a crash. @es El veredicto, o lo que escapó. */
const guarded = (raw, options) => {
  try {
    return evaluate(raw, options);
  } catch (error) {
    return { escaped: error.message };
  }
};

check('a lock reading that throws fails open', guarded(JSON.stringify(inTree), { holderOf: throwing }) === undefined);
check('a decision that throws fails open', guarded(JSON.stringify(inTree), { ...live, decide: throwing }) === undefined);
check('malformed JSON fails open', guarded('{not json', live) === undefined);

// --- THE SHIM: the real process, stdin in, stdout out ---------------------------------------------------------
plantLock(process.pid, recordOf(process.pid));

const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', env: process.env, windowsHide: true });
const viaShim = run(JSON.stringify(inTree));
const viaShimOutside = run(JSON.stringify(editCall('Edit', path.join(SCRATCH, 'free.txt'), SCRATCH)));

check('shim: a write into a measured tree is denied on stdout, exit 0', viaShim.status === 0 && viaShim.stdout.includes('"permissionDecision":"deny"'), viaShim.stdout + viaShim.stderr);
check('shim: a write elsewhere prints nothing, exit 0', viaShimOutside.status === 0 && viaShimOutside.stdout === '');
rmSync(STATE, { recursive: true, force: true });

process.stdout.write(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed === 0 ? 0 : 1);
