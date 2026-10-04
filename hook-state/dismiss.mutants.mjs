#!/usr/bin/env node
/**
 * The decisions of `hook-state/dismiss.mjs`, each broken once, that `dismiss.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `dismiss.mjs`, rotas una a una, que `dismiss.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const D = 'hook-state/dismiss.mjs';

const MUTANTS = [
  // --- what lifts a block ---
  ['a false-positive report lifts the block', D, "record.kind === 'dismissal' && record.blockId", "record.kind !== 'decision' && record.blockId"],
  ['a decision lifts the block', D, "record.kind === 'dismissal' && record.blockId", "record.kind !== 'false-positive-report' && record.blockId"],
  ['a dismissal of any block lifts every block', D, '&& record.blockId === blockId)', ')'],
  ['the journal of another mechanism is read', D, 'readRecords(mechanism).some', "readRecords('guard-a').some"],

  // --- reading the journal as it really is ---
  ['an absent journal is an error', D, "if (error.code === 'ENOENT') return [];\n\n    throw error;", 'throw error;'],
  ['any unreadable journal is read as empty', D, "if (error.code === 'ENOENT') return [];", 'return [];'],
  ['a torn line aborts the read', D, '} catch {\n      return [];', '} catch (error) {\n      throw error;'],
  ['a line that is not an object is kept', D, "typeof parsed === 'object' && parsed !== null ? [parsed] : []", '[parsed]'],
  ['null is read as an object', D, "typeof parsed === 'object' && parsed !== null ?", "typeof parsed === 'object' ?"],

  // --- what is recorded ---
  ['a false-positive report is recorded as a dismissal', D, "kind: falsePositive ? 'false-positive-report' : 'dismissal'", "kind: 'dismissal'"],
  ['a dismissal is recorded as a false-positive report', D, "kind: falsePositive ? 'false-positive-report' : 'dismissal'", "kind: 'false-positive-report'"],
  ['the digest is of the reason, not of the block', D, 'digestInput(blockId)', 'digestInput(reason)'],
  ['the record carries no reason', D, 'inputDigest: digestInput(blockId), reason }', 'inputDigest: digestInput(blockId) }'],
  ['the record ignores the given clock', D, 'reason }, { now });', 'reason });'],
  ['the command ignores the given clock', D, 'recordOutcome(mechanism, outcome, { now });', 'recordOutcome(mechanism, outcome);'],

  // --- a dismissal is recorded once ---
  ['a second dismissal is recorded', D, "if (!falsePositive && isLifted(mechanism, blockId)) throw new Refusal(bilingual('already-dismissed', { blockId, mechanism }));", ''],
  ['a report is refused when its block is already dismissed', D, 'if (!falsePositive && isLifted(', 'if (isLifted('],
  ['a dismissal is refused when any record of its block exists', D, 'if (!falsePositive && isLifted(mechanism, blockId))', 'if (readRecords(mechanism).some((record) => record.blockId === blockId))'],
  ['the duplicate check looks in another mechanism', D, '&& isLifted(mechanism, blockId))', "&& isLifted('guard-zz', blockId))"],
  ['the duplicate refusal is not a refusal', D, "throw new Refusal(bilingual('already-dismissed'", "throw new Error(bilingual('already-dismissed'"],

  // --- the options ---
  ['the false-positive flag is ignored', D, 'falsePositive = true;', 'falsePositive = false;'],
  ['an unknown token is accepted', D, "throw new Refusal(bilingual('unknown-option', { option: argv[index] }));", 'continue;'],
  ['an unknown token is not named', D, "{ option: argv[index] }", "{ option: '' }"],
  ['the value of an option is not skipped', D, 'index += values[argv[index]] === undefined ? 0 : 1;', 'index += 0;'],
  ['an option followed by another option takes it as its value', D, "|| argv[index + 1].startsWith('--') ? undefined", ' ? undefined'],
  ['an option at the end reads past the arguments', D, 'argv[index + 1] === undefined ||', ''],
  ['an empty value counts as given', D, "(values[option] ?? '').trim() === ''", 'values[option] === undefined'],
  ['a blank value counts as given', D, "(values[option] ?? '').trim() === ''", "(values[option] ?? '') === ''"],
  ['an absent option counts as given', D, "(values[option] ?? '').trim() === ''", "(values[option] ?? 'x').trim() === ''"],
  ['the required options are checked in another order', D, "const VALUE_OPTIONS = ['--mechanism', '--block', '--reason'];", "const VALUE_OPTIONS = ['--reason', '--block', '--mechanism'];"],
  ['the mechanism name is not checked', D, "assertMechanism(values['--mechanism']);", ''],
  ['a bad mechanism name is not a refusal', D, 'throw new Refusal(error.message);', 'throw error;'],

  // --- the exit code and the streams ---
  ['a refusal exits 1', D, 'speaker.dataError(error.message);\n\n      return 2;', 'speaker.dataError(error.message);\n\n      return 1;'],
  ['a refusal prints on the output stream', D, 'speaker.dataError(error.message);', 'speaker.data(error.message);'],
  ['a refusal prints nothing', D, 'speaker.dataError(error.message);', ''],
  ['no failure is a refusal', D, 'error instanceof Refusal', 'false'],
  ['every failure is a refusal', D, 'error instanceof Refusal', 'true'],
  ['a write failure exits 2', D, "speaker.complain('write-failed', { detail: error.message });\n\n    return 1;", "speaker.complain('write-failed', { detail: error.message });\n\n    return 2;"],
  ['a write failure prints nothing', D, "speaker.complain('write-failed', { detail: error.message });", ''],
  ['a write failure prints on the output stream', D, "speaker.complain('write-failed'", "speaker.say('write-failed'"],
  ['a success exits 1', D, 'return 0;', 'return 1;'],
  ['a success prints nothing', D, "speaker.say(outcome.falsePositive ? 'false-positive-recorded' : 'dismissed', { blockId: outcome.blockId, mechanism });", ''],
  ['a report prints the dismissal message', D, "outcome.falsePositive ? 'false-positive-recorded' : 'dismissed'", "'dismissed'"],
  ['a dismissal prints the report message', D, "outcome.falsePositive ? 'false-positive-recorded' : 'dismissed'", "'false-positive-recorded'"],
  ['the success message names another block', D, '{ blockId: outcome.blockId, mechanism }', "{ blockId: 'B', mechanism }"],
  ['the output goes to the console, not the given sink', D, 'makeSpeaker(MESSAGE_TABLE, sink)', 'makeSpeaker(MESSAGE_TABLE)'],

  // --- running as a command ---
  ['the command never runs', D, 'process.exitCode = main(process.argv.slice(2));', 'void process.argv;'],
  ['the command runs when imported', D, 'if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)', 'if (true)'],
  ['the exit code of the command is dropped', D, 'process.exitCode = main(', 'void main(']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/dismiss.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
