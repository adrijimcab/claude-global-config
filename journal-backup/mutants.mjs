#!/usr/bin/env node
/**
 * The decisions of `journal-backup/backup.mjs`, each broken once, that `selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * Both directions: mutants that let a bad backup through (a mismatch, a target in the cleaned tree, a
 * different existing backup) and mutants that refuse a good one (a near-miss target name, an identical
 * existing backup).
 *
 * @es Las decisiones de `backup.mjs`, rotas una a una, que `selftest.mjs` debe detectar. Ambas direcciones:
 * las que dejan pasar una mala copia y las que rechazan una buena. Un mutante que solo hace caer el selftest
 * cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const B = 'journal-backup/backup.mjs';

const MUTANTS = [
  // --- population ---
  ['only incidents.jsonl is backed up (a hand list in disguise)', B, "entry.isFile() && entry.name.endsWith('.jsonl')", "entry.isFile() && entry.name === 'incidents.jsonl'"],
  ['every file of a state directory is backed up, not only journals', B, "entry.isFile() && entry.name.endsWith('.jsonl')", 'entry.isFile()'],
  ['only the failure-capture directory is searched for state', B, 'entry.isDirectory() && existsSync(', "entry.name === 'failure-capture' && existsSync("],
  ['the population comes out in reverse order', B, "path.relative(home, file).split(path.sep).join('/'))\n    .sort();", "path.relative(home, file).split(path.sep).join('/'))\n    .sort().reverse();"],

  // --- the copy ---
  ['journals are flattened, losing their relative path', B, 'copyFile(path.join(home, relative), path.join(target, relative));', 'copyFile(path.join(home, relative), path.join(target, path.basename(relative)));'],
  ['the copy runs backwards, from the backup to the source', B, 'copyFile(path.join(home, relative), path.join(target, relative));', 'copyFile(path.join(target, relative), path.join(home, relative));'],
  ['a file without a trailing newline loses its last line in the count', B, 'bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0', '0'],
  ['a file with a trailing newline gains a phantom line in the count', B, 'bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0', '1'],

  // --- the verification ---
  ['a line-count mismatch goes unreported', B, 'if (source.lines !== backup.lines)', 'if (false)'],
  ['a sha256 mismatch goes unreported', B, 'if (source.sha !== backup.sha) mismatches', 'if (false) mismatches'],
  ['mismatches do not fail the run', B, 'if (mismatches > 0) return 1;', 'if (mismatches > 99) return 1;'],
  ['a mismatch exits 2, the refusal code, not 1', B, 'if (mismatches > 0) return 1;', 'if (mismatches > 0) return 2;'],
  ['a mismatching file is still reported as copied', B, "if (source.sha === backup.sha) say(out, 'copied'", "if (true) say(out, 'copied'"],

  // --- the target ---
  ['a target inside the cleaned state tree is accepted', B, 'if (cleaned !== undefined)', 'if (false)'],
  ['inside is judged by string prefix, so a near-miss sibling is refused', B, "path.relative(parent, child).split(path.sep)[0] !== '..' && !path.isAbsolute(path.relative(parent, child))", 'child.startsWith(parent)'],
  ['an existing target is never looked at, so it is overwritten', B, 'if (existsSync(target)) return', 'if (false) return'],
  ['an existing target with different content is accepted', B, 'holdsSame(target, home, journals) ?', 'true ?'],
  ['an existing identical target is refused', B, 'holdsSame(target, home, journals) ?', 'false ?'],
  ['an existing target with an extra or missing file counts as the same', B, 'JSON.stringify(filesUnder(target)) === JSON.stringify(journals) && ', ''],
  ['an existing target with altered bytes counts as the same', B, 'journals.every((relative) => digestOf(path.join(target, relative)).sha === digestOf(path.join(home, relative)).sha)', 'true'],
  ['the target directory loses its date', B, '`journals-${date}`', "'journals'"],

  // --- the empty population ---
  ['a home with no journal is backed up as success', B, 'if (journals.length === 0) return', 'if (false) return'],

  // --- the command line ---
  ['an unknown option is taken as the home directory', B, "if (flag === undefined && argv[index].startsWith('-')) return", 'if (false) return'],
  ['a missing option value is accepted', B, 'else if (argv[index + 1] === undefined) return', 'else if (false) return'],
  ['the date is not validated, so it can traverse', B, 'if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(options.date)) return', 'if (false) return'],
  ['the date check is not anchored at the end', B, '/^\\d{4}-\\d{2}-\\d{2}$/.test(options.date)', '/^\\d{4}-\\d{2}-\\d{2}/.test(options.date)'],
  ['the default date is cut short', B, 'new Date().toISOString().slice(0, 10)', 'new Date().toISOString().slice(0, 9)'],
  ['the default home is not ~/.claude', B, "path.join(homedir(), '.claude'), backupRoot", "path.join(homedir(), '.claudes'), backupRoot"],
  ['the default backup root is not ~/.claude-backups', B, "path.join(homedir(), '.claude-backups')", "path.join(homedir(), '.claude-backup')"],
  ['the process never runs the backup when launched directly', B, 'if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)', 'if (false)'],
  ['the process exits 0 whatever the run returned', B, 'process.exit(run(process.argv.slice(2)))', 'process.exit((run(process.argv.slice(2)), 0))'],

  // --- the message table ---
  ['a printed line loses its Spanish half', B, 'out(`${fill(MESSAGES[id].en)} @es ${fill(MESSAGES[id].es)}`);', 'out(fill(MESSAGES[id].en));'],
  ['placeholders are not filled', B, 'String(params[name])', "'{' + name + '}'"],
  ['the Spanish half of a message loses its accent', B, 'Copiado {file}: {lines} líneas', 'Copiado {file}: {lines} lineas']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['journal-backup'],
  selftest: 'journal-backup/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
