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

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function run(dir, payload) {
  try {
    return { output: execFileSync('node', [GUARD], { cwd: dir, input: JSON.stringify(payload), encoding: 'utf8' }), code: 0 };
  } catch (error) {
    return { output: error.stdout ?? '', code: error.status };
  }
}

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
  // Outside a repository entirely: no git, no verdict.
  const dir = mkdtempSync(join(tmpdir(), 'engram-guard-nogit-'));

  check('outside a git repository', 'allow', verdict(run(dir, { session_id: 'st-nogit', transcript_path: 'nope' })));
  rmSync(dir, { recursive: true, force: true });
}

const failures = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures === 0 ? 0 : 1);
