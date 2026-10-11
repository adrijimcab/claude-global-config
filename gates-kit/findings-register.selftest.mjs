#!/usr/bin/env node
/**
 * Proof that the findings register DISCRIMINATES. Every case builds its own register in a temporary folder.
 * State space: a correct finding (measured, with each kind of receipt; a hypothesis with and without one) and a
 * correct closure; every rule of the schema broken ALONE (version, kind, a line that is not an object, an
 * unknown key such as `ignore`, the id format and an id that is not the one derived from the content, a date
 * that is not a calendar day, an empty scope or source, a basis that is neither measured nor hypothesis, a
 * summary missing a language, copied between languages or on several lines, a measured finding or a closure
 * without a receipt, evidence that is not a list, each malformed receipt); the rules across lines (a duplicate
 * id, a closure with no finding before it, a second closure, a closure dated before its finding); reading (an
 * invalid line is named by its number, blank lines and CRLF are tolerated); the open findings (closed ones
 * leave, order stays); appending (the file and folder are created, the id and date are derived, a refused
 * record writes nothing, a corrupt register is not extended, a missing final newline is repaired); and the
 * CLI (list, validate, add, close, the default and the explicit file, every usage error, every printed line
 * bilingual).
 *
 * @es Prueba de que el registro de hallazgos DISCRIMINA. Cada caso construye su propio registro temporal.
 * Espacio de estados: un hallazgo correcto (medido, con cada tipo de recibo; una hipótesis con y sin recibo) y
 * un cierre correcto; cada regla del esquema rota SOLA; las reglas entre líneas (id duplicado, cierre sin
 * hallazgo antes, segundo cierre, cierre fechado antes de su hallazgo); la lectura (una línea inválida se
 * nombra por su número, se toleran líneas en blanco y CRLF); los hallazgos abiertos; el añadido (se crean
 * fichero y carpeta, id y fecha se derivan, un registro rechazado no escribe nada, un registro corrupto no se
 * extiende, se repara un salto final ausente); y el CLI (list, validate, add, close, el fichero por defecto y
 * el explícito, cada error de uso, cada línea impresa bilingüe).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { messageProblems, render } from '../bilingual-output/message.mjs';
import { DEFAULT_REGISTER_PATH, MESSAGES, append, deriveId, main, openFindings, readRegister, rowOf, validate } from './findings-register.mjs';

/** The text of a file, empty when it cannot be read, so a missing file fails an assertion instead of crashing. @es El texto de un fichero, vacío si no se lee. */
function textOf(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** `append` that reports a throw as a refusal, so it fails an assertion instead of crashing. @es `append` que informa un throw como rechazo. */
function appended(file, input, options) {
  try {
    return append(file, input, options);
  } catch (error) {
    return { ok: false, problems: [{ id: `threw: ${error.message}` }] };
  }
}

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

const roots = [];
// Every root is removed on every exit, a throw included: a selftest leaves nothing behind it. @es Toda raíz se
// elimina en toda salida, también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** A fresh temporary folder. @es Una carpeta temporal nueva. */
function freshRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'findings-selftest-'));

  roots.push(root);

  return root;
}

/** The id the content must carry, derived here from the same rule, written out. @es El id que debe llevar el contenido. */
const idOf = (scope, english) => `F-${createHash('sha256').update(`${scope}\n${english}`).digest('hex').slice(0, 8)}`;

const SUMMARY = { en: 'Condition is always true.', es: 'La condición siempre es verdadera.' };
const RECEIPT = { command: 'npx eslint src/a.ts', exitCode: 1 };

/** A correct finding with `overrides`; the id follows the content unless an id is given. @es Un hallazgo correcto. */
function finding(overrides = {}) {
  const base = { v: 1, kind: 'finding', at: '2026-10-01', scope: 'repo-b/src/a.ts', source: 'ts-strict-type-checked', basis: 'measured', summary: SUMMARY, evidence: [RECEIPT], ...overrides };

  return { id: idOf(base.scope, base.summary?.en), ...base };
}

/** A correct closure of `id` with `overrides`. @es Un cierre correcto. */
function closure(id, overrides = {}) {
  return { v: 1, kind: 'closure', id, at: '2026-10-02', summary: { en: 'Fixed in the source.', es: 'Corregido en el código.' }, evidence: [{ command: 'npx eslint src/a.ts', exitCode: 0 }], ...overrides };
}

/** The register text of records (objects are written as JSON, strings as they are). @es El texto de un registro. */
const register = (...records) => records.map((record) => (typeof record === 'string' ? record : JSON.stringify(record))).join('\n') + '\n';

/** The problems of a text as `line:id` or `line:id:detail`; a throw is reported so it fails the assertion. @es Los problemas de un texto. */
function ids(text) {
  try {
    return validate(text).map((problem) => `${problem.line}:${problem.id}${problem.detail === undefined ? '' : `:${problem.detail}`}`).join();
  } catch (error) {
    return `threw:${error.message}`;
  }
}

/** The record without the named keys. @es El registro sin las claves nombradas. */
function without(record, ...keys) {
  const copy = { ...record };

  for (const key of keys) delete copy[key];

  return copy;
}

// The correct records.
const THE_ID = idOf('repo-b/src/a.ts', SUMMARY.en);

check('the id rule is the one written here, over a literal', THE_ID === 'F-cbf84fe8' && deriveId('repo-b/src/a.ts', SUMMARY.en) === 'F-cbf84fe8');
check('the id changes with the scope', deriveId('x', 'y') === 'F-9ab9de25' && deriveId('z', 'y') !== 'F-9ab9de25');
check('the id changes with the English summary', deriveId('x', 'y') !== deriveId('x', 'w'));
check('the default register lives under .claude', DEFAULT_REGISTER_PATH === '.claude/FINDINGS.jsonl');
check('a correct measured finding has no problem', ids(register(finding())) === '');
check('a finding with each kind of receipt has no problem', ids(register(finding({ evidence: [RECEIPT, { path: 'etc/report.txt' }, { measurement: '3 of 7 files fail' }] }))) === '');
check('a hypothesis without a receipt has no problem', ids(register(finding({ basis: 'hypothesis', evidence: [] }))) === '');
check('a hypothesis without an evidence key has no problem', ids(register(without(finding({ basis: 'hypothesis' }), 'evidence'))) === '');
check('a hypothesis with a receipt has no problem', ids(register(finding({ basis: 'hypothesis' }))) === '');
check('a finding followed by its closure has no problem', ids(register(finding(), closure(THE_ID))) === '');
check('a closure dated the same day as its finding has no problem', ids(register(finding(), closure(THE_ID, { at: '2026-10-01' }))) === '');
check('an empty register has no problem', ids('') === '' && ids('\n\n') === '');

// Each rule of the schema, broken alone.
check('a version other than 1 is refused', ids(register(finding({ v: 2 }))) === '1:bad-version');
check('a missing version is refused', ids(register(without(finding(), 'v'))) === '1:bad-version');
check('an unknown kind is refused', ids(register(finding({ kind: 'note' }))) === '1:bad-kind');
check('a missing kind is refused', ids(register(without(finding(), 'kind'))) === '1:bad-kind');

for (const [label, line] of [['an array', '[1]'], ['a string', '"x"'], ['null', 'null'], ['a number', '3']]) check(`a line that is ${label} is not an object`, ids(register(line)) === '1:not-object');

check('an ignore key is refused', ids(register(finding({ ignore: true }))) === '1:unknown-key:ignore');
check('a suppress key is refused', ids(register(finding({ suppress: ['x'] }))) === '1:unknown-key:suppress');
check('every unknown key is named', ids(register(finding({ a: 1, b: 2 }))) === '1:unknown-key:a,1:unknown-key:b');
check('a closure may not carry a scope', ids(register(finding(), closure(THE_ID, { scope: 'x' }))) === '2:unknown-key:scope');
check('a key of no kind of line is refused on a finding', ids(register(finding({ resolution: 'fixed' }))) === '1:unknown-key:resolution');
check('an id of the wrong shape is refused', ids(register(finding({ id: 'F-XYZ' }))) === '1:bad-id');
check('an uppercase hex id is refused', ids(register(finding({ id: 'F-CBF84FE8' }))) === '1:bad-id');
check('an id with fewer digits is refused', ids(register(finding({ id: 'F-cbf84f' }))) === '1:bad-id');
check('an id with more digits is refused', ids(register(finding({ id: 'F-cbf84fe80' }))) === '1:bad-id');
check('an id followed by text is refused', ids(register(finding({ id: 'F-cbf84fe8x' }))) === '1:bad-id');
check('a kind named like an object property is not a kind', ['constructor', 'toString', '__proto__'].every((kind) => ids(register(finding({ kind }))) === '1:bad-kind'));
check('an id without its prefix is refused', ids(register(finding({ id: 'cbf84fe8' }))) === '1:bad-id');
check('an id that is not the one derived from the content is refused', ids(register(finding({ id: 'F-00000000' }))) === '1:id-mismatch');
check('a summary edited after the id was derived is refused', ids(register({ ...finding(), summary: { en: 'Another sentence.', es: 'Otra frase.' } })) === '1:id-mismatch');

for (const [label, value] of [['a month 13', '2026-13-01'], ['a day that does not exist', '2026-02-30'], ['a date without zero padding', '2026-1-1'], ['a time of day', '2026-10-01T10:00:00Z'], ['a number', 20261001], ['an empty string', '']]) check(`a date that is ${label} is refused`, ids(register(finding({ at: value }))) === '1:bad-date');

check('a date with text before it is refused', ids(register(finding({ at: 'x2026-10-01' }))) === '1:bad-date');
check('a date inside a list is refused', ids(register(finding({ at: ['2026-10-01'] }))) === '1:bad-date');
check('day zero is refused', ids(register(finding({ at: '2026-10-00' }))) === '1:bad-date');
check('month zero is refused', ids(register(finding({ at: '2026-00-10' }))) === '1:bad-date');
check('a leap day is a date', ids(register(finding({ at: '2028-02-29' }))) === '');
check('a missing date is refused', ids(register(without(finding(), 'at'))) === '1:bad-date');
check('an empty scope is refused', ids(register(finding({ scope: '' }))) === '1:missing-scope');
check('a blank scope is refused', ids(register(finding({ scope: '   ' }))) === '1:missing-scope');
check('a scope that is not text is refused', ids(register(finding({ scope: 3 }))) === '1:missing-scope');
check('an empty source is refused', ids(register(finding({ source: '' }))) === '1:missing-source');
check('a blank source is refused', ids(register(finding({ source: ' ' }))) === '1:missing-source');
check('a missing source is refused', ids(register(without(finding(), 'source'))) === '1:missing-source');
check('a basis that is neither measured nor hypothesis is refused', ids(register(finding({ basis: 'certain' }))) === '1:bad-basis');
check('a missing basis is refused', ids(register(without(finding(), 'basis'))) === '1:bad-basis');

// The bilingual summary.
for (const [label, summary] of [['without Spanish', { en: 'Only English.' }], ['without English', { es: 'Solo español.' }], ['with an empty Spanish half', { en: 'Only English.', es: '  ' }], ['with the Spanish half copied from the English one', { en: 'Same text.', es: 'Same text.' }], ['that is a plain string', 'Only English.'], ['that is missing', undefined], ['that is null', null]]) {
  check(`a summary ${label} is refused`, ids(register(finding({ summary, id: 'F-00000000' }))).includes('summary-not-bilingual'));
}

check('a summary whose halves are lists is refused', ids(register(finding({ summary: { en: ['One.'], es: ['Uno.'] }, id: 'F-00000000' }))) === '1:summary-not-bilingual');
check('a Spanish half on several lines is refused', ids(register(finding({ summary: { en: 'One.', es: 'Uno\ny dos.' } }))) === '1:summary-multiline');
check('a summary on several lines is refused', ids(register(finding({ summary: { en: 'One\nTwo', es: 'Uno\nDos' } }))) === '1:summary-multiline');
check('a summary with a carriage return is refused', ids(register(finding({ summary: { en: 'One\rTwo', es: 'Uno\rDos' } }))) === '1:summary-multiline');
check('a summary naming other placeholders in each half is refused', ids(register(finding({ summary: { en: 'See {a}.', es: 'Ver {b}.' } }))).includes('summary-not-bilingual'));

// The evidence.
check('a measured finding with an empty list is refused', ids(register(finding({ evidence: [] }))) === '1:missing-evidence');
check('a measured finding without the key is refused', ids(register(without(finding(), 'evidence'))) === '1:missing-evidence');
check('evidence that is not a list is refused', ids(register(finding({ evidence: RECEIPT }))) === '1:bad-evidence');
check('a closure without a receipt is refused', ids(register(finding(), closure(THE_ID, { evidence: [] }))) === '2:missing-evidence');
check('a closure without the evidence key is refused', ids(register(finding(), without(closure(THE_ID), 'evidence'))) === '2:missing-evidence');
check('a closure on a hypothesis still needs a receipt', ids(register(finding({ basis: 'hypothesis' }), closure(THE_ID, { evidence: [] }))) === '2:missing-evidence');

for (const [label, receipt] of [
  ['a command without its exit code', { command: 'npm test' }],
  ['an exit code that is text', { command: 'npm test', exitCode: '1' }],
  ['an exit code that is fractional', { command: 'npm test', exitCode: 1.5 }],
  ['an empty command', { command: '', exitCode: 1 }],
  ['an exit code without its command', { exitCode: 1 }],
  ['an empty path', { path: '' }],
  ['an empty measurement', { measurement: ' ' }],
  ['a measurement that is not text', { measurement: 7 }],
  ['two shapes in one receipt', { path: 'a', measurement: 'b' }],
  ['an extra key', { path: 'a', note: 'b' }],
  ['an empty object', {}],
  ['a string', 'npm test'],
  ['null', null],
  ['an array', ['npm test']],
]) {
  check(`a receipt that is ${label} is refused and numbered`, ids(register(finding({ evidence: [{ path: 'ok' }, receipt] }))) === '1:bad-receipt:1');
}

check('a receipt written with its exit code first is the same receipt', ids(register(finding({ evidence: [{ exitCode: 1, command: 'x' }] }))) === '');
check('a path receipt with a key that sorts after it is refused', ids(register(finding({ evidence: [{ path: 'a', zebra: 1 }] }))) === '1:bad-receipt:0');
check('a negative exit code is a real exit code', ids(register(finding({ evidence: [{ command: 'x', exitCode: -1 }] }))) === '');
check('an exit code of zero is a real exit code', ids(register(finding({ evidence: [{ command: 'x', exitCode: 0 }] }))) === '');
check('every bad receipt is numbered', ids(register(finding({ evidence: [{}, { path: 'ok' }, {}] }))) === '1:bad-receipt:0,1:bad-receipt:2');

// The rules across lines.
check('the same finding twice is a duplicate id', ids(register(finding(), finding())) === `2:duplicate-id:${THE_ID}`);
check('two findings with the same scope and another summary are different', ids(register(finding(), finding({ summary: { en: 'Another one.', es: 'Otro más.' } }))) === '');
check('a closure of an unknown id is an orphan', ids(register(closure('F-00000000'))) === '1:orphan-closure');
check('a closure before its finding is an orphan', ids(register(closure(THE_ID), finding())) === '1:orphan-closure');
check('a second closure of the same finding is refused', ids(register(finding(), closure(THE_ID), closure(THE_ID, { at: '2026-10-03' }))) === `3:already-closed:${THE_ID}`);
check('a closure dated before its finding is refused', ids(register(finding(), closure(THE_ID, { at: '2026-09-30' }))) === '2:closure-before-finding');
check('a closure id of the wrong shape is refused', ids(register(finding(), closure('nope'))) === '2:bad-id');
check('a closure dated by an invalid day reports the date alone', ids(register(finding(), closure(THE_ID, { at: '2025-99-99' }))) === '2:bad-date');
check('a line of another kind is not a finding a closure can close', ids(register({ ...finding(), kind: 'note' }, closure(THE_ID))) === '1:bad-kind,2:orphan-closure');
check('problems come out in line order whichever kind they are', ids(`${JSON.stringify(finding({ basis: 'x' }))}\n{bad\n`) === '1:bad-basis,2:invalid-json');
check('a problem on a late line carries that line number', ids(register(finding(), finding({ summary: { en: 'Another one.', es: 'Otro más.' } }), finding({ basis: 'x', summary: { en: 'Third.', es: 'Tercero.' } }))) === '3:bad-basis');

// Reading.
check('an invalid JSON line is named by its number', ids(`${JSON.stringify(finding())}\n{not json\n`) === '2:invalid-json');
check('blank lines are skipped and the numbering keeps counting them', ids(`\n${JSON.stringify(finding({ basis: 'x' }))}\n`) === '2:bad-basis');
check('CRLF line endings are read the same', ids(register(finding(), closure(THE_ID)).replaceAll('\n', '\r\n')) === '');
check('a final line without a newline is read', ids(JSON.stringify(finding())) === '');
check('readRegister keeps the record and its line', (() => {
  const { entries, problems } = readRegister(`\n${JSON.stringify(finding())}\n{bad\n`);

  return entries.length === 1 && entries[0].line === 2 && entries[0].record.id === THE_ID && problems.length === 1 && problems[0].line === 3 && problems[0].id === 'invalid-json';
})());
check('an invalid line does not stop the later lines from being read', ids(`{bad\n${JSON.stringify(finding({ basis: 'x' }))}\n`) === '1:invalid-json,2:bad-basis');

// The open findings.
const SECOND = finding({ scope: 'repo-b/src/b.ts', summary: { en: 'Second gap.', es: 'Segunda carencia.' } });
const THIRD = finding({ scope: 'repo-b/src/c.ts', summary: { en: 'Third gap.', es: 'Tercera carencia.' } });
const entriesOf = (...records) => readRegister(register(...records)).entries;

check('every finding is open without a closure', openFindings(entriesOf(finding(), SECOND, THIRD)).map((record) => record.id).join() === [THE_ID, SECOND.id, THIRD.id].join());
check('a closed finding leaves the open ones and the order stays', openFindings(entriesOf(finding(), SECOND, THIRD, closure(SECOND.id))).map((record) => record.id).join() === [THE_ID, THIRD.id].join());
check('a closure never counts as an open finding', openFindings(entriesOf(finding(), closure(THE_ID))).length === 0);
check('a closure of another id closes nothing', openFindings(entriesOf(finding(), closure('F-00000000'))).length === 1);
check('a line of another kind is not an open finding', openFindings(entriesOf({ ...finding(), kind: 'note' })).length === 0);
check('an empty register has no open finding', openFindings([]).length === 0);

// A row reads as the house form.
check('a row names the id, the date, the basis, the scope and the source', (() => {
  const row = rowOf(finding());

  return [THE_ID, '2026-10-01', 'measured', 'repo-b/src/a.ts', 'ts-strict-type-checked'].every((part) => row.includes(part));
})());
check('a row ends with the summary in the house bilingual form', rowOf(finding()).endsWith(render(SUMMARY)));

// Appending.
const NEW_FINDING = { kind: 'finding', scope: 'repo-b/src/a.ts', source: 'ts-strict-type-checked', basis: 'measured', summary: SUMMARY, evidence: [RECEIPT] };
const dirA = freshRoot();
const fileA = path.join(dirA, 'deep', 'folder', 'FINDINGS.jsonl');
const first = appended(fileA, NEW_FINDING, { now: () => '2026-10-05' });

check('append creates the folder and the file', first.ok === true && existsSync(fileA));
check('append writes the keys in the order of the schema', textOf(fileA).startsWith('{"v":1,"kind":"finding","id":"F-cbf84fe8","at":"2026-10-05","scope":"repo-b/src/a.ts","source":"ts-strict-type-checked","basis":"measured","summary":'));
check('append returns the record it wrote', first.ok && first.record.id === THE_ID && first.record.v === 1 && first.record.at === '2026-10-05' && first.record.kind === 'finding');
check('append writes one JSON line ending in a newline', textOf(fileA) === `${JSON.stringify(first.record)}\n`);
check('the written register validates', ids(textOf(fileA)) === '');

const again = appended(fileA, NEW_FINDING, { now: () => '2026-10-06' });

check('the same finding again is refused as a duplicate id', again.ok === false && again.problems.some((problem) => problem.id === 'duplicate-id'));
check('a refused finding writes nothing', textOf(fileA) === `${JSON.stringify(first.record)}\n`);

const closing = appended(fileA, { kind: 'closure', id: THE_ID, summary: { en: 'Fixed.', es: 'Corregido.' }, evidence: [{ command: 'npx eslint src/a.ts', exitCode: 0 }] }, { now: () => '2026-10-07' });

check('a closure is appended', closing.ok === true && textOf(fileA).split('\n').filter((line) => line !== '').length === 2);
check('the register with its closure validates and has no open finding', ids(textOf(fileA)) === '' && openFindings(readRegister(textOf(fileA)).entries).length === 0);
check('a second closure is refused', appended(fileA, { kind: 'closure', id: THE_ID, summary: { en: 'Fixed.', es: 'Corregido.' }, evidence: [RECEIPT] }, { now: () => '2026-10-08' }).ok === false);
check('a closure of an unknown finding is refused', appended(fileA, { kind: 'closure', id: 'F-00000000', summary: { en: 'Fixed.', es: 'Corregido.' }, evidence: [RECEIPT] }, { now: () => '2026-10-08' }).problems?.some((problem) => problem.id === 'orphan-closure') === true);

const dirB = freshRoot();
const fileB = path.join(dirB, 'FINDINGS.jsonl');
const refused = appended(fileB, { ...NEW_FINDING, basis: undefined }, { now: () => '2026-10-05' });

check('an invalid record is refused with its problems', refused.ok === false && refused.problems.some((problem) => problem.id === 'bad-basis'));
check('an invalid record does not create the file', !existsSync(fileB));
check('a caller cannot backdate a record', appended(fileB, { ...NEW_FINDING, at: '1999-01-01' }, { now: () => '2026-10-05' }).record?.at === '2026-10-05');
check('a caller cannot choose the id of a finding', (() => {
  const dir = freshRoot();
  const result = appended(path.join(dir, 'f.jsonl'), { ...NEW_FINDING, id: 'F-00000000' }, { now: () => '2026-10-05' });

  return result.ok === true && result.record.id === THE_ID;
})());
check('a caller cannot choose the version', appended(path.join(freshRoot(), 'f.jsonl'), { ...NEW_FINDING, v: 9 }, { now: () => '2026-10-05' }).record?.v === 1);
check('an unknown key in the input is refused', appended(path.join(freshRoot(), 'f.jsonl'), { ...NEW_FINDING, ignore: true }, { now: () => '2026-10-05' }).problems?.some((problem) => problem.id === 'unknown-key') === true);
check('the date defaults to today in ISO form', /^\d{4}-\d{2}-\d{2}$/.test(appended(path.join(freshRoot(), 'f.jsonl'), NEW_FINDING).record?.at ?? ''));

const dirC = freshRoot();
const fileC = path.join(dirC, 'FINDINGS.jsonl');

writeFileSync(fileC, '{broken\n');

const corrupt = appended(fileC, NEW_FINDING, { now: () => '2026-10-05' });

check('a corrupt register is not extended', corrupt.ok === false && corrupt.problems.some((problem) => problem.id === 'invalid-json') && textOf(fileC) === '{broken\n');

const dirD = freshRoot();
const fileD = path.join(dirD, 'FINDINGS.jsonl');

writeFileSync(fileD, JSON.stringify(finding({ scope: 'other', summary: { en: 'Old one.', es: 'Una vieja.' } })));
appended(fileD, NEW_FINDING, { now: () => '2026-10-05' });

check('a register without its final newline is extended on a new line', ids(textOf(fileD)) === '' && textOf(fileD).split('\n').filter((line) => line !== '').length === 2);

// The command line.
/** Runs the CLI in `cwd`; returns the exit code and the printed lines. @es Corre el CLI. */
function run(args, cwd, now = () => '2026-10-05') {
  const out = [];
  const sink = { log: (line) => out.push(String(line)), error: (line) => out.push(String(line)) };
  let status;

  try {
    status = main(args, { cwd, now, sink });
  } catch (error) {
    status = `threw:${error.message}`;
  }

  return { status, lines: out.join('\n').split('\n').filter((line) => line.trim() !== '') };
}

const project = freshRoot();

check('listing a project with no register is zero findings, said bilingually', (() => {
  const result = run(['list'], project);

  return result.status === 0 && result.lines.length >= 1 && result.lines.every((line) => line.includes(' @es '));
})());

const added = run(['add', '--scope', 'repo-b/src/a.ts', '--source', 'ts-strict-type-checked', '--basis', 'measured', '--en', SUMMARY.en, '--es', SUMMARY.es, '--cmd', 'npx eslint src/a.ts', '--exit', '1', '--path', 'etc/report.txt', '--measurement', '3 of 7 files fail'], project);

check('add records a finding in the default register and exits 0', added.status === 0 && existsSync(path.join(project, '.claude', 'FINDINGS.jsonl')));
check('add says what it recorded, with the id, bilingually', added.lines.some((line) => line.includes(THE_ID)) && added.lines.every((line) => line.includes(' @es ')));
check('add writes every receipt it was given', (() => {
  const record = readRegister(textOf(path.join(project, '.claude', 'FINDINGS.jsonl'))).entries[0]?.record;

  return JSON.stringify(record?.evidence) === JSON.stringify([{ command: 'npx eslint src/a.ts', exitCode: 1 }, { path: 'etc/report.txt' }, { measurement: '3 of 7 files fail' }]);
})());

run(['add', '--scope', 'repo-b/src/b.ts', '--source', 'review', '--basis', 'hypothesis', '--en', 'Second gap.', '--es', 'Segunda carencia.'], project);

const listed = run(['list'], project);

check('list prints one row per open finding and a count', listed.status === 0 && listed.lines.length === 3 && listed.lines.some((line) => line.includes('2 open finding(s)')));
check('every listed line is bilingual', listed.lines.every((line) => line.includes(' @es ')));
check('list names the id and the scope of a finding', listed.lines.some((line) => line.includes(THE_ID) && line.includes('repo-b/src/a.ts')));
check('a hypothesis is listed as one', listed.lines.some((line) => line.includes('hypothesis') && line.includes('repo-b/src/b.ts')));

const closed = run(['close', '--id', THE_ID, '--en', 'Fixed in the source.', '--es', 'Corregido en el código.', '--cmd', 'npx eslint src/a.ts', '--exit', '0'], project);
const afterClose = run(['list'], project);

check('close records the closure and exits 0', closed.status === 0 && closed.lines.some((line) => line.includes(THE_ID)));
check('close says it closed, add says it recorded', closed.lines.some((line) => line.startsWith('closed')) && added.lines.some((line) => line.startsWith('recorded')));
check('a closed finding leaves the list', afterClose.lines.some((line) => line.includes('1 open finding(s)')) && !afterClose.lines.some((line) => line.includes('repo-b/src/a.ts')));
check('closing without a receipt is refused with exit 1', run(['close', '--id', THE_ID, '--en', 'Again.', '--es', 'Otra vez.'], project).status === 1);
check('closing an unknown finding is refused with exit 1 and says why', (() => {
  const result = run(['close', '--id', 'F-00000000', '--en', 'x.', '--es', 'y.', '--path', 'a'], project);

  return result.status === 1 && result.lines.some((line) => line.includes('closure')) && result.lines.every((line) => line.includes(' @es '));
})());
check('add with a missing basis is refused with exit 1 and names the problem', (() => {
  const result = run(['add', '--scope', 's', '--source', 'x', '--en', 'One.', '--es', 'Uno.'], project);

  return result.status === 1 && result.lines.some((line) => line.includes('basis'));
})());
check('add with a non-numeric exit code is refused with exit 1', run(['add', '--scope', 's', '--source', 'x', '--basis', 'measured', '--en', 'One.', '--es', 'Uno.', '--cmd', 'x', '--exit', 'abc'], project).status === 1);
check('add with a command and no exit code is a usage error that names the flag left alone', (() => {
  const result = run(['add', '--scope', 's', '--source', 'x', '--basis', 'measured', '--en', 'One.', '--es', 'Uno.', '--cmd', 'x'], project);

  return result.status === 2 && result.lines.some((line) => line.includes('--cmd'));
})());
check('add with an exit code and no command is a usage error that names the flag left alone too', (() => {
  const result = run(['add', '--scope', 's', '--source', 'x', '--basis', 'measured', '--en', 'One.', '--es', 'Uno.', '--exit', '1'], project);

  return result.status === 2 && result.lines.some((line) => line.includes('--exit'));
})());
check('a refused add does not change the register', textOf(path.join(project, '.claude', 'FINDINGS.jsonl')).split('\n').filter((line) => line !== '').length === 3);

const validOnly = run(['validate'], project);

check('validate of a correct register exits 0, bilingually', validOnly.status === 0 && validOnly.lines.every((line) => line.includes(' @es ')));
check('validate prints its verdict and no finding', validOnly.lines.length === 1 && validOnly.lines[0].includes('valid'));
check('validate of a project with no register says there is nothing to validate', run(['validate'], freshRoot()).lines.some((line) => line.includes('nothing to validate')));

const badProject = freshRoot();

mkdirSync(path.join(badProject, '.claude'));
writeFileSync(path.join(badProject, '.claude', 'FINDINGS.jsonl'), `${JSON.stringify(finding({ basis: 'x' }))}\n`);

const invalid = run(['validate'], badProject);

check('validate of a register with a problem exits 1 and names its line', invalid.status === 1 && invalid.lines.some((line) => line.includes('1') && line.includes('basis')));
check('every validate line is bilingual', invalid.lines.every((line) => line.includes(' @es ')));
check('list of an invalid register exits 1 rather than listing it', run(['list'], badProject).status === 1);

const custom = freshRoot();

writeFileSync(path.join(custom, 'mine.jsonl'), register(finding()));

check('--file reads another register', run(['list', '--file', 'mine.jsonl'], custom).lines.some((line) => line.includes('1 open finding(s)')));
check('--file takes an absolute path', run(['list', '--file', path.join(custom, 'mine.jsonl')], freshRoot()).lines.some((line) => line.includes('1 open finding(s)')));
check('without --file the default register is read', run(['list'], custom).lines.every((line) => !line.includes('open finding(s)') || line.includes('0 open')));
check('add honours --file', (() => {
  const dir = freshRoot();

  run(['add', '--file', 'x/y.jsonl', '--scope', 's', '--source', 'src', '--basis', 'hypothesis', '--en', 'One.', '--es', 'Uno.'], dir);

  return existsSync(path.join(dir, 'x', 'y.jsonl')) && !existsSync(path.join(dir, '.claude'));
})());

// Usage errors.
check('no command is a usage error', run([], project).status === 2);
check('an unknown command is a usage error', run(['frobnicate'], project).status === 2);
check('an unknown flag is a usage error', run(['list', '--bogus', 'x'], project).status === 2);
check('a flag without its value is a usage error', run(['list', '--file'], project).status === 2);
check('a usage error is printed bilingually', run([], project).lines.every((line) => line.includes(' @es ')));
check('a flag that belongs to another command is a usage error', run(['list', '--scope', 'x'], project).status === 2);
check('a value without its flag is a usage error', run(['list', 'stray'], project).status === 2);
check('a flag given twice is a usage error', run(['list', '--file', 'a', '--file', 'b'], project).status === 2);
check('--path and --measurement may repeat', run(['add', '--scope', 's', '--source', 'x', '--basis', 'measured', '--en', 'Twice.', '--es', 'Dos veces.', '--path', 'a', '--path', 'b', '--measurement', 'c', '--measurement', 'd'], freshRoot()).status === 0);
check('--cmd given twice is a usage error', run(['add', '--scope', 's', '--source', 'x', '--basis', 'measured', '--en', 'One.', '--es', 'Uno.', '--cmd', 'x', '--cmd', 'y', '--exit', '1'], project).status === 2);
check('a usage error names the offending input', run(['list', '--bogus', 'x'], project).lines.some((line) => line.includes('--bogus')));

// The message table.
check('every message of the table has both halves, different and with the same placeholders', messageProblems(MESSAGES).length === 0);
check('every problem id has a message', ['invalid-json', 'not-object', 'bad-version', 'bad-kind', 'unknown-key', 'bad-id', 'id-mismatch', 'bad-date', 'missing-scope', 'missing-source', 'bad-basis', 'summary-not-bilingual', 'summary-multiline', 'missing-evidence', 'bad-evidence', 'bad-receipt', 'duplicate-id', 'orphan-closure', 'already-closed', 'closure-before-finding'].every((id) => MESSAGES[`problem.${id}`] !== undefined));
check('the Spanish halves keep their accents', Object.values(MESSAGES).some((message) => /[áéíóúñ]/.test(message.es)));

if (failures.length > 0) {
  console.error(`gates-kit findings-register selftest FAILED @es el selftest de findings-register de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit findings-register selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
