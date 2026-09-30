#!/usr/bin/env node
/**
 * Proof that a PROMOTION may shorten a ledger line to its minimal stub without losing the line: the
 * conservation check admits exactly the promotion date and mechanism it is GIVEN (and nothing else new),
 * the evidence store keeps the closure note beside the archived line, and `promotedStub` archives, re-reads
 * and proves before it answers. Every fixture is CONSTRUCTED in a temporary directory: the real ledger and
 * evidence are never read.
 *
 * @es Prueba de que una PROMOCIÓN puede acortar una línea del ledger a su muñón mínimo sin perderla: la
 * conservación admite exactamente la fecha y el mecanismo de promoción que RECIBE (y nada más nuevo), el
 * almacén de evidencia guarda la nota de cierre junto a la línea archivada, y `promotedStub` archiva,
 * relee y prueba antes de responder. Todo fixture se CONSTRUYE en un directorio temporal: nunca se lee el
 * ledger ni la evidencia reales.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { holdsWholeLine, proveConservation } from './conservation.mjs';
import { appendEvidence, evidenceFile, readEvidence } from './evidence.mjs';
import { minimalStub } from './ledger-line.mjs';
import { promotedStub } from './promotion.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'promotion-selftest-'));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

const KEY = 'sample-lesson';
const MARKER = `<!--fc:${KEY}#2-->`;
const ORIGINAL = `- [global] 2026-06-30 — La lección de la señal: corregir el año → causa → RULE: nunca uses ñ sin verificar la tilde. ${MARKER}`;
const DATE = '2026-09-30';
const MECHANISM = '.claude/sample-guard/guard.mjs';
const REASON = 'a claim written in prose cannot be detected by any hook; measured 0 of 6 recall';
const EVIDENCE = `# header\n\n## Ledger line archived ${DATE} (promoted)\n\n${ORIGINAL}\n`;
const STUB = minimalStub({ date: DATE, mechanism: MECHANISM, marker: MARKER }).line;
const STUB_NONE = minimalStub({ date: DATE, marker: MARKER }).line;
const EXPECTED_STUB = `- [promoted] ${DATE} — ${KEY}: mechanism ${MECHANISM} ${MARKER}`;

// --- conservation admits the promotion it is given, and only that --------------------------------------
const promotion = { date: DATE, mechanism: MECHANISM };
const proves = (shortened, given = promotion, { evidence = EVIDENCE, original = ORIGINAL } = {}) => proveConservation({ original, shortened, evidence, promotion: given });
const deficitsOf = (result) => (result.ok ? '' : result.deficits.join(' | '));

check('the stub shape is exactly "- [promoted] date — key: mechanism path marker"', STUB === EXPECTED_STUB, STUB);
check('a promotion admits the stub carrying the GIVEN date, the GIVEN mechanism and the original marker', proves(STUB).ok === true, deficitsOf(proves(STUB)));
check('a promotion with no mechanism admits the no-mechanism stub', proves(STUB_NONE, { date: DATE }).ok === true, deficitsOf(proves(STUB_NONE, { date: DATE })));
check('WITHOUT a promotion the same stub is refused: the condense path still refuses a changed date', !proveConservation({ original: ORIGINAL, shortened: STUB, evidence: EVIDENCE }).ok);
check('...and a promoted stub shortened to another date by condense is still refused', !proveConservation({ original: STUB, shortened: minimalStub({ date: '2026-10-05', mechanism: MECHANISM, marker: MARKER }).line, evidence: `${STUB}\n` }).ok);

const strays = [
  ['another date than the promotion date', minimalStub({ date: '2026-10-05', mechanism: MECHANISM, marker: MARKER }).line],
  ['the ORIGINAL date instead of the promotion date', minimalStub({ date: '2026-06-30', mechanism: MECHANISM, marker: MARKER }).line],
  ['another mechanism than the given one', minimalStub({ date: DATE, mechanism: '.claude/other/guard.mjs', marker: MARKER }).line],
  ['extra text after the mechanism', minimalStub({ date: DATE, mechanism: `${MECHANISM} and more`, marker: MARKER }).line],
  ['a mechanism when none was given', STUB],
  ['another counter', STUB.replace('#2', '#3')],
  ['no marker', STUB.replace(` ${MARKER}`, '')],
  ['a tiered line instead of a stub', `- [global] 2026-06-30 — RULE: nunca uses ñ sin verificar la tilde. Evidence: lessons/evidence/${KEY}.md ${MARKER}`],
  ['the original itself', ORIGINAL],
];

for (const [name, shortened] of strays) {
  const given = name === 'a mechanism when none was given' ? { date: DATE } : promotion;

  check(`a promotion refuses a stub with ${name}`, !proves(shortened, given).ok && deficitsOf(proves(shortened, given)).includes('holds text the original does not'), deficitsOf(proves(shortened, given)));
}

check('a promotion whose mechanism is missing from the stub is refused', !proves(STUB_NONE).ok);
check('a promotion still needs the whole original archived: a truncated copy is refused and named', deficitsOf(proves(STUB, promotion, { evidence: EVIDENCE.replace(ORIGINAL, ORIGINAL.slice(0, 60)) })).includes(`first 60 of ${String(ORIGINAL.length)}`));
check('...and an absent evidence file is refused', deficitsOf(proveConservation({ original: ORIGINAL, shortened: STUB, evidence: undefined, promotion })).includes('absent'));
check('a promotion with a malformed date is refused, in both languages', deficitsOf(proves(STUB, { date: 'today', mechanism: MECHANISM })).includes('date must be YYYY-MM-DD') && deficitsOf(proves(STUB, { date: 'today', mechanism: MECHANISM })).includes(' @es '));
check('a promotion whose mechanism holds a newline is refused', !proves(STUB, { date: DATE, mechanism: 'a\nb' }).ok);
check('a promotion of an original with no marker is refused', deficitsOf(proves(STUB, promotion, { original: ORIGINAL.replace(` ${MARKER}`, ''), evidence: `${ORIGINAL.replace(` ${MARKER}`, '')}\n` })).includes('marker is required'));
check('a promotion of an original that is already a stub re-promotes it with the new date', proves(minimalStub({ date: DATE, marker: MARKER }).line, { date: DATE }, { original: minimalStub({ date: '2026-09-01', mechanism: MECHANISM, marker: MARKER }).line, evidence: `${minimalStub({ date: '2026-09-01', mechanism: MECHANISM, marker: MARKER }).line}\n` }).ok === true);

// --- the evidence store keeps a closure note beside the archived line ---------------------------------
const ledger = path.join(scratch, 'home', 'lessons-ledger.md');
const evidenceOf = (key) => (existsSync(evidenceFile(ledger, key)) ? readFileSync(evidenceFile(ledger, key), 'utf8') : '');
const NOTE = `Promoted ${DATE} to a file; no mechanism is possible: ${REASON}`;
const noted = appendEvidence({ ledgerFile: ledger, key: KEY, line: ORIGINAL, date: DATE, kind: 'promoted', note: NOTE });

check('a note is written after the archived line, inside its block, as a whole line', noted.ok && noted.appended && evidenceOf(KEY).includes(`(promoted)\n\n${ORIGINAL}\n\n${NOTE}\n`) && holdsWholeLine(evidenceOf(KEY), NOTE), evidenceOf(KEY));
const afterNote = evidenceOf(KEY);
const repeated = appendEvidence({ ledgerFile: ledger, key: KEY, line: ORIGINAL, date: '2026-10-01', kind: 'promoted', note: NOTE });
check('the same line and the same note again write nothing', repeated.ok && !repeated.appended && evidenceOf(KEY) === afterNote, JSON.stringify(repeated));
const renoted = appendEvidence({ ledgerFile: ledger, key: KEY, line: ORIGINAL, date: '2026-10-01', kind: 'promoted', note: `${NOTE} again` });
check('the same line with a NEW note appends the note only: the line is not archived twice, prior bytes kept', renoted.ok && renoted.appended && evidenceOf(KEY).startsWith(afterNote) && evidenceOf(KEY).split(ORIGINAL).length === 2 && holdsWholeLine(evidenceOf(KEY), `${NOTE} again`), evidenceOf(KEY));
check('a note holding a newline is refused and writes nothing', !appendEvidence({ ledgerFile: ledger, key: 'other-key', line: ORIGINAL, date: DATE, kind: 'promoted', note: 'a\nb' }).ok && !existsSync(evidenceFile(ledger, 'other-key')));
check('an empty note is refused', !appendEvidence({ ledgerFile: ledger, key: 'other-key', line: ORIGINAL, date: DATE, kind: 'promoted', note: '' }).ok);
check('no note: the block is what it always was', (() => {
  appendEvidence({ ledgerFile: ledger, key: 'plain-key', line: ORIGINAL, date: DATE, kind: 'promoted' });

  return evidenceOf('plain-key').endsWith(`(promoted)\n\n${ORIGINAL}\n`);
})());

// --- promotedStub: archive, re-read, prove, then answer --------------------------------------------------
const home = (name) => path.join(scratch, name, 'lessons-ledger.md');
const ask = (name, patch = {}) => promotedStub({ ledgerFile: home(name), original: ORIGINAL, date: DATE, closure: { kind: 'mechanism', path: MECHANISM }, where: 'the file F', ...patch });

{
  const result = ask('mechanism');
  const evidence = readEvidence(home('mechanism'), KEY) ?? '';

  check('promotedStub answers the exact minimal stub of a mechanism closure', result.ok && result.line === EXPECTED_STUB, JSON.stringify(result));
  check('...having archived the WHOLE original line in the evidence', holdsWholeLine(evidence, ORIGINAL), evidence);
  check('...with a closure note naming where the rule landed and how it closed', evidence.includes(`Promoted ${DATE} to the file F; closed by mechanism ${MECHANISM} (selftest run, exit 0)`), evidence);
}

{
  const result = ask('reason', { closure: { kind: 'no-mechanism', reason: REASON } });
  const evidence = readEvidence(home('reason'), KEY) ?? '';

  check('promotedStub answers the no-mechanism stub, which does NOT carry the reason', result.ok && result.line === STUB_NONE && !result.line.includes(REASON), JSON.stringify(result));
  check('...and the reason is in the evidence VERBATIM', evidence.includes(`no mechanism is possible: ${REASON}`), evidence);
}

{
  const result = ask('again', { original: minimalStub({ date: '2026-09-01', mechanism: '.claude/old/guard.mjs', marker: MARKER }).line });

  check('promotedStub re-promotes a lesson whose line is already a stub: the old stub is archived, the new one answered', result.ok && result.line === EXPECTED_STUB && holdsWholeLine(readEvidence(home('again'), KEY) ?? '', minimalStub({ date: '2026-09-01', mechanism: '.claude/old/guard.mjs', marker: MARKER }).line), JSON.stringify(result));
}

const refusedAsk = (name, patch, fragment) => {
  const result = ask(name, patch);

  check(`promotedStub refuses ${name}, naming the reason`, result.ok === false && result.problem.includes(fragment), JSON.stringify(result));
  check(`...in both languages, and says the ledger was not changed`, result.problem.includes(' @es ') && result.problem.includes('not promoted') && result.problem.includes('no se promovió'), result.problem);

  return result;
};

{
  mkdirSync(evidenceFile(home('directory'), KEY), { recursive: true });
  refusedAsk('directory', {}, 'could not be written');
}

refusedAsk('a mechanism holding a newline', { closure: { kind: 'mechanism', path: 'a\nb' } }, 'mechanism must be one line');
check('...and a refused stub archived nothing', !existsSync(evidenceFile(home('a mechanism holding a newline'), KEY)));
refusedAsk('a malformed date', { date: 'today' }, 'date must be YYYY-MM-DD');
refusedAsk('an original with no marker', { original: ORIGINAL.replace(` ${MARKER}`, '') }, 'no marker');

{
  // The proof must read the evidence from DISK: a store that answers as if the write had worked cannot satisfy it.
  // @es La prueba debe leer la evidencia de DISCO: un almacén que responde como si la escritura hubiera ido bien no la satisface.
  const liar = { appendEvidence: () => ({ ok: true, appended: true }), readEvidence: () => undefined };
  const result = ask('liar', { io: liar });

  check('promotedStub refuses when the evidence re-read from disk does not hold the original', result.ok === false && result.problem.includes('absent'), JSON.stringify(result));
  check('...and a write that reported success is not trusted: nothing was archived', !existsSync(evidenceFile(home('liar'), KEY)));
}

rmSync(scratch, { recursive: true, force: true });

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture promotion selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
