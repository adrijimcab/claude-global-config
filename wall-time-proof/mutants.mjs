#!/usr/bin/env node
/**
 * The decisions of the wall-time guard (lexer, token walk, elapsed values, assertion calls), each broken once, that
 * `selftest.mjs` must catch. A survivor is a missing assertion, never a mutant to soften. Mutants whose result no
 * input can tell apart from the original are not listed: the production code that only they would exercise was
 * removed instead (the guards of `isSubtraction`, `matchingOpen`, `isDeclaration`).
 * @es Las decisiones del guard de tiempo de pared (lexer, recorrido de tokens, valores transcurridos, llamadas de
 * aserción), rotas una a una, que `selftest.mjs` debe cazar. Un superviviente es una aserción que falta, nunca un
 * mutante que ablandar. No se listan los mutantes que ninguna entrada distingue del original: el código que solo ellos
 * ejercitarían se quitó.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'wall-time-proof/lexer.mjs';
const T = 'wall-time-proof/token-walk.mjs';
const E = 'wall-time-proof/elapsed-values.mjs';
const C = 'wall-time-proof/check-calls.mjs';

const setText = (items) => `new Set([${items.map((item) => `'${item}'`).join(', ')}])`;
const withoutEach = (items) => items.map((item) => [item, items.filter((other) => other !== item)]);

const COMPARATORS = ['<', '>', '<=', '>=', '==', '===', '!=', '!=='];
const BOUNDARIES = [',', ';', '&&', '||', '??', '?', ':', '=', '=>'];
const ASSERTIONS = ['check', 'expect', 'assert', 'ok', 'equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'notEqual', 'notStrictEqual'];
const OPERATORS_TABLE = "['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>']";

const MUTANTS = [
  // --- LEXER: what makes a slash a regular expression.
  ['the word return no longer opens a regular expression', L, "new Set(['return', 'typeof'", "new Set(['typeof'"],
  ['the word in no longer opens a regular expression', L, "'instanceof', 'in', 'of'", "'instanceof', 'of'"],
  ['the word await no longer opens a regular expression', L, "'yield', 'await'])", "'yield'])"],
  ['a slash after a closing parenthesis is a regular expression', L, "new Set([')', ']', '}', '++', '--'])", "new Set([']', '}', '++', '--'])"],
  ['a slash after a closing bracket is a regular expression', L, "new Set([')', ']', '}', '++', '--'])", "new Set([')', '}', '++', '--'])"],
  ['a slash after a closing brace is a regular expression', L, "new Set([')', ']', '}', '++', '--'])", "new Set([')', ']', '++', '--'])"],
  ['a slash after an increment is a regular expression', L, "new Set([')', ']', '}', '++', '--'])", "new Set([')', ']', '}', '--'])"],
  ['a slash after a decrement is a regular expression', L, "new Set([')', ']', '}', '++', '--'])", "new Set([')', ']', '}', '++'])"],
  ['a slash after any word is a regular expression', L, "if (previous.kind === 'word') return REGEX_KEYWORDS.has(previous.text);", "if (previous.kind === 'word') return true;"],
  ['a slash after any punctuation is a regular expression', L, "if (previous.kind === 'punct') return !VALUE_END.has(previous.text);", "if (previous.kind === 'punct') return true;"],
  ['a slash after a number or string is a regular expression', L, '    return false;\n  }\n\n  /** Skips a regular expression', '    return true;\n  }\n\n  /** Skips a regular expression'],
  ['a slash at the start of the source is a division', L, 'if (previous === undefined) return true;', 'if (previous === undefined) return false;'],
  // --- LEXER: where a regular expression ends.
  ['a regular expression ignores escapes', L, "if (character === '\\\\') {\n        index += 2;", "if (character === '\\\\') {\n        index += 1;"],
  ['a character class never opens', L, "if (character === '[') inClass = true;", "if (character === '[') inClass = false;"],
  ['a character class never closes', L, "else if (character === ']') inClass = false;", "else if (character === ']') inClass = true;"],
  ['a slash inside a class ends the regular expression', L, "else if (character === '/' && !inClass) break;", "else if (character === '/') break;"],
  ['a regular expression runs past its line', L, "while (index < source.length && source[index] !== '\\n') {\n      const character", 'while (index < source.length) {\n      const character'],
  ['an unterminated regular expression swallows its newline', L, "if (source[index] !== '/') return;\n\n    index += 1;", 'index += 1;'],
  // --- LEXER: strings and templates.
  ['a string ignores escapes', L, "source[index] !== '\\n') index += source[index] === '\\\\' ? 2 : 1;", "source[index] !== '\\n') index += 1;"],
  ['a string runs past its line', L, "source[index] !== quote && source[index] !== '\\n')", 'source[index] !== quote)'],
  ['an unterminated string swallows its newline', L, 'if (source[index] === quote) index += 1;', 'index += 1;'],
  ['a template ignores escapes', L, "index += character === '\\\\' ? 2 : 1;", 'index += 1;'],
  ['a template does not count its lines', L, "if (character === '\\n') line += 1;\n\n      index += character", 'index += character'],
  ['a lone dollar opens a template expression', L, "character === '$' && source[index + 1] === '{'", "character === '$'"],
  ['a template expression is never opened', L, 'if (expression) {', 'if (false) {'],
  ['the closing brace of a template expression is not recognised', L, "templateBraces.at(-1) === 0) {", 'templateBraces.at(-1) === 1) {'],
  ['an opening brace inside a template expression is not counted', L, "if (operator === '{') templateBraces[templateBraces.length - 1] += 1;", ''],
  ['a closing brace inside a template expression is not counted', L, "else if (operator === '}') templateBraces[templateBraces.length - 1] -= 1;", ''],
  // --- LEXER: comments, blanks, numbers, names.
  ['a line comment is code', L, "} else if (character === '/' && next === '/') {", '} else if (false) {'],
  ['a block comment is code', L, "} else if (character === '/' && next === '*') {", '} else if (false) {'],
  ['a block comment does not count its lines', L, "for (let at = index; at < stop; at += 1) if (source[at] === '\\n') line += 1;", ''],
  ['a newline does not count', L, '      line += 1;\n      index += 1;\n    } else if (character === \' \'', "      index += 1;\n    } else if (character === ' '"],
  ['a tab is a token', L, "character === ' ' || character === '\\t' || character === '\\r'", "character === ' ' || character === '\\r'"],
  ['a carriage return is a token', L, "character === ' ' || character === '\\t' || character === '\\r'", "character === ' ' || character === '\\t'"],
  ['a hashbang is skipped anywhere', L, "character === '#' && next === '!' && index === 0", "character === '#' && next === '!'"],
  ['a number cannot start with a dot', L, "DIGIT.test(character) || (character === '.' && DIGIT.test(next ?? ''))", 'DIGIT.test(character)'],
  ['a number cannot hold a separator', L, '/[0-9a-zA-Z_.]/.test', '/[0-9a-zA-Z.]/.test'],
  ['an identifier is ASCII only', L, 'const IDENTIFIER_START = /[\\p{L}_$]/u;', 'const IDENTIFIER_START = /[A-Za-z_$]/u;'],
  ['a regular expression has no flags', L, 'while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;\n  }', '}'],
  ['the operator table loses >=', L, `const OPERATORS = ${OPERATORS_TABLE};`, `const OPERATORS = ${OPERATORS_TABLE.replace("'>=', ", '')};`],
  ['the operator table loses ===', L, `const OPERATORS = ${OPERATORS_TABLE};`, `const OPERATORS = ${OPERATORS_TABLE.replace("'===', ", '')};`],
  ['the operator table loses =>', L, `const OPERATORS = ${OPERATORS_TABLE};`, `const OPERATORS = ${OPERATORS_TABLE.replace("'=>', ", '')};`],
  ['the operator table loses ??', L, `const OPERATORS = ${OPERATORS_TABLE};`, `const OPERATORS = ${OPERATORS_TABLE.replace("'??', ", '')};`],
  ['the operator table loses &&', L, `const OPERATORS = ${OPERATORS_TABLE};`, `const OPERATORS = ${OPERATORS_TABLE.replace("'&&', ", '')};`],
  // --- TOKEN WALK: brackets, expression ends, operand reach.
  ['an opening square bracket is not counted', T, "const OPEN = new Set(['(', '[', '{']);", "const OPEN = new Set(['(', '{']);"],
  ['an opening brace is not counted', T, "const OPEN = new Set(['(', '[', '{']);", "const OPEN = new Set(['(', '[']);"],
  ['a closing square bracket is not counted', T, "const CLOSE = new Set([')', ']', '}']);", "const CLOSE = new Set([')', '}']);"],
  ['a closing brace is not counted', T, "const CLOSE = new Set([')', ']', '}']);", "const CLOSE = new Set([')', ']']);"],
  ['a call closes at its second level', T, 'if (depth === 0) return at;\n    }\n  }\n\n  return -1;', 'if (depth === 1) return at;\n    }\n  }\n\n  return -1;'],
  ['an expression does not end at the bracket that closes its enclosing one', T, 'if (depth === 0) return at;\n\n      depth -= 1;', 'if (depth === -1) return at;\n\n      depth -= 1;'],
  ['an expression does not end at a semicolon', T, "(token.text === ';' || token.text === ',')", "(token.text === ',')"],
  ['an expression does not end at a comma', T, "(token.text === ';' || token.text === ',')", "(token.text === ';')"],
  ['an expression ends at a semicolon of a deeper level', T, "} else if (depth === 0 && (token.text === ';'", "} else if ((token.text === ';'"],
  ['a property assignment is a name assignment', T, "|| isPunct(tokens[at - 1], '.')) continue;", ') continue;'],
  ['the left operand reaches rightwards', T, "const step = side === 'left' ? -1 : 1;", "const step = side === 'left' ? 1 : -1;"],
  ['an operand does not stop at the bracket that is not its own', T, 'if (depth === 0) break;\n\n        depth -= 1;', 'if (depth === -1) break;\n\n        depth -= 1;'],
  ['an operand stops at a separator of a deeper level too', T, '} else if (depth === 0 && OPERAND_BOUNDARY.has(token.text)) break;', '} else if (OPERAND_BOUNDARY.has(token.text)) break;'],
  ...withoutEach(BOUNDARIES).map(([item, rest]) => [`an operand does not stop at ${item}`, T, `const OPERAND_BOUNDARY = ${setText(BOUNDARIES)};`, `const OPERAND_BOUNDARY = ${setText(rest)};`]),
  // --- ELAPSED VALUES: comparators, clock shapes, readings.
  ...withoutEach(COMPARATORS).map(([item, rest]) => [`the comparator ${item} is not a bound`, E, `export const COMPARATORS = ${setText(COMPARATORS)};`, `export const COMPARATORS = ${setText(rest)};`]),
  ['Date.now is not a clock', E, "  ['Date', '.', 'now', '(', ')'],\n", ''],
  ['performance.now is not a clock', E, "  ['performance', '.', 'now', '(', ')'],\n", ''],
  ['process.hrtime.bigint is not a clock', E, "  ['process', '.', 'hrtime', '.', 'bigint', '(', ')'],\n", ''],
  ['hrtime.bigint is not a clock', E, "  ['hrtime', '.', 'bigint', '(', ')'],\n", ''],
  ['a property named like a clock call is the clock', E, "if (isPunct(tokens[at - 1], '.')) return 0;", ''],
  ['a clock call is not a reading', E, 'if (call > 0) return at + call;', ''],
  ['hrtime difference needs no hrtime name', E, "if (!isWord(tokens[at], 'hrtime') || !isPunct", 'if (!isPunct'],
  ['hrtime difference needs no call', E, "|| !isPunct(tokens[at + 1], '(') || isPunct(tokens[at + 2], ')')", "|| isPunct(tokens[at + 2], ')')"],
  ['hrtime without arguments is a difference', E, "|| !isPunct(tokens[at + 1], '(') || isPunct(tokens[at + 2], ')')) return false;", "|| !isPunct(tokens[at + 1], '(')) return false;"],
  ['hrtime of any object is a difference', E, "return !isPunct(tokens[at - 1], '.') || isWord(tokens[at - 2], 'process');", 'return true;'],
  ['hrtime of process is not a difference', E, "return !isPunct(tokens[at - 1], '.') || isWord(tokens[at - 2], 'process');", "return !isPunct(tokens[at - 1], '.');"],
  ['the end of the tokens is read as a reading', E, 'if (token === undefined) return -1;\n', ''],
  ['any word is a held reading', E, 'readings.has(token.text) && !isPunct(tokens[at - 1]', 'true && !isPunct(tokens[at - 1]'],
  ['a property of an object is a held reading', E, "&& !isPunct(tokens[at - 1], '.') && !isPunct(tokens[at + 1], '(')", "&& !isPunct(tokens[at + 1], '(')"],
  ['a called name is a held reading', E, "&& !isPunct(tokens[at + 1], '(') && !isPunct(tokens[at + 1], '.');", "&& !isPunct(tokens[at + 1], '.');"],
  ['the object of a member access is a held reading', E, "&& !isPunct(tokens[at + 1], '.');", ';'],
  ['a held reading spans nothing', E, 'return isHeldReading ? at + 1 : -1;', 'return isHeldReading ? at : -1;'],
  ['a reading call longer than five tokens is not seen to end', E, 'Math.max(0, at - 6)', 'Math.max(0, at - 5)'],
  ['a one-token reading is not seen to end', E, 'start <= at; start += 1', 'start < at; start += 1'],
  ['any operator between two readings is a difference', E, "if (token.text === '-' && readingEndingAt", 'if (readingEndingAt'],
  ['a difference needs no reading on the left', E, "if (token.text === '-' && readingEndingAt(tokens, at - 1, readings) && readingStartingAt", "if (token.text === '-' && readingStartingAt"],
  ['a difference needs no reading on the right', E, "readingEndingAt(tokens, at - 1, readings) && readingStartingAt(tokens, at + 1, readings) !== -1) found.add(at);", 'readingEndingAt(tokens, at - 1, readings)) found.add(at);'],
  ['a property named like an elapsed name is it', E, "elapsed.has(token.text) && !isPunct(tokens[at - 1], '.')", 'elapsed.has(token.text)'],
  ['an elapsed name is not an elapsed value', E, "else if (token.kind === 'word' && elapsed.has(token.text)", "else if (token.kind === 'word' && false"],
  ['a comparison needs one elapsed side, then both', E, 'if (sides.some((side)', 'if (sides.every((side)'],
  ['a span starting on its first token is not inside it', E, 'index >= side.from && index < side.to', 'index > side.from && index < side.to'],
  ['every token is a comparator', E, 'if (!COMPARATORS.has(tokens[at].text)) continue;', ''],
  ['an arrow assignment is an elapsed value', E, "token.text === '=>' || (token.kind", "(token.kind"],
  ['a function assignment is an elapsed value', E, "|| (token.kind === 'word' && token.text === 'function')", ''],
  ['a statement counts the elapsed tokens that follow it', E, 'index >= from && index < to', 'index >= from'],
  ['a verdict is held as an elapsed value', E, "? 'comparisons' : own.size", "? 'elapsed' : own.size"],
  ['an elapsed value is held as a verdict', E, "boundComparisons(tokens, from, to, own).length > 0 ?", 'true ?'],
  ['a reading is not held', E, "holdsReading(tokens, from, to, names.readings) ? 'readings' : undefined", 'undefined'],
  ['a reading wins over an elapsed value', E, "own.size > 0 ? 'elapsed' : holdsReading", "holdsReading(tokens, from, to, names.readings) ? 'readings' : own.size > 0 ? 'elapsed' : holdsReading"],
  ['the names are read once', E, '        changed = true;\n', ''],
  ['the elapsed tokens are not recomputed between passes', E, '    elapsedAt = elapsedIndexes(tokens, names);\n  }\n\n  return', '  }\n\n  return'],
  // --- ASSERTION CALLS.
  ...withoutEach(ASSERTIONS).map(([item, rest]) => [`${item} is not an assertion`, C, `export const ASSERTION_NAMES = ${setText(ASSERTIONS)};`, `export const ASSERTION_NAMES = ${setText(rest)};`]),
  ['a name that is not followed by a call is an assertion', C, "|| tokens[at + 1]?.text !== '(') return;", ') return;'],
  ['an unclosed call is not scanned', C, 'to: close === -1 ? tokens.length : close', 'to: close'],
  ['the verdict of a comparison held in a name is not read', C, 'comparisons.has(tokens[at].text)', 'false'],
  ['a property named like a verdict name is it', C, " && tokens[at - 1]?.text !== '.'", ''],
  ['the lines are not sorted', C, '.sort((a, b) => a - b)', '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['wall-time-proof'],
  selftest: 'wall-time-proof/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
