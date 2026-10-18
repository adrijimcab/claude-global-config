#!/usr/bin/env node
/**
 * Self-test for stash-watch, against git repositories CONSTRUCTED here and never the live one: a fixture
 * resting on live mutable state rots on its own (`guard-that-cannot-go-red`, fourth face), and this
 * project forbids creating or dropping stashes in the real repository. Every fixture is proved to sit
 * outside the live repository BEFORE any stash command runs in it.
 *
 * THE STATE SPACE, enumerated from the decision and from how stashes are really made here:
 *   - THE STACK: empty (must stay silent); one entry (must refuse); a second entry added after the
 *     first was shown (must refuse again); every entry dropped (must go silent again).
 *   - WHO HAS SEEN IT: the same session a second time (must pass: noticed); a different session (must
 *     refuse: it has seen nothing); a stop already inside a refusal (`stop_hook_active`, must pass).
 *   - WHAT A STASH HOLDS: tracked edits with line counts; untracked files (`-u`), which live in a third
 *     parent `git stash show` omits by default; a non-ASCII path, because git quotes those outside `-z`
 *     and an ASCII-only fixture is the one alphabet where that defect is invisible (ninth face).
 *   - HOW IT WAS NAMED: `git stash push -m` (`On <branch>: msg`); a bare `git stash` (`WIP on <branch>:
 *     <sha> <subject>`), the near miss a parser keyed on one prefix gets wrong; a branch with a slash.
 *   - WHEN IT CANNOT MEASURE: not a repository — must allow AND record it, never read as clean.
 *   - THE SHIM: the real `guard.mjs` process, fed a payload on stdin, including a BOM-prefixed one.
 *
 * @es Auto-test contra repos git CONSTRUIDOS aquí, nunca el vivo; cada fixture se comprueba fuera del
 * repo real ANTES de cualquier stash. Estados: la pila (vacía, una, una segunda tras mostrar la primera,
 * todas retiradas), quién la ha visto (misma sesión, otra sesión, `stop_hook_active`), qué contiene
 * (seguidos, no seguidos con `-u`, ruta no ASCII), cómo se nombró (`-m`, `WIP on`, rama con barra),
 * cuándo no se puede medir (no es un repo) y el shim real por stdin, con y sin BOM.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decide as decideGuard, fingerprint, SETTLE_WINDOW_MS } from './guard.mjs';
import { parseSubject, stashInventory } from './stashes.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('stash-watch');

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * The live repository a fixture must never land in: the git work tree that holds this selftest. The guard
 * used to live two folders below a project's top level, and this was `HERE/../..`; it now lives in
 * `~/.claude/stash-watch/`, where that expression names the user's HOME, which contains the temp dir, so
 * every fixture was refused. Asking git names the real enclosing repository wherever the guard lives.
 * @es El repositorio vivo en el que un fixture nunca debe caer: el árbol git que contiene este selftest.
 * Antes era `HERE/../..`; desde `~/.claude/` eso nombra el HOME, que contiene el temporal. Se le pregunta a git.
 */
const LIVE_REPO = spawnSync('git', ['-C', HERE, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim() || HERE;
const GUARD = path.join(HERE, 'guard.mjs');

/** The environment minus every `GIT_*` variable, so a fixture can never be steered at another repository. @es Entorno sin `GIT_*`. */
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();

/**
 * The guard's decision. A throw is a verdict about the guard: it is recorded as a FAILED check and answered
 * with a marker that is neither an allow (`undefined`) nor a block, so no case reads it as either.
 * @es La decisión de la guardia. Un throw es un veredicto: se registra como check FALLIDO y se responde con
 * un marcador que no es ni allow (`undefined`) ni block.
 */
function decide(payload, options = {}) {
  try {
    // Stashes built here are seconds old; unless a case names its own clock, the guard sees them after the
    // settle window, so the long-standing cases keep judging the stack and not its age.
    // @es Los stashes de aquí tienen segundos; salvo que un caso fije su reloj, la guardia los ve pasada la
    // ventana, y los casos de siempre siguen juzgando la pila y no su edad.
    return decideGuard(payload, { now: Date.now() + 2 * SETTLE_WINDOW_MS, ...options });
  } catch (error) {
    check('decide() does not throw @es decide() no lanza', false, error.message);

    return { threw: error.message };
  }
}

const canonical = (p) => realpathSync.native(path.resolve(p));

const root = mkdtempSync(path.join(os.tmpdir(), 'stash-watch-'));

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

/** A fresh repository with one commit, proved to be outside the live one before it is handed out. @es Un repo nuevo con un commit, fuera del vivo. */
function fixture(name) {
  const dir = path.join(root, name);

  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'config', 'user.email', 'selftest@example.invalid');
  git(dir, 'config', 'user.name', 'selftest');
  git(dir, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));

  const common = canonical(path.resolve(dir, git(dir, 'rev-parse', '--git-common-dir')));

  if (!common.startsWith(canonical(root)) || common.startsWith(canonical(LIVE_REPO))) {
    throw new Error(`fixture ${name} resolved its git directory to ${common}, outside the sandbox — refusing to stash anything`);
  }

  writeFileSync(path.join(dir, 'tracked.txt'), 'one\ntwo\n');
  git(dir, 'add', 'tracked.txt');
  git(dir, 'commit', '--quiet', '-m', 'initial');

  return dir;
}

const stateOf = (name) => path.join(root, `state-${name}`);

try {
  // ---------------------------------------------------------------------------------------------
  process.stdout.write('parsing the reflog subject\n');

  check('`On <branch>: msg` names the branch and message', JSON.stringify(parseSubject('On develop: counter resync')) === JSON.stringify({ branch: 'develop', message: 'counter resync' }));
  check('`WIP on <branch>: sha subject` is not read as `On`', JSON.stringify(parseSubject('WIP on main: 1a2b3c4 initial')) === JSON.stringify({ branch: 'main', message: '1a2b3c4 initial' }));
  check('a branch with a slash survives', parseSubject('On feature/x: y').branch === 'feature/x');
  check('a message holding `: ` keeps its tail', parseSubject('On main: a: b').message === 'a: b');
  check('an unknown subject keeps the text and names no branch', JSON.stringify(parseSubject('odd')) === JSON.stringify({ branch: undefined, message: 'odd' }));

  // ---------------------------------------------------------------------------------------------
  process.stdout.write('the stack, green then red then green\n');

  const repo = fixture('main-repo');
  const state = stateOf('main');
  const payload = (session, extra = {}) => ({ session_id: session, hook_event_name: 'Stop', ...extra });

  const empty = stashInventory(repo);

  check('an empty stack is MEASURED as empty', empty.measured === true && empty.stashes.length === 0, JSON.stringify(empty));
  check('an empty stack is allowed silently', decide(payload('s1'), { repoRoot: repo, stateDir: state }) === undefined);

  writeFileSync(path.join(repo, 'tracked.txt'), 'one\nTWO\nthree\n');
  git(repo, 'stash', 'push', '--quiet', '-m', 'parked-resync');

  const one = stashInventory(repo);
  const first = one.stashes[0];

  check('one stash is inventoried', one.measured === true && one.stashes.length === 1, JSON.stringify(one));
  check('it records the branch it was made on', first?.branch === 'main');
  check('it records the message', first?.message === 'parked-resync');
  check('it records WHAT it holds, with line counts', first?.tracked.length === 1 && first.tracked[0].path === 'tracked.txt' && first.tracked[0].added === 2 && first.tracked[0].deleted === 1, JSON.stringify(first?.tracked));

  const refused = decide(payload('s1'), { repoRoot: repo, stateDir: state });

  check('a stash on the stack REFUSES the stop', refused?.decision === 'block', JSON.stringify(refused));
  check('the refusal names the ref, the message and the file with its counts', typeof refused?.reason === 'string' && refused.reason.includes('stash@{0}') && refused.reason.includes('parked-resync') && refused.reason.includes('tracked.txt  +2 -1'), refused?.reason);
  check('the refusal says how to retire it without dropping bare', refused?.reason.includes('git tag reaped/stash-') === true);

  check('the same session, same stack: noticed, so it passes', decide(payload('s1'), { repoRoot: repo, stateDir: state }) === undefined);
  check('a stop already inside a refusal passes', decide(payload('s9', { stop_hook_active: true }), { repoRoot: repo, stateDir: state }) === undefined);
  check('a different session has seen nothing: refused', decide(payload('s2'), { repoRoot: repo, stateDir: state })?.decision === 'block');

  writeFileSync(path.join(repo, 'tracked.txt'), 'one\ntwo\nfour\n');
  git(repo, 'stash', '--quiet');

  const two = stashInventory(repo);

  check('a bare `git stash` is read through the `WIP on` prefix', two.stashes[0]?.branch === 'main' && two.stashes[0]?.message.endsWith('initial') === true, JSON.stringify(two.stashes[0]));

  const again = decide(payload('s1'), { repoRoot: repo, stateDir: state });

  check('a NEW stash in a session that saw the old set is refused again', again?.decision === 'block');
  check('and the report lists both entries', again?.reason.includes('stash@{0}') === true && again.reason.includes('stash@{1}') === true, again?.reason);
  check('the fingerprint does not depend on stack order', fingerprint([{ sha: 'b' }, { sha: 'a' }]) === fingerprint([{ sha: 'a' }, { sha: 'b' }]));

  git(repo, 'stash', 'clear');

  check('every stash gone: silent again, even for a session never shown', decide(payload('s7'), { repoRoot: repo, stateDir: state }) === undefined);

  // ---------------------------------------------------------------------------------------------
  process.stdout.write('the settle window: a young stash is neither reported nor marked shown\n');

  const settling = fixture('settle-repo');
  const settleState = stateOf('settle');
  const noticedOf = (dir) => {
    try {
      return JSON.parse(readFileSync(path.join(dir, 'noticed.json'), 'utf8'));
    } catch {
      return {};
    }
  };

  writeFileSync(path.join(settling, 'tracked.txt'), 'settle\n');
  git(settling, 'stash', 'push', '--quiet', '-m', 'lint-staged automatic backup');

  const bornAt = stashInventory(settling).stashes[0].createdAt.getTime();

  check('a young stash is not reported, whatever its message says', decide(payload('y1'), { repoRoot: settling, stateDir: settleState, now: bornAt + 1000 }) === undefined);
  check('and it is not marked as shown', noticedOf(settleState).y1 === undefined, JSON.stringify(noticedOf(settleState)));
  check('one ms short of the window is still young', decide(payload('y1'), { repoRoot: settling, stateDir: settleState, now: bornAt + SETTLE_WINDOW_MS - 1 }) === undefined);

  const settled = decide(payload('y1'), { repoRoot: settling, stateDir: settleState, now: bornAt + SETTLE_WINDOW_MS });

  check('the same stash, still there at a later Stop once old enough, is reported', settled?.decision === 'block' && settled.reason.includes('lint-staged automatic backup'), JSON.stringify(settled));
  check('an old stash is reported exactly as before: ref and counts', settled?.reason.includes('stash@{0}') === true && settled.reason.includes('tracked.txt  +1 -2'), settled?.reason);

  // A session that has seen the old set is not disturbed by a young newcomer, which stays unshown until old.
  // @es Una sesión que vio el conjunto viejo no se altera por un recién llegado joven, que sigue sin mostrarse.
  const mixedState = stateOf('settle-mixed');

  // The first stash is dated two windows back by its commit time, so which one is young never rests on
  // two stashes landing in different seconds.
  // @es El primer stash lleva fecha de hace dos ventanas, así que cuál es joven no depende de que dos
  // stashes caigan en segundos distintos.
  const mixed = fixture('settle-mixed-repo');
  const backdated = `${Math.floor((Date.now() - 2 * SETTLE_WINDOW_MS) / 1000)} +0000`;

  writeFileSync(path.join(mixed, 'tracked.txt'), 'veteran\n');
  execFileSync('git', ['stash', 'push', '--quiet', '-m', 'veteran'], { cwd: mixed, env: { ...cleanEnv, GIT_COMMITTER_DATE: backdated }, windowsHide: true });
  decide(payload('m1'), { repoRoot: mixed, stateDir: mixedState });
  writeFileSync(path.join(mixed, 'tracked.txt'), 'newcomer\n');
  git(mixed, 'stash', 'push', '--quiet', '-m', 'newcomer');

  const newcomerAt = stashInventory(mixed).stashes[0].createdAt.getTime();
  const during = decide(payload('m1'), { repoRoot: mixed, stateDir: mixedState, now: newcomerAt + 1000 });

  check('a young newcomer next to a shown stash passes silently', during === undefined, JSON.stringify(during));

  const after = decide(payload('m1'), { repoRoot: mixed, stateDir: mixedState, now: newcomerAt + SETTLE_WINDOW_MS });

  check('and is reported at a later Stop once old, with the old one', after?.decision === 'block' && after.reason.includes('newcomer') && after.reason.includes('stash@{1}'), JSON.stringify(after));

  // ---------------------------------------------------------------------------------------------
  process.stdout.write('what a stash holds beyond tracked edits\n');

  const wide = fixture('untracked-repo');

  writeFileSync(path.join(wide, 'café.txt'), 'accented\n');
  writeFileSync(path.join(wide, 'tracked.txt'), 'changed\n');
  git(wide, 'stash', 'push', '--quiet', '-u', '-m', 'with-untracked');

  const held = stashInventory(wide).stashes[0];

  check('untracked files carried by `-u` are listed', held?.untracked.includes('café.txt') === true, JSON.stringify(held?.untracked));
  check('a non-ASCII path is byte-exact, not git-quoted', held?.untracked.some((file) => file.includes('"') || file.includes('\\')) === false);

  const wideRefusal = decide(payload('w1'), { repoRoot: wide, stateDir: stateOf('wide') });

  check('the refusal names the untracked file as such', wideRefusal?.reason.includes('café.txt  (untracked file)') === true, wideRefusal?.reason);

  // ---------------------------------------------------------------------------------------------
  process.stdout.write('when the stack cannot be measured\n');

  const notARepo = path.join(root, 'not-a-repo');

  mkdirSync(notARepo, { recursive: true });

  const unmeasured = stashInventory(notARepo);
  const unmeasuredState = stateOf('unmeasured');

  check('outside a repository the inventory says UNMEASURED, not empty', unmeasured.measured === false && typeof unmeasured.reason === 'string', JSON.stringify(unmeasured));
  check('the guard allows it (fails open)', decide(payload('u1'), { repoRoot: notARepo, stateDir: unmeasuredState }) === undefined);
  check('and records that it could not measure', existsSync(path.join(unmeasuredState, 'observed.jsonl')) && readFileSync(path.join(unmeasuredState, 'observed.jsonl'), 'utf8').includes('"unmeasured"'));

  // ---------------------------------------------------------------------------------------------
  process.stdout.write('the real shim, end to end\n');

  const shimRepo = fixture('shim-repo');
  const shimState = stateOf('shim');
  const shim = (input) =>
    spawnSync(process.execPath, [GUARD], { input, env: { ...cleanEnv, CLAUDE_PROJECT_DIR: shimRepo, HOOK_STATE_DIR: shimState }, encoding: 'utf8', windowsHide: true });

  const cleanRun = shim(JSON.stringify(payload('e1')));

  check('clean stack: exit 0 and no output', cleanRun.status === 0 && cleanRun.stdout === '', JSON.stringify(cleanRun));

  writeFileSync(path.join(shimRepo, 'tracked.txt'), 'shim\n');
  // The real process reads the real clock, so the stash is made old: its commit time is two windows back.
  // @es El proceso real lee el reloj real, así que el stash se hace viejo: su fecha es de hace dos ventanas.
  const oldDate = `${Math.floor((Date.now() - 2 * SETTLE_WINDOW_MS) / 1000)} +0000`;

  execFileSync('git', ['stash', 'push', '--quiet', '-m', 'shim-stash'], { cwd: shimRepo, env: { ...cleanEnv, GIT_COMMITTER_DATE: oldDate }, windowsHide: true });

  const blockRun = shim(`﻿${JSON.stringify(payload('e1'))}`);
  let blockOutput;

  try {
    blockOutput = JSON.parse(blockRun.stdout);
  } catch {
    blockOutput = undefined;
  }

  check('a stash, BOM-prefixed payload: exit 0 with a block decision on stdout', blockRun.status === 0 && blockOutput?.decision === 'block' && blockOutput.reason.includes('shim-stash'), JSON.stringify(blockRun));

  const garbage = shim('not json');

  check('an unreadable payload fails open, exit 0, no output', garbage.status === 0 && garbage.stdout === '');
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(`\nstash-watch selftest: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
