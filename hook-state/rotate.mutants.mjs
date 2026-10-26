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
  ['prefix*suffix ignores the ending', R, ' && segment.startsWith(prefix) && segment.endsWith(suffix);', ' && segment.startsWith(prefix);'],
  ['prefix*suffix ignores the prefix', R, ' && segment.startsWith(prefix) && segment.endsWith(suffix);', ' && segment.endsWith(suffix);'],
  ['prefix*suffix matches a segment with nothing in the star', R, 'segment.length > prefix.length + suffix.length &&', 'segment.length >= prefix.length + suffix.length &&'],
  ['prefix*suffix lets the prefix and the ending overlap', R, 'segment.length > prefix.length + suffix.length &&', 'segment.length > 0 &&'],
  ['a pattern with two stars is read as a glob', R, "if (star === -1 || pattern.indexOf('*', star + 1) !== -1) return pattern === segment;", 'if (star === -1) return pattern === segment;'],
  ['a pattern with no star is read as a glob', R, "if (star === -1 || pattern.indexOf('*', star + 1) !== -1) return pattern === segment;", "if (pattern.indexOf('*', star + 1) !== -1) return pattern === segment;"],
  ['a lone * matches only an empty segment', R, 'segment.length > prefix.length + suffix.length &&', 'segment.length < prefix.length + suffix.length &&'],
  ['** matches zero segments', R, 'given.length >= wanted.length && wanted.slice(0, -1)', 'given.length >= wanted.length - 1 && wanted.slice(0, -1)'],
  ['a pattern matches a path of another length', R, 'return wanted.length === given.length && wanted.every(', 'return wanted.every('],
  ['** is read as a plain segment', R, "if (wanted.at(-1) === '**')", "if (wanted.at(-1) === '***')"],
  ['the ledger lock is not a lock', R, "['failure-capture', 'ledger.lock', LOCK, 'the ledger writers']", "['failure-capture', 'ledger.lock', KEEP, 'the ledger writers']"],
  ['the breaker of a stale ledger lock is not a lock', R, "['failure-capture', 'ledger.lock.breaker', LOCK, 'the writer breaking a stale ledger lock']", "['failure-capture', 'ledger.lock.breaker', KEEP, 'the writer breaking a stale ledger lock']"],
  ['the stamps of the sessions are archived instead of pruned by age', R, "['failure-capture', 'stamps/*', PRUNE,", "['failure-capture', 'stamps/*', ARCHIVE,"],
  ['the cooldowns of the sessions are kept forever', R, "['failure-capture', 'guard-state/*', PRUNE,", "['failure-capture', 'guard-state/*', KEEP,"],

  // --- J-3: pruning by age and removing the obsolete ---
  ['the per-session files are pruned after a day, not a week', R, "its session is over\", WEEK_MS],\n  ['failure-capture', 'guard-state/*', PRUNE,", "its session is over\", HOUR_MS * 24],\n  ['failure-capture', 'guard-state/*', PRUNE,"],
  ['a week is six days', R, 'const WEEK_MS = 7 * 24 * HOUR_MS;', 'const WEEK_MS = 6 * 24 * HOUR_MS;'],
  ['an hour is half an hour', R, 'const HOUR_MS = 60 * 60 * 1000;', 'const HOUR_MS = 30 * 60 * 1000;'],
  ['a stamp temp file follows the stamp rule', R, "  ['failure-capture', 'stamps/*.tmp', PRUNE, 'the temporary file of an interrupted stamp write', HOUR_MS],\n", ''],
  ['a cooldown temp file follows the cooldown rule', R, "  ['failure-capture', 'guard-state/*.tmp', PRUNE, 'the temporary file of an interrupted cooldown write', HOUR_MS],\n", ''],
  ['a temp file of any mechanism is unknown', R, "  [ANY, '*.tmp', PRUNE,", "  [ANY, '*.tmpx', PRUNE,"],
  ['the obsolete stamp file is kept', R, "['failure-capture', 'last-capture.json', REMOVE,", "['failure-capture', 'last-capture.json', KEEP,"],
  ['the obsolete cooldown file is kept', R, "['failure-capture', 'guard-state.json', REMOVE,", "['failure-capture', 'guard-state.json', KEEP,"],
  ['the not-counted runs are unknown', R, "[ANY, 'fires-uncounted.jsonl', ARCHIVE,", "[ANY, 'fires-uncounted.jsonlx', ARCHIVE,"],
  ['the lock failures a hook recorded are unknown', R, "[ANY, 'lock-faults.jsonl', ARCHIVE,", "[ANY, 'lock-faults.jsonlx', ARCHIVE,"],
  ['the lock failures a hook recorded are kept forever', R, "[ANY, 'lock-faults.jsonl', ARCHIVE,", "[ANY, 'lock-faults.jsonl', KEEP,"],
  ['the breaker of any lock is not a lock', R, "[ANY, '*.lock.breaker', LOCK,", "[ANY, '*.lock.breaker', KEEP,"],
  ['the break journal is unknown', R, "[ANY, '*.lock.breaks.jsonl', ARCHIVE,", "[ANY, '*.lock.breaks.jsonlx', ARCHIVE,"],
  ['a prune rule loses its age', R, "...(rule[2] === PRUNE ? { maxAgeMs: rule[4] } : {})", '...{}'],
  ['every rule carries an age', R, "...(rule[2] === PRUNE ? { maxAgeMs: rule[4] } : {})", '...{ maxAgeMs: rule[4] }'],
  ['a prune file is removed whatever its age', R, "action: now - stats.mtimeMs > maxAgeMs ? 'prune' : 'keep'", "action: 'prune'"],
  ['a prune file is never removed', R, "action: now - stats.mtimeMs > maxAgeMs ? 'prune' : 'keep'", "action: 'keep'"],
  ['a prune age is measured by the real clock, not the given one', R, '  const plan = planRotation(options.home, now);', '  const plan = planRotation(options.home);'],
  ['an obsolete file is kept', R, "  if (kind !== JOURNAL) return { ...entry, action: kind };", "  if (kind !== JOURNAL) return { ...entry, action: kind === REMOVE ? 'keep' : kind };"],
  ['a planned removal is not applied', R, "const CHANGING = new Set(['archive', 'journal', 'prune', 'remove']);", "const CHANGING = new Set(['archive', 'journal', 'remove']);"],
  ['an obsolete removal is not applied', R, "const CHANGING = new Set(['archive', 'journal', 'prune', 'remove']);", "const CHANGING = new Set(['archive', 'journal', 'prune']);"],
  ['a removal is archived instead', R, "      if (entry.action === 'prune' || entry.action === 'remove') {", '      if (false) {'],
  ['a removal is not reported', R, "        speaker.say('removed', { file: entry.source, reason: entry.reason });\n", ''],
  ['a removal is not counted in the total', R, "        speaker.say('removed', { file: entry.source, reason: entry.reason });\n        count += 1;", "        speaker.say('removed', { file: entry.source, reason: entry.reason });"],
  ['the summary does not count removals apart', R, "const removing = plan.filter(({ action }) => action === 'prune' || action === 'remove').length;", 'const removing = 0;'],
  ['the dismissals in force are archived', R, "['backlog-guard', 'dismissals.jsonl', KEEP, 'dismissals in force']", "['backlog-guard', 'dismissals.jsonl', ARCHIVE, 'dismissals in force']"],
  ['the session markers are archived', R, "['backlog-guard', '*.json', KEEP, \"a session's transcript offset\"]", "['backlog-guard', '*.json', ARCHIVE, \"a session's transcript offset\"]"],
  ['the handback refusal count is archived', R, "['fleet-kit', 'handback/refusals.jsonl', KEEP, 'the refusal count that bounds the handback loop'],\n", ''],
  ['the hook journal is archived whole, its dismissals lost', R, "[ANY, 'journal.jsonl', JOURNAL, 'hook journal']", "[ANY, 'journal.jsonl', ARCHIVE, 'hook journal']"],
  ['the fires counter lock is archived', R, "[ANY, 'fires.json.lock', LOCK,", "[ANY, 'fires.json.lock', ARCHIVE,"],
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
  ['an operative file is moved too', R, 'plan.filter(({ action }) => CHANGING.has(action))) {', 'plan) {'],
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
  ['nothing to do still reports a plan to apply', R, "  if (moving === 0 && redactions.length === 0) {\n    speaker.say('nothing-to-do');\n\n    return 0;\n  }\n", ''],
  // --- E7: the text an old journal must not hold ---
  ['text left to replace is nothing to do', R, 'if (moving === 0 && redactions.length === 0) {', 'if (moving === 0) {'],
  ['the text is never replaced', R, '  if (!applyRedactions(redactions, speaker)) return 1;\n', ''],
  ['a failed replacement is ignored', R, '  if (!applyRedactions(redactions, speaker)) return 1;', '  applyRedactions(redactions, speaker);'],
  ['the text is replaced after the moves', R, '  if (!applyRedactions(redactions, speaker)) return 1;\n\n  const { count, failed } = applyPlan(plan, archive, speaker);', '  const { count, failed } = applyPlan(plan, archive, speaker);\n  if (!applyRedactions(redactions, speaker)) return 1;'],
  ['the archives are not searched', R, 'const archived = dates.map((date) => path.join(archiveRoot, date, mechanism, file));', 'const archived = [];'],
  ['the live journal is not searched', R, 'const live = stateDirsUnder(home).filter((entry) => entry.mechanism === mechanism).map(({ directory }) => path.join(directory, file));', 'const live = [];'],
  ['a same-named file of any mechanism is replaced', R, '.filter((entry) => entry.mechanism === mechanism)', '.filter(() => true)'],
  ['the replaced line keeps its text', R, 'return JSON.stringify({ ...rest, [digestField]: digestInput(text) });', 'return JSON.stringify({ ...record, [digestField]: digestInput(text) });'],
  ['a field that is no text is replaced', R, "typeof record?.[field] !== 'string'", 'record?.[field] === undefined'],
  ['every line counts as pending', R, '.filter((line) => redactedLine(line, field, digestField) !== line).length', '.length'],
  ['a file with nothing pending is still planned', R, 'return pending === 0 ? [] :', 'return false ? [] :'],
  ['a file is rewritten in place, not through a temporary', R, '      writeFileSync(`${source}.tmp`, text);\n      renameSync(`${source}.tmp`, source);', '      writeFileSync(source, text);'],
  ['the replacement is not planned in a dry run', R, '  for (const { source, field, digestField, pending } of redactions) speaker.say(', '  for (const { source, field, digestField, pending } of []) speaker.say(']
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
