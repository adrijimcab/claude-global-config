#!/usr/bin/env node
/**
 * Proof of the three modules that let a ledger line be SHORTENED without losing its text: the line grammar
 * (`ledger-line.mjs`), the evidence store (`evidence.mjs`) and the conservation check (`conservation.mjs`).
 * Every decision is exercised in both directions — a lossy rewrite must go RED, a faithful one GREEN — and
 * every fixture is CONSTRUCTED in a temporary directory: the real ledger and evidence are never read.
 *
 * @es Prueba de los tres módulos que permiten ACORTAR una línea del ledger sin perder su texto: gramática
 * de línea, almacén de evidencia y comprobación de conservación. Cada decisión se ejerce en ambos sentidos
 * (una reescritura con pérdida debe dar ROJO, una fiel VERDE) y todo fixture se CONSTRUYE en un directorio
 * temporal: nunca se lee el ledger ni la evidencia reales.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { holdsWholeLine, proveConservation } from './conservation.mjs';
import { appendEvidence, evidenceFile, readEvidence } from './evidence.mjs';
import { evidenceKeyOf, isTiered, isValidKey, minimalStub, parseEntry, parseStub, readMarker, splitRule, tieredLine } from './ledger-line.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'tiering-selftest-'));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

const MARKER = '<!--fc:sample-lesson#4-->';
const ORIGINAL = `- [global] 2026-06-30 — (×4) La lección de la señal: corregir el año → causa → RULE: nunca uses ñ sin verificar la tilde. ${MARKER}`;
const RULE = 'nunca uses ñ sin verificar la tilde.';
const KEY = 'sample-lesson';
const SHORT = tieredLine({ scope: 'global', date: '2026-06-30', tally: '(×4)', rule: RULE, key: KEY, marker: MARKER });
const EXPECTED_SHORT = `- [global] 2026-06-30 — (×4) RULE: ${RULE} Evidence: lessons/evidence/${KEY}.md ${MARKER}`;
const EVIDENCE = `# header\n\n## Ledger line archived 2026-09-30 (condensed)\n\n${ORIGINAL}\n`;

// --- readMarker and isValidKey, moved out of capture.mjs: behaviour unchanged --------------------------
const marked = readMarker(`- [x] 2026-01-01 — a RULE: b ${MARKER}`);
check('readMarker reads key, count and the span of the marker', marked?.key === KEY && marked.count === 4 && marked.close - marked.open === MARKER.length, JSON.stringify(marked));
for (const bad of ['no marker', '<!--fc:k#-->', '<!--fc:key#0-->', '<!--fc:key#-2-->', '<!--fc:keyonly-->', '<!--fc:key#3']) check(`readMarker refuses "${bad}"`, readMarker(bad) === undefined);
for (const [key, valid] of [['abcd', true], ['a-b-1', true], ['abc', false], ['Abcd', false], ['-abcd', false], ['abcd-', false], ['a b c', false], ['../evil', false], ['a'.repeat(61), false], [undefined, false]]) check(`isValidKey(${String(key).slice(0, 8)}) is ${String(valid)}`, isValidKey(key) === valid);

// --- parseEntry / splitRule --------------------------------------------------------------------------
const entry = parseEntry(ORIGINAL);
check('parseEntry reads scope, date, body and the marker verbatim', entry.ok && entry.scope === 'global' && entry.date === '2026-06-30' && entry.marker === MARKER && entry.body.startsWith('(×4) La lección') && entry.body.endsWith('tilde.'), JSON.stringify(entry));
check('parseEntry: a marker-less line has no marker', parseEntry('- [global] 2026-06-30 — a RULE: b').marker === undefined);
for (const bad of ['# heading', '- [global] 2026-06-30 a RULE: b', '- [global] 30-06-2026 — a', `- [global] 2026-06-30 — a ${MARKER} trailing`, `- [global] 2026-06-30 — a${MARKER}`]) check(`parseEntry refuses "${bad.slice(0, 40)}"`, parseEntry(bad).ok === false, JSON.stringify(parseEntry(bad)));
const split = splitRule(entry.body);
check('splitRule keeps the tally, the narrative and the rule tail apart', split.ok && split.tally === '(×4)' && split.narrative === 'La lección de la señal: corregir el año → causa → ' && split.rule === RULE, JSON.stringify(split));
check('splitRule: no tally when the body does not start with one', splitRule('a RULE: b').tally === undefined && splitRule('a RULE: b').rule === 'b');
check('splitRule: "(×x)" is not a tally', splitRule('(×x) a RULE: b').tally === undefined);
check('splitRule refuses a body with no RULE: label', splitRule('a rule: b').ok === false);
check('splitRule refuses a body with two RULE: labels', splitRule('a RULE: b RULE: c').ok === false);

// --- tieredLine ----------------------------------------------------------------------------------------
check('tieredLine writes the RULE: label itself, the pointer and the marker byte for byte', SHORT.ok && SHORT.line === EXPECTED_SHORT, SHORT.line);
check('tieredLine: a marker-less line gets no marker and no tally', tieredLine({ scope: 'global', date: '2026-06-30', rule: RULE, key: 'operator-key' }).line === `- [global] 2026-06-30 — RULE: ${RULE} Evidence: lessons/evidence/operator-key.md`);
const base = { scope: 'global', date: '2026-06-30', rule: RULE, key: KEY, marker: MARKER };
const refusedBuilds = [
  ['a newline in the rule', { rule: 'one\ntwo' }],
  ['a carriage return in the rule', { rule: 'one\rtwo' }],
  ['a marker opener inside the rule', { rule: 'x <!--fc:other#1-->' }],
  ['a second RULE: label inside the rule', { rule: 'RULE: again' }],
  ['an empty rule', { rule: '' }],
  ['a date that is not a date', { date: 'June 30' }],
  ['a scope closing the bracket', { scope: 'a]b' }],
  ['a tally that is not (×N)', { tally: '(x4)' }],
  ['an invalid pointer key', { key: '../evil' }],
  ['a pointer key that is not the key of the marker', { key: 'another-key' }],
  ['a marker with text around it', { marker: `${MARKER} x` }],
  ['a marker with a count below one', { marker: '<!--fc:sample-lesson#0-->' }],
];
for (const [name, patch] of refusedBuilds) check(`tieredLine refuses ${name}`, tieredLine({ ...base, ...patch }).ok === false, JSON.stringify(tieredLine({ ...base, ...patch })));
check('tieredLine: a refusal is bilingual', String(tieredLine({ ...base, rule: 'a\nb' }).problem).includes(' @es '));

// --- minimalStub / isTiered ----------------------------------------------------------------------------
const PROMOTED_MARKER = '<!--fc:guard-that-cannot-go-red#14-->';
const withMechanism = minimalStub({ date: '2026-09-29', mechanism: '.claude/entry-point-check/check.mjs', marker: PROMOTED_MARKER });
check('minimalStub names the key, the mechanism path and the marker', withMechanism.ok && withMechanism.line === `- [promoted] 2026-09-29 — guard-that-cannot-go-red: mechanism .claude/entry-point-check/check.mjs ${PROMOTED_MARKER}`, withMechanism.line);
check('minimalStub without a mechanism says so and carries the marker', minimalStub({ date: '2026-09-29', marker: PROMOTED_MARKER }).line === `- [promoted] 2026-09-29 — guard-that-cannot-go-red: no mechanism ${PROMOTED_MARKER}`);
check('minimalStub refuses a stub with no marker', minimalStub({ date: '2026-09-29', mechanism: 'a/b.mjs' }).ok === false);
check('minimalStub refuses a newline in the mechanism', minimalStub({ date: '2026-09-29', mechanism: 'a\nb', marker: PROMOTED_MARKER }).ok === false);
check('parseStub reads a stub back', parseStub(withMechanism.line)?.mechanism === '.claude/entry-point-check/check.mjs' && parseStub(withMechanism.line)?.key === 'guard-that-cannot-go-red');
check('parseStub reads the no-mechanism form back', parseStub(`- [promoted] 2026-09-29 — guard-that-cannot-go-red: no mechanism ${PROMOTED_MARKER}`)?.mechanism === undefined);
check('parseStub refuses a fat promoted line', parseStub(`- [promoted] 2026-09-29 — guard-that-cannot-go-red: now a binding rule in a file; no mechanism is possible: x ${PROMOTED_MARKER}`) === undefined);
check('evidenceKeyOf reads the pointer key and refuses a rule without one', evidenceKeyOf(`x Evidence: lessons/evidence/${KEY}.md`) === KEY && evidenceKeyOf('x') === undefined && evidenceKeyOf('x Evidence: lessons/evidence/../evil.md') === undefined);
check('isTiered: a tiered line, a marker-less tiered line and a stub are tiered', isTiered(SHORT.line) && isTiered(`- [global] 2026-06-30 — RULE: ${RULE} Evidence: lessons/evidence/operator-key.md`) && isTiered(withMechanism.line));
check('isTiered: a fat line and a fat promoted line are not', !isTiered(ORIGINAL) && !isTiered(`- [promoted] 2026-09-29 — guard-that-cannot-go-red: now a binding rule; closed ${PROMOTED_MARKER}`));

// --- evidence store ------------------------------------------------------------------------------------
const ledger = path.join(scratch, 'home', 'lessons-ledger.md');
/** The evidence file as it is on disk, read directly (never through the module under test). @es El fichero tal cual está en disco. */
const evidenceOf = (key) => (existsSync(evidenceFile(ledger, key)) ? readFileSync(evidenceFile(ledger, key), 'utf8') : '');
check('evidenceFile sits at lessons/evidence/<key>.md beside the ledger', evidenceFile(ledger, KEY) === path.join(scratch, 'home', 'lessons', 'evidence', `${KEY}.md`));
const first = appendEvidence({ ledgerFile: ledger, key: KEY, line: ORIGINAL, date: '2026-09-30', kind: 'condensed' });
check('a first archive creates the file with a bilingual header, the block heading and the line', first.ok && first.appended && evidenceOf(KEY).includes(' @es ') && evidenceOf(KEY).includes('## Ledger line archived 2026-09-30 (condensed)\n\n') && holdsWholeLine(evidenceOf(KEY), ORIGINAL), JSON.stringify(first));
check('non-ASCII text survives the round trip byte for byte', readEvidence(ledger, KEY)?.includes('lección de la señal: corregir el año → causa') === true);
const afterFirst = evidenceOf(KEY);
const again = appendEvidence({ ledgerFile: ledger, key: KEY, line: ORIGINAL, date: '2026-10-01', kind: 'condensed' });
check('archiving the same line twice is idempotent: nothing is written', again.ok && !again.appended && evidenceOf(KEY) === afterFirst, JSON.stringify(again));
const other = `${ORIGINAL} second`;
const second = appendEvidence({ ledgerFile: ledger, key: KEY, line: other, date: '2026-10-01', kind: 'captured' });
check('a different line is APPENDED: prior content is kept byte for byte, with one header only', second.ok && second.appended && evidenceOf(KEY).startsWith(afterFirst) && holdsWholeLine(evidenceOf(KEY), other) && evidenceOf(KEY).split(' @es ').length === afterFirst.split(' @es ').length, JSON.stringify(second));
const handWritten = evidenceFile(ledger, 'hand-written');
mkdirSync(path.dirname(handWritten), { recursive: true });
writeFileSync(handWritten,'# hand written\n\nno trailing newline', 'utf8');
const third = appendEvidence({ ledgerFile: ledger, key: 'hand-written', line: ORIGINAL, date: '2026-09-30', kind: 'promoted' });
check('an existing hand-written file is never overwritten: its bytes lead the result and no header is added', third.ok && evidenceOf('hand-written').startsWith('# hand written\n\nno trailing newline\n## Ledger') && !evidenceOf('hand-written').includes(' @es '), evidenceOf('hand-written'));
check('...and its last hand-written line is still a whole line', holdsWholeLine(evidenceOf('hand-written'), 'no trailing newline'));
for (const [name, patch] of [['an invalid key', { key: '../evil' }], ['a multi-line text', { line: 'a\nb' }], ['an unknown kind', { kind: 'whatever' }], ['a bad date', { date: 'today' }]]) {
  check(`appendEvidence refuses ${name}`, appendEvidence({ ledgerFile: ledger, key: 'other-key', line: ORIGINAL, date: '2026-09-30', kind: 'condensed', ...patch }).ok === false);
}
check('...and a refused key writes nothing outside the evidence directory', !existsSync(path.join(scratch, 'home', 'lessons', 'evil.md')) && !existsSync(path.join(scratch, 'evil.md')));
mkdirSync(evidenceFile(ledger, 'is-a-directory'), { recursive: true });
const blocked = appendEvidence({ ledgerFile: ledger, key: 'is-a-directory', line: ORIGINAL, date: '2026-09-30', kind: 'condensed' });
check('an evidence path that is a DIRECTORY is a bilingual refusal, and stays a directory', !blocked.ok && blocked.problem.includes(' @es ') && statSync(evidenceFile(ledger, 'is-a-directory')).isDirectory(), JSON.stringify(blocked));
check('readEvidence: absent and unreadable evidence are both undefined', readEvidence(ledger, 'never-written') === undefined && readEvidence(ledger, 'is-a-directory') === undefined);

// --- conservation, unit states ------------------------------------------------------------------------
const proves = (evidence, shortened = SHORT.line, original = ORIGINAL) => proveConservation({ original, shortened, evidence });
const deficitsOf = (result) => (result.ok ? '' : result.deficits.join(' | '));
check('conservation holds when evidence holds the whole original and the shortening invents nothing', proves(EVIDENCE).ok === true, deficitsOf(proves(EVIDENCE)));
check('...also when the original is the first and the last line of the file, with no newline around it', proves(ORIGINAL).ok === true);
check('an absent evidence file fails, and says so', !proves(undefined).ok && deficitsOf(proves(undefined)).includes('absent'), deficitsOf(proves(undefined)));
const truncated = proves(EVIDENCE.replace(ORIGINAL, ORIGINAL.slice(0, 60)));
check('a truncated copy fails and names how far the closest line agrees', !truncated.ok && deficitsOf(truncated).includes(`first 60 of ${String(ORIGINAL.length)}`), deficitsOf(truncated));
check('a copy carrying another counter fails', !proves(EVIDENCE.replace('#4', '#3')).ok);
const flattened = proves(EVIDENCE.replace(ORIGINAL, ORIGINAL.replaceAll('ñ', 'n').replaceAll('ó', 'o')));
check('a lost non-ASCII character fails and names it', !flattened.ok && deficitsOf(flattened).includes('ñ'), deficitsOf(flattened));
check('a dropped sentence fails', !proves(EVIDENCE.replace(ORIGINAL, ORIGINAL.replace('corregir el año → causa → ', ''))).ok);
check('a longer line that merely STARTS with the original is not the original', !proves(EVIDENCE.replace(ORIGINAL, `${ORIGINAL} extra`)).ok);
check('a longer line that merely ENDS with the original is not the original', !proves(EVIDENCE.replace(ORIGINAL, `x ${ORIGINAL}`)).ok);
check('holdsWholeLine refuses an empty or a multi-line "line"', !holdsWholeLine('a\nb\n', '') && !holdsWholeLine('a\nb\n', 'a\nb'));

// --- conservation, invented or altered text -----------------------------------------------------------
const inventions = [
  ['a word added to the rule', `- [global] 2026-06-30 — (×4) RULE: ${RULE} always Evidence: lessons/evidence/${KEY}.md ${MARKER}`],
  ['a rule reworded', `- [global] 2026-06-30 — (×4) RULE: never use ñ. Evidence: lessons/evidence/${KEY}.md ${MARKER}`],
  ['a counter changed', EXPECTED_SHORT.replace('#4', '#5')],
  ['a marker dropped', EXPECTED_SHORT.replace(` ${MARKER}`, '')],
  ['a tally dropped', EXPECTED_SHORT.replace('(×4) ', '')],
  ['a date changed', EXPECTED_SHORT.replace('2026-06-30', '2026-07-01')],
  ['a scope changed', EXPECTED_SHORT.replace('[global]', '[other]')],
  ['a pointer to a key the marker does not carry', EXPECTED_SHORT.replace(`evidence/${KEY}.md`, 'evidence/another-key.md')],
  ['no pointer at all', `- [global] 2026-06-30 — (×4) RULE: ${RULE} ${MARKER}`],
  ['the original itself, which shortens nothing', ORIGINAL],
];
for (const [name, shortened] of inventions) check(`a shortened line with ${name} fails`, !proves(EVIDENCE, shortened).ok, shortened);
check('an unparsable original fails, with the reason', deficitsOf(proves('x\n', SHORT.line, 'not an entry')).includes('original'));

const MARKERLESS = '- [global] 2026-06-16 — Conflated memory with hooks -> RULE: enforce it via hook injection.';
const MARKERLESS_SHORT = tieredLine({ scope: 'global', date: '2026-06-16', rule: 'enforce it via hook injection.', key: 'operator-key' }).line;
check('a marker-less line keeps no marker: conservation holds', proves(`${MARKERLESS}\n`, MARKERLESS_SHORT, MARKERLESS).ok === true, deficitsOf(proves(`${MARKERLESS}\n`, MARKERLESS_SHORT, MARKERLESS)));
check('...and a marker invented for it fails', !proves(`${MARKERLESS}\n`, `${MARKERLESS_SHORT} ${MARKER}`, MARKERLESS).ok);

const FAT_PROMOTED = `- [promoted] 2026-09-29 — guard-that-cannot-go-red: now a binding rule in a file; closed by mechanism .claude/entry-point-check/check.mjs (selftest run, exit 0); full history in x ${PROMOTED_MARKER}`;
check('a fat promoted line shortens to a stub that names a path the original holds', proves(`${FAT_PROMOTED}\n`, withMechanism.line, FAT_PROMOTED).ok === true, deficitsOf(proves(`${FAT_PROMOTED}\n`, withMechanism.line, FAT_PROMOTED)));
const inventedPath = minimalStub({ date: '2026-09-29', mechanism: '.claude/invented/guard.mjs', marker: PROMOTED_MARKER }).line;
check('...but a stub naming a path the original never held fails', !proves(`${FAT_PROMOTED}\n`, inventedPath, FAT_PROMOTED).ok);
check('...and a stub with another counter fails', !proves(`${FAT_PROMOTED}\n`, withMechanism.line.replace('#14', '#15'), FAT_PROMOTED).ok);

// --- the lossy rewrite, on disk -----------------------------------------------------------------------
/** Archives, RE-READS from disk and proves: the order a caller must follow before it accepts a shorter line. @es Archiva, RELEE de disco y prueba. */
function shorten(key, original, shortened) {
  const archived = appendEvidence({ ledgerFile: ledger, key, line: original, date: '2026-09-30', kind: 'condensed' });

  return archived.ok ? proveConservation({ original, shortened, evidence: readEvidence(ledger, key) }) : { ok: false, deficits: [archived.problem] };
}
check('a faithful rewrite is accepted after the evidence is re-read from disk', shorten('faithful-key', ORIGINAL, SHORT.line).ok === true);
check('the same rewrite is refused when its evidence path is a directory', shorten('is-a-directory', ORIGINAL, SHORT.line).ok === false);
check('a rewrite is refused when the evidence on disk was truncated behind its back', (() => {
  writeFileSync(evidenceFile(ledger, 'truncated-key'), ORIGINAL.slice(0, 50), 'utf8');

  return proveConservation({ original: ORIGINAL, shortened: SHORT.line, evidence: readEvidence(ledger, 'truncated-key') }).ok === false;
})());

const unreadable = deficitsOf(proves('not an entry\n', SHORT.line, 'not an entry'));
check('an unreadable original carries its reason in BOTH languages', unreadable.split(' @es ')[1]?.includes('no es una línea de entrada') === true, unreadable);

// --- `capture --rule`, end to end in a constructed repository and home --------------------------------
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NARRATIVE = 'I asserted a number from memory and it was wrong, root cause: I never measured it, so the claim was a guess';
const SAID = 'always measure a number before you state it';

/** A fresh repository holding a copy of the loop, and a fresh home: the real ledger is never touched. @es Un repositorio y un home nuevos. */
function world(name) {
  const repo = path.join(scratch, name, 'repo');
  const home = path.join(scratch, name, 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');

  mkdirSync(path.join(loop, 'state'), { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  for (const file of readdirSync(HERE)) if (file.endsWith('.mjs')) copyFileSync(path.join(HERE, file), path.join(loop, file));
  writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n', 'utf8');
  writeFileSync(path.join(repo, '.claude', 'failure-capture.json'), JSON.stringify({ scope: 'b100-am-ui' }), 'utf8');

  return { repo, home, loop, ledger: path.join(home, '.claude', 'lessons-ledger.md'), evidenceDir: path.join(home, '.claude', 'lessons', 'evidence') };
}

/** Runs `capture` in a world: `{ status, out }`. @es Ejecuta `capture` en un mundo. */
function capture(target, key, extra) {
  const args = ['capture', '--key', key, '--scope', 'global', '--actor', 'orchestrator', ...extra];

  try {
    const out = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), ...args], { cwd: target.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: target.home, USERPROFILE: target.home }, timeout: 60_000 });

    return { status: 0, out };
  } catch (error) {
    return { status: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}${error?.stderr ?? ''}` };
  }
}

const readOr = (file) => (existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : '');
const noteOf = (out) => out.split('\n').find((line) => line.startsWith('NOTE')) ?? '';
const lineFor = (text, key) => text.split('\n').find((line) => line.includes(`<!--fc:${key}#`)) ?? '';

{
  const target = world('rule-new');
  const run = capture(target, 'rule-lesson', ['--lesson', NARRATIVE, '--rule', SAID]);
  const line = lineFor(readOr(target.ledger), 'rule-lesson');
  const evidence = readOr(path.join(target.evidenceDir, 'rule-lesson.md'));
  const entry = parseEntry(line);

  check('--rule (without the word RULE) is accepted', run.status === 0, run.out);
  check('...the ledger line is the tiered line: label written by the builder, pointer, marker', entry.ok && line.endsWith(` — RULE: ${SAID} Evidence: lessons/evidence/rule-lesson.md <!--fc:rule-lesson#1-->`) && !line.includes('measured'), line);
  check('...the full legacy line is a whole line of the evidence file', entry.ok && holdsWholeLine(evidence, `- [global] ${entry.date} — ${NARRATIVE} RULE: ${SAID} <!--fc:rule-lesson#1-->`), evidence);
  check('...the incident log keeps the narrative and the rule as today', readOr(path.join(target.loop, 'state', 'incidents.jsonl')).includes(JSON.stringify(NARRATIVE)) && readOr(path.join(target.loop, 'state', 'incidents.jsonl')).includes(JSON.stringify(SAID)));

  const again = capture(target, 'rule-lesson', ['--lesson', NARRATIVE, '--rule', SAID]);
  const bumped = readOr(target.ledger).split('\n').filter((one) => one.includes('rule-lesson'));

  check('a recurrence bumps the counter of the tiered line, keeping ONE line', again.status === 0 && bumped.length === 1 && bumped[0].endsWith('Evidence: lessons/evidence/rule-lesson.md <!--fc:rule-lesson#2-->'), bumped.join('\n'));
  check('...and a recurrence is announced as such', again.out.includes('RECURRENCE'), again.out);
}

{
  const target = world('legacy');
  const legacy = `${NARRATIVE} -> RULE: measure it`;
  const run = capture(target, 'legacy-lesson', ['--lesson', legacy]);
  const entry = parseEntry(lineFor(readOr(target.ledger), 'legacy-lesson'));

  check('--lesson alone writes today\'s full line and no evidence', run.status === 0 && entry.ok && entry.body === legacy && !existsSync(target.evidenceDir), run.out);
}

for (const [name, extra, fragment] of [
  ['a rule under the minimum length', ['--lesson', NARRATIVE, '--rule', 'measure it'], 'at least'],
  ['a --rule flag with no value', ['--lesson', NARRATIVE, '--rule'], 'needs a sentence'],
  ['a rule carrying a newline', ['--lesson', NARRATIVE, '--rule', `${SAID}\nsecond line`], 'one line'],
  ['a rule carrying a marker opener', ['--lesson', NARRATIVE, '--rule', `${SAID} <!--fc:other#1-->`], '<!--fc:'],
  ['a rule carrying its own RULE: label', ['--lesson', NARRATIVE, '--rule', `RULE: ${SAID}`], 'RULE:'],
  ['a lesson carrying a newline', ['--lesson', `${NARRATIVE}\nsecond line`, '--rule', SAID], 'one line'],
  ['a lesson carrying a marker opener', ['--lesson', `${NARRATIVE} <!--fc:other#1-->`, '--rule', SAID], '<!--fc:'],
  ['a legacy lesson carrying a marker opener', ['--lesson', `${NARRATIVE} -> RULE: x <!--fc:other#1-->`], '<!--fc:'],
]) {
  const target = world(`refused-${String(passed)}`);
  const run = capture(target, 'refused-lesson', extra);

  check(`refused: ${name}`, run.status === 1 && run.out.includes(fragment) && run.out.includes(' @es ') && !existsSync(target.ledger), `exit ${run.status}: ${run.out}`);
}

{
  const target = world('unwritable-evidence');
  mkdirSync(path.join(target.evidenceDir, 'blocked-lesson.md'), { recursive: true });

  const run = capture(target, 'blocked-lesson', ['--lesson', NARRATIVE, '--rule', SAID]);
  const line = lineFor(readOr(target.ledger), 'blocked-lesson');

  check('evidence that cannot be written: the FULL line is recorded, the capture still succeeds', run.status === 0 && line.includes(NARRATIVE) && line.includes(`RULE: ${SAID}`) && !line.includes('Evidence:') && readOr(target.ledger).includes('#1-->'), `${run.out}\n${line}`);
  check('...and the fallback is announced in both languages', run.out.includes('not shortened') && run.out.includes(' @es '), run.out);

  // A message is ONE English part, then ONE `@es` part carrying the same information, in the same order.
  // @es Un mensaje es UNA parte en inglés y UNA parte `@es` con la misma información, en el mismo orden.
  const [english, spanish, ...extra] = noteOf(run.out).split(' @es ');

  check('...the note is one English part, then one @es part, each carrying the evidence fault', extra.length === 0 && english.includes('not shortened') && english.includes('could not be written') && !english.includes('no se pudo') && spanish?.includes('se registró como línea completa') === true && spanish.includes('no se pudo escribir la evidencia'), noteOf(run.out));
}

{
  const target = world('unprovable');
  const twoLabels = `${NARRATIVE} -> RULE: measure`;
  const run = capture(target, 'unprovable-lesson', ['--lesson', twoLabels, '--rule', SAID]);
  const line = lineFor(readOr(target.ledger), 'unprovable-lesson');

  check('a full line whose conservation cannot be proved (two RULE: labels) is recorded in full, not shortened', run.status === 0 && line.includes(twoLabels) && !line.includes('Evidence:') && run.out.includes('not shortened'), `${run.out}\n${line}`);
  check('...and its note also has exactly one @es', noteOf(run.out).split(' @es ').length === 2, noteOf(run.out));
}

{
  const run = capture(world('legacy-refused'), 'legacy-refused', ['--lesson', NARRATIVE]);

  check('a legacy --lesson without the word RULE is still refused', run.status === 1 && run.out.includes('contain the word RULE'), run.out);
}

rmSync(scratch, { recursive: true, force: true });

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture tiering selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
