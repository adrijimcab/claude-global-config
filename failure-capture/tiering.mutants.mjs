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

  // --- the split is the single RULE: label, never a guess
  ['a body with two RULE: labels is split anyway', LINE, 'if (text.indexOf(RULE_LABEL, at + 1) !== -1) return refuse(', 'if (false) return refuse('],
  ['a body with no RULE: label is split anyway', LINE, 'if (at === -1) return refuse(', 'if (false) return refuse('],

  // --- what counts as already shortened
  ['a stub is not recognised as shortened, so a second condense rewrites it', LINE, 'if (parseStub(line) !== undefined) return true;', 'if (false) return true;'],
  ['a fat line counts as shortened', LINE, 'return split.ok && evidenceKeyOf(split.rule) !== undefined;', 'return split.ok;'],
  ['a fat promoted line reads as a stub', LINE, 'return entry.body.startsWith(lead) && entry.body.length > lead.length ?', 'return true ?'],
  ['the minimal stub forgets its mechanism path', LINE, '${mechanism === undefined ? NO_MECHANISM : `mechanism ${mechanism}`}', '${NO_MECHANISM}'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/tiering.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
