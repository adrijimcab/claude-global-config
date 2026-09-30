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

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HERE, 'guard.mjs');
const STATE_DIR = join(HERE, 'state');

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository with one commit, and a second on demand. @es Un repo con un commit, y otro a demanda. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'engram-guard-'));

  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'selftest@example.com']);
  git(dir, ['config', 'user.name', 'selftest']);
  writeFileSync(join(dir, 'a.txt'), 'one', 'utf8');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'chore(seed): first']);

  return dir;
}

function advance(dir, subject) {
  writeFileSync(join(dir, `${subject}.txt`), subject, 'utf8');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', `feat(x): ${subject}`]);

  return git(dir, ['rev-parse', 'HEAD']);
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
  rmSync(dir, { recursive: true, force: true });
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
  rmSync(dir, { recursive: true, force: true });
}

// --- CASE 3: THE ONE THAT MATTERS — HEAD moved, no save in the new tail → block, naming the commit.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-block-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed');
  writeFileSync(transcript, 'start\nsome ordinary work, no memory call\n', 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('HEAD moved with no save — refuses', 'block', verdict(r));
  check('  and the refusal NAMES the commit', true, r.output.includes('feat(x): landed'));
  rmSync(dir, { recursive: true, force: true });
}

// --- CASE 4: HEAD moved and a save follows it → allow.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-saved-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed');
  writeFileSync(transcript, 'start\ncalled mem_save with the decision\n', 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('HEAD moved and a save follows — allows', 'allow', verdict(r));
  rmSync(dir, { recursive: true, force: true });
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
  writeFileSync(transcript, 'start\ncalled mem_save earlier, before any of this\nplain work now\n', 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('a save BEFORE the commits does not cover them', 'block', verdict(r));
  rmSync(dir, { recursive: true, force: true });
}

// --- CASE 6: stop_hook_active → allow immediately, so the guard can never trap a turn.
{
  const dir = makeRepo();
  const transcript = join(dir, 't.jsonl');

  writeFileSync(transcript, 'start\n', 'utf8');

  const session = `st-active-${Date.now()}`;

  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'landed');
  writeFileSync(transcript, 'start\nno save\n', 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript, stop_hook_active: true });

  check('stop_hook_active — never traps a turn', 'allow', verdict(r));
  rmSync(dir, { recursive: true, force: true });
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
  writeFileSync(transcript, `${multiByteHistory}called mem_save with the decision\n`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('REAL CASE: multi-byte history, then a save after the commits — allows', 'allow', verdict(r));
  rmSync(dir, { recursive: true, force: true });
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
  writeFileSync(transcript, `${multiByteHistory}ordinary work, no memory call — ñ\n`, 'utf8');

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('multi-byte history, no save after the commits — still refuses', 'block', verdict(r));
  rmSync(dir, { recursive: true, force: true });
}

// --- FAIL-OPEN: every malfunction of its own must let the turn end.
{
  const dir = makeRepo();

  check('garbage payload', 'allow', verdict(run(dir, 'NOT JSON')));
  check('no session id, no transcript', 'allow', verdict(run(dir, {})));
  rmSync(dir, { recursive: true, force: true });
}

{
  // Outside a repository entirely: no git, no verdict, no baseline, and nothing leaked on stderr.
  // @es Fuera de todo repo: sin git no hay veredicto ni línea base, y nada se filtra por stderr.
  const dir = mkdtempSync(join(tmpdir(), 'engram-guard-nogit-'));
  const session = `st-nogit-${Date.now()}`;
  const r = run(dir, { session_id: session, transcript_path: 'nope' });

  check('outside a git repository', 'allow', verdict(r));
  check('  and it records no baseline', undefined, stateOf(session));
  check('  and git\'s own complaint does not leak to stderr', '', r.stderr);
  rmSync(dir, { recursive: true, force: true });
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
  writeFileSync(transcript, `${SAVED}plain work\n`, 'utf8');
  check('a save made during an idle Stop does not cover later commits', 'block', verdict(run(dir, { session_id: session, transcript_path: transcript })));
  rmSync(dir, { recursive: true, force: true });
}

{
  const { dir, transcript, session } = baselined('summary');

  advance(dir, 'landed');
  writeFileSync(transcript, 'start\ncalled mem_session_summary to close out\n', 'utf8');
  check('a session summary is a save too', 'allow', verdict(run(dir, { session_id: session, transcript_path: transcript })));
  rmSync(dir, { recursive: true, force: true });
}

{
  // A satisfied guard moves its baseline: the same save cannot be spent on the next commits.
  const { dir, transcript, session } = baselined('spent');

  advance(dir, 'first');
  writeFileSync(transcript, SAVED, 'utf8');
  run(dir, { session_id: session, transcript_path: transcript });
  advance(dir, 'second');
  check('a save already spent on earlier commits does not cover new ones', 'block', verdict(run(dir, { session_id: session, transcript_path: transcript })));
  rmSync(dir, { recursive: true, force: true });
}

{
  // A state file whose head is not a string is no baseline: the run re-baselines instead of comparing.
  const dir = makeRepo();
  const session = `st-corrupt-${Date.now()}`;

  writeFileSync(join(STATE_DIR, `${session}.json`), JSON.stringify({ head: 42, offset: 0 }), 'utf8');
  writeFileSync(join(dir, 't.jsonl'), 'start\nno save\n', 'utf8');
  check('a state file with a non-string head reads as a first sighting', 'allow', verdict(run(dir, { session_id: session, transcript_path: join(dir, 't.jsonl') })));
  check('  and the baseline is rewritten as the real HEAD', git(dir, ['rev-parse', 'HEAD']), stateOf(session)?.head);
  rmSync(dir, { recursive: true, force: true });
}

{
  // Commits landed but the transcript cannot be read: no honest verdict, so allow and re-baseline.
  const { dir, session } = baselined('unreadable');
  const landed = advance(dir, 'landed');

  check('an unreadable transcript lets the turn end', 'allow', verdict(run(dir, { session_id: session, transcript_path: join(dir, 'missing.jsonl') })));
  check('  and the baseline moves to the new HEAD', landed, stateOf(session)?.head);
  rmSync(dir, { recursive: true, force: true });
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
  rmSync(dir, { recursive: true, force: true });
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
  rmSync(dir, { recursive: true, force: true });
}

{
  // Thirteen commits landed: the refusal names the newest twelve, never an unbounded list.
  const { dir, transcript, session } = baselined('many');

  for (let index = 1; index <= 13; index += 1) advance(dir, `c${String(index).padStart(2, '0')}`);

  const r = run(dir, { session_id: session, transcript_path: transcript });

  check('thirteen commits with no save — refuses', 'block', verdict(r));
  check('  and it lists the newest of them', true, r.output.includes('feat(x): c13'));
  check('  and it lists the twelfth newest', true, r.output.includes('feat(x): c02'));
  check('  and it leaves the oldest unlisted', false, r.output.includes('feat(x): c01'));
  rmSync(dir, { recursive: true, force: true });
}

{
  // A payload written by PowerShell carries a byte-order mark and must still be judged.
  const { dir, transcript, session } = baselined('bom');

  advance(dir, 'landed');
  writeFileSync(transcript, 'start\nno save\n', 'utf8');
  check('a payload with a byte-order mark is still judged', 'block', verdict(run(dir, `﻿${JSON.stringify({ session_id: session, transcript_path: transcript })}`)));
  rmSync(dir, { recursive: true, force: true });
}

const failures = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures === 0 ? 0 : 1);
