#!/usr/bin/env node
/**
 * The decisions of `condense`, each broken once, that `condense.selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`. This is the campaign that proves a LOSSY condense goes
 * red: a mutant that lets a line shrink without its text proved safe, that writes without the lock, without
 * a pre-image or without reading the write back would let the ledger lose lessons in silence.
 *
 * @es Las decisiones de `condense`, rotas una a una, que `condense.selftest.mjs` debe atrapar. Es la campaña
 * que prueba que un condense CON PÉRDIDA da rojo: un mutante que deje encoger una línea sin probar su texto a
 * salvo, que escriba sin el lock, sin imagen previa o sin releer lo escrito dejaría al ledger perder
 * lecciones en silencio.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const RUN = 'failure-capture/condense.mjs';
const WRITE = 'failure-capture/verified-write.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  // --- proof before change: archive, re-read, prove, and a failing line stays
  ['the original is never archived, so nothing can prove it', RUN, "const archived = io.appendEvidence({ ledgerFile: file, key: item.key, line: item.original, date, kind: 'condensed' });", 'const archived = { ok: true };'],
  ['only part of the original is archived', RUN, 'line: item.original, date, kind', 'line: item.original.slice(0, 50), date, kind'],
  ['the proof is skipped, so a line that failed it is shortened', RUN, 'const done = proofs.filter(({ proof }) => proof.ok)', 'const done = proofs.filter(() => true)'],
  ['a line that failed the proof is not reported', RUN, 'left: [...left, ...failed].sort(', 'left: [...left].sort('],
  ['the proof reads the evidence before it is archived', RUN, 'evidence: io.readEvidence(file, item.key) })', 'evidence: undefined })'],
  ['the reason of a failed line loses its Spanish half', RUN, 'reason: joinBilingual(proof.deficits) }', "reason: joinBilingual(proof.deficits).split(' @es ')[0] }"],

  // --- the write: once, read back, restored on any difference
  ['the write is not read back', WRITE, 'if (onDisk === next) return true;', 'return true;'],
  ['a write that differs is not restored', WRITE, "  writeFileSync(file, text, 'utf8');\n\n  return false;", '  return false;'],
  ['a write that fails is not treated as a difference', WRITE, '  } catch {\n    onDisk = undefined;', '  } catch (error) {\n    throw error;'],
  ['a restored run is reported as clean', RUN, 'ledgers.some((one) => one.left.length > 0 || one.restored)', 'ledgers.some((one) => one.left.length > 0)'],
  ['a key-map problem alone does not fail the run', RUN, 'problems.length > 0 || ledgers.some(', 'ledgers.some('],
  ['a line left unchanged does not fail the run', RUN, 'one.left.length > 0 || one.restored', 'one.restored'],
  ['a ledger with nothing proved is still written', RUN, 'const written = done.length === 0 || writeVerified(', 'const written = writeVerified('],
  ['the ledger is written before its lines are proved', RUN, 'const next = replaced(ledger.lines, done).join', 'const next = replaced(ledger.lines, eligible).join'],

  // --- safety: lock, pre-image, dry run
  ['the lock is not taken', RUN, 'const locked = withLock(lockFile, run);', 'const locked = { held: true, value: run() };'],
  ['the ledger is read before the lock is held', RUN, 'const run = () => {\n    const { plans, problems } = planLedgers({ ledgers: load(), keyMap });', 'const early = load();\n  const run = () => {\n    const { plans, problems } = planLedgers({ ledgers: early, keyMap });'],
  ['a held lock is reported as a clean run', RUN, '{ status: 2, held: true,', '{ status: 0, held: true,'],
  ['a held lock refusal loses its Spanish half', RUN, '; nothing was changed. @es condense RECHAZADO', '; nothing was changed. condense RECHAZADO'],
  ['a dry run takes the lock and writes', RUN, 'if (!write) return run();', 'if (false) return run();'],
  ['a dry run archives evidence', RUN, 'if (!write || eligible.length === 0)', 'if (eligible.length === 0)'],
  ['the pre-image is not stored', RUN, 'storePreImage({ dir: preImageDir, scope: ledger.scope, text, items });', 'void preImageDir;'],
  ['the pre-image holds the ledger after the write, not before', RUN, 'writeFileSync(path.join(dir, `${scope}.ledger`), text,', 'writeFileSync(path.join(dir, `${scope}.ledger`), text.slice(1),'],
  ['the run id carries no time', RUN, "`${new Date().toISOString().replaceAll(':', '-')}-${String(process.pid)}`", "`run-${String(process.pid)}`"],

  // --- the report
  ['the sizes before are not reported', RUN, 'before: text.length }', 'before: 0 }'],
  ['the sizes after ignore what was written', RUN, 'after: written ? next.length : text.length', 'after: text.length'],
  ['the key-map skeleton is not printed', RUN, '...(needKey.length === 0 ? [] :', '...(true ? [] :'],
  ['the key-map skeleton cuts the prefix short', RUN, 'item.original.slice(0, 40)', 'item.original.slice(0, 10)'],
  ['a dry run is worded as a write', RUN, "['would be shortened', 'se acortarían']", "['shortened', 'acortadas']"],

  // --- the command
  ['a dry run is written for real', COMMAND, 'write: args.write === true })', 'write: true })'],
  ['the ledger is read before the lock by the command', COMMAND, 'runCondense({ load: () => loadLedgers().filter((ledger) => scope === undefined || ledger.scope === scope),', 'runCondense({ load: ((early) => () => early)(loadLedgers().filter((ledger) => scope === undefined || ledger.scope === scope)),'],
  ['an unreadable keys file is not refused', COMMAND, "speaker.complain('condense.keysInvalid', { detail: error instanceof Error ? error.message : String(error) });", 'speaker.data(String(error));'],
  ['a refused keys file does not stop the run', COMMAND, '\n\n      return 1;\n    }\n  }\n\n  const outcome', '\n    }\n  }\n\n  const outcome'],
  ['a keys file without a keys array is accepted', COMMAND, "if (!Array.isArray(keyMap)) throw", 'if (false) throw'],
  ['the status of the run is not the exit status', COMMAND, 'for (const line of describeOutcome(outcome)) speaker.data(line);\n\n  return outcome.status;', 'for (const line of describeOutcome(outcome)) speaker.data(line);\n\n  return 0;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/condense.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
