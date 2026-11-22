#!/usr/bin/env node
/**
 * Proof of `note`: a later measurement of one incident is appended to its evidence file and the ledger stays
 * byte-identical (the counter is never touched), a promoted stub included. The note is re-read and must be a whole line
 * of the evidence; the same note twice adds nothing; an unknown or repeated key, a short or multi-line text, a lying
 * disk or a held lock change nothing and say why in both languages. Every fixture lives in a temporary directory.
 *
 * @es Prueba de `note`: una medición posterior de un incidente se agrega a su evidencia y el ledger queda idéntico byte a
 * byte (el contador nunca se toca), muñón promovido incluido. La nota se relee y debe ser una línea entera de la
 * evidencia; la misma nota dos veces no agrega nada; una clave desconocida o repetida, un texto corto o de varias
 * líneas, un disco que miente o un lock ocupado no cambian nada y dicen por qué en los dos idiomas.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describeEvidenceNote, runEvidenceNote } from './evidence-note.mjs';
import { isolateState } from '../hook-state/locations.mjs';

isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'evidence-note-selftest-'));

process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

const DATE = '2026-11-22';
const KEY = 'tree-written-during-its-full-chain';
const TEXT = 'no chain reads TEMP/claude: the write guard has no TEMP clause and pollution.mjs is invoked by no chain';
const STUB = `- [promoted] 2026-11-10 — ${KEY}: mechanism full-chain-lock/write-guard.mjs <!--fc:${KEY}#2-->`;
const LIVE = `- [global] 2026-10-11 — RULE: a live lesson. Evidence: lessons/evidence/live-lesson.md <!--fc:live-lesson#3-->`;

/** A ledger with the given lines in its own folder. @es Un ledger con las líneas dadas en su propia carpeta. */
function world(name, lines) {
  const dir = path.join(scratch, name);
  const file = path.join(dir, 'lessons-promoted.md');

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `# header\n\n${lines.join('\n')}\n`, 'utf8');

  return { file, text: readFileSync(file, 'utf8'), load: () => [{ scope: 'global', file, lines: readFileSync(file, 'utf8').split('\n') }], lock: path.join(dir, 'ledger.lock'), evidence: (key) => path.join(dir, 'lessons', 'evidence', `${key}.md`) };
}

const note = (target, overrides = {}, deps) => runEvidenceNote({ load: target.load, key: KEY, text: TEXT, date: DATE, lockFile: target.lock, deps, ...overrides });
const readOr = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const lines = (text) => text.split('\n');

{
  const target = world('promoted', [LIVE, STUB]);
  const first = note(target);
  const evidence = readOr(target.evidence(KEY));

  check('a promoted stub accepts a note (status 0)', first.status === 0, JSON.stringify(first));
  check('the ledger is byte-identical: the counter is untouched', readFileSync(target.file, 'utf8') === target.text);
  check('the note is a whole line of the evidence, dated', lines(evidence).includes(`Measured ${DATE}: ${TEXT}`), evidence);
  check('the ledger line is archived once beside the note', lines(evidence).filter((line) => line === STUB).length === 1, evidence);
  check('the block is labelled measured', evidence.includes(`(measured)`), evidence);
  check('the report says the counter is unchanged, in both languages', describeEvidenceNote(first)[0].includes('the counter is unchanged') && describeEvidenceNote(first)[0].includes('@es'), describeEvidenceNote(first)[0]);

  const again = note(target);

  check('the same note twice adds nothing', again.status === 0 && readOr(target.evidence(KEY)) === evidence && again.noted.appended === false, JSON.stringify(again));
  check('a repeated note says so', describeEvidenceNote(again)[0].includes('already holds this note'), describeEvidenceNote(again)[0]);

  const second = note(target, { text: `${TEXT}; re-measured after the gentle-ai 5.0.0 sync` });

  check('a different note on the same key is appended', second.status === 0 && lines(readOr(target.evidence(KEY))).filter((line) => line.startsWith('Measured ')).length === 2);
}

for (const [label, overrides] of [
  ['an unknown key is refused', { key: 'no-such-lesson-anywhere' }],
  ['an invalid key is refused', { key: 'Not A Key' }],
  ['a text shorter than the minimum is refused', { text: 'too short' }],
  ['a multi-line text is refused', { text: `${TEXT}\nsecond line` }],
  ['a missing text is refused', { text: undefined }],
]) {
  const target = world(`refused-${label.length}`, [LIVE, STUB]);
  const outcome = note(target, overrides);

  check(label, outcome.status === 1 && outcome.noted === undefined && readFileSync(target.file, 'utf8') === target.text && !existsSync(target.evidence(KEY)), JSON.stringify(outcome));
  check(`${label}: the report is bilingual`, describeEvidenceNote(outcome).join(' ').includes('@es'));
}

{
  const target = world('twin', [STUB, STUB.replace('2026-11-10', '2026-11-11')]);

  check('two lines carrying the key are refused', note(target).status === 1 && !existsSync(target.evidence(KEY)));
}

{
  const target = world('lying-disk', [STUB]);
  const outcome = note(target, {}, { readEvidence: () => 'nothing like the note' });

  check('a disk that does not hold the note after writing is refused', outcome.status === 1 && describeEvidenceNote(outcome).join(' ').includes('could not be proved'), JSON.stringify(outcome));
  check('a refused append is reported with its problem', note(world('append-fails', [STUB]), {}, { appendEvidence: () => ({ ok: false, problem: 'disk full' }) }).problems.join(' ').includes('disk full'));
}

{
  const target = world('held', [STUB]);

  writeFileSync(target.lock, JSON.stringify({ pid: process.pid, at: Date.now() }));
  const outcome = note(target);

  check('a held lock changes nothing and says so', outcome.status === 2 && outcome.held === true && !existsSync(target.evidence(KEY)) && describeEvidenceNote(outcome)[0].includes('locked'), JSON.stringify(outcome));
}

if (failures.length > 0) {
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`${String(passed)} passed, ${String(failures.length)} failed @es ${String(passed)} pasan, ${String(failures.length)} fallan`);
  process.exitCode = 1;
} else {
  console.log(`${String(passed)}/${String(passed)} checks passed @es ${String(passed)}/${String(passed)} comprobaciones correctas`);
}
