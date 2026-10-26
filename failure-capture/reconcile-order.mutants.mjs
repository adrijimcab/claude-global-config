#!/usr/bin/env node
/**
 * The decisions of the spool-to-ledger hand-off — ledgers written before the spool entry is removed, the
 * incident logged only after that, the ledger replaced atomically and its temporary file cleaned up — each
 * broken once, that `reconcile-order.selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del traspaso del spool al ledger —ledgers escritos antes de borrar la entrada del
 * spool, el incidente registrado solo después, el ledger reemplazado de forma atómica y su temporal
 * limpiado— rotas una a una; las debe cazar `reconcile-order.selftest.mjs`. El runner y sus reglas viven
 * en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const COMMAND = 'failure-capture/capture.mjs';
const LEDGERS = 'failure-capture/ledgers.mjs';

const MUTANTS = [
  // --- the spool entry outlives a failed ledger write
  ['the spool entry is removed as soon as it is read, before any ledger is written', COMMAND, '      consumed.push({ full, entry });', '      unlinkSync(full);\n      consumed.push({ full, entry });'],
  ['the incident is logged as soon as it is read, before any ledger is written', COMMAND, '      consumed.push({ full, entry });', "      appendFileSync(incidentsFile(), `${JSON.stringify(entry)}\\n`, 'utf8');\n      consumed.push({ full, entry });"],
  ['the spool entry is removed and the incident logged while the ledgers are still unwritten', COMMAND, '    for (const ledger of touched) writeLedger(ledger);\n\n    for (const { full, entry } of consumed) {', '    for (const { full, entry } of consumed) {\n      appendFileSync(incidentsFile(), `${JSON.stringify(entry)}\\n`, \'utf8\');\n      unlinkSync(full);\n    }\n\n    for (const ledger of touched) writeLedger(ledger);\n\n    for (const { full, entry } of []) {'],

  // --- the ledger is replaced, never overwritten in place
  ['the ledger is overwritten in place, so a crash mid-write leaves it truncated', LEDGERS, '    writeFileSync(temp, data);\n    renameSync(temp, file);', '    writeFileSync(file, data);'],
  ['a failed write leaves its temporary file behind', LEDGERS, "    rmSync(temp, { force: true });\n    throw error;", '    throw error;'],
  ['a failed write is swallowed, so the caller believes the ledger is on disk', LEDGERS, "    rmSync(temp, { force: true });\n    throw error;", "    rmSync(temp, { force: true });\n    return;"]
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest: 'failure-capture/reconcile-order.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
