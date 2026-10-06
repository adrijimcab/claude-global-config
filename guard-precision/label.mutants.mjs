#!/usr/bin/env node
/**
 * The decisions of `guard-precision/label.mjs`, each broken once, that `label.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `label.mjs`, rotas una a una, que `label.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'guard-precision/label.mjs';

const MUTANTS = [
  // --- the defaults ---
  ['the default sample is smaller than the minimum of labelled blocks', L, 'export const DEFAULT_SAMPLE = MIN_LABELLED;', 'export const DEFAULT_SAMPLE = 5;'],
  ['the default seed is another text', L, "export const DEFAULT_SEED = '1';", "export const DEFAULT_SEED = '2';"],
  ['the default seed is a number', L, "export const DEFAULT_SEED = '1';", 'export const DEFAULT_SEED = 1;'],
  ['the digest shown is shorter', L, 'const DIGEST_WIDTH = 12;', 'const DIGEST_WIDTH = 8;'],
  ['the digest shown is longer', L, 'const DIGEST_WIDTH = 12;', 'const DIGEST_WIDTH = 16;'],

  // --- the draw ---
  ['the draw ignores the seed', L, '[seed, mechanism, blockId]', '[mechanism, blockId]'],
  ['the draw ignores the guard', L, '[seed, mechanism, blockId]', '[seed, blockId]'],
  ['the draw ignores the block id', L, '[seed, mechanism, blockId]', '[seed, mechanism]'],
  ['the draw is another hash', L, "createHash('sha256')", "createHash('sha1')"],
  ['the draw keeps the highest ranks', L, 'rank(left) < rank(right) ? -1 : 1', 'rank(left) < rank(right) ? 1 : -1'],
  ['the draw is one id too long', L, '.slice(0, size)', '.slice(0, size + 1)'],
  ['the draw skips the first ids instead of keeping them', L, '.slice(0, size)', '.slice(size)'],
  ['the draw is not sorted by id', L, '.slice(0, size)\n    .sort();', '.slice(0, size);'],
  ['the draw sorts the population it was given', L, '[...blockIds]', 'blockIds'],

  // --- the command line ---
  ['an unknown token is accepted as an option', L, '!VALUE_OPTIONS.includes(option)', 'false'],
  ['--seed is not an option', L, "'--sample', '--seed'];\nconst LABEL", "'--sample'];\nconst LABEL"],
  ['an option may be given twice', L, 'values[option] !== undefined) throw new Refusal(bilingual(\'duplicate-option\'', 'false) throw new Refusal(bilingual(\'duplicate-option\''],
  ['a blank value is accepted', L, "(value ?? '').trim() === ''", 'value === undefined'],
  ['a missing value is accepted', L, "(value ?? '').trim() === ''", 'false'],
  ['the value of an option is read as an option', L, 'values[option] = value;\n    index += 1;', 'values[option] = value;'],
  ['two labels are accepted', L, 'if (otherLabelOption !== undefined) throw', 'if (false) throw'],
  ['two labels are named in the wrong order', L, "{ first: labelOption, second: otherLabelOption }", "{ first: otherLabelOption, second: labelOption }"],
  ['a label without --mechanism is accepted', L, "labelOption !== undefined && values['--mechanism'] === undefined", 'false'],
  ['a sample without --mechanism is refused', L, "labelOption !== undefined && values['--mechanism'] === undefined", "values['--mechanism'] === undefined"],
  ['a mechanism name that is not plain is accepted', L, "if (values['--mechanism'] !== undefined) {\n    try {", "if (false) {\n    try {"],
  ['a sample of 0 is accepted', L, '/^[1-9]\\d*$/', '/^\\d+$/'],
  ['a sample that is not a whole number is accepted', L, '/^[1-9]\\d*$/', '/^[1-9]\\d*/'],
  ['a sample too big to count is accepted', L, ' && Number.isSafeInteger(Number(values[\'--sample\']))', ''],
  ['a bad sample is accepted', L, "values['--sample'] !== undefined && !(", 'false && !('],
  ['a bad sample is named by another value', L, "bilingual('bad-sample', { value: values['--sample'] })", "bilingual('bad-sample', { value: '' })"],
  ['the default sample is ignored', L, "size: values['--sample'] === undefined ? DEFAULT_SAMPLE : Number(values['--sample'])", 'size: Number(values[\'--sample\'])'],
  ['the default seed is ignored', L, "seed: values['--seed'] ?? DEFAULT_SEED", "seed: values['--seed']"],
  ['--correct records a false label', L, "{ '--correct': CORRECT_LABEL, '--false': FALSE_LABEL }", "{ '--correct': FALSE_LABEL, '--false': CORRECT_LABEL }"],
  ['a correct label is recorded as a false-positive report', L, "{ [CORRECT_LABEL]: 'true-positive-report', [FALSE_LABEL]: 'false-positive-report' }", "{ [CORRECT_LABEL]: 'false-positive-report', [FALSE_LABEL]: 'false-positive-report' }"],
  ['a false label is recorded as a dismissal, which lifts the block', L, "[FALSE_LABEL]: 'false-positive-report'", "[FALSE_LABEL]: 'dismissal'"],
  ['a false label is recorded as a true-positive report', L, "[FALSE_LABEL]: 'false-positive-report'", "[FALSE_LABEL]: 'true-positive-report'"],
  ['the block id is always the --correct one', L, 'blockId: values[labelOption],', "blockId: values['--correct'],"],

  // --- the sample ---
  ['a block somebody self-reported is drawn', L, "labels.get(blockId)?.sampled ?? true", 'true'],
  ['a block labelled by a sample leaves the draw', L, "labels.get(blockId)?.sampled ?? true", '!labels.has(blockId)'],
  ['only blocks labelled by a sample are drawn', L, "labels.get(blockId)?.sampled ?? true", 'labels.has(blockId)'],
  ['no block is drawn', L, "labels.get(blockId)?.sampled ?? true", 'false'],
  ['an unlabelled block is not drawn', L, "labels.get(blockId)?.sampled ?? true", "labels.get(blockId)?.sampled ?? false"],
  ['a block still to label is not listed', L, 'drawn.filter((blockId) => !labels.has(blockId))', 'drawn.filter(() => false)'],
  ['a labelled block is listed again', L, 'drawn.filter((blockId) => !labels.has(blockId))', 'drawn'],
  ['only labelled blocks are listed', L, 'drawn.filter((blockId) => !labels.has(blockId))', 'drawn.filter((blockId) => labels.has(blockId))'],
  ['the header counts the blocks still to label as the draw', L, 'shown: pending.length,', 'shown: drawn.length,'],
  ['the header counts the draw as the blocks still to label', L, 'drawn: drawn.length,', 'drawn: pending.length,'],
  ['the header counts every label as by sample', L, "const labelled = [...labels.values()].filter((entry) => entry.sampled).length;", 'const labelled = labels.size;'],
  ['the header counts no label', L, 'labelled, blocks: decisions.size', 'labelled: 0, blocks: decisions.size'],
  ['the header counts the draw as the blocks', L, 'blocks: decisions.size });', 'blocks: drawn.length });'],
  ['the draw of a guard does not use the guard name', L, 'const drawn = drawSample(populationOf(blocks), { seed, mechanism, size });', "const drawn = drawSample(populationOf(blocks), { seed, mechanism: 'guard', size });"],
  ['the draw ignores the seed asked', L, 'const drawn = drawSample(populationOf(blocks), { seed, mechanism, size });', 'const drawn = drawSample(populationOf(blocks), { seed: DEFAULT_SEED, mechanism, size });'],
  ['the draw ignores the size asked', L, 'const drawn = drawSample(populationOf(blocks), { seed, mechanism, size });', 'const drawn = drawSample(populationOf(blocks), { seed, mechanism, size: DEFAULT_SAMPLE });'],
  ['the time of a block is its tool use', L, 'ts: shown(ts)', 'ts: shown(toolUseId)'],
  ['the event of a block is its tool use', L, 'event: shown(event)', 'event: shown(toolUseId)'],
  ['the event of a block is never shown', L, 'event: shown(event)', "event: '-'"],
  ['the tool use of a block is its time', L, 'toolUseId: shown(toolUseId)', 'toolUseId: shown(ts)'],
  ['the digest of a block is cut from nothing', L, 'inputDigest?.slice(0, DIGEST_WIDTH)', 'inputDigest'],
  ['the reason of a block is its tool use', L, 'reason: shown(reason)', 'reason: shown(toolUseId)'],
  ['a missing value is printed as nothing', L, "const shown = (value) => value ?? '-';", 'const shown = (value) => value;'],
  ['a missing value is printed as null', L, "const shown = (value) => value ?? '-';", 'const shown = (value) => String(value);'],

  // --- the command ---
  ['the usage is printed when there is nothing to label', L, "if (withBlocks.length === 0) speaker.say('no-blocks');\n    else speaker.say('sample-usage'", "if (withBlocks.length !== 0) speaker.say('no-blocks');\n    else speaker.say('sample-usage'"],
  ['the usage is printed always', L, "if (withBlocks.length === 0) speaker.say('no-blocks');\n    else speaker.say('sample-usage', { seed: options.seed, size: options.size });", "speaker.say('sample-usage', { seed: options.seed, size: options.size });"],
  ['the no-blocks line is printed always', L, "if (withBlocks.length === 0) speaker.say('no-blocks');\n    else speaker.say('sample-usage'", "speaker.say('no-blocks');\n    if (true) speaker.say('sample-usage'"],
  ['the usage names the default seed', L, '{ seed: options.seed, size: options.size }', '{ seed: DEFAULT_SEED, size: options.size }'],
  ['the usage names the default size', L, '{ seed: options.seed, size: options.size }', '{ seed: options.seed, size: DEFAULT_SAMPLE }'],
  ['a guard with blocks and no labelled ones is not listed', L, 'blocks.decisions.size > 0', 'blocks.labels.size > 0'],
  ['a label option never labels', L, 'if (options.label !== undefined) {', 'if (false) {'],
  ['every command labels', L, 'if (options.label !== undefined) {', 'if (true) {'],
  ['a correct label prints the false message', L, "options.label === CORRECT_LABEL ? 'labelled-correct' : 'labelled-false'", "options.label === CORRECT_LABEL ? 'labelled-false' : 'labelled-correct'"],
  ['a label exits 1', L, "mechanism: options.mechanism });\n\n      return 0;", "mechanism: options.mechanism });\n\n      return 1;"],
  ['a sample exits 1', L, "size: options.size });\n\n    return 0;", "size: options.size });\n\n    return 1;"],
  ['a guard with no journal is sampled', L, 'options.mechanism !== undefined && !names.includes(options.mechanism)', 'false'],
  ['a guard with a journal is refused', L, 'options.mechanism !== undefined && !names.includes(options.mechanism)', 'options.mechanism !== undefined && names.includes(options.mechanism)'],
  ['--mechanism does not limit the sample', L, 'options.mechanism === undefined ? names : [options.mechanism]', 'names'],
  ['a guard with no blocks is listed', L, '.filter(({ blocks }) => blocks.decisions.size > 0)', ''],
  ['every failure is a refusal', L, 'if (error instanceof Refusal) {', 'if (true) {'],
  ['no failure is a refusal', L, 'if (error instanceof Refusal) {', 'if (false) {'],
  ['a refusal is printed on the output stream', L, 'speaker.dataError(error.message);', 'speaker.data(error.message);'],
  ['a refusal exits 1', L, 'speaker.dataError(error.message);\n\n      return 2;', 'speaker.dataError(error.message);\n\n      return 1;'],
  ['a failure is printed on the output stream', L, "speaker.complain('command-failed'", "speaker.say('command-failed'"],
  ['a failure exits 2', L, "speaker.complain('command-failed', { detail: error.message });\n\n    return 1;", "speaker.complain('command-failed', { detail: error.message });\n\n    return 2;"],
  ['the output goes to the console, not the given sink', L, 'makeSpeaker(MESSAGE_TABLE, sink)', 'makeSpeaker(MESSAGE_TABLE)'],
  ['the command never runs', L, 'process.exitCode = main(process.argv.slice(2));', 'void process.argv;'],
  ['the command runs when imported', L, 'if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)', 'if (true)'],
  ['the exit code of the command is dropped', L, 'process.exitCode = main(', 'void main('],

  // --- the label ---
  ['a guard with no journal is labelled', L, '!mechanismNames(readdirSync).includes(mechanism)', 'false'],
  ['a guard with a journal is refused a label', L, '!mechanismNames(readdirSync).includes(mechanism)', 'mechanismNames(readdirSync).includes(mechanism)'],
  ['an unknown block is labelled', L, '!blocks.decisions.has(blockId)', 'false'],
  ['a known block is refused a label', L, '!blocks.decisions.has(blockId)', 'blocks.decisions.has(blockId)'],
  ['a block the draw does not contain is labelled', L, '!drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)', 'false'],
  ['a block the draw contains is refused', L, '!drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)', 'drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)'],
  ['a label is checked against the draw of the default seed', L, '!drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)', '!drawSample(populationOf(blocks), { seed: DEFAULT_SEED, mechanism, size }).includes(blockId)'],
  ['a label is checked against the draw of the default size', L, '!drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)', '!drawSample(populationOf(blocks), { seed, mechanism, size: DEFAULT_SAMPLE }).includes(blockId)'],
  ['a label is checked against the draw of another guard', L, '!drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)', "!drawSample(populationOf(blocks), { seed, mechanism: 'guard', size }).includes(blockId)"],
  ['a block labelled the same way is labelled again', L, 'blocks.labels.get(blockId)?.label === label', 'false'],
  ['a labelled block cannot change its label', L, 'blocks.labels.get(blockId)?.label === label', 'blocks.labels.has(blockId)'],
  ['a label is not recorded as sampled', L, 'inputDigest: digestInput(blockId), sampled: true, seed }', 'inputDigest: digestInput(blockId), seed }'],
  ['a label is recorded as not sampled', L, 'inputDigest: digestInput(blockId), sampled: true, seed }', 'inputDigest: digestInput(blockId), sampled: false, seed }'],
  ['a label does not record its seed', L, 'inputDigest: digestInput(blockId), sampled: true, seed }', 'inputDigest: digestInput(blockId), sampled: true }'],
  ['a label ignores the given clock', L, 'sampled: true, seed }, { now });', 'sampled: true, seed });'],
  ['the digest of a label is of the guard', L, 'inputDigest: digestInput(blockId), sampled', 'inputDigest: digestInput(mechanism), sampled'],
  ['a label is recorded for another block', L, 'appendRecord(mechanism, { kind: KIND_OF_LABEL[label], blockId,', "appendRecord(mechanism, { kind: KIND_OF_LABEL[label], blockId: 'B01',"],
  ['a label is recorded without its seed being read from the options', L, 'recordLabel(options.mechanism, options, { now });', 'recordLabel(options.mechanism, { ...options, seed: DEFAULT_SEED }, { now });'],
  ['a label ignores the clock of the command', L, 'recordLabel(options.mechanism, options, { now });', 'recordLabel(options.mechanism, options, {});'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['guard-precision', 'hook-state', 'bilingual-output'],
  selftest: 'guard-precision/label.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
