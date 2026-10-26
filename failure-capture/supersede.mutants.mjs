#!/usr/bin/env node
/**
 * The decisions of `supersede`, each broken once, that `supersede.selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here lets an amendment lose the old line,
 * change a line's scope, date, tally or marker, write a ledger it never proved or read back, take a line it
 * should have refused, or run without the ledger lock.
 *
 * @es Las decisiones de `supersede`, rotas una a una, que `supersede.selftest.mjs` debe atrapar. Un punto
 * ciego aquí deja que una enmienda pierda la línea vieja, cambie alcance, fecha, recuento o marcador de una
 * línea, escriba un ledger que nunca probó ni releyó, tome una línea que debía rechazar, o corra sin el lock.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const SUPERSEDE = 'failure-capture/supersede.mjs';
const LEDGER = 'failure-capture/ledger-line.mjs';
const CONSERVATION = 'failure-capture/conservation.mjs';
const WRITE = 'failure-capture/verified-write.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const ARCHIVE_CALL = "const archived = io.appendEvidence({ ledgerFile: file, key, line: original, date, kind: 'superseded', note: `Superseded ${date} by ${by.trim()}; replaced by: ${built}` });";

const MUTANTS = [
  // --- the inputs
  ['a key that is not kebab-case is accepted', SUPERSEDE, 'isValidKey(key) ? [] :', 'true ? [] :'],
  ['the rule is not checked', SUPERSEDE, 'captureTextProblems({ rule })', '[]'],
  ['a blank superseding directive is accepted', SUPERSEDE, "typeof by === 'string' && by.trim().length > 0 ?", "typeof by === 'string' ?"],
  ['the superseding directive may run over two lines', SUPERSEDE, "oneLineProblems('--by', by)", '[]'],

  // --- finding the line, and refusing what is not one lesson's rule
  ['a line is found by its marker only', LEDGER, 'export const lineKeyOf = (line) => readMarker(line)?.key ?? pointerKeyOf(line);', 'export const lineKeyOf = (line) => readMarker(line)?.key;'],
  ['a line is found by its pointer only', LEDGER, 'export const lineKeyOf = (line) => readMarker(line)?.key ?? pointerKeyOf(line);', 'export const lineKeyOf = (line) => pointerKeyOf(line);'],
  ['a key two lines carry amends the first and leaves the other stating the old rule', SUPERSEDE, 'if (found.length === 1) return', 'if (found.length >= 1) return'],
  ['a promoted stub is amended', SUPERSEDE, 'if (entry.scope === PROMOTED_SCOPE) return refuse(', 'if (false) return refuse('],
  ['a line with no RULE: label is amended', SUPERSEDE, 'if (!split.ok) return split;', 'if (false) return split;'],
  ['a line that cannot be read is amended', SUPERSEDE, 'if (!entry.ok) return entry;', 'if (false) return entry;'],

  // --- what the amended line keeps and says
  ['the amended line loses its scope', SUPERSEDE, 'tieredLine({ scope: entry.scope,', "tieredLine({ scope: 'global',"],
  ['the amended line takes the date of the amendment', SUPERSEDE, 'date: entry.date, tally: split.tally,', 'date, tally: split.tally,'],
  ['the amended line loses its recurrence tally', SUPERSEDE, 'tally: split.tally,', 'tally: undefined,'],
  ['the amended line loses its marker, so a recurrence cannot fold into it', SUPERSEDE, 'key, marker: entry.marker });', 'key });'],
  ['the amended line forgets what superseded the old one', SUPERSEDE, '`${rule.trim()} Superseded ${date} by ${directive}${', '`${rule.trim()} ${'],
  ['the amended line does not end its sentence', SUPERSEDE, "${directive.endsWith('.') ? '' : '.'}", "${''}"],
  ['a directive that ends a sentence gets a second dot', SUPERSEDE, "${directive.endsWith('.') ? '' : '.'}", "${'.'}"],
  ['the rule is not trimmed', SUPERSEDE, '`${rule.trim()} Superseded', '`${rule} Superseded'],
  ['the directive is not trimmed', SUPERSEDE, 'const directive = by.trim();', 'const directive = by;'],

  // --- a line that already says it is left alone
  ['a line that already states the rule is rewritten and archived again', SUPERSEDE, 'if (built.line === original) return', 'if (false) return'],

  // --- proof before change: archive, re-read, prove
  ['the old line is never archived, so nothing can prove it', SUPERSEDE, ARCHIVE_CALL, 'const archived = { ok: true };'],
  ['only part of the old line is archived', SUPERSEDE, "line: original, date, kind: 'superseded'", "line: original.slice(0, 50), date, kind: 'superseded'"],
  ['the archive does not say what replaced the old line', SUPERSEDE, '; replaced by: ${built}` });', '` });'],
  ['the archive does not say what superseded the old line', SUPERSEDE, 'note: `Superseded ${date} by ${by.trim()}; replaced by', 'note: `Replaced by'],
  ['the proof is skipped, so a line that failed it is replaced', SUPERSEDE, 'return proveArchived({ original, evidence: io.readEvidence(file, key) });', 'return { ok: true };'],
  ['the proof reads the evidence before it is archived', SUPERSEDE, 'evidence: io.readEvidence(file, key) });', 'evidence: undefined });'],
  ['the deficit of a failed proof is not named', SUPERSEDE, ', ...proof.deficits])]);', '])]);'],
  ['a failed archive is not a refusal', SUPERSEDE, 'if (!archived.ok) return { ok: false, deficits: [archived.problem] };', 'if (false) return { ok: false, deficits: [archived.problem] };'],
  ['the proof only needs the line to be in the file, not to be a whole line of it', CONSERVATION, "const deficits = archiveDeficits(original, evidence);\n\n  return deficits.length === 0 ? { ok: true } : { ok: false, deficits };\n}\n\n/**\n * @param input", "const deficits = evidence !== undefined && evidence.includes(original) ? [] : archiveDeficits(original, evidence);\n\n  return deficits.length === 0 ? { ok: true } : { ok: false, deficits };\n}\n\n/**\n * @param input"],

  // --- the write: once, read back, restored on any difference
  ['the write is not read back', SUPERSEDE, 'if (!writeVerified({ io, file: ledger.file, text, next })) return', 'if (false) return'],
  ['a write that is not what was planned is not read back', WRITE, 'if (onDisk === next) return true;', 'return true;'],
  ['a write that differs is not restored', WRITE, "  writeFileSync(file, text, 'utf8');\n\n  return false;", '  return false;'],
  ['a write that fails is not treated as a difference', WRITE, '  } catch {\n    onDisk = undefined;', '  } catch (error) {\n    throw error;'],
  ['the line replaced is not the one found', SUPERSEDE, '(at === index ? built.line : one)', '(at === 0 ? built.line : one)'],

  // --- the lock
  ['the lock is not taken', SUPERSEDE, 'const locked = withLock(lockFile, () => supersedeLocked({ ledgers: load(), key, rule, by, date, io }));', 'const locked = { held: true, value: supersedeLocked({ ledgers: load(), key, rule, by, date, io }) };'],
  ['the ledger is read before the lock is held', SUPERSEDE, 'const locked = withLock(lockFile, () => supersedeLocked({ ledgers: load(), key, rule, by, date, io }));', 'const early = load();\n  const locked = withLock(lockFile, () => supersedeLocked({ ledgers: early, key, rule, by, date, io }));'],
  ['a held lock is reported as a clean run', SUPERSEDE, '{ status: 2, held: true,', '{ status: 0, held: true,'],

  // --- the report
  ['a held lock refusal loses its Spanish half', SUPERSEDE, '; nothing was changed. @es supersede RECHAZADO', '; nothing was changed. supersede RECHAZADO'],
  ['a refusal loses its Spanish half', SUPERSEDE, 'the ledger was not changed. @es supersede RECHAZADO: no se cambió el ledger.', 'the ledger was not changed.'],
  ['a refusal does not name its reasons', SUPERSEDE, '...outcome.problems.map((problem) => `  ${problem}`)', ''],
  ['a done run does not say it superseded the lesson', SUPERSEDE, 'superseded; the old line is archived whole in the evidence store. ${String(before)} -> ${String(after)} characters. @es', 'changed. ${String(before)} -> ${String(after)} characters. @es'],
  ['a done run loses its Spanish half', SUPERSEDE, 'la línea vieja queda archivada entera en el almacén de evidencia. ${String(before)} -> ${String(after)} caracteres.', ''],
  ['a no-op run does not say the lesson already states the rule', SUPERSEDE, 'already states this rule and this directive; nothing was changed. @es', 'was not changed. @es'],

  // --- the command
  ['the status of the run is not the exit status', COMMAND, 'describeSupersede(outcome)) (outcome.status === 0 ? speaker.data : speaker.dataError)(line);\n\n  return outcome.status;', 'describeSupersede(outcome)) (outcome.status === 0 ? speaker.data : speaker.dataError)(line);\n\n  return 0;'],
  ['the state directory the lock lives in is not made', COMMAND, 'function commandSupersede(args) {\n  ensureDirs();\n\n  const outcome', 'function commandSupersede(args) {\n  const outcome'],
  ['the amendment is dated by something other than today', COMMAND, 'by: args.by, date: today(),', "by: args.by, date: '1999-01-01',"],
  ['the command does not read the project, so it has no ledger', COMMAND, "'condense', 'supersede', 'recount',", "'condense', 'recount',"],
  ['the command amends only the home ledger', COMMAND, 'runSupersede({ load: loadLedgers,', 'runSupersede({ load: () => loadLedgers().slice(0, 1),'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/supersede.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
