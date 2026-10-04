#!/usr/bin/env node
/**
 * The decisions of a PROMOTION's shortening — what the conservation proof admits as new text, the closure
 * note in the evidence store, the order archive / re-read / proof in `promotedStub`, and how `promote` and
 * `status` use the stub — each broken once, that `promotion.selftest.mjs` (the modules) or `selftest.mjs`
 * (the command) must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del acortamiento de una PROMOCIÓN —qué texto nuevo admite la prueba de conservación,
 * la nota de cierre en el almacén de evidencia, el orden archivar / releer / probar en `promotedStub`, y
 * cómo usan el muñón `promote` y `status`— rotas una a una; las debe cazar `promotion.selftest.mjs` (los
 * módulos) o `selftest.mjs` (el comando). El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PROOF = 'failure-capture/conservation.mjs';
const STORE = 'failure-capture/evidence.mjs';
const PROMOTION = 'failure-capture/promotion.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const ADMIT = 'if (promotion !== undefined) return minimalStub({ date: promotion.date, mechanism: promotion.mechanism, marker: before.marker });';

const MODULE_MUTANTS = [
  // --- conservation admits the promotion it is given, and only that
  ['the promotion input is ignored, so the stub with a new date is an invention', PROOF, ADMIT, 'if (false) return minimalStub({ date: promotion.date, mechanism: promotion.mechanism, marker: before.marker });'],
  ['the promotion never reaches the invention check', PROOF, 'inventionDeficits(original, shortened, promotion)]', 'inventionDeficits(original, shortened)]'],
  ['the promotion date is the original\'s, so a promotion cannot carry its own date', PROOF, 'minimalStub({ date: promotion.date, mechanism: promotion.mechanism,', 'minimalStub({ date: before.date, mechanism: promotion.mechanism,'],
  ['the date is read back from the stub, so whatever date was written is admitted', PROOF, 'minimalStub({ date: promotion.date, mechanism: promotion.mechanism,', 'minimalStub({ date: parseStub(shortened)?.date ?? promotion.date, mechanism: promotion.mechanism,'],
  ['the mechanism is read back from the stub, so whatever path was written is admitted', PROOF, 'date: promotion.date, mechanism: promotion.mechanism, marker: before.marker });', 'date: promotion.date, mechanism: parseStub(shortened)?.mechanism, marker: before.marker });'],
  ['the marker is read back from the stub, so another counter is admitted', PROOF, 'date: promotion.date, mechanism: promotion.mechanism, marker: before.marker });', 'date: promotion.date, mechanism: promotion.mechanism, marker: parseStub(shortened)?.marker ?? before.marker });'],
  ['a promotion admits any shortened line', PROOF, ADMIT, 'if (promotion !== undefined) return { ok: true, line: shortened };'],

  // --- the closure note in the evidence store
  ['the note is never written', STORE, '${line}\\n${noteBlock}`', '${line}\\n`'],
  ['an already archived line is archived a second time with its new note', STORE, 'const block = archived ? noteBlock : `', 'const block = `'],
  ['an already archived line ignores a new note', STORE, 'if (archived && noted) return', 'if (archived) return'],
  ['a note already present is written again', STORE, 'const noted = note === undefined || (existing !== undefined && holdsWholeLine(existing, note));', 'const noted = note === undefined;'],
  ['a note holding a newline is accepted', STORE, "note.length > 0 && !note.includes('\\n') && !note.includes('\\r')", 'note.length > 0'],
  ['an empty note is accepted', STORE, 'typeof note === \'string\' && note.length > 0 && ', 'typeof note === \'string\' && '],

  // --- promotedStub: build, archive, re-read, prove, then answer
  ['the original is never archived', PROMOTION, 'const archived = store.appendEvidence({ ledgerFile,', 'const archived = ((unused) => ({ ok: true }))({ ledgerFile,'],
  ['the conservation proof is skipped', PROMOTION, 'return proof.ok ? { ok: true, line: built.line } : notPromoted(proof.deficits);', 'return { ok: true, line: built.line };'],
  ['the proof trusts the original instead of the evidence re-read from disk', PROMOTION, 'evidence: store.readEvidence(ledgerFile, marker.key),', 'evidence: original,'],
  ['the promotion is not given to the proof', PROMOTION, ', promotion: { date, mechanism } })', ' })'],
  ['a stub that cannot be built is archived anyway', PROMOTION, 'if (!built.ok) return notPromoted([built.problem]);', 'if (!built.ok && marker === undefined) return notPromoted([built.problem]);'],
  ['a mechanism closure is written as no mechanism', PROMOTION, "const mechanism = closure.kind === 'mechanism' ? closure.path : undefined;", 'const mechanism = undefined;'],
  ['the closure note loses how the promotion closed', PROMOTION, '`Promoted ${date} to ${where}; ${closureClause(closure)}`', '`Promoted ${date} to ${where}`'],
  ['the stub carries a rebuilt marker with another counter', PROMOTION, 'marker: original.slice(marker.open, marker.close) })', 'marker: `<!--fc:${marker.key}#1-->` })'],
  ['a refusal loses its Spanish half', PROMOTION, 'la lección no se promovió: la línea del ledger no cambió.', 'la línea del ledger no cambió.'],
  ['an original with no marker is not refused for that', PROMOTION, "refuse('the line carries no marker.', 'la línea no lleva marcador.')", "refuse('the line is unusable.', 'la línea no sirve.')"],
];

const COMMAND_MUTANTS = [
  // --- promote uses the stub and keeps ONE store
  ['a refused stub is written to the ledger anyway', COMMAND, 'if (!stub.ok) return stub;', 'if (false) return stub;'],
  ['a refused promotion reports success', COMMAND, 'if (collapsed.value?.ok !== true) {', 'if (false) {'],
  ['the old state/promoted.md is written again beside the evidence store', COMMAND, 'ledger.lines[index] = stub.line;', "appendFileSync(PROMOTED, 'duplicate', 'utf8');\n    ledger.lines[index] = stub.line;"],
  ['the promotion is dated some other day', COMMAND, 'date: today(), closure, where })', "date: '2000-01-01', closure, where })"],
  ['promote shortens the line without the closure being what was verified', COMMAND, 'promotedStub({ ledgerFile: ledger.file, original: ledger.lines[index], date: today(), closure, where })', 'promotedStub({ ledgerFile: ledger.file, original: ledger.lines[index], date: today(), closure: { kind: \'no-mechanism\', reason: \'x\' }, where })'],

  // --- status reads what landed from the ledger stub, and still honours the old record
  ['status ignores the stub in the ledger, so a promoted lesson is due for ever', COMMAND, '!stubbed.has(key) && ', ''],
  ['status reads the stubs of the first ledger only', COMMAND, 'readLedgers(LEDGERS).flatMap((ledger) => (ledger.lines', 'readLedgers(LEDGERS).slice(0, 1).flatMap((ledger) => (ledger.lines'],
  ['status stops honouring the old state/promoted.md', COMMAND, ' && !promoted.includes(` — ${key} -> `));', ');'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaign = (selftest, mutants) => runMutants({ fleetRoot, paths: ['failure-capture', 'bilingual-output', 'mutation-proof'], selftest, mutants });
const survivors = campaign('failure-capture/promotion.selftest.mjs', MODULE_MUTANTS) + campaign('failure-capture/selftest.mjs', COMMAND_MUTANTS);

process.exit(survivors === 0 ? 0 : 1);
