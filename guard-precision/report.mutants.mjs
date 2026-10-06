#!/usr/bin/env node
/**
 * The decisions of `guard-precision/report.mjs` and `guard-precision/blocks.mjs`, each broken once, that
 * `report.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`;
 * `crashKills: 'fail'` makes a mutant that only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `report.mjs` y `blocks.mjs`, rotas una a una, que `report.selftest.mjs` debe
 * detectar. Un mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'guard-precision/report.mjs';
const B = 'guard-precision/blocks.mjs';

const MUTANTS = [
  // --- the threshold and the status ---
  ['9 labelled blocks is enough for a rate', R, 'export const MIN_LABELLED = 10;', 'export const MIN_LABELLED = 9;'],
  ['10 labelled blocks is not enough for a rate', R, 'export const MIN_LABELLED = 10;', 'export const MIN_LABELLED = 11;'],
  ['exactly the minimum reads insufficient', R, 'labelled < MIN_LABELLED', 'labelled <= MIN_LABELLED'],
  ['enough labelled blocks read insufficient', R, "labelled < MIN_LABELLED ? 'insufficient' : 'ok'", "labelled < MIN_LABELLED ? 'ok' : 'insufficient'"],
  ['every guard reads ok', R, "labelled < MIN_LABELLED ? 'insufficient' : 'ok'", "'ok'"],
  ['every guard reads insufficient', R, "labelled < MIN_LABELLED ? 'insufficient' : 'ok'", "'insufficient'"],
  ['the threshold counts blocks, not labelled blocks', R, 'labelled < MIN_LABELLED', 'decisions.size < MIN_LABELLED'],

  // --- the rate ---
  ['a rate is computed even without enough labelled blocks', R, "status === 'ok' ? falseBlocks / labelled : null", 'falseBlocks / labelled'],
  ['no rate is ever computed', R, "status === 'ok' ? falseBlocks / labelled : null", 'null'],
  ['the rate is over every block, so unlabelled blocks count as correct', R, "? falseBlocks / labelled : null", '? falseBlocks / decisions.size : null'],
  ['the rate is the correct share, not the false one', R, "? falseBlocks / labelled : null", '? (labelled - falseBlocks) / labelled : null'],
  ['the rate denominator counts one labelled block too many', R, "? falseBlocks / labelled : null", '? falseBlocks / (labelled + 1) : null'],
  ['the rate is the complement of the old precision', R, "? falseBlocks / labelled : null", '? 1 - falseBlocks / labelled : null'],

  // --- the interval ---
  ['an interval is computed even without enough labelled blocks', R, "status === 'ok' ? wilsonInterval(falseBlocks, labelled) : null", 'wilsonInterval(falseBlocks, labelled)'],
  ['no interval is ever computed', R, "status === 'ok' ? wilsonInterval(falseBlocks, labelled) : null", 'null'],
  ['the interval is over every block', R, 'wilsonInterval(falseBlocks, labelled)', 'wilsonInterval(falseBlocks, decisions.size)'],
  ['the interval is of the correct count', R, 'wilsonInterval(falseBlocks, labelled)', 'wilsonInterval(labelled - falseBlocks, labelled)'],
  ['the interval is for 90%', R, 'const Z_95 = 1.96;', 'const Z_95 = 1.645;'],
  ['an empty population has an interval', R, 'if (total === 0) return null;\n\n  const proportion', 'const proportion'],
  ['the Wilson scale subtracts', R, 'const scale = 1 + Z_95 ** 2 / total;', 'const scale = 1 - Z_95 ** 2 / total;'],
  ['the Wilson scale is not squared', R, 'const scale = 1 + Z_95 ** 2 / total;', 'const scale = 1 + Z_95 / total;'],
  ['the Wilson center subtracts the correction', R, '(proportion + Z_95 ** 2 / (2 * total)) / scale', '(proportion - Z_95 ** 2 / (2 * total)) / scale'],
  ['the Wilson center correction is not halved', R, '(proportion + Z_95 ** 2 / (2 * total)) / scale', '(proportion + Z_95 ** 2 / total) / scale'],
  ['the Wilson center is not scaled', R, '(proportion + Z_95 ** 2 / (2 * total)) / scale', '(proportion + Z_95 ** 2 / (2 * total))'],
  ['the Wilson margin is not scaled', R, 'Z_95 ** 2 / (4 * total ** 2))) / scale', 'Z_95 ** 2 / (4 * total ** 2)))'],
  ['the Wilson margin variance is not divided by the population', R, '(proportion * (1 - proportion)) / total', '(proportion * (1 - proportion))'],
  ['the Wilson margin variance is of the wrong proportion', R, '(proportion * (1 - proportion)) / total', '(proportion * proportion) / total'],
  ['the Wilson margin subtracts the correction', R, '(proportion * (1 - proportion)) / total + Z_95 ** 2', '(proportion * (1 - proportion)) / total - Z_95 ** 2'],
  ['the Wilson margin correction is not quartered', R, 'Z_95 ** 2 / (4 * total ** 2)', 'Z_95 ** 2 / (2 * total ** 2)'],
  ['the Wilson margin correction squares the wrong term', R, 'Z_95 ** 2 / (4 * total ** 2)', 'Z_95 ** 2 / (4 * total) ** 2'],
  ['the Wilson margin has no quantile', R, 'const margin = (Z_95 * Math.sqrt(', 'const margin = (Math.sqrt('],
  ['the interval low end is not clamped at 0', R, 'Math.max(0, center - margin)', 'center - margin'],
  ['the interval high end is not clamped at 1', R, 'Math.min(1, center + margin)', 'center + margin'],
  ['the interval ends are swapped', R, 'low: Math.max(0, center - margin), high: Math.min(1, center + margin)', 'low: Math.min(1, center + margin), high: Math.max(0, center - margin)'],

  // --- the counts ---
  ['the labelled count is every block', R, 'const labelled = labels.size;', 'const labelled = decisions.size;'],
  ['the false count is the correct labels', R, 'label === FALSE_LABEL', 'label !== FALSE_LABEL'],
  ['the correct count is the blocks without a false label', R, 'correctBlocks: labelled - falseBlocks,', 'correctBlocks: decisions.size - falseBlocks,'],
  ['the correct count is the false count', R, 'correctBlocks: labelled - falseBlocks,', 'correctBlocks: falseBlocks,'],
  ['the blocks are the labelled ones', R, 'blocks: decisions.size,', 'blocks: labels.size,'],
  ['the blocks are every record', R, 'blocks: decisions.size,', 'blocks: records.length,'],
  ['the orphans are dropped from the figures', R, 'orphaned,\n    unclassified:', 'orphaned: [],\n    unclassified:'],

  // --- blocks and labels joined by blockId ---
  ['a record of any kind is a block', B, "record.kind === 'decision' && !decisions.has(record.blockId)", '!decisions.has(record.blockId)'],
  ['a dismissal is a block, not a decision', B, "record.kind === 'decision' && !decisions.has(record.blockId)", "record.kind === 'dismissal' && !decisions.has(record.blockId)"],
  ['the last decision of a block is its evidence', B, "record.kind === 'decision' && !decisions.has(record.blockId)", "record.kind === 'decision'"],
  ['a dismissal labels its block correct', B, 'dismissal: FALSE_LABEL,', 'dismissal: CORRECT_LABEL,'],
  ['a false-positive report labels its block correct', B, "'false-positive-report': FALSE_LABEL,", "'false-positive-report': CORRECT_LABEL,"],
  ['a true-positive report labels its block false', B, "'true-positive-report': CORRECT_LABEL", "'true-positive-report': FALSE_LABEL"],
  ['a dismissal labels nothing', B, 'dismissal: FALSE_LABEL, ', ''],
  ['a false-positive report labels nothing', B, "'false-positive-report': FALSE_LABEL, ", ''],
  ['a true-positive report labels nothing', B, ", 'true-positive-report': CORRECT_LABEL", ''],
  ['a decision is a label', B, 'if (label === undefined) continue;', ''],
  ['the FIRST label of a block decides', B, 'if (decisions.has(record.blockId)) labels.set(record.blockId, label);', 'if (decisions.has(record.blockId) && !labels.has(record.blockId)) labels.set(record.blockId, label);'],
  ['any false label wins', B, 'if (decisions.has(record.blockId)) labels.set(record.blockId, label);', 'if (decisions.has(record.blockId)) labels.set(record.blockId, labels.get(record.blockId) === FALSE_LABEL ? FALSE_LABEL : label);'],
  ['any correct label wins', B, 'if (decisions.has(record.blockId)) labels.set(record.blockId, label);', 'if (decisions.has(record.blockId)) labels.set(record.blockId, labels.get(record.blockId) === CORRECT_LABEL ? CORRECT_LABEL : label);'],
  ['an orphan label is counted as joined', B, 'if (decisions.has(record.blockId)) labels.set(record.blockId, label);\n    else orphans.add(record.blockId);', 'labels.set(record.blockId, label);\n    orphans.add(record.blockId);'],
  ['a joined label is also listed as an orphan', B, 'if (decisions.has(record.blockId)) labels.set(record.blockId, label);\n    else orphans.add(record.blockId);', 'if (decisions.has(record.blockId)) labels.set(record.blockId, label);\n    orphans.add(record.blockId);'],
  ['an orphan label is not listed', B, 'else orphans.add(record.blockId);', ';'],
  ['the orphans are not sorted', B, '[...orphans].sort()', '[...orphans]'],
  ['an orphan named by several labels is listed several times', B, '[...orphans].sort()', '[...orphans, ...orphans].sort()'],

  // --- what is a v2 record ---
  ['a record without the v2 marker is classified', B, 'record?.v === 2 && ', ''],
  ['any truthy version is v2', B, 'record?.v === 2', 'record?.v'],
  ['a record of an unknown kind is classified', B, 'KINDS.has(record.kind) && ', ''],
  ['a record without a string blockId is classified', B, "typeof record.blockId === 'string' && ", ''],
  ['a record with an empty blockId is classified', B, " && record.blockId !== ''", ''],
  ['a null line is read as a record', B, 'record?.v', 'record.v'],
  ['a torn line aborts the report', B, '} catch {\n    return undefined;', '} catch (error) {\n    throw error;'],

  // --- what is read and counted as unclassified ---
  ['a v2 record of a legacy file is classified', B, 'file === journal ? parse(line) : undefined', 'parse(line)'],
  ['a blank line is unclassified', B, "if (line.trim() === '') continue;", ''],
  ['a whitespace line is unclassified', B, "line.trim() === ''", "line === ''"],
  ['a file that is not jsonl is read', B, " && entry.name.endsWith('.jsonl')", ''],
  ['a directory named like a journal is read', B, 'entry.isFile() && ', ''],
  ['the files are not sorted', B, '.map((entry) => entry.name).sort();', '.map((entry) => entry.name);'],
  ['the unclassified count of a file is reset by each line', B, '(unclassifiedFiles[file] ?? 0) + 1', '1'],
  ['the unclassified count of a file starts at 1', B, '(unclassifiedFiles[file] ?? 0) + 1', '(unclassifiedFiles[file] ?? 1) + 1'],
  ['the unclassified total counts files, not lines', R, '(sum, count) => sum + count, 0)', '(sum) => sum + 1, 0)'],
  ['the unclassified total starts at 1', R, '(sum, count) => sum + count, 0)', '(sum, count) => sum + count, 1)'],
  ['the report total counts guards, not lines', R, 'sum + guard.unclassified, 0)', 'sum + 1, 0)'],
  ['the report total starts at 1', R, 'sum + guard.unclassified, 0)', 'sum + guard.unclassified, 1)'],

  // --- which mechanisms are listed ---
  ['a mechanism with no journal file is listed', R, '.filter(({ read }) => read.records.length + Object.keys(read.unclassifiedFiles).length > 0)', ''],
  ['a mechanism with only legacy lines is not listed', R, 'read.records.length + Object.keys(read.unclassifiedFiles).length > 0', 'read.records.length > 0'],
  ['a mechanism with only v2 records is not listed', R, 'read.records.length + Object.keys(read.unclassifiedFiles).length > 0', 'Object.keys(read.unclassifiedFiles).length > 0'],
  ['an absent root is an error', B, 'if (!existsSync(root)) return [];', ''],
  ['the Claude home is read even when HOOK_STATE_DIR is set', B, 'process.env.HOOK_STATE_DIR ? path.resolve(process.env.HOOK_STATE_DIR) : claudeHome()', 'claudeHome()'],
  ['HOOK_STATE_DIR is read even when it is not set', B, 'process.env.HOOK_STATE_DIR ? path.resolve(process.env.HOOK_STATE_DIR) : claudeHome()', 'path.resolve(process.env.HOOK_STATE_DIR ?? claudeHome())'],
  ['a file in the root is read as a mechanism', B, 'entry.isDirectory() && ', ''],
  ['a name that is not plain is read as a mechanism', B, 'entry.isDirectory() && isPlainName(entry.name)', 'entry.isDirectory()'],
  ['no name is plain', B, '    assertMechanism(name);\n\n    return true;', '    assertMechanism(name);\n\n    return false;'],
  ['a directory without a state directory is read', B, '.filter((name) => existsSync(stateDir(name)))', ''],
  ['the mechanisms are not sorted', B, '.filter((name) => existsSync(stateDir(name)))\n    .sort();', '.filter((name) => existsSync(stateDir(name)));'],

  // --- the table ---
  ['the percent is not a percentage', R, '(fraction * 100).toFixed(1)', '(fraction).toFixed(1)'],
  ['the percent has no decimal', R, '(fraction * 100).toFixed(1)', '(fraction * 100).toFixed(0)'],
  ['the percent is the low end of the interval', R, 'percent: percentOf(guard.falseBlockRate)', 'percent: percentOf(guard.interval.low)'],
  ['the low end printed is the high end', R, 'low: percentOf(guard.interval.low)', 'low: percentOf(guard.interval.high)'],
  ['the high end printed is the low end', R, 'high: percentOf(guard.interval.high)', 'high: percentOf(guard.interval.low)'],
  ['an insufficient row prints a figure', R, "guard.status === 'ok' ? {", 'true ? {'],
  ['an ok row prints no figure', R, "guard.status === 'ok' ? {", 'false ? {'],
  ['the minimum shown is not the minimum used', R, 'minimum: MIN_LABELLED', 'minimum: 5'],
  ['an ok row prints the insufficient message', R, "ok: 'row-ok'", "ok: 'row-insufficient'"],
  ['an insufficient row prints the ok message', R, "insufficient: 'row-insufficient'", "insufficient: 'row-ok'"],
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
