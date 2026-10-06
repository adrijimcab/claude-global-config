#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/rotate.mjs`, the clean break of polluted journals. Every case runs on a
 * CONSTRUCTED Claude home in a temp directory, never the live one.
 *
 * THE STATE SPACE: the classification (each kind, a mechanism-specific rule before a general one, a rule for any
 * mechanism, the patterns `*`, `*.ext` and `**`, a file no rule names); a constructed home holding every action
 * (archive, journal with dismissals to carry, journal already current, empty, keep, lock, unknown, a link, a
 * directory that is not a plain name); the modes (default dry run, `--apply`, both, a second `--apply`, new data
 * the same day); the refusals (a live session, a session record that is dead, unreadable or pid-less, a lock);
 * the arguments (unknown, missing value, bad date, a home that is not a directory, the default home); and a move
 * that fails.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `rotate.mjs`. Todo corre sobre un home de Claude CONSTRUIDO en un temporal,
 * nunca el vivo. Espacio de estados: la clasificación (cada tipo, regla de mecanismo antes que la general, regla
 * para cualquier mecanismo, patrones `*`, `*.ext` y `**`, fichero sin regla); un home con cada acción; los modos
 * (simulación por defecto, `--apply`, ambos, un segundo `--apply`, datos nuevos el mismo día); los rechazos
 * (sesión viva; registro muerto, ilegible o sin pid; un lock); los argumentos; y un movimiento que falla.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from './locations.mjs';
import { ARCHIVE, JOURNAL, KEEP, KINDS, LOCK, UNKNOWN, classify, dismissalsIn, liveSessions, main, pathMatches, processAlive } from './rotate.mjs';

isolateState('rotate');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROTATE = path.join(HERE, 'rotate.mjs');
const NOW = Date.parse('2026-10-06T12:00:00Z');
const DATE = '2026-10-06';
let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** A sink that keeps what the command prints. @es Un sumidero que guarda lo que imprime el comando. */
function recorder() {
  const out = [];
  const err = [];

  return { sink: { log: (line) => out.push(line), error: (line) => err.push(line) }, out, err, all: () => [...out, ...err].join('\n') };
}

/** Runs the command in process. @es Corre el comando en el proceso. */
function rotate(argv, { alive = () => false } = {}) {
  const printed = recorder();
  const code = main(argv, { sink: printed.sink, now: NOW, alive });

  return { code, ...printed };
}

/** Every entry under `root` with its bytes or `dir`/`link`. @es Cada entrada bajo `root`. */
function treeOf(root) {
  const found = {};
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const stats = lstatSync(absolute);
      const relative = path.relative(root, absolute).split(path.sep).join('/');

      if (stats.isSymbolicLink()) found[relative] = 'link';
      else if (stats.isDirectory()) {
        found[relative] = 'dir';
        walk(absolute);
      } else found[relative] = `${readFileSync(absolute, 'utf8')}@${stats.mtimeMs}`;
    }
  };

  walk(root);

  return found;
}

const put = (root, relative, content) => {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), content);
};

const DECISION = JSON.stringify({ v: 2, kind: 'decision', blockId: 'B1', inputDigest: 'd' });
const DISMISSAL = JSON.stringify({ v: 2, kind: 'dismissal', blockId: 'B1', inputDigest: 'd', reason: 'false block' });
const REPORT = JSON.stringify({ v: 2, kind: 'false-positive-report', blockId: 'B2', inputDigest: 'd' });

/** A constructed Claude home holding every action. @es Un home construido con cada acción. */
function makeHome(scratch, name) {
  const home = path.join(scratch, name);

  put(home, 'collision-guard/state/refusals.jsonl', '{"raw":"test data"}\n');
  put(home, 'collision-guard/state/guard-errors.jsonl', '');
  put(home, 'backlog-guard/state/s-1.json', '{"offset":3}');
  put(home, 'backlog-guard/state/dismissals.jsonl', '{"marker":"m"}\n');
  put(home, 'guard-x/state/journal.jsonl', `${DECISION}\n${DISMISSAL}\n{torn\n${REPORT}\n`);
  put(home, 'guard-x/state/fires.json', '{"count":7}\n');
  put(home, 'guard-y/state/journal.jsonl', `${DISMISSAL}\n`);
  put(home, 'mystery/state/weird.bin', 'who knows');
  put(home, 'fleet-kit/state/handback/refusals.jsonl', '{"agentId":"a"}\n');
  put(home, 'fleet-kit/state/landing-guard/notices.jsonl', '{"kind":"advise"}\n');
  put(home, 'fleet-kit/state/repos/k/verdicts/t.json', '{"green":true}');
  put(home, 'fleet-kit/state/repos/k/diff-coverage/run-1/summary.json', '{"results":[]}');
  put(home, '.hidden/state/refusals.jsonl', 'not a mechanism\n');
  put(home, 'guard-z/state/journal.jsonl', '');
  put(home, 'outside/target.jsonl', 'the target of a link\n');
  mkdirSync(path.join(home, 'brief-audience', 'state'), { recursive: true });
  symlinkSync(path.join(home, 'outside', 'target.jsonl'), path.join(home, 'brief-audience', 'state', 'refusals.jsonl'));
  put(home, 'sessions/dead.json', JSON.stringify({ pid: 999_999_991, sessionId: 's' }));
  put(home, 'sessions/garbled.json', '{not json');
  put(home, 'sessions/no-pid.json', JSON.stringify({ sessionId: 's' }));
  put(home, 'sessions/notes.txt', JSON.stringify({ pid: 4242 }));

  return home;
}

const scratch = mkdtempSync(path.join(tmpdir(), 'rotate-selftest-'));

try {
  // --- the classification ---
  check('a refusal journal is archived', classify('collision-guard', 'refusals.jsonl').kind, ARCHIVE);
  check('a dismissal registry is kept', classify('backlog-guard', 'dismissals.jsonl').kind, KEEP);
  check('a per-session marker is kept (*.json)', classify('engram-persistence', 'st-1.json').kind, KEEP);
  check('*.json does not match a .jsonl file', classify('engram-persistence', 'notes.jsonl').kind, UNKNOWN);
  check('*.json does not match a file named only .json', classify('engram-persistence', '.json').kind, UNKNOWN);
  check('a lock is a lock', classify('failure-capture', 'ledger.lock').kind, LOCK);
  check('the hook journal of any mechanism is a journal', [classify('guard-anything', 'journal.jsonl').kind, classify('collision-guard', 'journal.jsonl').kind], [JOURNAL, JOURNAL]);
  check('the fires counter of any mechanism is archived', classify('guard-anything', 'fires.json').kind, ARCHIVE);
  check('a mechanism-specific rule wins over a general one', [classify('fleet-kit', 'handback/refusals.jsonl').kind, classify('fleet-kit', 'landing-guard/refusals.jsonl').kind], [KEEP, ARCHIVE]);
  check('* is exactly one segment', [classify('fleet-kit', 'repos/k/verdicts/t.json').kind, classify('fleet-kit', 'repos/k/verdicts/deeper/t.json').kind], [KEEP, UNKNOWN]);
  check('** is one or more segments', [classify('fleet-kit', 'repos/k/diff-coverage/run-1/summary.json').kind, classify('failure-capture', 'condense/run/ledger.md').kind, classify('failure-capture', 'condense').kind], [ARCHIVE, ARCHIVE, UNKNOWN]);
  check('a rule of one mechanism does not apply to another', classify('guard-anything', 'refusals.jsonl').kind, UNKNOWN);
  check('a file no rule names is unknown, with no reason', classify('collision-guard', 'surprise.txt'), { kind: UNKNOWN, reason: '' });
  check('a known kind carries its reason', classify('stash-watch', 'noticed.json').reason.length > 0, true);
  check('pathMatches compares whole paths', [pathMatches('a/b', 'a/b'), pathMatches('a/b', 'a/b/c'), pathMatches('a/b', 'a'), pathMatches('a/*', 'a/x'), pathMatches('a/**', 'a')], [true, false, false, true, false]);
  check('every rule has a known kind, a reason and a pattern', KINDS.filter(([, pattern, kind, reason]) => ![ARCHIVE, JOURNAL, KEEP, LOCK].includes(kind) || reason === '' || pattern === ''), []);
  check('only dismissals are carried', dismissalsIn(`${DECISION}\n${DISMISSAL}\n{torn\n${REPORT}\nnull`), [DISMISSAL]);

  // --- the sessions ---
  const probeHome = makeHome(scratch, 'probe');
  check('a dead, garbled, pid-less or non-.json session record is no live session', liveSessions(probeHome, (pid) => pid === 4242), []);
  check('a record whose pid is alive is a live session', liveSessions(probeHome, (pid) => pid === 999_999_991), [{ file: path.join(probeHome, 'sessions', 'dead.json'), pid: 999_999_991 }]);
  check('only a .json record with a positive numeric pid can be a live session', liveSessions(probeHome, () => true).map(({ pid }) => pid), [999_999_991]);
  check('a home without sessions has none', liveSessions(path.join(scratch, 'nowhere')), []);
  check('the real probe sees this process and not an absent one', [processAlive(process.pid), processAlive(999_999_991)], [true, false]);
  const refusing = (code) => () => {
    throw Object.assign(new Error(code), { code });
  };
  check('a process of another user (EPERM) is alive, an absent one (ESRCH) is not', [processAlive(7, refusing('EPERM')), processAlive(7, refusing('ESRCH'))], [true, false]);

  // --- the dry run is the default and changes nothing ---
  const home = makeHome(scratch, 'home');
  const before = treeOf(home);
  const dry = rotate(['--home', home]);
  const said = dry.out.join('\n');
  check('a dry run exits 0', dry.code, 0);
  check('a dry run changes nothing', treeOf(home), before);
  check('the plan names the archive of the date', said.includes(`archive ${path.join(home, 'state-archive', DATE)} (--dry-run)`), true);
  check('the plan archives the refusal journal, the counter and the coverage output', ['ARCHIVE  collision-guard/refusals.jsonl', 'ARCHIVE  guard-x/fires.json', 'ARCHIVE  fleet-kit/landing-guard/notices.jsonl', 'ARCHIVE  fleet-kit/repos/k/diff-coverage/run-1/summary.json'].map((line) => said.includes(line)), [true, true, true, true]);
  check('the plan carries the dismissal of a journal', said.includes('ARCHIVE  guard-x/journal.jsonl: hook journal; 1 dismissal(s)'), true);
  check('a journal of dismissals only is current', said.includes('KEEP     guard-y/journal.jsonl: hook journal that holds only the 1 dismissal(s)'), true);
  check('an empty file has nothing to archive', said.includes('KEEP     collision-guard/guard-errors.jsonl: empty'), true);
  check('an empty hook journal has nothing to archive', said.includes('KEEP     guard-z/journal.jsonl: empty'), true);
  check('operative state is kept', ['KEEP     backlog-guard/s-1.json: operative', 'KEEP     backlog-guard/dismissals.jsonl: operative', 'KEEP     fleet-kit/handback/refusals.jsonl: operative', 'KEEP     fleet-kit/repos/k/verdicts/t.json: operative'].map((line) => said.includes(line)), [true, true, true, true]);
  check('an unknown file and a link are reported, never guessed', [said.includes('UNKNOWN  mystery/weird.bin'), said.includes('UNKNOWN  brief-audience/refusals.jsonl')], [true, true]);
  check('a directory that is not a plain name is not a mechanism', said.includes('.hidden'), false);
  check('the summary counts every action', said.includes('5 to archive, 7 kept, 2 unknown.'), true);
  check('the dry run says how to apply it, bilingual', said.includes('Run again with --apply') && dry.out.every((line) => line.includes(' @es ')), true);
  check('a dry run with no blocker announces no refusal', said.includes('REFUSED'), false);

  // --- apply ---
  const archive = path.join(home, 'state-archive', DATE);
  const applied = rotate(['--home', home, '--apply']);
  const after = treeOf(home);
  check('apply exits 0', [applied.code, applied.err], [0, []]);
  check('every archived file is in the archive with its bytes', ['collision-guard/refusals.jsonl', 'guard-x/fires.json', 'fleet-kit/landing-guard/notices.jsonl', 'fleet-kit/repos/k/diff-coverage/run-1/summary.json'].map((file) => readFileSync(path.join(archive, file), 'utf8') === before[`${file.split('/')[0]}/state/${file.split('/').slice(1).join('/')}`].split('@')[0]), [true, true, true, true]);
  check('every archived file is gone from the state', ['collision-guard/state/refusals.jsonl', 'guard-x/state/fires.json', 'fleet-kit/state/landing-guard/notices.jsonl', 'fleet-kit/state/repos/k/diff-coverage/run-1/summary.json'].map((file) => existsSync(path.join(home, file))), [false, false, false, false]);
  check('the whole journal is archived', readFileSync(path.join(archive, 'guard-x', 'journal.jsonl'), 'utf8'), `${DECISION}\n${DISMISSAL}\n{torn\n${REPORT}\n`);
  check('the fresh journal holds only the dismissal in force', readFileSync(path.join(home, 'guard-x', 'state', 'journal.jsonl'), 'utf8'), `${DISMISSAL}\n`);
  check('no temp file is left behind', existsSync(path.join(home, 'guard-x', 'state', 'journal.jsonl.tmp')), false);
  const untouched = ['backlog-guard/state/s-1.json', 'backlog-guard/state/dismissals.jsonl', 'guard-y/state/journal.jsonl', 'collision-guard/state/guard-errors.jsonl', 'mystery/state/weird.bin', 'fleet-kit/state/handback/refusals.jsonl', 'fleet-kit/state/repos/k/verdicts/t.json', 'guard-z/state/journal.jsonl', 'brief-audience/state/refusals.jsonl', 'outside/target.jsonl', '.hidden/state/refusals.jsonl'];
  check('operative, current, empty, unknown and linked files are untouched, bytes and time', untouched.map((file) => after[file] === before[file]), untouched.map(() => true));
  check('apply reports each move and the total', [applied.out.filter((line) => line.startsWith('Archived ')).length, applied.out.some((line) => line.startsWith('Carried 1 dismissal(s)')), applied.out.at(-1).startsWith(`Rotated 5 file(s) into ${archive}.`)], [5, true, true]);

  // --- idempotent ---
  const archived = treeOf(archive);
  const again = rotate(['--home', home, '--apply']);
  check('a second apply has nothing to rotate', [again.code, again.out.at(-1).startsWith('Nothing to rotate')], [0, true]);
  check('a second apply changes neither the state nor the archive', [treeOf(home), treeOf(archive)], [after, archived]);

  // --- new data the same day is appended to the archive, never overwrites it ---
  put(home, 'collision-guard/state/refusals.jsonl', '{"raw":"later"}\n');
  check('a later rotation the same day appends', [rotate(['--home', home, '--apply']).code, readFileSync(path.join(archive, 'collision-guard', 'refusals.jsonl'), 'utf8')], [0, '{"raw":"test data"}\n{"raw":"later"}\n']);
  check('...and the appended source is gone from the state', existsSync(path.join(home, 'collision-guard', 'state', 'refusals.jsonl')), false);

  // --- refusals ---
  const live = makeHome(scratch, 'live');
  const liveBefore = treeOf(live);
  const refused = rotate(['--home', live, '--apply'], { alive: (pid) => pid === 999_999_991 });
  check('apply with a live session is refused with exit 2', refused.code, 2);
  check('the refusal names the session record and its pid', refused.err.join('\n').includes(`${path.join(live, 'sessions', 'dead.json')} (pid 999999991)`), true);
  check('a refused apply changes nothing', treeOf(live), liveBefore);
  const warned = rotate(['--home', live], { alive: (pid) => pid === 999_999_991 });
  check('a dry run with a live session still plans, and says apply would be refused', [warned.code, warned.out.join('\n').includes('--apply would be REFUSED now'), treeOf(live)], [0, true, liveBefore]);
  put(live, 'failure-capture/state/ledger.lock', '');
  const locked = rotate(['--home', live, '--apply']);
  check('apply with a state lock is refused with exit 2 and names it', [locked.code, locked.err.join('\n').includes(path.join(live, 'failure-capture', 'state', 'ledger.lock'))], [2, true]);
  check('the lock is planned as kept', rotate(['--home', live]).out.join('\n').includes('KEEP     failure-capture/ledger.lock: a lock'), true);

  // --- a move that fails ---
  const broken = makeHome(scratch, 'broken');
  put(broken, 'state-archive', 'a file where the archive directory should be');
  const failed = rotate(['--home', broken, '--apply']);
  check('a move that fails exits 1 and names the file', [failed.code, failed.err.join('\n').includes('FAILED on ')], [1, true]);
  check('a failed move leaves its source in place', existsSync(path.join(broken, 'backlog-guard', 'state', 's-1.json')) && readdirSync(path.join(broken, 'collision-guard', 'state')).includes('refusals.jsonl'), true);

  // --- the arguments ---
  check('an unknown argument is refused with exit 2', rotate(['--force']).code, 2);
  check('--dry-run and --apply together are refused', rotate(['--home', home, '--dry-run', '--apply']).code, 2);
  check('--home without a value is refused', [rotate(['--home']).code, rotate(['--home', '--apply']).code], [2, 2]);
  check('an option is never taken as the value of another', rotate(['--date', '--apply']).err.join('\n').includes('--date needs a value'), true);
  check('a bad date is refused', rotate(['--home', home, '--date', '6-10-2026']).code, 2);
  check('a given date names the archive', rotate(['--home', home, '--date', '2027-01-02']).out[0].includes(path.join(home, 'state-archive', '2027-01-02')), true);
  check('a home that is not a directory is refused', rotate(['--home', path.join(scratch, 'nowhere')]).code, 2);
  check('every refusal is bilingual', rotate(['--force']).err.every((line) => line.includes(' @es ')), true);

  // --- the default home, through the real command line ---
  const cliHome = makeHome(scratch, 'cli');
  const viaCli = spawnSync(process.execPath, [ROTATE], { encoding: 'utf8', env: { ...process.env, HOOK_CLAUDE_HOME: cliHome } });
  check('the command line defaults to the Claude home and a dry run', [viaCli.status, viaCli.stdout.includes(`Rotation plan for ${cliHome}`), viaCli.stdout.includes('(--dry-run)')], [0, true, true]);
} catch (error) {
  failures.push(`unexpected throw — ${error.stack}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
