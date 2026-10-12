#!/usr/bin/env node
/**
 * The decisions of the authorship seam of `capture.mjs` — which command is measured, which roots, what is
 * credited and to whom — each broken once, that `authorship.selftest.mjs` must catch. The runner and its
 * rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del punto de autoría de `capture.mjs` —qué comando se mide, qué raíces, qué se acredita
 * y a quién— rotas una a una; las debe cazar `authorship.selftest.mjs`. El runner y sus reglas viven en
 * `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  ['a command is no longer run under the authorship measurement, so nothing is journaled', COMMAND, 'return runAuthored(args.session, () => dispatch(command, args));', 'return dispatch(command, args);'],
  ['the changed files are no longer journaled', COMMAND, '  recordAuthoredWrites(changedBetween(before, snapshotMtimes(roots)), session);', ''],
  ['the files are credited to a session that did not run the command', COMMAND, 'snapshotMtimes(roots)), session);', "snapshotMtimes(roots)), 'someone-else');"],
  ['the snapshot is taken after the command, so it sees no change', COMMAND, '  const before = snapshotMtimes(roots);\n  const code = command();', '  const code = command();\n  const before = snapshotMtimes(roots);'],
  ['the ledgers are left out of the measured roots, so a ledger write is never credited', COMMAND, '...Object.values(LEDGERS).map(({ file }) => file), ', ''],
  ['every file under the roots is credited, not only the ones the command changed', COMMAND, 'changedBetween(before, snapshotMtimes(roots))', '[...snapshotMtimes(roots)].map(([file, mtimeMs]) => ({ path: file, mtimeMs }))']
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state', 'config-sync-guard'], selftest: 'failure-capture/authorship.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
