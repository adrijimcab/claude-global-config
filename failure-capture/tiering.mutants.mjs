#!/usr/bin/env node
/**
 * The decisions of the line grammar, the evidence store and the conservation check, each broken once, that
 * `tiering.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 * This is the campaign that proves a LOSSY rewrite goes red: a mutant that lets text be dropped, altered or
 * invented without the selftest noticing would let the ledger lose lessons in silence.
 *
 * @es Las decisiones de la gramática de línea, el almacén de evidencia y la comprobación de conservación,
 * rotas una a una. Es la campaña que prueba que una reescritura CON PÉRDIDA da rojo: un mutante que deje
 * perder, alterar o inventar texto sin que el selftest lo note dejaría al ledger perder lecciones en silencio.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const LINE = 'failure-capture/ledger-line.mjs';
const STORE = 'failure-capture/evidence.mjs';
const PROOF = 'failure-capture/conservation.mjs';
const CAPTURE = 'failure-capture/tiered-capture.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  // --- the marker grammar is byte-stable
  ['a marker with a count below one is read as a marker', LINE, 'if (!Number.isInteger(count) || count < 1) return undefined;', 'if (!Number.isInteger(count)) return undefined;'],
  ['the builder drops the marker it was given', LINE, "${marker === undefined ? '' : ` ${marker}`}", "${''}"],
  ['the builder invents a marker for a marker-less line', LINE, "${marker === undefined ? '' : ` ${marker}`}", "${marker === undefined ? ' <!--fc:invented-key#1-->' : ` ${marker}`}"],
  ['a marker that is not the whole marker string is accepted', LINE, 'found.open === 0 && found.close === marker.length && isValidKey(found.key)', 'found.open === 0 && isValidKey(found.key)'],
  ['the pointer key may differ from the key of the marker', LINE, 'marker !== undefined && keyOfMarker(marker) !== key ? refuse(', 'false ? refuse('],
  ['a marker followed by more text still ends the line', LINE, 'found.close !== line.length || found.open <= bodyStart', 'found.open <= bodyStart'],
  ['a marker glued to the text before it is accepted', LINE, " || line[found.open - 1] !== ' ') return refuse(", ') return refuse('],

  // --- the builder owns the label and refuses what it cannot write faithfully
  ['the builder forgets to write the RULE: label', LINE, '${RULE_LABEL}${rule}${POINTER_LEAD}', '${rule}${POINTER_LEAD}'],
  ['the builder drops the recurrence tally', LINE, "${tally === undefined ? '' : `${tally} `}", "${''}"],
  ['a newline is accepted inside a one-line entry', LINE, "if (text.includes('\\n') || text.includes('\\r')) return refuse(", 'if (false) return refuse('],
  ['a marker opener is accepted inside the text', LINE, 'if (text.includes(MARK_OPEN)) return refuse(', 'if (false) return refuse('],
  ['a RULE: inside the rule is accepted, so the line reads back with two labels', LINE, "(rule.includes('RULE:') ? refuse(", '(false ? refuse('],
  ['a tally that is not (×N) is accepted', LINE, 'tally === undefined || tallyOf(`${String(tally)} `) === tally ? undefined', 'true ? undefined'],
  ['a non-numeric tally is read as a tally', LINE, '[...body.slice(2, close)].every((character) => DIGITS.includes(character)) ? body.slice(0, close + 1)', 'true ? body.slice(0, close + 1)'],

  // --- the pointer is read by one function, the builder's own shape
  ['a pointer is read where it does not start', LINE, 'if (!text.startsWith(lead, from)) return undefined;', 'if (false) return undefined;'],
  ['a pointer under a key that is not valid is read', LINE, 'return isValidKey(key) ? { key, end: keyEnd + POINTER_END.length } : undefined;', 'return { key, end: keyEnd + POINTER_END.length };'],
  ['a pointer that ends before the rule does is the rule\'s pointer', LINE, 'return pointer?.end === rule.length ? pointer.key : undefined;', 'return pointer?.key;'],
  ['the file a pointer points at is not named by its key', LINE, 'export const evidenceNameOf = (key) => `${key}${POINTER_END}`;', 'export const evidenceNameOf = (key) => key;'],

  // --- the split is the single RULE: label, never a guess
  ['a body with two RULE: labels is split anyway', LINE, 'if (text.indexOf(RULE_LABEL, at + 1) !== -1) return refuse(', 'if (false) return refuse('],
  ['a body with no RULE: label is split anyway', LINE, 'if (at === -1) return refuse(', 'if (false) return refuse('],

  // --- what counts as already shortened
  ['a stub is not recognised as shortened, so a second condense rewrites it', LINE, 'if (parseStub(line) !== undefined) return true;', 'if (false) return true;'],
  ['a fat line counts as shortened', LINE, 'return split.ok && evidenceKeyOf(split.rule) !== undefined;', 'return split.ok;'],
  ['a fat promoted line reads as a stub', LINE, 'return entry.body.startsWith(lead) && entry.body.length > lead.length ?', 'return true ?'],
  ['the minimal stub forgets its mechanism path', LINE, '${mechanism === undefined ? NO_MECHANISM : `mechanism ${mechanism}`}', '${NO_MECHANISM}'],

  // --- the evidence store is append-only, verbatim and never throws
  ['an existing evidence file is overwritten, not appended to', STORE, "else appendFileSync(file, block, 'utf8');", "else writeFileSync(file, block, 'utf8');"],
  ['the header is written again on every append', STORE, "else appendFileSync(file, block, 'utf8');", "else appendFileSync(file, `${header(key)}${block}`, 'utf8');"],
  ['an already archived line is archived again', STORE, 'if (archived && noted) return', 'if (false) return'],
  ['only the narrative half of the line is archived', STORE, '(${kind})\\n\\n${line}', "(${kind})\\n\\n${line.slice(0, line.indexOf('RULE: '))}"],
  ['a filesystem fault is reported as success', STORE, 'return { ok: false, problem: `the evidence could not', 'return { ok: true, file, appended: false, problem: `the evidence could not'],
  ['the evidence directory is not created', STORE, "mkdirSync(path.dirname(file), { recursive: true });", 'mkdirSync(path.dirname(file), {});'],
  ['a key that could climb out of the evidence directory is accepted', STORE, "isValidKey(key) ? undefined : 'the key must be", "true ? undefined : 'the key must be"],
  ['a multi-line text is archived as if it were one line', STORE, "!line.includes('\\n') && !line.includes('\\r') ? undefined", 'true ? undefined'],

  // --- conservation: the deficit decides, and it decides on the whole line
  ['the deficit is ignored: every shortening is accepted', PROOF, 'return deficits.length === 0 ? { ok: true } : { ok: false, deficits };', 'return { ok: true };'],
  ['containment is weakened to a substring, so a longer line holds the original', PROOF, '`\\n${text}\\n`.includes(`\\n${line}\\n`)', 'text.includes(line)'],
  ['the first and last lines of the file are not lines', PROOF, '`\\n${text}\\n`.includes(', 'text.includes('],
  ['the invention check is skipped', PROOF, 'const deficits = [...archiveDeficits(original, evidence), ...inventionDeficits(original, shortened, promotion)];', 'const deficits = [...archiveDeficits(original, evidence)];'],
  ['an absent evidence file is tolerated', PROOF, 'if (evidence === undefined) return [', 'if (evidence === undefined) return [] || ['],
  ['the marker of the shortened line is trusted instead of the original\'s', PROOF, 'tally: kept.tally, rule: kept.rule, key, marker: before.marker }', 'tally: kept.tally, rule: kept.rule, key, marker: after.marker }'],
  ['the date of the shortened line is trusted instead of the original\'s', PROOF, 'tieredLine({ scope: before.scope, date: before.date,', 'tieredLine({ scope: before.scope, date: after.date,'],
  ['the tally of the shortened line is trusted instead of the original\'s', PROOF, 'tally: kept.tally,', 'tally: splitRule(after.body).tally,'],
  ['a stub may name a mechanism the original never held', PROOF, 'if (stub.mechanism !== undefined && !original.includes(stub.mechanism)) return refuse(', 'if (false) return refuse('],
  ['the marker of a stub is trusted instead of the original\'s', PROOF, 'mechanism: stub.mechanism, marker: before.marker }', 'mechanism: stub.mechanism, marker: stub.marker }'],
  ['a refusal no longer says how far the closest line agrees', PROOF, 'Math.max(best, sharedPrefix(line, original))', 'best'],
  ['a refusal no longer names the characters that were lost', PROOF, 'filter((character) => !evidence.includes(character))', 'filter(() => false)'],
  ['the Spanish half of an unreadable original loses its reason', PROOF, '`el original no se puede leer: ${spanish}`', "'el original no se puede leer.'"],

  // --- capture --rule: a shortened line is accepted only after the proof, and the full line is the fallback
  ['a failed shortening is written anyway instead of falling back to the full line', CAPTURE, 'if (proof?.ok) return { line: built.line, tiered: true };', 'return { line: built.line, tiered: true };'],
  ['the conservation proof is skipped: a line that cannot be proved is shortened', CAPTURE, 'const proof = archived.ok ? proveConservation({ original: full, shortened: built.line, evidence: readEvidence(ledgerFile, key) }) : undefined;', 'const proof = archived.ok ? { ok: true } : undefined;'],
  ['the full line is never archived before it is shortened', CAPTURE, "const archived = built.ok ? appendEvidence({ ledgerFile, key, line: full, date, kind: 'captured' }) : built;", 'const archived = built;'],
  ['the legacy form is built as a tiered line', CAPTURE, 'if (rule === undefined) return { line:', 'if (false) return { line:'],
  ['a rule under the minimum length is accepted', CAPTURE, 'rule.trim().length < MINIMUM_RULE_LENGTH ?', 'false ?'],
  ['a newline is accepted in a capture text', CAPTURE, "text.includes('\\n') || text.includes('\\r') ?", 'false ?'],
  ['a marker opener is accepted in a capture text', CAPTURE, 'text.includes(MARK_OPEN) ?', 'false ?'],
  ['a rule carrying its own RULE: label is accepted', CAPTURE, "rule.includes('RULE:') ?", 'false ?'],
  ['the lesson is not checked for newlines or marker openers', CAPTURE, "typeof lesson === 'string' ? oneLineProblems('--lesson', lesson) : []", '[]'],
  ['a --rule flag with no value is treated as a rule', CAPTURE, "typeof rule !== 'string') return", 'false) return'],
  ['the rule never reaches the spool, so capture always writes the legacy line', COMMAND, '...(rule === undefined ? {} : { rule })', '...{}'],
  ['the fallback to the full line is not announced', COMMAND, 'if (mine.fallback !== undefined) speaker.data(', 'if (false) speaker.data('],
  ['the legacy lesson no longer has to state its RULE', COMMAND, "if (rule === undefined && typeof lesson === 'string' && !lesson.includes('RULE'))", 'if (false)'],
  ['the Spanish half of a message repeats the English parts', LINE, "halves.map(([english, spanish = english]) => spanish).join(' ')", "halves.map(([english]) => english).join(' ')"],
  ['every part of a message carries its own @es', LINE, "halves.map(([english]) => english).join(' ')} @es", "halves.map(([english, spanish]) => `${english} @es ${spanish}`).join(' ')} @es"],
  ['a recurrence no longer bumps the counter', COMMAND, 'const count = marker.count + 1;', 'const count = marker.count;'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'bilingual-output', 'mutation-proof'],
  selftest: 'failure-capture/tiering.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
