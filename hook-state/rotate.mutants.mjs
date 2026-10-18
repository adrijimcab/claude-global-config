#!/usr/bin/env node
/**
 * The decisions of `hook-state/rotate.mjs`, each broken once, that `rotate.selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only
 * crashes the selftest count as a survivor. Not mutated, stated: the `EXDEV` fallback of a move across volumes
 * (copy, then remove), which no constructed home on one volume can reach.
 *
 * @es Las decisiones de `rotate.mjs`, rotas una a una, que `rotate.selftest.mjs` debe detectar. Un mutante que
 * solo hace caer el selftest cuenta como superviviente. No se muta, dicho: el respaldo `EXDEV` de un movimiento
 * entre volúmenes, que ningún home construido en un solo volumen alcanza.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'hook-state/rotate.mjs';

const MUTANTS = [
  // --- the classification ---
  ['a rule of any mechanism is ignored', R, '(owner === mechanism || owner === ANY)', '(owner === mechanism)'],
  ['a rule of one mechanism applies to every mechanism', R, '(owner === mechanism || owner === ANY)', '(true)'],
  ['the last matching rule wins instead of the first', R, 'const rule = KINDS.find(', 'const rule = KINDS.findLast('],
  ['an unknown file is given a kind', R, "return rule === undefined ? { kind: UNKNOWN, reason: '' }", "return rule === undefined ? { kind: ARCHIVE, reason: '' }"],
  ['*.ext matches any ending', R, "if (pattern.startsWith('*.')) return segment.endsWith(pattern.slice(1)) && segment.length > pattern.length - 1;", "if (pattern.startsWith('*.')) return true;"],
  ['*.ext matches a segment that is only the ending', R, ' && segment.length > pattern.length - 1;', ';'],
  ['* matches nothing', R, "  if (pattern === '*') return true;\n", ''],
  ['** matches zero segments', R, 'given.length >= wanted.length && wanted.slice(0, -1)', 'given.length >= wanted.length - 1 && wanted.slice(0, -1)'],
  ['a pattern matches a path of another length', R, 'return wanted.length === given.length && wanted.every(', 'return wanted.every('],
  ['** is read as a plain segment', R, "if (wanted.at(-1) === '**')", "if (wanted.at(-1) === '***')"],
  ['the ledger lock is not a lock', R, "['failure-capture', 'ledger.lock', LOCK, 'the ledger writers']", "['failure-capture', 'ledger.lock', KEEP, 'the ledger writers']"],
  ['the breaker of a stale ledger lock is not a lock', R, "['failure-capture', 'ledger.lock.breaker', LOCK, 'the writer breaking a stale ledger lock']", "['failure-capture', 'ledger.lock.breaker', KEEP, 'the writer breaking a stale ledger lock']"],
  ['the stamps of the sessions are not kept', R, "['failure-capture', 'stamps/*', KEEP,", "['failure-capture', 'stamps/*', ARCHIVE,"],
  ['the cooldowns of the sessions are not kept', R, "['failure-capture', 'guard-state/*', KEEP,", "['failure-capture', 'guard-state/*', ARCHIVE,"],
  ['the dismissals in force are archived', R, "['backlog-guard', 'dismissals.jsonl', KEEP, 'dismissals in force']", "['backlog-guard', 'dismissals.jsonl', ARCHIVE, 'dismissals in force']"],
  ['the session markers are archived', R, "['backlog-guard', '*.json', KEEP, \"a session's transcript offset\"]", "['backlog-guard', '*.json', ARCHIVE, \"a session's transcript offset\"]"],
  ['the handback refusal count is archived', R, "['fleet-kit', 'handback/refusals.jsonl', KEEP, 'the refusal count that bounds the handback loop'],\n", ''],
  ['the hook journal is archived whole, its dismissals lost', R, "[ANY, 'journal.jsonl', JOURNAL, 'hook journal']", "[ANY, 'journal.jsonl', ARCHIVE, 'hook journal']"],
  ['the fires counter is kept', R, "[ANY, 'fires.json', ARCHIVE,", "[ANY, 'fires.json', KEEP,"],
  ['a refusal journal is kept', R, "['collision-guard', 'refusals.jsonl', ARCHIVE, 'refusal journal']", "['collision-guard', 'refusals.jsonl', KEEP, 'refusal journal']"],

  // --- what a journal carries ---
  ['every outcome is carried, not only dismissals', R, "filter((line) => recordOf(line)?.kind === 'dismissal')", "filter((line) => recordOf(line)?.kind !== 'decision')"],
  ['nothing is carried', R, "filter((line) => recordOf(line)?.kind === 'dismissal')", 'filter(() => false)'],
  ['a journal of dismissals only is rotated again', R, "action: carried.length === lines.length ? 'current' : 'journal'", "action: 'journal'"],
  ['the carried dismissals are not written back', R, "        writeFileSync(`${entry.source}.tmp`, `${entry.carried.join('\\n')}\\n`);\n        renameSync(`${entry.source}.tmp`, entry.source);\n", ''],
  ['the fresh journal is written in place, leaving no atomic swap', R, "        renameSync(`${entry.source}.tmp`, entry.source);\n", ''],

  // --- the plan ---
  ['an empty file is archived', R, "if (kind === ARCHIVE) return { ...entry, action: empty ? 'empty' : 'archive' };", "if (kind === ARCHIVE) return { ...entry, action: 'archive' };"],
  ['an empty journal is rotated', R, "  if (empty) return { ...entry, action: 'empty' };", "  if (false) return { ...entry, action: 'empty' };"],
  ['a link is classified like a file', R, "      if (stats.isSymbolicLink()) return { ...entry, kind: UNKNOWN, action: 'unknown' };\n", ''],
  ['a subdirectory of state is not walked', R, '(entry.isDirectory() ? filesUnder(path.join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`])', '(entry.isDirectory() ? [] : [`${prefix}${entry.name}`])'],

  ['a state directory that is a link is entered', 'hook-state/locations.mjs', 'const isRealDirectory = (candidate) => lstatSync(candidate, { throwIfNoEntry: false })?.isDirectory() === true;', 'const isRealDirectory = (candidate) => lstatSync(candidate, { throwIfNoEntry: false })?.isDirectory() === true || lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink() === true;'],

  // --- the sessions and locks that refuse ---
  ['a live session does not refuse', R, "...liveSessions(home, alive).map(({ file, pid }) => ['live-session', { file, pid }]),\n", ''],
  ['a lock does not refuse', R, "...plan.filter((entry) => entry.action === 'lock').map((entry) => ['held-lock', { file: entry.source }])", '...[]'],
  ['apply runs despite the blockers', R, 'if (options.apply && blockers.length > 0) {', 'if (false) {'],
  ['a dry run with blockers says nothing about them', R, "    if (blockers.length > 0) speaker.say('would-refuse');\n    for (const [id, params] of blockers) speaker.say(id, params);\n", ''],
  ['any record counts as a session, not only .json', R, ".filter((name) => name.endsWith('.json'))\n", ''],
  ['a record without a numeric pid is a live session', R, 'return Number.isSafeInteger(pid) && pid > 0 && alive(pid)', 'return alive(pid)'],
  ['every recorded session is alive', R, '&& alive(pid) ? [{ file, pid }] : [];', '? [{ file, pid }] : [];'],
  ['a process another user owns reads as dead', R, "return error?.code === 'EPERM';", 'return false;'],
  ['the probe says every process is alive', R, '    kill(pid, 0);\n\n    return true;', '    return true;'],

  // --- the moves ---
  ['a second rotation the same day overwrites the archive', R, '  if (existsSync(target)) {', '  if (false) {'],
  ['an appended source is left in place', R, '    appendFileSync(target, readFileSync(source));\n    rmSync(source);', '    appendFileSync(target, readFileSync(source));'],
  ['an operative file is moved too', R, "plan.filter(({ action }) => action === 'archive' || action === 'journal')) {", 'plan) {'],
  ['the archive is not split by mechanism', R, 'path.join(archive, entry.mechanism, ...entry.file.split', 'path.join(archive, ...entry.file.split'],
  ['a failed move still exits 0', R, '  if (failed) return 1;', '  if (failed) return 0;'],
  ['a failed move goes on with the next file', R, "      return { count, failed: true };", '      continue;'],

  // --- the command line ---
  ['apply is the default', R, "const options = { home: claudeHome(), date: new Date(now).toISOString().slice(0, 10), apply: false };", "const options = { home: claudeHome(), date: new Date(now).toISOString().slice(0, 10), apply: true };"],
  ['a dry run applies the plan', R, '  if (!options.apply) {', '  if (false) {'],
  ['--dry-run and --apply together are accepted', R, "  if (modes.size > 1) return { problem: '--dry-run and --apply together' };\n", ''],
  ['a missing option value is taken from the next option', R, " || value.startsWith('--')) return", ') return'],
  ['an unknown argument is ignored', R, '      return { problem: argument };', '      continue;'],
  ['a bad date is accepted', R, "if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(options.date)) return refuse", 'if (false) return refuse'],
  ['a home that is not a directory is walked', R, "if (statSync(options.home, { throwIfNoEntry: false })?.isDirectory() !== true) return refuse('no-home', { home: options.home });\n", ''],
  ['the default home is not the Claude home', R, 'const options = { home: claudeHome(),', "const options = { home: path.resolve('.claude'),"],
  ['the date of the archive is not the given one', R, "options[argument.slice(2)] = argument === '--home' ? path.resolve(value) : value;", "options[argument.slice(2)] = argument === '--home' ? path.resolve(value) : options.date;"],
  ['the archive lives outside the home', R, 'const archive = path.join(options.home, ARCHIVE_FOLDER, options.date);', 'const archive = path.join(options.home, options.date);'],
  ['nothing to do still reports a plan to apply', R, "  if (moving === 0) {\n    speaker.say('nothing-to-do');\n\n    return 0;\n  }\n", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/rotate.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
