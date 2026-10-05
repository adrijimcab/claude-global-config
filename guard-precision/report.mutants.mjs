#!/usr/bin/env node
/**
 * The decisions of `guard-precision/report.mjs`, each broken once, that `report.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `report.mjs`, rotas una a una, que `report.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'guard-precision/report.mjs';

const MUTANTS = [
  // --- the thresholds and the status ---
  ['9 blocks is enough for a figure', R, 'export const MIN_BLOCKS = 10;', 'export const MIN_BLOCKS = 9;'],
  ['10 blocks is not enough for a figure', R, 'export const MIN_BLOCKS = 10;', 'export const MIN_BLOCKS = 11;'],
  ['exactly the minimum reads insufficient', R, 'blocks < MIN_BLOCKS', 'blocks <= MIN_BLOCKS'],
  ['0 blocks reads insufficient, not no data', R, "blocks === 0 ? 'no-data' : blocks < MIN_BLOCKS", 'blocks < MIN_BLOCKS'],
  ['0 blocks reads ok', R, "blocks === 0 ? 'no-data'", "blocks === 0 ? 'ok'"],
  ['a figure is computed even without enough blocks', R, "status === 'ok' ? 1 - flagged / blocks : null", '1 - flagged / blocks'],
  ['no figure is ever computed', R, "status === 'ok' ? 1 - flagged / blocks : null", 'null'],

  // --- the formula ---
  ['the denominator counts one block too many', R, '? 1 - flagged / blocks : null', '? 1 - flagged / (blocks + 1) : null'],
  ['the figure is the flagged share, not its complement', R, "? 1 - flagged / blocks :", '? flagged / blocks :'],
  ['the figure counts the dismissed only', R, '? 1 - flagged / blocks : null', '? 1 - joined(dismissals).length / blocks : null'],

  // --- blocks and outcomes joined by blockId ---
  ['a block journaled twice counts twice', R, 'const blocks = blockIds.size;', "const blocks = records.filter((record) => record.kind === 'decision').length;"],
  ['the blocks are the decisions, not the dismissals', R, "const blockIds = idsOf('decision');", "const blockIds = idsOf('dismissal');"],
  ['a dismissal is read as a report', R, "const dismissals = idsOf('dismissal');", "const dismissals = idsOf('false-positive-report');"],
  ['a report is read as a dismissal', R, "const reports = idsOf('false-positive-report');", "const reports = idsOf('dismissal');"],
  ['a record of another kind is taken', R, 'record.kind === kind', 'record.kind !== kind'],
  ['an outcome with no block is counted as joined', R, '.filter((id) => blockIds.has(id));\n  const flagged', '.filter(() => true);\n  const flagged'],
  ['two outcomes of one block count twice', R, 'new Set([...joined(dismissals), ...joined(reports)]).size', 'joined(dismissals).length + joined(reports).length'],
  ['the reports are not flagged', R, 'new Set([...joined(dismissals), ...joined(reports)]).size', 'joined(dismissals).length'],
  ['the dismissals are not flagged', R, 'new Set([...joined(dismissals), ...joined(reports)]).size', 'joined(reports).length'],
  ['the dismissed count is the reports', R, 'dismissed: joined(dismissals).length,', 'dismissed: joined(reports).length,'],
  ['the false-positive count is the dismissals', R, 'falsePositive: joined(reports).length,', 'falsePositive: joined(dismissals).length,'],

  // --- orphans ---
  ['the orphans are the joined outcomes', R, '.filter((id) => !blockIds.has(id)).sort()', '.filter((id) => blockIds.has(id)).sort()'],
  ['the orphans are not sorted', R, '.filter((id) => !blockIds.has(id)).sort()', '.filter((id) => !blockIds.has(id))'],
  ['an orphan report is not listed', R, '[...new Set([...dismissals, ...reports])]', '[...new Set([...dismissals])]'],
  ['an orphan dismissal is not listed', R, '[...new Set([...dismissals, ...reports])]', '[...new Set([...reports])]'],
  ['an orphan named by both kinds is listed twice', R, '[...new Set([...dismissals, ...reports])]', '[...dismissals, ...reports]'],

  // --- what is a v2 record ---
  ['a record without the v2 marker is classified', R, 'record?.v === 2 && ', ''],
  ['any truthy version is v2', R, 'record?.v === 2', 'record?.v'],
  ['a record of an unknown kind is classified', R, 'KINDS.has(record.kind) && ', ''],
  ['a record without a string blockId is classified', R, "typeof record.blockId === 'string' && ", ''],
  ['a record with an empty blockId is classified', R, " && record.blockId !== ''", ''],
  ['a null line is read as a record', R, 'record?.v', 'record.v'],
  ['a torn line aborts the report', R, '} catch {\n    return undefined;', '} catch (error) {\n    throw error;'],

  // --- what is read and counted as unclassified ---
  ['a v2 record of a legacy file is classified', R, 'file === journal ? parse(line) : undefined', 'parse(line)'],
  ['a blank line is unclassified', R, "if (line.trim() === '') continue;", ''],
  ['a whitespace line is unclassified', R, "line.trim() === ''", "line === ''"],
  ['a file that is not jsonl is read', R, " && entry.name.endsWith('.jsonl')", ''],
  ['a directory named like a journal is read', R, 'entry.isFile() && ', ''],
  ['the files are not sorted', R, '.map((entry) => entry.name).sort();', '.map((entry) => entry.name);'],
  ['the unclassified count of a file is reset by each line', R, '(unclassifiedFiles[file] ?? 0) + 1', '1'],
  ['the unclassified count of a file starts at 1', R, '(unclassifiedFiles[file] ?? 0) + 1', '(unclassifiedFiles[file] ?? 1) + 1'],
  ['the unclassified total counts files, not lines', R, '(sum, count) => sum + count, 0)', '(sum) => sum + 1, 0)'],
  ['the unclassified total starts at 1', R, '(sum, count) => sum + count, 0)', '(sum, count) => sum + count, 1)'],
  ['the report total counts guards, not lines', R, 'sum + guard.unclassified, 0)', 'sum + 1, 0)'],
  ['the report total starts at 1', R, 'sum + guard.unclassified, 0)', 'sum + guard.unclassified, 1)'],

  // --- which mechanisms are listed ---
  ['a mechanism with no journal file is listed', R, '.filter(({ read }) => read.records.length + Object.keys(read.unclassifiedFiles).length > 0)', ''],
  ['a mechanism with only legacy lines is not listed', R, 'read.records.length + Object.keys(read.unclassifiedFiles).length > 0', 'read.records.length > 0'],
  ['a mechanism with only v2 records is not listed', R, 'read.records.length + Object.keys(read.unclassifiedFiles).length > 0', 'Object.keys(read.unclassifiedFiles).length > 0'],
  ['an absent root is an error', R, 'if (!existsSync(root)) return [];', ''],
  ['the Claude home is read even when HOOK_STATE_DIR is set', R, 'process.env.HOOK_STATE_DIR ? path.resolve(process.env.HOOK_STATE_DIR) : claudeHome()', 'claudeHome()'],
  ['HOOK_STATE_DIR is read even when it is not set', R, 'process.env.HOOK_STATE_DIR ? path.resolve(process.env.HOOK_STATE_DIR) : claudeHome()', 'path.resolve(process.env.HOOK_STATE_DIR ?? claudeHome())'],
  ['a file in the root is read as a mechanism', R, 'entry.isDirectory() && ', ''],
  ['a name that is not plain is read as a mechanism', R, 'entry.isDirectory() && isPlainName(entry.name)', 'entry.isDirectory()'],
  ['no name is plain', R, '    assertMechanism(name);\n\n    return true;', '    assertMechanism(name);\n\n    return false;'],
  ['a directory without a state directory is read', R, '.filter((name) => existsSync(stateDir(name)))', ''],
  ['the mechanisms are not sorted', R, '.filter((name) => existsSync(stateDir(name)))\n    .sort();', '.filter((name) => existsSync(stateDir(name)));'],

  // --- the table ---
  ['the percent is not a percentage', R, '(guard.precision * 100).toFixed(1)', '(guard.precision).toFixed(1)'],
  ['the percent has no decimal', R, '(guard.precision * 100).toFixed(1)', '(guard.precision * 100).toFixed(0)'],
  ['the minimum shown is not the minimum used', R, 'minimum: MIN_BLOCKS', 'minimum: 5'],
  ['an ok row prints the insufficient message', R, "ok: 'row-ok'", "ok: 'row-insufficient'"],
  ['an insufficient row prints the no-data message', R, "'insufficient-data': 'row-insufficient'", "'insufficient-data': 'row-no-data'"],
  ['a no-data row prints the ok message', R, "'no-data': 'row-no-data'", "'no-data': 'row-ok'"],
  ['the orphan line is printed for every guard', R, 'guard.orphaned.length > 0', 'guard.orphaned.length >= 0'],
  ['the orphan ids are joined without a separator', R, "guard.orphaned.join(', ')", "guard.orphaned.join('')"],
  ['the unclassified total is printed even when 0', R, 'report.unclassifiedTotal > 0', 'report.unclassifiedTotal >= 0'],
  ['the unclassified total is never printed', R, 'report.unclassifiedTotal > 0', 'report.unclassifiedTotal < 0'],
  ['the no-journals line is printed always', R, 'report.guards.length === 0', 'report.guards.length >= 0'],
  ['the no-journals line is never printed', R, 'report.guards.length === 0', 'report.guards.length < 0'],

  // --- the command ---
  ['an unknown argument is accepted', R, "argv.find((argument) => argument !== '--json')", 'undefined'],
  ['--json itself is refused', R, "argument !== '--json'", 'true'],
  ['an unknown argument exits 1', R, "speaker.complain('unknown-option', { option: unknown });\n\n    return 2;", "speaker.complain('unknown-option', { option: unknown });\n\n    return 1;"],
  ['an unknown argument is printed on the output stream', R, "speaker.complain('unknown-option'", "speaker.say('unknown-option'"],
  ['an unknown argument is not named', R, '{ option: unknown }', "{ option: '' }"],
  ['--json is ignored', R, "argv.includes('--json')", 'false'],
  ['the table is never printed', R, "argv.includes('--json')", 'true'],
  ['the JSON is printed as a line of the table', R, 'speaker.data(JSON.stringify(report))', "speaker.say('no-journals')"],
  ['the output goes to the console, not the given sink', R, 'makeSpeaker(MESSAGE_TABLE, sink)', 'makeSpeaker(MESSAGE_TABLE)'],
  ['the command exits 1 on success', R, 'return 0;', 'return 1;'],
  ['the command never runs', R, 'process.exitCode = main(process.argv.slice(2));', 'void process.argv;'],
  ['the command runs when imported', R, 'if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)', 'if (true)'],
  ['the exit code of the command is dropped', R, 'process.exitCode = main(', 'void main(']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['guard-precision', 'hook-state', 'bilingual-output'],
  selftest: 'guard-precision/report.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
