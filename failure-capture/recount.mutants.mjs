#!/usr/bin/env node
/**
 * The decisions of `recount`, each broken once, that `recount.selftest.mjs` must catch: a recount that raises a
 * counter, amends the wrong line, loses the old line, writes a ledger it never proved or read back, writes during a
 * dry run, or runs without the lock.
 *
 * @es Las decisiones de `recount`, rotas una a una, que `recount.selftest.mjs` debe cazar: un recuento que sube un
 * contador, enmienda la línea equivocada, pierde la línea vieja, escribe un ledger sin probarlo ni releerlo, escribe
 * en un simulacro o corre sin el lock.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const RECOUNT = 'failure-capture/recount.mjs';
const COMMAND = 'failure-capture/capture.mjs';
const EVIDENCE = 'failure-capture/evidence.mjs';

const ARCHIVE_CALL = "const archived = io.appendEvidence({ ledgerFile: ledger.file, key, line: original, date, kind: 'recounted', note: `Recounted ${date} from ${String(planned.marker.count)} to ${String(count)}: ${reason.trim()}` });";

const MUTANTS = [
  // --- the inputs
  ['a key that is not kebab-case is accepted', RECOUNT, 'isValidKey(key) ? [] :', 'true ? [] :'],
  ['a count of zero is accepted', RECOUNT, 'Number.isInteger(count) && count >= 1 ?', 'Number.isInteger(count) && count >= 0 ?'],
  ['a fractional count is accepted', RECOUNT, 'Number.isInteger(count) && count >= 1 ?', 'count >= 1 ?'],
  ['a reason is not required', RECOUNT, "typeof reason === 'string' && reason.trim().length >= MINIMUM_REASON_LENGTH ? oneLineProblems('--reason', reason) :", "typeof reason === 'string' ? oneLineProblems('--reason', reason) :"],
  ['blanks count towards the reason', RECOUNT, 'reason.trim().length >= MINIMUM_REASON_LENGTH', 'reason.length >= MINIMUM_REASON_LENGTH'],
  ['a reason may run over two lines', RECOUNT, "? oneLineProblems('--reason', reason) :", '? [] :'],

  // --- the line
  ['a marker-less line pointing at the evidence is recounted', RECOUNT, 'return marker?.key === key ? [{ ledger, index, line, marker }] : [];', "return marker?.key === key || line.includes(`evidence/${key}.md`) ? [{ ledger, index, line, marker }] : [];"],
  ['a key two counters carry amends the first', RECOUNT, 'if (found.length === 1) return', 'if (found.length >= 1) return'],
  ['a promoted stub is recounted', RECOUNT, '  if (original.startsWith(PROMOTED_PREFIX)) return refuse(', '  if (false) return refuse('],
  ['a raise is accepted', RECOUNT, '  if (count > marker.count) return refuse(', '  if (false) return refuse('],
  ['the recounted line changes more than the number', RECOUNT, '${original.slice(0, marker.open)}${MARK_OPEN}', '${original.slice(1, marker.open)}${MARK_OPEN}'],
  ['the recounted line keeps the old number', RECOUNT, '${MARK_OPEN}${key}#${String(count)}${MARK_CLOSE}', '${MARK_OPEN}${key}#${String(marker.count)}${MARK_CLOSE}'],
  ['the line replaced is not the one found', RECOUNT, '(at === index ? built : one)', '(at === 0 ? built : one)'],
  ['a line that already counts right is archived again', RECOUNT, '  if (built === original) return', '  if (false) return'],

  // --- proof before change
  ['the old line is never archived', RECOUNT, ARCHIVE_CALL, 'const archived = { ok: true };'],
  ['the archive does not say why', RECOUNT, 'to ${String(count)}: ${reason.trim()}` });', 'to ${String(count)}` });'],
  ['the archive does not say the old count', RECOUNT, 'from ${String(planned.marker.count)} to', 'from ${String(count)} to'],
  ['the reason is not trimmed in the archive', RECOUNT, ': ${reason.trim()}` });', ': ${reason}` });'],
  ['the proof is skipped', RECOUNT, '? proveArchived({ original, evidence: io.readEvidence(ledger.file, key) }) :', '? { ok: true } :'],
  ['a failed archive is not a refusal', RECOUNT, ': { ok: false, deficits: [archived.problem] };', ': { ok: true };'],
  ['the write is not read back', RECOUNT, 'if (!writeVerified({ io, file: ledger.file, text, next })) return', 'if (false) return'],
  ['the recounted kind is no evidence kind', EVIDENCE, ", 'superseded', 'recounted'];", ", 'superseded'];"],

  // --- dry run and lock
  ['a dry run writes', RECOUNT, '  if (dryRun) {\n', '  if (false) {\n'],
  ['a dry run does not report its line', RECOUNT, 'dryRun: true, line: planned.built,', 'dryRun: true, line: planned.line,'],
  ['a refused dry run reads as planned', RECOUNT, ': refused([planned.problem]);\n  }', ': { status: 0, held: false, problems: [], recounted: undefined };\n  }'],
  ['the lock is not taken', RECOUNT, 'const locked = withLock(lockFile, () => recountLocked({ ledgers: load(), key, count, reason, date, io }));', 'const locked = { held: true, value: recountLocked({ ledgers: load(), key, count, reason, date, io }) };'],
  ['the ledger is read before the lock is held', RECOUNT, 'const locked = withLock(lockFile, () => recountLocked({ ledgers: load(), key, count, reason, date, io }));', 'const early = load();\n  const locked = withLock(lockFile, () => recountLocked({ ledgers: early, key, count, reason, date, io }));'],
  ['a held lock reads as a clean run', RECOUNT, '{ status: 2, held: true,', '{ status: 0, held: true,'],

  // --- the report
  ['a done run does not say what changed', RECOUNT, 'recounted ${String(from)} -> ${String(to)}; the old line', 'changed; the old line'],
  ['a done run loses its Spanish half', RECOUNT, 'lección "${key}" recontada ${String(from)} -> ${String(to)}; la línea vieja queda archivada entera en la evidencia con el motivo.', ''],
  ['a no-op run does not say so', RECOUNT, 'already counts ${String(to)}; nothing was changed.', 'was not changed.'],
  ['a dry run does not say it wrote nothing', RECOUNT, 'recount (dry run, nothing written):', 'recount:'],
  ['a refusal does not name its reasons', RECOUNT, "...outcome.problems.map((problem) => `  ${problem}`)];", '];'],

  // --- the command
  ['the command dry run makes the state directory', COMMAND, '  if (!dryRun) ensureDirs();\n', '  ensureDirs();\n'],
  ['the command never dry-runs', COMMAND, "const dryRun = args['dry-run'] === true;", 'const dryRun = false;'],
  ['the command reads any count', COMMAND, "[...args.count].every((digit) => digit >= '0' && digit <= '9') ? Number(args.count) : Number.NaN", 'Number.parseInt(args.count, 10)'],
  ['the status of the run is not the exit status', COMMAND, 'describeRecount(outcome)) (outcome.status === 0 ? speaker.data : speaker.dataError)(line);\n\n  return outcome.status;', 'describeRecount(outcome)) (outcome.status === 0 ? speaker.data : speaker.dataError)(line);\n\n  return 0;'],
  ['the command does not read the project', COMMAND, "'supersede', 'recount', 'status', 'route']", "'supersede', 'status', 'route']"],
  ['recount is no command', COMMAND, "    case 'recount':\n      return commandRecount(args);\n", ''],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state', 'config-sync-guard'],
  selftest: 'failure-capture/recount.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
