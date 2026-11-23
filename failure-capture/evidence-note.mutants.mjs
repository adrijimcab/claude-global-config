#!/usr/bin/env node
/**
 * The decisions of `note` (evidence-note.mjs), each broken once, that `evidence-note.selftest.mjs` must catch. A
 * survivor is a missing assertion, never a mutant to soften.
 * @es Las decisiones de `note`, rotas una a una, que su selftest debe cazar. Un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const N = 'failure-capture/evidence-note.mjs';

const MUTANTS = [
  ['an invalid key is accepted', N, '...(isValidKey(key) ? [] : [refuse(', '...(true ? [] : [refuse('],
  ['a short text is accepted', N, 'text.trim().length >= MINIMUM_TEXT_LENGTH', 'text.trim().length >= 1'],
  ['a multi-line text is accepted', N, "? oneLineProblems('--text', text) :", '? [] :'],
  ['two lines with the key are accepted', N, 'if (found.length === 1) return { ok: true, ...found[0] };', 'if (found.length >= 1) return { ok: true, ...found[0] };'],
  ['an unknown key is accepted', N, "return found.length === 0 ? refuse(`no ledger line", "if (found.length === 0) return { ok: true, ledger: ledgers[0], line: 'x' };\n  return found.length === 0 ? refuse(`no ledger line"],
  ['the note is not dated', N, 'const note = `Measured ${date}: ${text.trim()}`;', 'const note = text.trim();'],
  ['the note is filed as another kind', N, "kind: 'measured', note", "kind: 'captured', note"],
  ['the note is not proved after writing', N, ' || !holdsWholeLine(evidence, note)', ''],
  ['a held lock reads as done', N, 'return locked.held ? locked.value : { status: 2, held: true', 'return locked.held ? locked.value : { status: 0, held: true'],
  ['the report forgets the counter is unchanged', N, 'the counter is unchanged', 'the counter is fine'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state', 'config-sync-guard'],
  selftest: 'failure-capture/evidence-note.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
