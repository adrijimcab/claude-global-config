#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for the wall-time guard (ledger key wall-time-asserted-as-concurrency-proof), over sources
 * CONSTRUCTED here, never over the tree (`tree.selftest.mjs` does that). Both sides are proved, because a scanner
 * that flags everything or nothing would pass one side alone:
 *
 *   - RED: every shape of an elapsed wall time put against a bound inside an assertion: a difference written in the
 *     check, held in a name, derived from one, held as a verdict, compared on either side, with each clock
 *     (`Date.now`, `performance.now`, `process.hrtime`), in each assertion call, across lines, and used before its
 *     declaration in the text.
 *   - GREEN: a deadline that bounds waiting (a loop, a timeout passed to a helper, a deadline in a check), an elapsed
 *     value that is only reported, a past instant, text that merely MENTIONS a clock (string, comment, template,
 *     regular expression), a difference outside an assertion, and a difference whose operand is not a reading.
 *   - THE LEXER: a regular expression or comment holding a quote does not swallow the code after it, and the line
 *     reported is the line of the comparison.
 *   - THE WORDS: the finding names file:line, the rule, and both languages.
 *
 * @es PRUEBA DE DISCRIMINACIÓN del guard de tiempo de pared (clave del ledger wall-time-asserted-as-concurrency-proof),
 * sobre fuentes CONSTRUIDOS aquí, nunca sobre el árbol (eso lo hace `tree.selftest.mjs`). Se prueban los dos lados:
 * ROJO (cada forma de un tiempo transcurrido frente a una cota dentro de una aserción: escrito en el check, en un
 * nombre, derivado, como veredicto, a cualquier lado, con cada reloj, en cada llamada de aserción, en varias líneas
 * y usado antes de su declaración); VERDE (un plazo que acota una espera, un valor que solo se informa, un instante
 * pasado, texto que solo MENCIONA un reloj, una diferencia fuera de una aserción y una diferencia cuyo operando no
 * es una lectura); EL LEXER (una regex o un comentario con una comilla no se traga el código siguiente, y la línea
 * es la de la comparación) y LOS TEXTOS (archivo:línea, la regla y los dos idiomas).
 */

import { elapsedAssertionLines } from './check-calls.mjs';
import { tokenize } from './lexer.mjs';
import { RULE, findingMessage, summaryMessage } from './messages.mjs';
import { scanFiles } from './scan.mjs';

let passed = 0;
const failures = [];

/**
 * A check never throws: a throw inside a case is a FAILED check, so a mutant that only crashes the guard is told
 * from a missing check. @es Un check nunca lanza: un throw dentro de un caso es un check FALLIDO.
 */
function check(name, actual, expected) {
  const text = JSON.stringify(actual);

  if (text === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${text}`);
}

/** The lines a source is flagged on; a throw becomes a value. @es Las líneas en que se marca un fuente; un throw pasa a ser un valor. */
function flagged(source) {
  try {
    return elapsedAssertionLines(source);
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

/** Source lines joined; the first reading is `started`. @es Líneas de fuente unidas; la primera lectura es `started`. */
const source = (...lines) => lines.join('\n');
const STARTED = 'const started = Date.now();';

// --- RED: the elapsed value is written in the check ---
check('red: a difference of two Date.now readings against a bound', flagged(source(STARTED, "check('fast', Date.now() - started < 100);")), [2]);
check('red: the bound on the left', flagged(source(STARTED, "check('fast', 100 > Date.now() - started);")), [2]);
check('red: a lower bound is a bound too', flagged(source(STARTED, "check('slow', Date.now() - started >= 110, true);")), [2]);
check('red: an equality with an elapsed value', flagged(source(STARTED, "check('zero', Date.now() - started === 0);")), [2]);
check('red: the difference is the first reading minus a later one', flagged(source(STARTED, "check('x', started - Date.now() > -5);")), [2]);
check('red: performance.now', flagged(source('const t0 = performance.now();', "check('x', performance.now() - t0 < 5);")), [2]);
check('red: process.hrtime.bigint', flagged(source('const t0 = process.hrtime.bigint();', "check('x', process.hrtime.bigint() - t0 < 5n);")), [2]);
check('red: a bare hrtime import', flagged(source('const t0 = hrtime.bigint();', "check('x', hrtime.bigint() - t0 < 5n);")), [2]);
check('red: a bare hrtime(start) is a difference already', flagged("check('x', hrtime(t0)[0] < 1);"), [1]);
check('green: hrtime() without arguments is a pair, not an elapsed time', flagged("check('x', process.hrtime().length < 3);"), []);
check('green: hrtime of another object is not the clock', flagged("check('x', box.hrtime(t0) < 3);"), []);
check('red: process.hrtime(start) is a difference already', flagged(source('const t0 = process.hrtime();', "check('x', process.hrtime(t0)[0] < 1);")), [2]);
check('red: a reading assigned later than its first use in the text', flagged(source('let started;', 'started = Date.now();', "check('x', Date.now() - started < 5);")), [3]);

// --- RED: the elapsed value is held in a name ---
check('red: the difference held in a name', flagged(source(STARTED, 'const spent = Date.now() - started;', "check('fast', spent < 1000);")), [3]);
check('red: the name inside an array of checks', flagged(source(STARTED, 'const spent = Date.now() - started;', "check('J-1', [spent > 150, spent < 1_000], [true, true]);")), [3]);
check('red: arithmetic over an elapsed name', flagged(source(STARTED, 'const spent = Date.now() - started;', 'const seconds = spent / 1000;', "check('fast', seconds < 2);")), [4]);
check('red: an alias of a reading', flagged(source(STARTED, 'const alias = started;', "check('x', Date.now() - alias < 5);")), [3]);
check('red: the verdict of the comparison held in a name', flagged(source(STARTED, 'const fast = Date.now() - started < 5;', "check('fast', fast);")), [3]);
check('red: the name used before the declaration in the text', flagged(source("function proof() { check('x', spent < 1); }", 'const spent = Date.now() - t0;', 'const t0 = Date.now();')), [1]);

// --- RED: every assertion call, and a call spread over lines ---
for (const call of ['check', 'expect', 'assert', 'ok', 'equal', 'assert.ok', 'assert.strictEqual', 'assert.deepStrictEqual']) {
  check(`red: ${call}`, flagged(source(STARTED, `${call}(Date.now() - started < 5);`)), [2]);
}

check('red: the line is the line of the comparison, in a call over several lines', flagged(source(STARTED, 'check(', "  'long name',", '  Date.now() - started < 5,', '  true,', ');')), [4]);
check('red: two assertions, two lines', flagged(source(STARTED, "check('a', Date.now() - started < 5);", "check('b', Date.now() - started > 1);")), [2, 3]);

// --- GREEN: a deadline bounds waiting, it is not an elapsed time ---
check('green: a wait loop up to a deadline', flagged(source('const end = Date.now() + 8000;', 'while (!ready() && Date.now() < end) await sleep(25);')), []);
check('green: a deadline inside a check', flagged(source('const deadline = Date.now() + 5000;', "check('in time', Date.now() < deadline);")), []);
check('green: a timeout passed to a helper', flagged("check('ready', await until(() => done(), 5000));"), []);
check('green: a deadline built from a reading and compared in a check', flagged(source(STARTED, 'const deadline = started + 500;', "check('in time', Date.now() < deadline, true);")), []);
check('green: a polling loop with a for header', flagged('for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(100)) if (gone(pid)) return true;'), []);

// --- GREEN: elapsed or clock values that are not put against a bound inside an assertion ---
check('green: an elapsed time only reported in the detail', flagged(source(STARTED, "check('x', ok, `${String(Date.now() - started)} ms`);")), []);
check('green: an elapsed name only reported', flagged(source(STARTED, 'const spent = Date.now() - started;', "check('x', ok, spent);")), []);
check('green: a past instant is not an elapsed time', flagged("check('old', stamp > Date.now() - 60_000);"), []);
check('green: a past instant held in a name', flagged(source('const cutoff = new Date(Date.now() - 3_600_000);', "check('old', stamp < cutoff);")), []);
check('green: a difference outside any assertion', flagged(source(STARTED, 'if (Date.now() - started > 5000) throw new Error("slow");')), []);
check('green: a difference whose other operand is not a reading', flagged(source('const started = 3;', "check('x', Date.now() - started < 5);")), []);
check('green: a comparison of something that is not a clock', flagged("check('count', items.length < 5 && other > 2);"), []);
check('green: a declaration named check is not a call', flagged(source(STARTED, 'function check(a) { return Date.now() - started < a; }')), []);
check('green: a property of the same name as a reading is not the reading', flagged(source(STARTED, "check('x', Date.now() - box.started < 5);")), []);
check('green: a division is not mistaken for a regular expression', flagged(source(STARTED, "check('x', total / 2 < 5 && Date.now() / 1000 < limit);")), []);

// --- GREEN: text that only MENTIONS a clock ---
check('green: in a string', flagged(source(STARTED, "check('Date.now() - started < 100', true);", "check('x', 'Date.now() - started < 100');")), []);
check('green: in a double-quoted string', flagged(source(STARTED, 'check("x", "Date.now() - started < 100");')), []);
check('green: in a line comment', flagged(source(STARTED, "// check('x', Date.now() - started < 100);")), []);
check('green: in a block comment', flagged(source(STARTED, "/* check('x', Date.now() - started < 100); */")), []);
check('green: in a template text', flagged(source(STARTED, "check('x', `Date.now() - started < 100`);")), []);
check('green: in a regular expression', flagged(source(STARTED, "check('x', /Date\\.now\\(\\) - started < 1/.test(text));")), []);
check('green: in an expression inside a template, a message only', flagged(source(STARTED, "check('x', ok, `took ${'Date.now() - started < 9'}`);")), []);

// --- THE LEXER: what is skipped does not swallow the code after it ---
check('lexer: a quote inside a regular expression', flagged(source(STARTED, 'const quote = /"/;', "check('x', Date.now() - started < 5);")), [3]);
check('lexer: an apostrophe inside a comment', flagged(source(STARTED, "// don't", "check('x', Date.now() - started < 5);")), [3]);
check('lexer: a slash inside a character class of a regular expression', flagged(source(STARTED, 'const path = /[/]x/;', "check('x', Date.now() - started < 5);")), [3]);
check('lexer: a backtick and a nested template in a template expression', flagged(source(STARTED, 'const text = `a ${`b ${1}`} \\` c`;', "check('x', Date.now() - started < 5);")), [3]);
check('lexer: lines counted through a multi-line block comment and template', flagged(source(STARTED, '/* one', 'two */', 'const text = `x', 'y`;', "check('x', Date.now() - started < 5);")), [6]);
check('lexer: an escaped quote does not end a string', flagged(source(STARTED, "const s = 'it\\'s'; check('x', Date.now() - started < 5);")), [2]);
check('lexer: a slash inside a character class, with a quote after it on the line', flagged(source(STARTED, 'const r = /[/"]/; check(\'x\', Date.now() - started < 5);')), [2]);
check('tokens: an identifier may start with a non-ASCII letter', tokenize('const ñandú = 1;').map((token) => token.text), ['const', 'ñandú', '=', '1', ';']);
check('red: a comma inside a call does not end the expression held in a name', flagged(source(STARTED, 'const spent = Math.max(0, Date.now() - started);', "check('x', spent < 5);")), [3]);
check('green: a name read in a declaration list after a reading stays a reading', flagged(source('const t = Date.now(), spent = Date.now() - t;', "check('x', t < 5);")), []);
check('green: a closing brace ends the call', flagged(source(STARTED, "check('x', { a: 1 });", 'const bad = Date.now() - started < 5;')), []);
check('green: a property is not a reading when it is the left operand', flagged(source(STARTED, "check('x', box.started - Date.now() < 5);")), []);
check('green: a property is not a reading when it is assigned to a name', flagged(source(STARTED, 'const t = box.started;', "check('x', Date.now() - t < 5);")), []);
check('green: a sum of readings is not an elapsed time', flagged(source(STARTED, "check('x', started + Date.now() > limit);")), []);
check('green: a bare assertion name is not a call', flagged(source(STARTED, 'const fn = check;', 'const bad = foo(Date.now() - started < 5);')), []);
check('lexer: code after an object inside a template expression is still code', flagged(source(STARTED, "const t = `${f({ a: 1 }, check('x', Date.now() - started < 5))}`;")), [2]);
check('lexer: braces of an object inside a template expression', flagged(source(STARTED, 'const text = `${JSON.stringify({ a: 1 })}`;', "check('x', Date.now() - started < 5);")), [3]);

// --- every comparator and every assertion name ---
for (const operator of ['<', '>', '<=', '>=', '==', '===', '!=', '!==']) {
  check(`red: the comparator ${operator}`, flagged(source(STARTED, `check('x', Date.now() - started ${operator} 5);`)), [2]);
}

// The list is written out, not read from the module: a name dropped from the module would otherwise drop its own proof.
// @es La lista se escribe aquí y no se lee del módulo: un nombre quitado del módulo quitaría su propia prueba.
for (const name of ['check', 'expect', 'assert', 'ok', 'equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'notEqual', 'notStrictEqual']) check(`red: the assertion name ${name}`, flagged(source(STARTED, `${name}(Date.now() - started < 5);`)), [2]);

// --- the reach of an operand: a neighbour that is not an operand is never read as one ---
const SPENT = source(STARTED, 'const spent = Date.now() - started;');
const neighbours = [
  ['a comma before', "check('x', spent, count < 5);"],
  ['a comma after', "check('x', count < 5, spent);"],
  ['&&', "check('x', count < 5 && spent);"],
  ['||', "check('x', spent || count < 5);"],
  ['??', "check('x', spent ?? count < 5);"],
  ['a conditional test', "check('x', spent ? count < 5 : 0);"],
  ['a conditional branch', "check('x', ok ? count < 5 : spent);"],
  ['a statement end', "check('x', run(() => { void spent; return count < 5; }));"],
  ['an arrow parameter', "check('x', run((spent) => count < 5));"],
  ['an assignment target', "check('x', run(() => { spent = count < 5; }));"],
  ['the end of the call', "check('x', count < 5);\nconst e = Date.now() - started;"]
];

for (const [name, line] of neighbours) check(`green: ${name} is not part of the operand`, flagged(source(SPENT, line)), []);

check('red: a call inside the operand keeps its commas', flagged(source(SPENT, "check('x', Math.max(spent, 3) < 5);")), [3]);
check('red: an array before the comparison does not close the call', flagged(source(STARTED, "check('x', [a], Date.now() - started < 5);")), [2]);
check('red: an object before the comparison does not close the call', flagged(source(STARTED, "check('x', { a: 1 }, Date.now() - started < 5);")), [2]);
check('red: an unclosed call is still scanned to the end', flagged(source(STARTED, "check('x', Date.now() - started < 5")), [2]);
check('red: a declaration list ends each name at its comma', flagged(source('const t = Date.now(), spent = Date.now() - t;', "check('x', spent < 5);")), [2]);

// --- which names hold what ---
check('green: a property assignment does not make a reading', flagged(source('box.started = Date.now();', "check('x', Date.now() - started < 5);")), []);
check('green: a default parameter ends at its bracket', flagged(source('function f(t0 = Date.now()) { return Date.now() - t0; }', "check('x', t0 < 5);")), []);
check('green: an arrow is not an elapsed value', flagged(source(STARTED, 'const probe = () => Date.now() - started;', "check('x', probe < 5);")), []);
check('green: a function expression is not an elapsed value', flagged(source(STARTED, 'const probe = function () { return Date.now() - started; };', "check('x', probe < 5);")), []);
check('green: a called name is not a reading', flagged(source(STARTED, "check('x', Date.now() - started() < 5);")), []);
check('green: the object of a member access is not a reading', flagged(source(STARTED, "check('x', Date.now() - started.value < 5);")), []);
check('green: a global clock behind a property is not the clock', flagged(source(STARTED, "check('x', box.Date.now() - started < 5);")), []);
check('green: a property named like an elapsed name is not it', flagged(source(SPENT, "check('x', box.spent < 5);")), []);
check('green: a property named like a verdict name is not it', flagged(source(STARTED, 'const fast = Date.now() - started < 5;', "check('x', box.fast);")), []);
check('red: lines are ascending even when a verdict name follows its comparison', flagged(source(STARTED, 'const fast = Date.now() - started < 5;', 'check(', "  'x',", '  fast,', '  Date.now() - started < 5,', ');')), [5, 6]);

// --- the lexer decisions that hide an offender when they go wrong ---
for (const word of ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']) {
  check(`lexer: a slash after ${word} starts a regular expression`, flagged(source(STARTED, `${word} /"/; check('x', Date.now() - started < 5);`)), [2]);
}

for (const before of ['(a)', 'a[0]', '{}', 'a++', 'a--', 'total', '4', "'s'", '`t`', '/x/']) {
  check(`lexer: a slash after ${before} is a division`, flagged(source(STARTED, `${before} / 2; check('x', Date.now() - started < 5); const z = 1 / 2;`)), [2]);
}

check('lexer: a regular expression as the very first token', flagged(source('/"/.test(s); const started = Date.now();', "check('x', Date.now() - started < 5);")), [2]);
check('lexer: an escaped slash does not end a regular expression', flagged(source(STARTED, 'const r = /a\\/"/; check(\'x\', Date.now() - started < 5);')), [2]);
check('lexer: a class that closes lets the next slash end the regular expression', flagged(source(STARTED, 'const r = /[a]/; const s = "/"; check(\'x\', Date.now() - started < 5);')), [2]);
check('lexer: a dollar that is not a template expression stays text', flagged(source(STARTED, 'const t = `cost $5 and ${1}`;', "check('x', Date.now() - started < 5);")), [3]);
check('lexer: carriage returns and tabs are blanks', flagged("const started = Date.now();\r\ncheck('x', Date.now()\r\n\t- started < 5);\r\n"), [3]);
check('green: a call with arguments is not an hrtime difference', flagged("check('x', count(1) < 5);"), []);
check('green: a name hrtime that is not called is not a difference', flagged("check('x', hrtime < 3);"), []);
check('green: a difference that ends the source reads nothing past it', flagged('const s = Date.now() -'), []);
check('green: a difference whose first operand is not a reading', flagged(source(STARTED, "check('x', total - started < 3);")), []);
check('lexer: an unterminated string ends at its line', flagged(source(STARTED, "const s = 'oops", "check('x', Date.now() - started < 5);")), [3]);
check('lexer: an unterminated regular expression ends at its line', flagged(source(STARTED, 'const r = /oops', "check('x', Date.now() - started < 5);")), [3]);
check('lexer: a line comment at the end of the source', flagged(source(STARTED, "check('x', Date.now() - started < 5); // done")), [2]);

const kinds = (text) => tokenize(text).map((token) => token.kind);

check('tokens: a hashbang is skipped only on the first line', tokenize('x;\n#!y').map((token) => token.text), ['x', ';', '#', '!', 'y']);
check('tokens: numbers keep their separators, dots and leading dot', tokenize('a = 15_000 + .5').map((token) => token.text), ['a', '=', '15_000', '+', '.5']);
check('tokens: an escaped dollar does not open a template expression', kinds('`a \\${b}`'), ['string']);
check('tokens: every multi-character operator stays whole', tokenize('a >>>= b ... c **= d <<= e >>= f >>> g &&= h ||= i ??= j => k == l != m <= n && o || p ?? q ?. r ++ s -- t += u -= v *= w /= x %= y &= z |= a ^= b ** c << d >> e').map((token) => token.text).filter((text) => text.length > 1 && !/^[a-z]$/.test(text)), ['>>>=', '...', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>']);

check('tokens: kinds of a call', kinds("check('a', 1.5e3, /x/g);"), ['word', 'punct', 'string', 'punct', 'number', 'punct', 'regex', 'punct', 'punct']);
check('tokens: a template expression is code between synthetic parentheses', tokenize('`a${b}c`').map((token) => `${token.kind}:${token.text}${token.synthetic === true ? '*' : ''}`), ['string:', 'punct:(*', 'word:b', 'punct:)*', 'string:']);
check('tokens: multi-character operators stay whole', tokenize('a >= b === c => d').map((token) => token.text), ['a', '>=', 'b', '===', 'c', '=>', 'd']);
check('tokens: a unicode identifier is one word', tokenize('const año = 1;').map((token) => token.text), ['const', 'año', '=', '1', ';']);
check('tokens: a hashbang line is skipped', tokenize('#!/usr/bin/env node\nx;').map((token) => token.text), ['x', ';']);
check('tokens: an unterminated block comment ends at the end of the source', tokenize('a /* b').map((token) => token.text), ['a']);

// --- THE WORDS ---
const offender = source(STARTED, "check('x', Date.now() - started < 5);");
const scan = scanFiles(['a.selftest.mjs', 'b.selftest.mjs'], (file) => (file === 'a.selftest.mjs' ? offender : "check('x', true);"));

check('scan: counts the files and finds the one offender', [scan.scanned, scan.findings.map((finding) => [finding.file, finding.line])], [2, [['a.selftest.mjs', 2]]]);
check('scan: the message names file:line, the rule and both languages', [scan.findings[0]?.message.startsWith('a.selftest.mjs:2 '), scan.findings[0]?.message.includes(RULE), scan.findings[0]?.message.includes(' @es ')], [true, true, true]);
check('words: the finding message is the one the scan prints', findingMessage('a.selftest.mjs', 2), scan.findings[0]?.message);
check('words: the rule names what is forbidden and what is fine', [RULE.includes('elapsed wall time'), RULE.includes('deadline'), RULE.includes('@es')], [true, true, true]);
check('words: a clean summary is bilingual', [summaryMessage(3, 0).includes('no elapsed wall time is asserted'), summaryMessage(3, 0).includes('@es')], [true, true]);
check('words: a failing summary counts the findings', [summaryMessage(3, 2).startsWith('2 elapsed-time assertion(s) in 3'), summaryMessage(3, 2).includes('@es')], [true, true]);

if (failures.length > 0) {
  console.error(`wall-time-proof selftest FAILED (${failures.length}/${passed + failures.length}):\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`wall-time-proof selftest: ${passed} checks passed`);
