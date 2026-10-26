#!/usr/bin/env node
/**
 * The decisions of the useless-escape guard, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules live in `../mutation-proof/run-mutants.mjs`. In the texts below `§` stands for a backslash.
 *
 * @es Las decisiones de la guardia de escapes inútiles, rotas una a una, que `selftest.mjs` debe cazar. En
 * los textos, `§` representa una barra invertida.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const BS = String.fromCharCode(92);
const LEXER = 'useless-escape-guard/lexer.mjs';
const FINDER = 'useless-escape-guard/useless-escapes.mjs';
const GUARD = 'useless-escape-guard/guard.mjs';
const REFUSAL = 'useless-escape-guard/refusal.mjs';

const RAW_MUTANTS = [
  // --- regex versus division (lexer.mjs)
  ['a slash is never division — a division swallows the rest of its line as a regex', LEXER, "if (previous === 'value') {", 'if (false) {'],
  ['a slash is always division — a regex is lexed as code and its quotes open strings', LEXER, "if (previous === 'value') {", 'if (true) {'],
  ['a closing parenthesis stops being a value', LEXER, "character === ')' || character === ']'", "character === ']'"],
  ['a closing bracket stops being a value', LEXER, "character === ']' || character === '}' ?", "character === ')' || character === '}' ?"],
  ['a closing brace stops being a value', LEXER, "character === ']' || character === '}' ? 'value'", "character === ']' ? 'value'"],
  ['keywords that precede an expression stop being operators', LEXER, "previous = OPERATOR_KEYWORDS.has(word) ? 'operator' : 'value';", "previous = 'value';"],
  ['`return` leaves the operator keywords', LEXER, "['return', 'typeof',", "['typeof',"],
  ['`typeof` leaves the operator keywords', LEXER, "'typeof', 'instanceof',", "'instanceof',"],
  ['a class inside a regex stops protecting its slash', LEXER, "character === '/' && !inClass", "character === '/'"],
  ['the class opener is not recognised', LEXER, "if (character === '[') inClass = true;", 'if (false) inClass = true;'],
  ['an escaped character inside a regex stops being skipped', LEXER, "if (character === BS) {\n      state.at += 2;\n    } else if (character === '§n') {", "if (false) {\n      state.at += 2;\n    } else if (character === '§n') {"],

  // --- templates and their nesting (lexer.mjs)
  ['a template expression opens with a wrong depth — its closing brace is never recognised', LEXER, 'openExpressions.push(0);', 'openExpressions.push(1);'],
  ['the closing brace test expects the wrong depth', LEXER, 'openExpressions.at(-1) === 0', 'openExpressions.at(-1) === 1'],
  ['an opening brace inside an expression stops counting', LEXER, "character === '{') openExpressions[openExpressions.length - 1] += 1;", "character === '{') openExpressions[openExpressions.length - 1] += 0;"],
  ['a closing brace inside an expression stops counting', LEXER, "character === '}') openExpressions[openExpressions.length - 1] -= 1;", "character === '}') openExpressions[openExpressions.length - 1] -= 0;"],
  ['a template after a value stops being tagged', LEXER, "const tagged = previous === 'value';", 'const tagged = false;'],
  ['the closed template is not a value', LEXER, "previous = closed ? 'value' : 'operator';\n    } else if (isWordStart", "previous = 'operator';\n    } else if (isWordStart"],

  // --- strings (lexer.mjs)
  ['an unterminated string stops ending at its line', LEXER, "&& source[at] !== quote && source[at] !== '§n') at +=", '&& source[at] !== quote) at +='],
  ['a Windows line continuation stops being skipped whole', LEXER, "source.startsWith('§r§n', at + 1) ? 3 : 2", "source.startsWith('§r§n', at + 1) ? 2 : 2"],
  ['an escaped quote stops being skipped', LEXER, '? 1 : source.startsWith', '? 1 : 1 + source.startsWith'],

  // --- line numbers (lexer.mjs, useless-escapes.mjs)
  ['a newline in code stops counting', LEXER, 'state.line += 1;', 'state.line += 0;'],
  ['a block comment stops counting its lines', LEXER, 'state.line += countNewlines(source.slice(state.at, stop));', 'state.line += 0;'],
  ['a string stops counting its continuation lines', LEXER, 'state.line += countNewlines(source.slice(state.at, Math.min(at, source.length)));', 'state.line += 0;'],
  ['a template stops counting its lines', LEXER, 'state.line += countNewlines(text);', 'state.line += 0;'],
  ['a finding stops counting the newlines before it inside its segment', FINDER, "segment.line + segment.text.slice(0, at).split('§n').length - 1", 'segment.line'],

  // --- the valid-escape set (useless-escapes.mjs)
  ['`v` stops being a valid escape', FINDER, "'f', 'v', 'x'", "'f', 'x'"],
  ['`x` stops being a valid escape', FINDER, "'v', 'x', 'u'", "'v', 'u'"],
  ['`u` stops being a valid escape', FINDER, "'x', 'u', ", "'x', "],
  ['the quotes stop being valid escapes', FINDER, `'"', BS, `, `BS, `],
  ['the backslash stops being a valid escape', FINDER, `'"', BS, `, `'"', `],
  ['`$` stops being a valid escape', FINDER, "'$', '{', ", "'{', "],
  ['`{` stops being a valid escape', FINDER, "'{', '§n'", "'§n'"],
  ['a line break stops being a valid escape', FINDER, "'§n', '§r', ", "'§r', "],
  ['a carriage return stops being a valid escape', FINDER, "'§r', LINE_SEPARATOR", 'LINE_SEPARATOR'],
  ['the line separator stops being a valid escape', FINDER, 'LINE_SEPARATOR, PARAGRAPH_SEPARATOR, ', 'PARAGRAPH_SEPARATOR, '],
  ['the digits stop being valid escapes', FINDER, "...'0123456789'", "...'0'"],
  ['a tagged template is judged', FINDER, 'if (segment.tagged) continue;', ''],

  // --- the guard: Edit application, file type, fail open (guard.mjs)
  ['the guard judges the file before the edit, not after', GUARD, 'findUselessEscapes(simulated.after)', 'findUselessEscapes(simulated.before)'],
  ['`.mjs` leaves the judged extensions', GUARD, "new Set(['.mjs', '.js', '.cjs'])", "new Set(['.js', '.cjs'])"],
  ['`.js` leaves the judged extensions', GUARD, "new Set(['.mjs', '.js', '.cjs'])", "new Set(['.mjs', '.cjs'])"],
  ['`.cjs` leaves the judged extensions', GUARD, "new Set(['.mjs', '.js', '.cjs'])", "new Set(['.mjs', '.js'])"],
  ['`.ts` joins the judged extensions', GUARD, "new Set(['.mjs', '.js', '.cjs'])", "new Set(['.mjs', '.js', '.cjs', '.ts'])"],
  ['`Write` leaves the guarded tools', GUARD, "new Set(['Write', 'Edit'])", "new Set(['Edit'])"],
  ['`Edit` leaves the guarded tools', GUARD, "new Set(['Write', 'Edit'])", "new Set(['Write'])"],
  // The BOM strip lives in `hook-io`, pinned there by its mutant 'the BOM is not stripped'.
  // @es El BOM lo quita `hook-io`, que lo fija con su mutante 'the BOM is not stripped'.
  ['a malformed payload is refused instead of allowed', GUARD, 'const payload = tryParsePayload(raw);', "const payload = tryParsePayload(raw);\n\n  if (payload === undefined) return { hookSpecificOutput: { permissionDecision: 'deny' } };\n"],
  ['an edit that cannot be simulated is refused instead of failing open', GUARD, 'reportMalfunction(simulated.error);\n\n    return undefined;', "reportMalfunction(simulated.error);\n\n    return { hookSpecificOutput: { permissionDecision: 'deny' } };"],
  ['the Spanish half of a malfunction report is dropped from stderr', GUARD, '  process.stderr.write(`[useless-escape-guard] @es ${message} — fallando ABIERTO: no poder verificar no es lo mismo que estar limpio.§n`);', ''],
  ['a malfunction is no longer journaled', GUARD, '    appendFileSync(errorsFile(), ', '    void (errorsFile(), '],

  // --- the refusal (refusal.mjs)
  ['the refusal stops naming the line', REFUSAL, '`  line ${line}: ${escape}`', '`  ${escape}`'],
  ['the refusal stops naming the escape', REFUSAL, '`  line ${line}: ${escape}`', '`  line ${line}`'],
  ['the refusal stops naming the file', REFUSAL, "render(USELESS_ESCAPE_MESSAGE, { file, findings", "render(USELESS_ESCAPE_MESSAGE, { file: 'x', findings"],
  ['the English fix is dropped', REFUSAL, 'FIX, any of these: double the backslash', 'FIX, any of these: change it'],
  ['the Spanish fix is dropped', REFUSAL, 'CORRECCIÓN, cualquiera: duplicar la barra', 'CORRECCIÓN, cualquiera: cambiarla']
];

const MUTANTS = RAW_MUTANTS.map(([label, file, original, mutated]) => [label, file, original.replaceAll('§', BS), mutated.replaceAll('§', BS)]);

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['useless-escape-guard', 'type-assertion-guard', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'useless-escape-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
