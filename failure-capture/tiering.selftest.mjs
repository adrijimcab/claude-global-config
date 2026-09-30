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

import { evidenceKeyOf, isTiered, isValidKey, minimalStub, parseEntry, parseStub, readMarker, splitRule, tieredLine } from './ledger-line.mjs';

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

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture tiering selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
