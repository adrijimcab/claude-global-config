#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `journal-backup/backup.mjs`. Every case runs on a home CONSTRUCTED in a temp
 * directory, never on the real `~/.claude`.
 *
 * THE STATE SPACE: the population (derived from the tree: incidents, dismissals, any guard's journal, a
 * journal added later, non-journal files and non-state directories ignored), the copy (relative paths kept,
 * sources untouched), the verification (identical, truncated copy, same-length altered copy), the target
 * (outside the cleaned tree, inside it, a near-miss name, absent, existing identical, existing different),
 * the empty population, and the language of every printed line.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `backup.mjs`. Cada caso corre sobre un home CONSTRUIDO en un directorio
 * temporal, nunca sobre el `~/.claude` real. Espacio de estados: población, copia, verificación, destino,
 * población vacía e idioma de cada línea impresa.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { backupJournals, discoverJournals, MESSAGES, run } from './backup.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const sha = (text) => createHash('sha256').update(text).digest('hex');
const scratch = mkdtempSync(path.join(tmpdir(), 'journal-backup-selftest-'));
let counter = 0;

/** A constructed home holding the given files. @es Un home construido con esos ficheros. */
function makeHome(files) {
  counter += 1;
  const home = path.join(scratch, `case-${counter}`, 'home');

  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(home, relative)), { recursive: true });
    writeFileSync(path.join(home, relative), content);
  }

  return { home, backupRoot: path.join(scratch, `case-${counter}`, 'backups') };
}

/** What `action` returns, or `'threw'`: a throw is a failed check, never a crash of the selftest. @es Lo que devuelve `action`, o `'threw'`. */
function safely(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return 'threw';
  }
}

/** Runs the backup capturing its lines. @es Corre la copia capturando sus líneas. */
function attempt(setup, extra = {}) {
  const lines = [];
  const exit = safely(() => backupJournals({ ...setup, date: '2026-10-04', out: (line) => lines.push(line), ...extra }));

  return { exit, lines, text: lines.join('\n'), target: path.join(setup.backupRoot, 'journals-2026-10-04') };
}

const FILES = {
  'failure-capture/state/incidents.jsonl': '{"a":1}\n{"a":2}\n',
  'failure-capture/state/dismissals.jsonl': '{"d":1}\n',
  'backlog-guard/state/decisions.jsonl': '{"b":1}\n{"b":2}\n{"b":3}',
  'backlog-guard/state/notes.txt': 'not a journal\n',
  'backlog-guard/other.jsonl': 'not in a state dir\n',
  'settings.json': '{}\n'
};
const EXPECTED = ['backlog-guard/state/decisions.jsonl', 'failure-capture/state/dismissals.jsonl', 'failure-capture/state/incidents.jsonl'];

// --- the population comes from the tree ---
const base = makeHome(FILES);

check('population: every state journal, sorted, nothing else', discoverJournals(base.home), EXPECTED);

const grown = makeHome({ ...FILES, 'brand-new-guard/state/events.jsonl': '{"n":1}\n' });

check('population: a journal added to the tree is found without editing the code', discoverJournals(grown.home), ['backlog-guard/state/decisions.jsonl', 'brand-new-guard/state/events.jsonl', ...EXPECTED.slice(1)]);
check('population: incidents.jsonl is always among them', discoverJournals(base.home).includes('failure-capture/state/incidents.jsonl'), true);

// --- the copy ---
const sourceShas = Object.fromEntries(EXPECTED.map((relative) => [relative, sha(FILES[relative])]));
const copied = attempt(base);

check('copy: exit 0', copied.exit, 0);
for (const relative of EXPECTED) {
  const copy = path.join(copied.target, relative);

  check(`copy: ${relative} kept at its relative path with equal sha256`, existsSync(copy) && sha(readFileSync(copy, 'utf8')), sourceShas[relative]);
  check(`copy: source ${relative} untouched`, sha(readFileSync(path.join(base.home, relative), 'utf8')), sourceShas[relative]);
}
check('copy: a non-journal file is not copied', existsSync(path.join(copied.target, 'backlog-guard/state/notes.txt')), false);
check('copy: a file without trailing newline counts its last line (3 lines)', copied.lines.some((line) => line.includes('decisions.jsonl') && line.includes('3 lines')), true);
check('copy: a file with trailing newline does not count an extra line (2 lines)', copied.lines.some((line) => line.includes('incidents.jsonl') && line.includes('2 lines')), true);

// --- the verification ---
const truncated = attempt(makeHome(FILES), { copyFile: (from, to) => writeFileSync(to, readFileSync(from, 'utf8').split('\n')[0] + '\n') });

check('verify: a truncated copy is refused with a non-zero exit', truncated.exit, 1);
check('verify: a truncated copy names the line-count mismatch of the file', truncated.lines.some((line) => line.includes('LINES') && line.includes('incidents.jsonl')), true);
check('verify: a truncated copy is not reported as copied', truncated.lines.some((line) => line.startsWith('Copied') && line.includes('incidents.jsonl')), false);
check('verify: a truncated copy also names the sha256 mismatch of the file', truncated.lines.some((line) => line.includes('SHA256') && line.includes('incidents.jsonl')), true);

const altered = attempt(makeHome(FILES), { copyFile: (from, to) => writeFileSync(to, readFileSync(from, 'utf8').replaceAll('a', 'z')) });

check('verify: a same-length altered copy is refused', altered.exit, 1);
check('verify: a same-length altered copy names a sha256 mismatch', altered.lines.some((line) => line.includes('SHA256') && line.includes('incidents.jsonl')), true);
check('verify: a same-length altered copy reports no line-count mismatch', altered.lines.some((line) => line.includes('LINES')), false);

const honest = attempt(makeHome(FILES), { copyFile: copyFileSync });

check('verify: a faithful copy reports no mismatch', honest.lines.some((line) => line.includes('MISMATCH')), false);

// --- the target ---
const inside = makeHome(FILES);
const insideTarget = attempt({ ...inside, backupRoot: path.join(inside.home, 'backlog-guard', 'state', 'backups') });

check('target: a backup inside the cleaned state tree is refused (exit 2)', insideTarget.exit, 2);
check('target: nothing is written inside the cleaned tree', existsSync(insideTarget.target), false);

const root = makeHome(FILES);

check('target: a backup root that IS a state directory is refused', attempt({ ...root, backupRoot: path.join(root.home, 'failure-capture', 'state') }).exit, 2);

const near = makeHome(FILES);

check('target: a sibling named like the state tree is not inside it', attempt({ ...near, backupRoot: path.join(near.home, 'backlog-guard', 'state-backups') }).exit, 0);

/** A backup directory already on disk: the sources' content, changed as the case says. @es Una copia ya en disco. */
function plantBackup(setup, { replace = {}, drop = [], add = {} } = {}) {
  const planted = { ...Object.fromEntries(EXPECTED.map((relative) => [relative, FILES[relative]])), ...replace, ...add };

  for (const relative of drop) delete planted[relative];
  for (const [relative, content] of Object.entries(planted)) {
    mkdirSync(path.dirname(path.join(setup.backupRoot, 'journals-2026-10-04', relative)), { recursive: true });
    writeFileSync(path.join(setup.backupRoot, 'journals-2026-10-04', relative), content);
  }
}

const again = makeHome(FILES);

check('target: first run exits 0', attempt(again).exit, 0);
check('target: an existing identical backup is accepted again', attempt(again).exit, 0);

const planted = makeHome(FILES);

plantBackup(planted, { replace: { [EXPECTED[0]]: 'different\n' } });
const different = attempt(planted);

check('target: an existing backup with different content is refused (exit 2)', different.exit, 2);
check('target: the existing backup is not overwritten', readFileSync(path.join(planted.backupRoot, 'journals-2026-10-04', EXPECTED[0]), 'utf8'), 'different\n');

const extra = makeHome(FILES);

plantBackup(extra, { add: { 'stray.jsonl': 'x\n' } });
check('target: an existing backup holding an extra file counts as different', attempt(extra).exit, 2);

const lacking = makeHome(FILES);

plantBackup(lacking, { drop: [EXPECTED[1]] });
check('target: an existing backup lacking a source file counts as different', attempt(lacking).exit, 2);

// --- the empty population ---
const empty = makeHome({ 'settings.json': '{}\n' });
const none = attempt(empty);

check('empty: a home with no journal is refused (exit 2), nothing was measured', none.exit, 2);
check('empty: no target directory is created', existsSync(none.target), false);

// --- the command line ---
const cliHome = makeHome(FILES);
const cli = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'backup.mjs'), cliHome.home, '--backup-root', cliHome.backupRoot, '--date', '2026-10-04'], { encoding: 'utf8' });

check('cli: exit 0 on a faithful backup', cli.status, 0);
check('cli: the backup exists', existsSync(path.join(cliHome.backupRoot, 'journals-2026-10-04', EXPECTED[0])), true);
const quiet = { out: () => undefined };

check('cli: refuses an unknown option (exit 2)', safely(() => run([cliHome.home, '--nope'], quiet)), 2);
check('cli: refuses a missing --backup-root value (exit 2)', safely(() => run([cliHome.home, '--backup-root'], quiet)), 2);
check('cli: refuses a missing --date value (exit 2)', safely(() => run([cliHome.home, '--date'], quiet)), 2);
check('cli: refuses a date that is not YYYY-MM-DD (exit 2)', safely(() => run([cliHome.home, '--backup-root', cliHome.backupRoot, '--date', '../x'], quiet)), 2);
check('cli: refuses a date with a valid prefix and a tail (exit 2)', safely(() => run([cliHome.home, '--backup-root', cliHome.backupRoot, '--date', '2026-10-04x'], quiet)), 2);
check('cli: a date traversal creates nothing', existsSync(path.join(cliHome.backupRoot, '..', 'x')), false);

const emptyCli = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'backup.mjs'), empty.home, '--backup-root', empty.backupRoot], { encoding: 'utf8' });

check('cli: a refusal exits 2 from the process', emptyCli.status, 2);

const user = path.join(scratch, 'user');

mkdirSync(path.join(user, '.claude', 'failure-capture', 'state'), { recursive: true });
writeFileSync(path.join(user, '.claude', 'failure-capture', 'state', 'incidents.jsonl'), '{"u":1}\n');
const defaults = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'backup.mjs')], { encoding: 'utf8', env: { ...process.env, USERPROFILE: user, HOME: user } });
const today = new Date().toISOString().slice(0, 10);

check('cli: with no arguments the home is ~/.claude and the target ~/.claude-backups/journals-<today>', defaults.status === 0 && existsSync(path.join(user, '.claude-backups', `journals-${today}`, 'failure-capture', 'state', 'incidents.jsonl')), true);

// --- language: every printed line carries its Spanish half ---
const printed = [...copied.lines, ...truncated.lines, ...none.lines, ...insideTarget.lines, ...different.lines, ...cli.stdout.split('\n').filter(Boolean), ...emptyCli.stdout.split('\n').filter(Boolean)];

check('language: something was printed', printed.length > 5, true);
check('language: every printed line has its @es half', printed.filter((line) => !line.includes(' @es ')), []);
check('language: every message of the table has both halves', Object.entries(MESSAGES).filter(([, { en, es }]) => !en || !es).map(([id]) => id), []);
check('language: the Spanish halves keep their accents', Object.values(MESSAGES).some(({ es }) => /[áéíóúñ]/.test(es)), true);
check('language: the Spanish copied line keeps its accent', MESSAGES.copied.es.includes('líneas'), true);
check('language: the table is not empty', Object.keys(MESSAGES).length > 0, true);

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`journal-backup selftest FAILED (${failures.length}/${passed + failures.length}):\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`journal-backup selftest: ${passed} checks passed`);
