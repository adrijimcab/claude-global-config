#!/usr/bin/env node
/**
 * Self-test for the engram-persistence guard.
 *
 * It exercises the DECISION's state space on CONSTRUCTED fixtures — a throwaway git repository and a
 * throwaway transcript file per case — so nothing here reads live state that could rot underneath it.
 * That matters more than usual: the fourth face of `guard-that-cannot-go-red` is a selftest whose
 * fixture is live mutable state, which reddens over a correct tree and teaches people to switch the
 * guard off.
 *
 * The case that decides whether this guard is honest is ORDER: a save written BEFORE the commits must
 * NOT satisfy them. A guard that accepted it would be green on exactly the situation it exists to
 * catch — work landing after the last time anyone wrote anything down.
 *
 * @es Auto-test sobre fixtures CONSTRUIDOS: un repo git desechable y un transcript desechable por
 * caso, nunca estado vivo. El caso que decide si este guard es honesto es el del ORDEN: un guardado
 * ANTERIOR a los commits no debe satisfacerlos.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('engram-persistence');

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const STATE_DIR = stateDir('engram-persistence');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const scratches = [];

// Every scratch directory is removed on every exit, a throw included: a selftest leaves nothing behind it.
// @es Todo directorio de prueba se elimina en toda salida, también ante una excepción: un selftest no deja nada.
process.once('exit', () => scratches.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** A fresh temporary directory, removed when the run exits. @es Un directorio temporal nuevo, eliminado al salir. */
function scratchDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));

  scratches.push(dir);

  return dir;
}

/** A repository with one commit, and a second on demand. @es Un repo con un commit, y otro a demanda. */
function makeRepo() {
  const dir = scratchDir('engram-guard-');

  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'selftest@example.com']);
  git(dir, ['config', 'user.name', 'selftest']);
  writeFileSync(join(dir, 'a.txt'), 'one', 'utf8');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'chore(seed): first']);

  return dir;
}

let callCounter = 0;

/** One shell call as the two transcript records Claude Code writes: its tool_use and its tool_result. @es Una llamada de shell como los dos registros del transcript: tool_use y tool_result. */
function shellCall(command, startMs, endMs, { tool = 'Bash', failed = false } = {}) {
  const id = `toolu_${(callCounter += 1)}`;
  const use = { timestamp: new Date(startMs).toISOString(), message: { content: [{ type: 'tool_use', id, name: tool, input: { command } }] } };
  const result = { timestamp: new Date(endMs).toISOString(), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: failed }] } };

  return `${JSON.stringify(use)}\n${JSON.stringify(result)}\n`;
}

/** A commit whose committer date is `atMs`, made without any transcript evidence. @es Un commit con fecha de committer `atMs`, sin evidencia en el transcript. */
function commitAt(dir, subject, atMs) {
  writeFileSync(join(dir, `${subject}.txt`), subject, 'utf8');
  git(dir, ['add', '-A']);
  execFileSync('git', ['commit', '-q', '-m', `feat(x): ${subject}`], { cwd: dir, env: { ...process.env, GIT_COMMITTER_DATE: new Date(atMs).toISOString() } });

  return git(dir, ['rev-parse', 'HEAD']);
}

const ownCalls = new Map();

/** The transcript text of every commit call `advance` made in `dir`. @es El texto del transcript de cada llamada de commit que `advance` hizo en `dir`. */
const callsFor = (dir) => ownCalls.get(dir) ?? '';

/** A commit THIS session makes through `git commit`, recorded in `callsFor(dir)`. @es Un commit que ESTA sesión hace con `git commit`, anotado en `callsFor(dir)`. */
function advance(dir, subject) {
  const start = Date.now();
  const hash = commitAt(dir, subject, start);

  ownCalls.set(dir, callsFor(dir) + shellCall(`git commit -m "feat(x): ${subject}"`, start, Date.now()));

  return hash;
}

/**
 * Runs the guard in `dir` with `payload` on stdin (a string is sent as it is, anything else as JSON), and
 * reports what it printed, its exit code and its stderr. Git is told never to look above `dir`'s parent, so
 * a fixture that must NOT be a repository cannot become one through whatever the machine keeps above it.
 * @es Corre el guard en `dir`; un string se envía tal cual y lo demás como JSON. Git no mira por encima del
 * padre de `dir`: un fixture que NO debe ser repo no puede serlo por lo que la máquina tenga por encima.
 */
function run(dir, payload) {
  const result = spawnSync('node', [GUARD], {
    cwd: dir,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) }
  });

  return { output: result.stdout ?? '', code: result.status, stderr: result.stderr ?? '' };
}

const stateOf = (session) => {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, `${session}.json`), 'utf8'));
  } catch {
    return undefined;
  }
};

const SAVED = 'start\ncalled mem_save with the decision\n';

const results = [];
const check = (label, expected, actual, extra = '') => {
  const ok = expected === actual;

  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expected} actual=${actual}  ${label}${extra}`);
};

const verdict = ({ output }) => (output.includes('"block"') ? 'block' : 'allow');

mkdirSync(STATE_DIR, { recursive: true });

// --- CASE 1: first sighting records a baseline and allows.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-first-${Date.now()}`;
  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('first sighting of a session records a baseline', 'allow', verdict(r));
}

// --- CASE 2: HEAD unchanged → nothing landed → allow.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-still-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('HEAD unchanged — nothing landed', 'allow', verdict(r));
}

// --- CASE 3: THE ONE THAT MATTERS — HEAD moved, no save in the new tail → block, naming the commit.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-block-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed');
  writeFileSync(transcript, `start\nsome ordinary work, no memory call\n${callsFor(dir)}`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('HEAD moved with no save — refuses', 'block', verdict(r));
  check('  and the refusal NAMES the commit', true, r.output.includes('feat(x): landed'));
}

// --- CASE 4: HEAD moved and a save follows it → allow.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-saved-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed');
  writeFileSync(transcript, `start\n${callsFor(dir)}called mem_save with the decision\n`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('HEAD moved and a save follows — allows', 'allow', verdict(r));
}

// --- CASE 5: ORDER. A save written BEFORE the commits must NOT satisfy them. This is the case the
//     whole offset mechanism exists for; without it a stale save covers every future commit.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\ncalled mem_save earlier, before any of this\n', 'utf8');

  const session = `st-order-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'after-the-save');
  writeFileSync(transcript, `start\ncalled mem_save earlier, before any of this\nplain work now\n${callsFor(dir)}`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('a save BEFORE the commits does not cover them', 'block', verdict(r));
}

// --- CASE 6: stop_hook_active → allow immediately, so the guard can never trap a turn.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-active-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed');
  writeFileSync(transcript, `start\nno save\n${callsFor(dir)}`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript, stop_hook_active: true });

  check('stop_hook_active — never traps a turn', 'allow', verdict(r));
}

// --- CASE 7: THE REAL FAILURE, measured 2026-09-14. The offset is a BYTE count (`statSync().size`), so
//     a transcript full of multi-byte text (Spanish accents, box-drawing, emoji) must still be cut in
//     BYTES. Cutting a decoded string by that byte offset lands past its end: the tail came back EMPTY,
//     the guard never saw a save, and it refused twice right after real saves. On the live transcript the
//     drift was 459,662 bytes. The prefix below is deliberately multi-byte and larger than the tail.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');
  const multiByteHistory = `${'Decisión integrada — ✓ ─────── «señal» '.repeat(400)}\n`;

  writeFileSync(transcript, multiByteHistory, 'utf8');

  const session = `st-multibyte-save-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed-after-accents');
  writeFileSync(transcript, `${multiByteHistory}${callsFor(dir)}called mem_save with the decision\n`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('REAL CASE: multi-byte history, then a save after the commits — allows', 'allow', verdict(r));
}

// --- CASE 8: the same multi-byte history WITHOUT a save must still refuse — the byte fix must not turn
//     into a guard that allows everything once the transcript contains accents.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');
  const multiByteHistory = `${'Decisión integrada — ✓ ─────── «señal» '.repeat(400)}\n`;

  writeFileSync(transcript, multiByteHistory, 'utf8');

  const session = `st-multibyte-nosave-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed-no-save');
  writeFileSync(transcript, `${multiByteHistory}ordinary work, no memory call — ñ\n${callsFor(dir)}`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('multi-byte history, no save after the commits — still refuses', 'block', verdict(r));
}

// --- FAIL-OPEN: every malfunction of its own must let the turn end.
{
  const dir = makeRepo();

  check('garbage payload', 'allow', verdict(run(dir, 'NOT JSON')));
  check('no session id, no transcript', 'allow', verdict(run(dir, {})));
}

{
  // Outside a repository entirely: no git, no verdict, no baseline, and nothing leaked on stderr.
  // @es Fuera de todo repo: sin git no hay veredicto ni línea base, y nada se filtra por stderr.
  const dir = scratchDir('engram-guard-nogit-');
  const session = `st-nogit-${Date.now()}`;
  const r = run(dir, { session_id: session, transcript_path: 'nope' });

  check('outside a git repository', 'allow', verdict(r));
  check('  and it records no baseline', undefined, stateOf(session));
  check('  and git\'s own complaint does not leak to stderr', '', r.stderr);
}

// --- THE REST OF THE STATE SPACE. Each case below pins one decision the guard makes.
// @es EL RESTO DEL ESPACIO DE ESTADOS. Cada caso fija una decisión del guard.

/** A fresh repo with a transcript and a baseline already recorded for `name`. @es Un repo con transcript y línea base para `name`. */
function baselined(name, transcriptText = 'start\n') {
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');
  const session = `st-${name}-${Date.now()}`;

  writeFileSync(transcript, transcriptText, 'utf8');
  run(dir, { session_id: session, transcript_path: transcript });

  return { dir, transcript, session };
}

{
  // A save written while the guard idled (same HEAD) is still BEFORE the commits that follow it.
  const { dir, transcript, session } = baselined('idle-save');

  writeFileSync(transcript, SAVED, 'utf8');
  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'after-the-idle-stop');
  writeFileSync(transcript, `${SAVED}plain work\n${callsFor(dir)}`, 'utf8');
  check('a save made during an idle Stop does not cover later commits', 'block', verdict(run(dir, { session_id: session, transcript_path: transcript })));
}

{
  const { dir, transcript, session } = baselined('summary');

  advance(dir, 'landed');
  writeFileSync(transcript, `start\n${callsFor(dir)}called mem_session_summary to close out\n`, 'utf8');
  check('a session summary is a save too', 'allow', verdict(run(dir, { session_id: session, transcript_path: transcript })));
}

{
  // A satisfied guard moves its baseline: the same save cannot be spent on the next commits.
  const { dir, transcript, session } = baselined('spent');

  advance(dir, 'first');
  writeFileSync(transcript, SAVED, 'utf8');
  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'second');
  writeFileSync(transcript, SAVED + callsFor(dir), 'utf8');
  check('a save already spent on earlier commits does not cover new ones', 'block', verdict(run(dir, { session_id: session, transcript_path: transcript })));
}

{
  // A state file whose head is not a string is no baseline: the run re-baselines instead of comparing.
  const dir = makeRepo();
  const session = `st-corrupt-${Date.now()}`;

  writeFileSync(join(STATE_DIR, `${session}.json`), JSON.stringify({ head: 42, offset: 0 }), 'utf8');
  writeFileSync(join(dir, 't.jsonl'), 'start\nno save\n', 'utf8');
  check('a state file with a non-string head reads as a first sighting', 'allow', verdict(run(dir, { session_id: session, transcript_path: join(dir, 't.jsonl') })));
  check('  and the baseline is rewritten as the real HEAD', git(dir, ['rev-parse', 'HEAD']), stateOf(session)?.head);
}

{
  // Commits landed but the transcript cannot be read: no honest verdict, so allow and re-baseline.
  const { dir, session } = baselined('unreadable');
  const landed = advance(dir, 'landed');

  check('an unreadable transcript lets the turn end', 'allow', verdict(run(dir, { session_id: session, transcript_path: join(dir, 'missing.jsonl') })));
  check('  and the baseline moves to the new HEAD', landed, stateOf(session)?.head);
}

{
  // HEAD moved BACKWARDS (a reset): nothing landed, so there is nothing to record.
  const { dir, transcript, session } = baselined('reset');
  const reset = git(dir, ['rev-parse', 'HEAD']);

  advance(dir, 'landed');
  writeFileSync(transcript, SAVED, 'utf8');
  run(dir, { session_id: session, transcript_path: transcript });
  git(dir, ['reset', '-q', '--hard', reset]);
  // The transcript lives in the repository here and `advance` committed it, so the reset removed it: put it
  // back, or the run would be judged on a missing transcript instead of on the moved HEAD.
  // @es El transcript vive en el repo y `advance` lo commiteó, así que el reset lo quitó: se repone.
  writeFileSync(transcript, SAVED, 'utf8');
  check('a HEAD that moved backwards has no new commits to record', 'allow', verdict(run(dir, { session_id: session, transcript_path: transcript })));
  check('  and the baseline moves back to the reset HEAD', reset, stateOf(session)?.head);
}

{
  // A recorded head git does not know (rebased away, gone): the range is unreadable, allow and change nothing.
  const dir = makeRepo();
  const session = `st-gone-${Date.now()}`;
  const gone = '0000000000000000000000000000000000000001';

  writeFileSync(join(STATE_DIR, `${session}.json`), JSON.stringify({ head: gone, offset: 0 }), 'utf8');
  writeFileSync(join(dir, 't.jsonl'), 'start\nno save\n', 'utf8');
  check('a recorded head git cannot resolve lets the turn end', 'allow', verdict(run(dir, { session_id: session, transcript_path: join(dir, 't.jsonl') })));
  check('  and leaves the recorded head untouched', gone, stateOf(session)?.head);
}

{
  // Thirteen commits landed: the refusal names the newest twelve, never an unbounded list.
  const { dir, transcript, session } = baselined('many');

  for (let index = 1; index <= 13; index += 1) advance(dir, `c${String(index).padStart(2, '0')}`);

  writeFileSync(transcript, `start\n${callsFor(dir)}`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('thirteen commits with no save — refuses', 'block', verdict(r));
  check('  and it lists the newest of them', true, r.output.includes('feat(x): c13'));
  check('  and it lists the twelfth newest', true, r.output.includes('feat(x): c02'));
  check('  and it leaves the oldest unlisted', false, r.output.includes('feat(x): c01'));
}

{
  // A payload written by PowerShell carries a byte-order mark and must still be judged.
  const { dir, transcript, session } = baselined('bom');

  advance(dir, 'landed');
  writeFileSync(transcript, `start\nno save\n${callsFor(dir)}`, 'utf8');
  check('a payload with a byte-order mark is still judged', 'block', verdict(run(dir, `﻿${JSON.stringify({ session_id: session, transcript_path: transcript })}`)));
}

// --- WHOSE COMMITS. The obligation to record belongs to whoever made the work: only commits created by
//     this session's own shell calls block it. Peer commits carry a committer date far from every window.
// @es DE QUIÉN SON LOS COMMITS. Solo bloquean los commits que crearon las llamadas de shell de esta sesión.

const HOUR = 60 * 60 * 1000;

/** The verdict after `lines` are appended to a baselined transcript, plus the full run. @es El veredicto tras añadir `lines` a un transcript con línea base, y la corrida completa. */
function judged(name, makeCommits) {
  const { dir, transcript, session } = baselined(name);
  const lines = makeCommits(dir);

  writeFileSync(transcript, `start\n${lines}`, 'utf8');

  return { dir, ...run(dir, { session_id: session, transcript_path: transcript }) };
}

{
  const own = judged('own-nosave', (dir) => (advance(dir, 'mine'), callsFor(dir)));

  check('own commit and no save — refuses', 'block', verdict(own));
  check('  and it names the own commit', true, own.output.includes('feat(x): mine'));
  check('  and each commit line is the short hash and subject, without the committer time', false, /\d{10}/.test(own.output));
  check('  and the refusal is bilingual, with its accents', true, own.output.includes('@es ENGRAM-PERSISTENCE: esta sesión aterrizó trabajo'));
}

{
  const saved = judged('own-saved', (dir) => (advance(dir, 'mine'), `${callsFor(dir)}${SAVED}`));

  check('own commit and a save after it — allows', 'allow', verdict(saved));
}

{
  const peers = judged('peers-only', (dir) => {
    commitAt(dir, 'peer-a', Date.now() - 3 * HOUR);
    commitAt(dir, 'peer-b', Date.now() - 2 * HOUR);

    return 'ordinary work\n';
  });

  check('only peer commits — allows', 'allow', verdict(peers));
  check('  and says nothing at all', '', peers.output);
}

{
  const quiet = judged('peers-during-other-call', (dir) => {
    const at = Date.now() - HOUR;

    commitAt(dir, 'peer-during-status', at);

    return shellCall('git status', at - 500, at + 500);
  });

  check('a peer commit inside a shell call that creates no commits — allows', 'allow', verdict(quiet));
}

{
  const mixed = judged('mixed', (dir) => {
    commitAt(dir, 'peer-before', Date.now() - 2 * HOUR);
    advance(dir, 'mine-in-the-middle');
    commitAt(dir, 'peer-after', Date.now() - HOUR);

    return callsFor(dir);
  });

  check('own and peer commits mixed — refuses', 'block', verdict(mixed));
  check('  and it lists the own commit', true, mixed.output.includes('feat(x): mine-in-the-middle'));
  check('  and it lists no peer commit', false, mixed.output.includes('peer-before') || mixed.output.includes('peer-after'));
}

for (const [label, command, options] of [
  ['a backup-repo wrapper commit', 'node C:/Users/x/Desktop/Projects/b100/.claude/backup-repo.mjs commit -m "feat(x): wrapped"', {}],
  ['a land.mjs commit', 'node C:/Users/x/.claude/worktree-landing/land.mjs --worktree a --main b', {}],
  ['a cherry-pick from PowerShell', 'git -C C:/repo cherry-pick abc123', { tool: 'PowerShell' }],
  ['a revert', 'git revert --no-edit abc123', {}],
  ['a merge', 'git merge feature/x', {}],
  ['an am', 'git am patch.mbox', {}],
  ['a rebase', 'git rebase main', {}],
  ['a bare commit with the verb as the last token', 'git commit', {}],
  ['a commit with two spaces before the verb', 'git  commit -m y', {}],
  ['a commit under a -c option', 'git -c user.name=x commit -m y', {}],
  ['a commit under a long option', 'git --no-pager commit -m y', {}],
  ['a commit by git.exe at a Windows path', 'C:\\Program Files\\Git\\cmd\\git.exe commit -m y', { tool: 'PowerShell' }],
  ['a commit after a backslash-separated wrapper path', 'node C:\\Users\\x\\.claude\\backup-repo.mjs commit -m y', {}],
  ...[';', '&', '|', '(', ')', '"', "'", '`', '\t', '\n', '\r'].map((separator) => [`a commit after the separator ${JSON.stringify(separator)}`, `echo${separator}git commit -m y`, {}]),
  ['a commit chained after other commands', 'git add -A && git commit -m "feat(x): chained"', {}]
]) {
  const made = judged(`wrapper-${(callCounter += 1)}`, (dir) => {
    const at = Date.now() - 30 * 1000;

    commitAt(dir, 'wrapped', at);

    return shellCall(command, at - 500, at + 500, options);
  });

  check(`${label} is this session's commit — refuses`, 'block', verdict(made));
}

for (const [label, command] of [
  ['a backup-repo call that is not a commit', 'node .claude/backup-repo.mjs status'],
  ['a git call that only reads', 'git log --oneline -5']
]) {
  const read = judged(`reads-${(callCounter += 1)}`, (dir) => {
    const at = Date.now() - HOUR;

    commitAt(dir, 'peer-under-read', at);

    return shellCall(command, at - 500, at + 500);
  });

  check(`${label} claims no commit — allows`, 'allow', verdict(read));
}

{
  const failed = judged('failed-call', (dir) => {
    const at = Date.now() - HOUR;

    commitAt(dir, 'peer-under-failed-call', at);

    return shellCall('git commit -m "feat(x): rejected by the hook"', at - 500, at + 500, { failed: true });
  });

  check('a commit call that failed created nothing — a commit inside its window is not claimed', 'allow', verdict(failed));
}

{
  const fastForward = judged('fast-forward', (dir) => {
    commitAt(dir, 'their-work-1', Date.now() - 5 * HOUR);
    commitAt(dir, 'their-work-2', Date.now() - 4 * HOUR);

    return shellCall('git merge --ff-only origin/feature', Date.now() - 1000, Date.now());
  });

  check('HEAD moved by a fast-forward of someone else\'s work — allows', 'allow', verdict(fastForward));
}

{
  // A peer re-baselines silently: after the allowed peer-only Stop, the next own commit is still judged.
  const { dir, transcript, session } = baselined('peer-then-own');

  commitAt(dir, 'peer-first', Date.now() - 2 * HOUR);
  writeFileSync(transcript, 'start\nwork\n', 'utf8');
  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'mine-later');
  writeFileSync(transcript, `start\nwork\n${callsFor(dir)}`, 'utf8');
  check('after peer commits were skipped, a later own commit still refuses', 'block', verdict(run(dir, { session_id: session, transcript_path: transcript })));
}

const failures = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures === 0 ? 0 : 1);
