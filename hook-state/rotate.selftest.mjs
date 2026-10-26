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
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestInput } from './journal.mjs';
import { isolateState } from './locations.mjs';
import * as rotation from './rotate.mjs';

const { ARCHIVE, JOURNAL, KEEP, KINDS, LOCK, REDACTIONS, UNKNOWN, classify, dismissalsIn, liveSessions, main, pathMatches, processAlive, redactedLine } = rotation;
// Read through the namespace so a module without them fails a check, not the import. @es Por el espacio de nombres.
const PRUNE = rotation.PRUNE ?? 'no-prune-kind';
const REMOVE = rotation.REMOVE ?? 'no-remove-kind';
const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

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

/**
 * A link to a DIRECTORY, built with the type that needs no privilege: a junction on Windows (a file symlink there
 * needs a privilege an ordinary user lacks), a symlink elsewhere. Both are reported by `lstat` as links.
 * @es Un enlace a un DIRECTORIO, del tipo que no exige privilegio: junction en Windows (allí un symlink de fichero
 * exige un privilegio que un usuario normal no tiene), symlink en el resto. `lstat` informa de ambos como enlaces.
 */
function linkToDirectory(target, linkPath) {
  symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
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
  put(home, 'outside/linked-dir/target.jsonl', 'the target of a link\n');
  mkdirSync(path.join(home, 'brief-audience', 'state'), { recursive: true });
  linkToDirectory(path.join(home, 'outside', 'linked-dir'), path.join(home, 'brief-audience', 'state', 'refusals.jsonl'));
  put(home, 'outside/linked-state/refusals.jsonl', '{"raw":"behind a linked state directory"}\n');
  mkdirSync(path.join(home, 'linked-mechanism'), { recursive: true });
  linkToDirectory(path.join(home, 'outside', 'linked-state'), path.join(home, 'linked-mechanism', 'state'));
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
  check('the undecided journal of the dependency-claim face is archived', classify('brief-provenance', 'undecided/entries.jsonl').kind, ARCHIVE);
  check('a dismissal registry is kept', classify('backlog-guard', 'dismissals.jsonl').kind, KEEP);
  check('a per-session marker is kept (*.json)', classify('engram-persistence', 'st-1.json').kind, KEEP);
  check('*.json does not match a .jsonl file', classify('engram-persistence', 'notes.jsonl').kind, UNKNOWN);
  check('*.json does not match a file named only .json', classify('engram-persistence', '.json').kind, UNKNOWN);
  check('a lock is a lock', classify('failure-capture', 'ledger.lock').kind, LOCK);
  check('the file of a writer breaking a stale lock is a lock too, and the per-session files are pruned by a week', [classify('failure-capture', 'ledger.lock.breaker').kind, classify('failure-capture', 'stamps/sesion-a.json'), classify('failure-capture', 'guard-state/sesion-a.json').kind, classify('failure-capture', 'guard-state/sesion-a.json').maxAgeMs], [LOCK, { kind: PRUNE, reason: classify('failure-capture', 'stamps/sesion-a.json').reason, maxAgeMs: WEEK }, PRUNE, WEEK]);
  check('J-3: the temporary files of the per-session writers are pruned by an hour, before their directory\'s rule', [classify('failure-capture', 'stamps/s.json.123-ab12cd34.tmp').maxAgeMs, classify('failure-capture', 'guard-state/s.json.9-ff.tmp').maxAgeMs], [HOUR, HOUR]);
  check('J-3: the temporary file of a fires counter or a rotated journal, of any mechanism, is pruned by an hour', [classify('guard-anything', 'fires.json.4242.tmp').kind, classify('guard-anything', 'journal.jsonl.tmp').maxAgeMs], [PRUNE, HOUR]);
  check('J-3: the obsolete shared state files of failure-capture are removed, and only those', [classify('failure-capture', 'last-capture.json').kind, classify('failure-capture', 'guard-state.json').kind, classify('delegation-receipts', 'guard-state.json').kind], [REMOVE, REMOVE, KEEP]);
  check('the breaker of any lock is a lock, its break journal and the not-counted runs are archived', [classify('guard-anything', 'fires.json.lock.breaker').kind, classify('guard-anything', 'fires.json.lock.breaks.jsonl').kind, classify('failure-capture', 'ledger.lock.breaks.jsonl').kind, classify('guard-anything', 'fires-uncounted.jsonl').kind], [LOCK, ARCHIVE, ARCHIVE, ARCHIVE]);
  check('the lock failures a hook recorded instead of printing are archived', classify('premise-judge', 'lock-faults.jsonl').kind, ARCHIVE);
  check('only a PRUNE rule carries an age', ['maxAgeMs' in classify('failure-capture', 'last-capture.json'), 'maxAgeMs' in classify('collision-guard', 'refusals.jsonl')], [false, false]);
  check('the hook journal of any mechanism is a journal', [classify('guard-anything', 'journal.jsonl').kind, classify('collision-guard', 'journal.jsonl').kind], [JOURNAL, JOURNAL]);
  check('the fires counter of any mechanism is archived', classify('guard-anything', 'fires.json').kind, ARCHIVE);
  check('the lock of a fires counter increment is a lock, so it refuses an apply', classify('guard-anything', 'fires.json.lock').kind, LOCK);
  check('the lock of a running full chain is a lock, so it refuses an apply', classify('full-chain-lock', 'chain.lock').kind, LOCK);
  check('the holder record of a full chain left with no lock is obsolete and removed', classify('full-chain-lock', 'holder.json').kind, REMOVE);
  check('the stale locks a full chain broke are archived with their reason', classify('full-chain-lock', 'chain.lock.breaks.jsonl').kind, ARCHIVE);
  check('a mechanism-specific rule wins over a general one', [classify('fleet-kit', 'handback/refusals.jsonl').kind, classify('fleet-kit', 'landing-guard/refusals.jsonl').kind], [KEEP, ARCHIVE]);
  check('* is exactly one segment', [classify('fleet-kit', 'repos/k/verdicts/t.json').kind, classify('fleet-kit', 'repos/k/verdicts/deeper/t.json').kind], [KEEP, UNKNOWN]);
  check('** is one or more segments', [classify('fleet-kit', 'repos/k/diff-coverage/run-1/summary.json').kind, classify('failure-capture', 'condense/run/ledger.md').kind, classify('failure-capture', 'condense').kind], [ARCHIVE, ARCHIVE, UNKNOWN]);
  check('prefix*suffix matches a segment with that start and ending', [pathMatches('stale-*.json', 'stale-ab12.json'), pathMatches('stale-*.json', 'stale-a.json')], [true, true]);
  check('prefix*suffix needs the star to hold at least one character', [pathMatches('stale-*.json', 'stale-.json'), pathMatches('a*a', 'a'), pathMatches('a*a', 'aa')], [false, false, false]);
  check('prefix*suffix needs both its start and its ending', [pathMatches('stale-*.json', 'other-ab.json'), pathMatches('stale-*.json', 'stale-ab.jsonl'), pathMatches('stale-*.json', 'stale-ab.txt')], [false, false, false]);
  check('prefix*suffix is one segment', [pathMatches('stale-*.json', 'x/stale-ab.json'), pathMatches('x/stale-*.json', 'x/stale-ab.json')], [false, true]);
  check('a segment with no star is compared whole, a segment with two stars is not a glob', [pathMatches('ab', 'abc'), pathMatches('a*b*c', 'axbxc'), pathMatches('a*b*c', 'a*b*c')], [false, false, true]);
  check('a pattern with two stars is compared whole even when a glob on its first star would match', pathMatches('a*b*c', 'axb*c'), false);
  check('a lone * matches any non-empty segment', [pathMatches('*', 'x'), pathMatches('a/*', 'a/anything.json')], [true, true]);
  check('the stale records of commit-index-guard are kept', [classify('commit-index-guard', 'stale-0123abcd.json').kind, classify('commit-index-guard', 'stale-.json').kind], [KEEP, UNKNOWN]);
  check('a rule of one mechanism does not apply to another', classify('guard-anything', 'refusals.jsonl').kind, UNKNOWN);
  check('a file no rule names is unknown, with no reason', classify('collision-guard', 'surprise.txt'), { kind: UNKNOWN, reason: '' });
  check('a known kind carries its reason', classify('stash-watch', 'noticed.json').reason.length > 0, true);
  check('pathMatches compares whole paths', [pathMatches('a/b', 'a/b'), pathMatches('a/b', 'a/b/c'), pathMatches('a/b', 'a'), pathMatches('a/*', 'a/x'), pathMatches('a/**', 'a')], [true, false, false, true, false]);
  check('every rule has a known kind, a reason and a pattern, and a PRUNE rule a positive age', KINDS.filter(([, pattern, kind, reason, maxAgeMs]) => ![ARCHIVE, JOURNAL, KEEP, LOCK, PRUNE, REMOVE].includes(kind) || reason === '' || pattern === '' || (kind === PRUNE) !== (Number.isFinite(maxAgeMs) && maxAgeMs > 0)), []);
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
  check('a state directory that is a link is never entered, so nothing behind it is planned', [said.includes('linked-mechanism'), said.includes('linked-state')], [false, false]);
  check('the summary counts every action', said.includes('5 to archive, 0 to remove, 7 kept, 2 unknown.'), true);
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
  const untouched = ['backlog-guard/state/s-1.json', 'backlog-guard/state/dismissals.jsonl', 'guard-y/state/journal.jsonl', 'collision-guard/state/guard-errors.jsonl', 'mystery/state/weird.bin', 'fleet-kit/state/handback/refusals.jsonl', 'fleet-kit/state/repos/k/verdicts/t.json', 'guard-z/state/journal.jsonl', 'brief-audience/state/refusals.jsonl', 'outside/linked-dir', 'outside/linked-dir/target.jsonl', 'outside/linked-state/refusals.jsonl', 'linked-mechanism/state', '.hidden/state/refusals.jsonl'];
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

  // --- J-3: what only matters while recent is pruned by its age, and the obsolete is removed ---
  // @es J-3: lo que solo importa mientras es reciente se poda por su edad, y lo obsoleto se borra.
  const pruned = path.join(scratch, 'prune');
  const aged = (relative, ageMs) => {
    put(pruned, relative, '{}');
    utimesSync(path.join(pruned, relative), (NOW - ageMs) / 1000, (NOW - ageMs) / 1000);
  };

  aged('failure-capture/state/last-capture.json', 0);
  aged('failure-capture/state/guard-state.json', 0);
  aged('failure-capture/state/stamps/old-session.json', WEEK + HOUR);
  aged('failure-capture/state/stamps/live-session.json', WEEK - HOUR);
  aged('failure-capture/state/guard-state/old-scope.json', WEEK + HOUR);
  aged('failure-capture/state/stamps/s.json.12-ab.tmp', 2 * HOUR);
  aged('failure-capture/state/guard-state/s.json.12-ab.tmp', (HOUR * 3) / 4);
  aged('guard-x/state/fires.json.4242.tmp', 2 * HOUR);
  aged('guard-x/state/fires-uncounted.jsonl', 0);
  aged('guard-x/state/fires.json.lock.breaks.jsonl', 0);

  const prunePlan = rotate(['--home', pruned]).out.join('\n');

  check('J-3: the plan removes the obsolete, the old per-session files and the old temp files, and says why', ['REMOVE   failure-capture/last-capture.json: obsolete', 'REMOVE   failure-capture/guard-state.json: obsolete', 'REMOVE   failure-capture/stamps/old-session.json: past its age', 'REMOVE   failure-capture/guard-state/old-scope.json: past its age', 'REMOVE   failure-capture/stamps/s.json.12-ab.tmp: past its age', 'REMOVE   guard-x/fires.json.4242.tmp: past its age'].map((line) => prunePlan.includes(line)), [true, true, true, true, true, true]);
  check('J-3: NEAR MISS: a per-session file younger than a week and a temp file younger than an hour are kept', ['KEEP     failure-capture/stamps/live-session.json: operative', 'KEEP     failure-capture/guard-state/s.json.12-ab.tmp: operative'].map((line) => prunePlan.includes(line)), [true, true]);
  check('J-3: the summary counts the removals apart', prunePlan.includes('2 to archive, 6 to remove, 2 kept, 0 unknown.'), true);

  const pruneApplied = rotate(['--home', pruned, '--apply']);
  const left = (relative) => existsSync(path.join(pruned, relative));

  check('J-3: --apply removes them, so a live install cleans up through rotate', [pruneApplied.code, ...['failure-capture/state/last-capture.json', 'failure-capture/state/guard-state.json', 'failure-capture/state/stamps/old-session.json', 'failure-capture/state/guard-state/old-scope.json', 'failure-capture/state/stamps/s.json.12-ab.tmp', 'guard-x/state/fires.json.4242.tmp'].map(left)], [0, false, false, false, false, false, false]);
  check('J-3: ...keeps the young ones, archives the break journal and the not-counted runs', [left('failure-capture/state/stamps/live-session.json'), left('failure-capture/state/guard-state/s.json.12-ab.tmp'), existsSync(path.join(pruned, 'state-archive', DATE, 'guard-x', 'fires-uncounted.jsonl')), existsSync(path.join(pruned, 'state-archive', DATE, 'guard-x', 'fires.json.lock.breaks.jsonl'))], [true, true, true, true]);
  check('J-3: ...says each removal, bilingual, and counts it in the total', [pruneApplied.out.filter((line) => line.startsWith('Removed ') && line.includes(' @es Borrado ')).length, pruneApplied.out.at(-1).startsWith('Rotated 8 file(s)')], [6, true]);
  check('J-3: a second apply has nothing left to remove', rotate(['--home', pruned, '--apply']).out.at(-1).startsWith('Nothing to rotate'), true);

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

  // --- E7: the command text of old eval-guard denials is replaced by its sha256, once, live and archived ---
  // @es E7: el texto de orden de los rechazos viejos de eval-guard se sustituye por su sha256, una vez, vivo y archivado.
  const OLD_TEXT = "node -e \"console.log('\\\\b')\" // denial-secret-4471";
  const OLD_DENIAL = JSON.stringify({ at: 'x', flag: '-e', command: OLD_TEXT });
  const NEW_DENIAL = JSON.stringify({ at: 'y', flag: '-e', commandDigest: digestInput('other') });
  const ARCHIVED_DENIAL = JSON.stringify({ at: 'z', command: 'archived denial-secret-4471' });
  const redactHome = makeHome(scratch, 'redact');
  const liveDenials = path.join(redactHome, 'eval-guard', 'state', 'denials.jsonl');
  const oldArchive = path.join(redactHome, 'state-archive', '2026-10-01', 'eval-guard', 'denials.jsonl');

  put(redactHome, 'eval-guard/state/denials.jsonl', `${OLD_DENIAL}\n${NEW_DENIAL}\n{torn\n`);
  put(redactHome, 'state-archive/2026-10-01/eval-guard/denials.jsonl', `${ARCHIVED_DENIAL}\n`);
  put(redactHome, 'backlog-guard/state/denials.jsonl', `${OLD_DENIAL}\n`);

  const beforeRedaction = treeOf(redactHome);
  const plannedRedaction = rotate(['--home', redactHome]);

  check('a dry run plans the replacement of the live and the archived text, and changes nothing', [plannedRedaction.out.filter((line) => line.startsWith('REPLACE')).length, plannedRedaction.out.join('\n').includes(`REPLACE  ${liveDenials}: 1 line(s)`), plannedRedaction.out.join('\n').includes(`REPLACE  ${oldArchive}: 1 line(s)`), treeOf(redactHome)], [2, true, true, beforeRedaction]);
  check('every replacement line is bilingual', plannedRedaction.out.filter((line) => line.startsWith('REPLACE')).every((line) => line.includes(' @es SUSTITUIR ')), true);

  const appliedRedaction = rotate(['--home', redactHome, '--apply']);
  const rotatedDenials = readFileSync(path.join(redactHome, 'state-archive', DATE, 'eval-guard', 'denials.jsonl'), 'utf8');

  check('apply exits 0 and says what it replaced', [appliedRedaction.code, appliedRedaction.out.some((line) => line.startsWith(`Replaced the \`command\` text by its sha256 in 1 line(s) of ${liveDenials}`))], [0, true]);
  check('the rotated journal holds the digest and never the text', [rotatedDenials.includes('denial-secret-4471'), rotatedDenials.split('\n')[0]], [false, JSON.stringify({ at: 'x', flag: '-e', commandDigest: digestInput(OLD_TEXT) })]);
  check('an entry already in digest form and a torn line are kept as they were', rotatedDenials.split('\n').slice(1), [NEW_DENIAL, '{torn', '']);
  check('a same-named file of another mechanism is not touched', readFileSync(path.join(redactHome, 'backlog-guard', 'state', 'denials.jsonl'), 'utf8'), `${OLD_DENIAL}\n`);
  check('an archive of an earlier rotation is replaced too', readFileSync(oldArchive, 'utf8'), `${JSON.stringify({ at: 'z', commandDigest: digestInput('archived denial-secret-4471') })}\n`);

  const afterRedaction = treeOf(redactHome);
  const secondRedaction = rotate(['--home', redactHome, '--apply']);

  check('a second run replaces nothing and changes nothing', [secondRedaction.out.some((line) => line.startsWith('REPLACE') || line.startsWith('Replaced')), treeOf(redactHome)], [false, afterRedaction]);
  check('a line is replaced only when its field holds text', [redactedLine('{"command":3}', 'command', 'commandDigest'), redactedLine('not json', 'command', 'commandDigest'), redactedLine('null', 'command', 'commandDigest'), redactedLine('{"other":"x"}', 'command', 'commandDigest')], ['{"command":3}', 'not json', 'null', '{"other":"x"}']);
  check('the redaction table names the eval-guard denial journal', REDACTIONS, [['eval-guard', 'denials.jsonl', 'command', 'commandDigest']]);

  const failingRedaction = makeHome(scratch, 'redact-fails');

  put(failingRedaction, 'eval-guard/state/denials.jsonl', `${OLD_DENIAL}\n`);
  mkdirSync(path.join(failingRedaction, 'eval-guard', 'state', 'denials.jsonl.tmp'));
  const failedRedaction = rotate(['--home', failingRedaction, '--apply']);

  check('a replacement that fails exits 1, names the file and moves nothing', [failedRedaction.code, failedRedaction.err.join('\n').includes(`FAILED on ${path.join(failingRedaction, 'eval-guard', 'state', 'denials.jsonl')}`), existsSync(path.join(failingRedaction, 'collision-guard', 'state', 'refusals.jsonl'))], [1, true, true]);
  check('a home with only text to replace still applies', (() => {
    const onlyText = path.join(scratch, 'only-text');

    put(onlyText, 'state-archive/2026-10-01/eval-guard/denials.jsonl', `${OLD_DENIAL}\n`);
    const result = rotate(['--home', onlyText, '--apply']);

    return [result.code, readFileSync(path.join(onlyText, 'state-archive', '2026-10-01', 'eval-guard', 'denials.jsonl'), 'utf8').includes('denial-secret-4471')];
  })(), [0, false]);

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
