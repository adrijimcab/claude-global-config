#!/usr/bin/env node
/**
 * The decisions of the tiering verdict, each broken once, that `verdict.selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here lets a tiering lose a line, a
 * RULE sentence or an anchor, or invent text, without a deficit.
 *
 * Not a row, stated: skipping unchanged lines in the invention check is EQUIVALENT (an unchanged line is
 * always one slice of the original), so it could not be killed and proves nothing.
 *
 * @es Las decisiones del veredicto de escalonado, rotas una a una. Un punto ciego aquí deja que un escalonado
 * pierda una línea, una frase RULE o un ancla, o invente texto, sin déficit. No es fila: saltar las líneas
 * sin cambio en la comprobación de invención es EQUIVALENTE (una línea sin cambio siempre es un trozo del
 * original), así que no se puede matar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const TEXT = 'rule-tiering/instruction-text.mjs';
const RULES = 'rule-tiering/rule-sentences.mjs';
const SLICE = 'rule-tiering/slice-join.mjs';
const VERDICT = 'rule-tiering/tiering-verdict.mjs';

const MUTANTS = [
  // --- reading text
  ['CRLF is not read as LF', TEXT, "text.split('\\r\\n').join('\\n').split('\\r')", "text.split('\\r')"],
  ['a lone CR is not read as LF', TEXT, ".split('\\r').join('\\n').split('\\n')", ".split('\\n')"],
  ['folding drops the spaces between words', TEXT, 'result += pendingSpace ? ` ${character}` : character;', 'result += character;'],
  ['folding keeps leading whitespace', TEXT, 'pendingSpace = result.length > 0;', 'pendingSpace = true;'],

  // --- recognising RULE sentences
  ['`RULE,` does not open a sentence', RULES, "const OPENERS = [':', ','];", "const OPENERS = [':'];"],
  ['a letter before RULE is ignored', RULES, 'if (isWordCharacter(flat[at - 1]) || ', 'if ('],
  ['a digit before RULE is ignored', RULES, " || (character >= '0' && character <= '9')", ''],
  ['no opener is required after RULE', RULES, ' || !OPENERS.includes(flat[at + MARK.length])', ''],
  ['a dot inside backticks ends the sentence', RULES, 'else if (!inCode && TERMINATORS', 'else if (TERMINATORS'],
  ['a dot inside a word ends the sentence', RULES, '(at + 1 === text.length || AFTER_TERMINATOR.includes(text[at + 1]))', 'true'],
  ['a `*` after the terminator does not end the sentence', RULES, "const AFTER_TERMINATOR = [' ', '*'];", "const AFTER_TERMINATOR = [' '];"],
  ['`?` does not end a sentence', RULES, "const TERMINATORS = ['.', '!', '?'];", "const TERMINATORS = ['.', '!'];"],
  ['`!` does not end a sentence', RULES, "const TERMINATORS = ['.', '!', '?'];", "const TERMINATORS = ['.', '?'];"],
  ['an unterminated sentence is cut to nothing', RULES, '  return text.length;\n}', '  return from;\n}'],

  // --- slices
  ['the minimum slice is 11', SLICE, 'export const MIN_SLICE = 12;', 'export const MIN_SLICE = 11;'],
  ['the minimum slice is 13', SLICE, 'export const MIN_SLICE = 12;', 'export const MIN_SLICE = 13;'],
  ['the minimum is not enforced', SLICE, 'let to = from + MIN_SLICE;', 'let to = from + 1;'],
  ['the label Evidence: is not allowed', SLICE, "['Evidence:', 'Mechanism:']", "['Mechanism:']"],
  ['the label Mechanism: is not allowed', SLICE, "['Evidence:', 'Mechanism:']", "['Evidence:']"],
  ['a short original line is refused', SLICE, 'if (wholeLines.has(target)) return undefined;', ''],
  ['a short slice lifted out of a sentence passes', SLICE, 'if (wholeLines.has(target)) return undefined;', 'if (source.includes(target)) return undefined;'],
  ['the verdict gives the slice check no original lines', VERDICT, 'const wholeLines = new Set(beforeLines.map(folded));', 'const wholeLines = new Set();'],
  ['the original lines are compared unfolded', VERDICT, 'const wholeLines = new Set(beforeLines.map(folded));', 'const wholeLines = new Set(beforeLines);'],
  ['only the longest first slice is tried', SLICE, 'for (let to = from + MIN_SLICE; to <= end; to += 1) reached[to] = true;', 'if (end - from >= MIN_SLICE) reached[end] = true;'],
  ['an unreachable end passes', SLICE, 'return reached[target.length] ? undefined :', 'return true ? undefined :'],
  ['the uncovered text is the whole line', SLICE, 'target.slice(reached.lastIndexOf(true))', 'target'],

  // --- the verdict
  ['a removed blank line is a deficit', VERDICT, "if (line.trim() === '' || afterLines.includes(line) || archives", 'if (afterLines.includes(line) || archives'],
  ['a kept line must be archived too', VERDICT, "if (line.trim() === '' || afterLines.includes(line) || archives", "if (line.trim() === '' || archives"],
  ['evidence is read without folding CRLF', VERDICT, "evidence.map(({ text }) => linesOf(text).join('\\n'))", 'evidence.map(({ text }) => text)'],
  ['a line inside a longer evidence line counts as archived', VERDICT, 'holdsWholeLine(archive, line)', 'archive.includes(line)'],
  ['only the first evidence file is searched', VERDICT, 'archives.some(', 'archives.slice(0, 1).some('],
  ['an invented line is not reported', VERDICT, 'if (gap !== undefined) found.push', 'if (false) found.push'],
  ['a lost RULE sentence is not reported', VERDICT, 'if (!flatAfter.includes(sentence)) found.push', 'if (false) found.push'],
  ['RULE sentences are compared unfolded', VERDICT, 'if (!flatAfter.includes(sentence))', 'if (!after.includes(sentence))'],
  ['an anchor absent from before is required', VERDICT, 'if (beforeLines.some((line) => line.startsWith(anchor)) && ', 'if ('],
  ['an anchor anywhere in a line counts as kept', VERDICT, '!afterLines.some((line) => line.startsWith(anchor))', '!afterLines.some((line) => line.includes(anchor))'],
  ['a lost anchor is not reported', VERDICT, "found.push(deficit('anchor-lost'", "found.slice(deficit('anchor-lost'"],
  ['the message is English only', VERDICT, '`${english}: ${line} @es ${spanish}: ${line}`', '`${english}: ${line}`'],
  ['the deficit does not name its line', VERDICT, '({ kind, line, message:', "({ kind, line: '', message:"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['rule-tiering', 'failure-capture', 'mutation-proof'],
  selftest: 'rule-tiering/verdict.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
