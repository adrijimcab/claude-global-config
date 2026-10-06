#!/usr/bin/env node
/**
 * PROOF that every outcome kind some module READS has a non-test module that WRITES it, and that the scan which
 * says so DISCRIMINATES.
 *
 * The scan (`producers.mjs`) tokenizes the source; this file proves, on constructed sources, that it reads the
 * REAL call shapes and nothing a loose substring search would: a kind in a comment or a string is no write and no
 * read, a call of another function is no write, an unresolvable `kind` is a named problem and never a silent
 * skip. Then it scans THIS repository: each kind of `journal.mjs` `KINDS` that a module reads (guard-precision
 * reads `decision`, `dismissal`, `false-positive-report` and `true-positive-report`) must be written by one, and
 * the places it found are asserted by name, so a scan that finds nothing cannot pass for "no finding".
 *
 * @es PRUEBA de que cada tipo de desenlace que LEE algún módulo tiene un módulo de producción que lo ESCRIBE, y
 * de que el análisis que lo dice DISCRIMINA. Sobre fuentes construidas prueba que lee las formas REALES de
 * llamada y nada que una búsqueda de subcadena leería: un tipo en un comentario o una cadena no es escritura ni
 * lectura, la llamada a otra función no es escritura, un `kind` irresoluble es un problema nombrado, nunca un
 * salto silencioso. Después analiza ESTE repositorio: cada tipo de `KINDS` que un módulo lee debe ser escrito por
 * alguno, y los lugares hallados se afirman por nombre, para que un análisis que no encuentra nada no pase por
 * «sin hallazgos».
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JOURNAL_MODULES, importAt, productionModules, producerFindings, scanSource, tokenize } from './producers.mjs';
import { KINDS } from './journal.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('hook-state');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let checks = 0;
let failed = 0;

/**
 * One check. The condition is a thunk, so a throw while evaluating it is a FAILED check naming its cause.
 * @es Un check. La condición es una función: un throw al evaluarla es un check FALLIDO con su causa.
 */
function expect(label, condition) {
  let ok = false;
  let cause = '';

  try {
    ok = condition() === true;
  } catch (error) {
    cause = `  threw ${error.message}`;
  }

  checks += 1;

  if (!ok) failed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${cause}\n`);
}

const source = (...lines) => `${lines.join('\n')}\n`;
const IMPORT = "import { appendRecord } from '../hook-state/journal.mjs';";
const sorted = (iterable) => JSON.stringify([...iterable].sort());
const kindsOf = (map) => sorted(map.keys());
const withImport = (...lines) => source(IMPORT, ...lines);

// --- THE TOKENIZER: what is code, and what is not.
const typesOf = (text) => tokenize(text).map((token) => token.type).join(',');
const valuesOf = (text) => tokenize(text).map((token) => token.value);

expect('comments yield no token, strings and templates are one token each', () => typesOf("// appendRecord\n/* appendRecord */ 'appendRecord' \"appendRecord\" `appendRecord`") === 'str,str,str');
expect('an escaped quote does not end a string, and its value is resolved', () => JSON.stringify(valuesOf("'it\\'s' \"a\\\"b\"")) === JSON.stringify(["it's", 'a"b']));
expect('a string that never closes ends at its line: the next line is code again', () => typesOf("'open\nnext") === 'str,id');
expect('a plain template is a string; one with ${…} is one opaque token, nested quotes and templates included', () => typesOf('`plain` `a ${ "}" + `x${1}` } b` after') === 'str,tmpl,id');
expect('a template that spans lines counts them: the next token is on the right line', () => tokenize('`a\nb`\nx').at(-1).line === 3);
expect('an escaped backtick does not end a template', () => typesOf('`a\\`b` c') === 'str,id' && valuesOf('`a\\`b` c')[0] === 'a`b');
expect('a closing brace inside a template nested in a ${…} does not end it', () => typesOf('`${ `}` } b` after') === 'tmpl,id');
expect('braces nested in a ${…} are balanced', () => typesOf('`${ {a:1}.a } x` after') === 'tmpl,id');
expect('a block comment counts its lines', () => tokenize('/*\n\n*/ x').at(-1).line === 3);
expect('lines are counted across tokens', () => tokenize('a\nb\n\nc').map((token) => token.line).join() === '1,2,4');
expect('a regular expression holding quotes is one token, and the code after it is read', () => typesOf("x = /'[/]'/g; y") === 'id,punct,regex,punct,id');
expect('a `/` after a name or a closing bracket divides', () => typesOf('a / b / c') === 'id,punct,id,punct,id' && typesOf('(a) / b / c') === 'punct,id,punct,punct,id,punct,id' && typesOf('[a] / b / c') === 'punct,id,punct,punct,id,punct,id' && typesOf('1 / 2 / 3') === 'num,punct,num,punct,num');
expect('a `/` that starts the source opens a regular expression', () => typesOf('/x/g') === 'regex');
expect('a `/` after an operator or an opening bracket opens a regular expression', () => typesOf('a = /x/') === 'id,punct,regex' && typesOf('f(/x/)') === 'id,punct,regex,punct');
expect('a `/` after `return` opens a regular expression', () => typesOf('return /x/') === 'id,regex');
expect('a `/` with no closing slash on its line is a division', () => typesOf('x = a /\n b') === 'id,punct,id,punct,id');
expect('numbers are one token, with their fraction', () => typesOf('1.5e3 + 2') === 'num,punct,num');
expect('operators are read longest first', () => JSON.stringify(valuesOf('a === b ?. c ?? d => e ... f')) === JSON.stringify(['a', '===', 'b', '?.', 'c', '??', 'd', '=>', 'e', '...', 'f']));
expect('a non-ASCII letter starts and continues a name', () => typesOf('ñandú') === 'id' && valuesOf('ñandú')[0] === 'ñandú');
expect('every kind of white space separates tokens: a no-break space, a byte-order mark, a form feed, a vertical tab', () => typesOf('a b﻿c\fd\ve') === 'id,id,id,id,id');
expect('a regular expression holding an escaped slash is one token', () => typesOf('x = /\\//g') === 'id,punct,regex');
expect('a template with an object literal inside ${…} and a template after it is one token', () => typesOf('`${ {a:1}.a + `x` } y` after') === 'tmpl,id');
expect('a name may hold `$`, `_`, digits and non-ASCII letters', () => JSON.stringify(valuesOf('$a _b c1 ñ Zed')) === JSON.stringify(['$a', '_b', 'c1', 'ñ', 'Zed']));

// --- IMPORTS: the module an `import` names and the names it binds.
const importOf = (text) => JSON.stringify(importAt(tokenize(text), 0));

expect('a named import binds each name, with its alias', () => importOf("import { a as b, c } from 'm';") === '{"module":"m","names":[{"imported":"a","local":"b"},{"imported":"c","local":"c"}]}');
expect('a default import binds its name, alone or beside named ones', () => importOf("import d from 'm';") === '{"module":"m","names":[{"imported":"d","local":"d"}]}' && importOf("import d, { a } from 'm';") === '{"module":"m","names":[{"imported":"d","local":"d"},{"imported":"a","local":"a"}]}');
expect('a malformed alias binds the name it follows and nothing else', () => importOf("import { a as } from 'm';") === '{"module":"m","names":[{"imported":"a","local":"a"}]}');
expect('a namespace import binds no name', () => importOf("import * as ns from 'm';") === '{"module":"m","names":[]}');
expect('an import for its side effect names its module and binds nothing', () => importOf("import 'm';") === '{"module":"m","names":[]}');
expect('an import that spans lines is read whole', () => importOf("import {\n  a,\n  b as c,\n} from 'm';") === '{"module":"m","names":[{"imported":"a","local":"a"},{"imported":"b","local":"c"}]}');
expect('a dynamic import, `import.meta` and a bare `import` at the end are no import statement', () => importOf("import('m')") === undefined && importOf('import.meta.url') === undefined && importOf('import') === undefined && importOf('import { a }') === undefined);
expect('the import is read from the token it starts at', () => JSON.stringify(importAt(tokenize("x; import { a } from 'm';"), 2)) === '{"module":"m","names":[{"imported":"a","local":"a"}]}');

// --- WRITES: every real shape, each resolved to its kind.
const writesOf = (text) => scanSource(text).writes;
const problemsOf = (text) => scanSource(text).problems.map((problem) => problem.message);

expect('a call with a literal kind is a write', () => kindsOf(writesOf(withImport("appendRecord(mechanism, { kind: 'decision', blockId });"))) === '["decision"]');
expect('the line of the write is reported', () => writesOf(withImport('', "appendRecord(m, { kind: 'decision' });")).get('decision').join() === '3');
expect('a ternary of kinds writes both', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: falsePositive ? 'false-positive-report' : 'dismissal', blockId });"))) === '["dismissal","false-positive-report"]');
expect('a nested ternary writes every branch', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: a ? 'x' : b ? 'y' : 'z' });"))) === '["x","y","z"]');
expect('a comparison inside the condition of a ternary is not a kind', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: mode === 'strict' ? 'x' : 'y' });"))) === '["x","y"]');
expect('a constant object indexed by anything writes its VALUES, never its keys', () => kindsOf(writesOf(withImport("const KIND_OF = { [A]: 'true-positive-report', [B]: 'false-positive-report', plain: 'extra' };", 'appendRecord(m, { kind: KIND_OF[label] });'))) === '["extra","false-positive-report","true-positive-report"]');
expect('a frozen constant object is read too', () => kindsOf(writesOf(withImport("const KIND_OF = Object.freeze({ a: 'x' });", 'appendRecord(m, { kind: KIND_OF[label] });'))) === '["x"]');
expect('a string constant writes its string', () => kindsOf(writesOf(withImport("const KIND = 'decision';", 'appendRecord(m, { kind: KIND });'))) === '["decision"]');
expect('a quoted `kind` key is the same property', () => kindsOf(writesOf(withImport("appendRecord(m, { 'kind': 'decision' });"))) === '["decision"]');
expect('the kind may follow other properties, in any argument', () => kindsOf(writesOf(withImport("appendRecord(m, { blockId, toolUseId: null, kind: 'decision', inputDigest });"))) === '["decision"]');
expect('a kind that is a plain template is a string', () => kindsOf(writesOf(withImport('appendRecord(m, { kind: `decision` });'))) === '["decision"]');
expect('an import alias is the API', () => kindsOf(writesOf(source("import { appendRecord as write } from './journal.mjs';", "write(m, { kind: 'decision' });"))) === '["decision"]');
expect('a seam bound by default to the API is the API (the way a test seam is spelled)', () => kindsOf(writesOf(withImport("export function record(blocks, { append = appendRecord } = {}) {", "  append(m, { kind: 'decision' });", '}'))) === '["decision"]');
expect('a name bound to the API by a declaration is the API, through any number of bindings', () => kindsOf(writesOf(withImport('const first = appendRecord;', 'const second = first;', "second(m, { kind: 'decision' });"))) === '["decision"]');
expect('the API is also found when the import spans lines and imports other names', () => kindsOf(writesOf(source('import {', '  digestInput,', '  appendRecord,', "} from '../hook-state/journal.mjs';", "appendRecord(m, { kind: 'decision' });"))) === '["decision"]');

expect('a call that never closes still writes what it holds', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: 'x'"))) === '["x"]' && problemsOf(withImport("appendRecord(m, { kind: 'x'")).length === 0);
expect('the same kind written twice keeps both lines', () => writesOf(withImport("appendRecord(m, { kind: 'x' });", "appendRecord(m, { kind: 'x' });")).get('x').join() === '2,3');
expect('a bracket held in a string value of the arguments is no bracket', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: '(', blockId });"))) === '["("]' && problemsOf(withImport("appendRecord(m, { kind: '(', blockId });")).length === 0);
expect('a ternary inside a call is the call, not a choice of kinds', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: pick(flag ? 'x' : 'y') });"))) === '[]' && problemsOf(withImport("appendRecord(m, { kind: pick(flag ? 'x' : 'y') });")).length === 1);
expect('a ternary nested in the consequent of another reads every branch', () => kindsOf(writesOf(withImport("appendRecord(m, { kind: a ? b ? 'x' : 'y' : 'z' });"))) === '["x","y","z"]');
expect('a kind in a name bound by the API through a later declaration is still the API', () => kindsOf(writesOf(withImport('function use(write = alias) {', "  write(m, { kind: 'x' });", '}', 'const alias = appendRecord;'))) === '["x"]');
expect('the arguments of a call end at its closing bracket: the next call is not its own', () => {
  const text = withImport('appendRecord(m, fields);', "other(m, { kind: 'decision' });");

  return writesOf(text).size === 0 && problemsOf(text).length === 1;
});
expect('a `kind` that is only a member of another property is not the property', () => {
  const text = withImport("appendRecord(m, { a: record.kind, kind: 'x' });");

  return kindsOf(writesOf(text)) === '["x"]' && problemsOf(text).every((message) => !message.includes('bare name'));
});
expect('a `kind` that is an operand and no property is no property: the call holds none', () => problemsOf(withImport('appendRecord(m, kind + 1);')).some((message) => message.includes('holds no `kind:` property')));
expect('a shorthand `kind`, first or last, is a bare name and no resolution', () => ['appendRecord(m, { kind, blockId });', 'appendRecord(m, { blockId, kind });'].every((statement) => problemsOf(withImport(statement)).some((message) => message.includes('bare name'))));
expect('a constant declared inside a function is no constant of the module', () => {
  const text = withImport('function f() {', "  const KIND = 'decision';", '  appendRecord(m, { kind: KIND });', '}');

  return writesOf(text).size === 0 && problemsOf(text).length === 1;
});
expect('a name that is not a `const` is no constant', () => {
  const text = withImport("let KIND = 'decision';", 'appendRecord(m, { kind: KIND });');

  return writesOf(text).size === 0 && problemsOf(text).length === 1;
});
expect('a string constant that is concatenated is no string', () => {
  const text = withImport("const KIND = 'dec' + 'ision';", 'appendRecord(m, { kind: KIND });');

  return writesOf(text).size === 0 && problemsOf(text).length === 1;
});
expect('an object made by another function than `Object.freeze` is no object constant', () => {
  const text = withImport("const KIND_OF = Object.keys({ a: 'x' });", 'appendRecord(m, { kind: KIND_OF[label] });');

  return writesOf(text).size === 0 && problemsOf(text).length === 1;
});
expect('an object value that is an expression, or a name, is no string value', () => {
  const text = withImport("const KIND_OF = { a: 'x' + suffix, b: NAME, c: 'y' };", 'appendRecord(m, { kind: KIND_OF[label] });');

  return kindsOf(writesOf(text)) === '["y"]' && problemsOf(text).length === 1;
});
expect('a string that is spelled like a constant is no constant', () => {
  const text = withImport("const KIND_OF = { a: 'x' };", "appendRecord(m, { kind: 'KIND_OF'[label] });");

  return writesOf(text).size === 0 && problemsOf(text).length === 1;
});
expect('a string followed by more is no string, and a name inside it is no constant', () => {
  const text = withImport("const KIND = 'decision';", "appendRecord(m, { kind: 'x' + suffix });", "appendRecord(m, { kind: 'KIND' + suffix });", 'appendRecord(m, { kind: KIND + suffix });');

  return writesOf(text).size === 0 && problemsOf(text).length === 3;
});
expect('an object constant is a value through its name or an index, nothing else', () => {
  const text = withImport("const KIND_OF = { a: 'x' };", 'appendRecord(m, { kind: KIND_OF.a });', 'appendRecord(m, { kind: KIND_OF(label) });', 'appendRecord(m, { kind: KIND_OF[label].trim() });');

  return writesOf(text).size === 0 && problemsOf(text).length === 3;
});
expect('an object constant named alone is a value', () => kindsOf(writesOf(withImport("const KIND_OF = { a: 'x' };", 'appendRecord(m, { kind: KIND_OF });'))) === '["x"]');
expect('an unresolvable consequent is a named problem, and the alternate is still a write', () => {
  const text = withImport("appendRecord(m, { kind: flag ? other : 'y' });");

  return problemsOf(text).length === 1 && kindsOf(writesOf(text)) === '["y"]';
});
expect('a namespace import binds no API name', () => writesOf(source("import * as appendRecord from './journal.mjs';", "appendRecord(m, { kind: 'decision' });")).size === 0);
expect('only the journal module exports the API: the same name from another journal module is no API', () => writesOf(source("import { appendRecord } from '../guard-precision/blocks.mjs';", "appendRecord(m, { kind: 'decision' });")).size === 0);
expect('a module that imports the journal for a side effect, by default or by namespace uses it', () => ["import './journal.mjs';", "import journal from './journal.mjs';", "import journal, { a } from './journal.mjs';", "import * as journal from './journal.mjs';"].every((statement) => scanSource(`${statement}\n`).usesJournal));
expect('a dynamic import, an import.meta and a member named import are no import statement', () => ["const m = await import('./journal.mjs');", "const here = import.meta.url + './journal.mjs';", "load.import('./journal.mjs');"].every((statement) => !scanSource(`${statement}\n`).usesJournal));
expect('a dynamic import next to a real import does not take its module', () => scanSource("const m = await import('./other.mjs')\nimport { x } from './journal.mjs'\n").usesJournal === true && scanSource("const m = await import('./journal.mjs')\nimport { x } from './other.mjs'\n").usesJournal === false);
expect('an alias of another name is not the API even when it is spelled like it', () => writesOf(source("import { other as appendRecord } from './journal.mjs';", "appendRecord(m, { kind: 'decision' });")).size === 0);
expect('a kind in a comment is no write', () => writesOf(withImport("// appendRecord(m, { kind: 'decision' });", "/* appendRecord(m, { kind: 'decision' }) */")).size === 0);
expect('a kind in a string or a template is no write', () => writesOf(withImport("const text = \"appendRecord(m, { kind: 'decision' })\";", "const other = `appendRecord(m, { kind: 'decision' })`;")).size === 0);
expect('an object with a `kind` that is not passed to the API is no write', () => writesOf(withImport("const record = { kind: 'decision' };", "other(m, { kind: 'decision' });")).size === 0);
expect('a call of a name that is not bound to the API is no write', () => writesOf(withImport("append(m, { kind: 'decision' });")).size === 0);
expect('a METHOD named like the API is no write', () => writesOf(withImport("journal.appendRecord(m, { kind: 'decision' });", "journal?.appendRecord(m, { kind: 'decision' });")).size === 0);
expect('a definition of a function named like the API is no write', () => writesOf(withImport("function appendRecord(m, { kind: 'decision' }) {}")).size === 0);
expect('without the import there is no API: a local function of that name is no write', () => writesOf(source("function appendRecord() {}", "appendRecord(m, { kind: 'decision' });")).size === 0);
expect('an import of the name from another module is not the journal', () => writesOf(source("import { appendRecord } from './elsewhere.mjs';", "appendRecord(m, { kind: 'decision' });")).size === 0);
expect('a dynamic import is no import statement', () => writesOf(source("const module = await import('./journal.mjs');", "appendRecord(m, { kind: 'decision' });")).size === 0);

expect('a bracket inside a string of the arguments does not end the call', () => kindsOf(writesOf(withImport("appendRecord(m, ')', { kind: 'x' });"))) === '["x"]' && problemsOf(withImport("appendRecord(m, ')', { kind: 'x' });")).length === 0);
expect('a shorthand `kind` cannot be resolved: a named problem, not a silent skip', () => problemsOf(withImport('appendRecord(m, { kind, blockId });')).length === 1);
expect('a call with no `kind` property is a named problem', () => problemsOf(withImport('appendRecord(m, fields);')).some((message) => message.includes('holds no `kind:` property')));
expect('a `kind` computed by a call is a named problem', () => problemsOf(withImport('appendRecord(m, { kind: kindFor(x) });')).length === 1);
expect('a `kind` held in a name that is no constant of the module is a named problem', () => problemsOf(withImport('appendRecord(m, { kind: chosen });')).length === 1);
expect('a constant object with a value that is not a string is a named problem', () => problemsOf(withImport("const KIND_OF = { a: 'x', b: compute() };", 'appendRecord(m, { kind: KIND_OF[label] });')).length === 1);
expect('a ternary with one unresolvable branch is a named problem, and the resolvable branch is still a write', () => {
  const text = withImport("appendRecord(m, { kind: flag ? 'x' : other });");

  return problemsOf(text).length === 1 && kindsOf(writesOf(text)) === '["x"]';
});
expect('a ternary that never closes is a named problem', () => problemsOf(withImport("appendRecord(m, { kind: flag ? 'x' });")).length === 1);
expect('the problem names the line', () => scanSource(withImport('', '', 'appendRecord(m, fields);')).problems[0].line === 4);
expect('a well-formed call raises no problem', () => problemsOf(withImport("appendRecord(m, { kind: 'decision' });")).length === 0);

// --- READS: every real shape.
const readsOf = (text) => scanSource(text).reads;

expect('`x.kind === \'k\'` is a read', () => kindsOf(readsOf(withImport("if (record.kind === 'decision') use();"))) === '["decision"]');
expect('the operand order does not matter', () => kindsOf(readsOf(withImport("if ('decision' === record.kind) use();"))) === '["decision"]');
expect('`!==`, `==` and `!=` read too', () => kindsOf(readsOf(withImport("a.kind !== 'p'; a.kind == 'q'; a.kind != 'r'; 's' !== a.kind;"))) === '["p","q","r","s"]');
expect('an optional chain and a long chain read too', () => kindsOf(readsOf(withImport("a?.kind === 'p'; a.b?.c.kind === 'q'; 'r' === a?.b.kind;"))) === '["p","q","r"]');
expect('the line of a read is reported', () => readsOf(withImport('', "x.kind === 'decision';")).get('decision').join() === '3');
expect('an index of a constant object by `.kind` reads its KEYS (a name, a string), never its values', () => kindsOf(readsOf(withImport("const LABEL_OF = { dismissal: FALSE, 'false-positive-report': FALSE, [DYNAMIC]: OTHER };", 'const label = LABEL_OF[record.kind];'))) === '["dismissal","false-positive-report"]');
expect('an index by a deeper chain reads too', () => kindsOf(readsOf(withImport('const LABEL_OF = { a: 1 };', 'LABEL_OF[entry?.record.kind];'))) === '["a"]');
expect('a call or any expression owning the member is still a `.kind` access, on the left of a comparison or on the right', () => kindsOf(readsOf(withImport("getRecord().kind === 'p'; 'q' === getRecord().kind; 'r' === a.b(c).kind;"))) === '["p","q","r"]');
expect('a member that is not `kind` is no read', () => readsOf(withImport("record.type === 'decision'; 'decision' === record.type; record['kind'] === 'decision';")).size === 0);
expect('the operand of a comparison ends at the operator, the separator or the bracket that closes it', () => kindsOf(readsOf(withImport("if ('p' === a.kind && b) {} f('q' === a.kind); g(['r' === a.kind, 1]); h('s' === a.kind ? 1 : 2);"))) === '["p","q","r","s"]');
expect('a string that reads like an operator ends no operand', () => readsOf(withImport("'p' === a.kind ',' b;")).size === 0);
expect('a comparison with a longer operand is a problem and no read', () => {
  const text = withImport("'p' === a.kind.length;", "'q' === a.kind + b;");

  return readsOf(text).size === 0 && problemsOf(text).length === 2;
});
expect('a name that is no `.kind` member on the left of a comparison is no read', () => {
  const scan = scanSource(withImport('if (expected === record.kind) use();'));

  return scan.reads.size === 0 && scan.problems.length === 1;
});
expect('the bare local `kind` on the right of a comparison is no read and no problem', () => {
  const scan = scanSource(withImport("if ('decision' === kind) use();"));

  return scan.reads.size === 0 && scan.problems.length === 0;
});
expect('a string that reads like an operator or like a dot is neither', () => {
  const operator = scanSource(withImport("'decision' '===' record.kind;"));
  const dot = scanSource(withImport("owner '.' kind === 'decision';"));

  return operator.reads.size === 0 && operator.problems.length === 1 && dot.reads.size === 0 && dot.problems.length === 0;
});
expect('an index of a member of another object, or one that holds more than the member, is no index by a kind', () => {
  const text = withImport('const TABLE = { x: 1 };', 'use(other.TABLE[record.kind]);', 'use(TABLE[record.kind + 1]);');

  return readsOf(text).size === 0 && problemsOf(text).length === 2;
});
expect('an array literal after a keyword is no index', () => {
  const scan = scanSource(withImport('function f() { return [record.kind]; }'));

  return scan.problems.length === 1 && !scan.problems[0].message.includes('indexes');
});
expect('`KINDS.has(x.kind)` is validation: no read, and no problem', () => {
  const scan = scanSource(withImport('if (!KINDS.has(record.kind)) throw new Error();'));

  return scan.reads.size === 0 && scan.problems.length === 0;
});
expect('a kind in a comment or a string is no read', () => readsOf(withImport("// record.kind === 'decision'", "const text = \"record.kind === 'decision'\";")).size === 0);
expect('a comparison of a local name that is not a `.kind` member is no read and no problem', () => {
  const scan = scanSource(withImport("if (kind === 'decision') use();"));

  return scan.reads.size === 0 && scan.problems.length === 0;
});
expect('a comparison with a template that has interpolation is no read', () => readsOf(withImport('record.kind === `a${b}`;')).size === 0);
expect('a module that does not import the journal reads nothing and raises nothing', () => {
  const scan = scanSource("if (record.kind === 'decision') use(); switch (x.kind) {}\n");

  return !scan.usesJournal && scan.reads.size === 0 && scan.problems.length === 0;
});
expect('importing any journal module marks a user of the journal', () => JOURNAL_MODULES.every((name) => scanSource(`import { x } from './${name}';\n`).usesJournal) && JOURNAL_MODULES.every((name) => scanSource(`import * as j from '../a/${name}';\n`).usesJournal));
expect('importing another module does not', () => !scanSource("import { x } from './journal-other.mjs';\n").usesJournal && !scanSource("import { x } from './other.mjs';\n").usesJournal);
expect('in a user of the journal a `.kind` used any other way is a named problem', () => ['x.kind === y.kind;', 'switch (x.kind) {}', 'const k = x.kind;', 'other.has(x.kind);', 'KINDS.get(x.kind);', 'KINDS.has(x.kind + 1);', 'x.kind = 1;', 'LIST[x.kind + 1];', 'CONSTANT[x.kind];'].every((statement) => problemsOf(withImport(statement)).length >= 1));
expect('an index of something that is not a constant object of the module is a named problem', () => problemsOf(withImport('table[record.kind];')).some((message) => message.includes('indexes something that is not an object constant')));
expect('every `.kind` classified raises no problem', () => problemsOf(withImport("a.kind === 'x'; 'y' === a.kind; MAP[a.kind]; KINDS.has(a.kind);", "const MAP = { z: 1 };")).length === 0);

// --- THE FINDINGS over a set of modules.
const modules = (table) => ({ files: Object.keys(table), readText: (file) => table[file] });
const findingsOf = (table, kinds = ['decision', 'dismissal']) => producerFindings({ ...modules(table), kinds }).findings;
const READER = withImport("if (record.kind === 'decision') use();");
const WRITER = withImport("appendRecord(m, { kind: 'decision' });");

expect('a kind with a reader and a writer has no finding', () => findingsOf({ 'a/reader.mjs': READER, 'b/writer.mjs': WRITER }).length === 0);
expect('a kind that is read and written by no module is a finding naming the kind and the place it is read', () => {
  const [finding, ...others] = findingsOf({ 'a/reader.mjs': READER });

  return others.length === 0 && finding.includes("'decision' is read at a/reader.mjs:2") && finding.includes('no non-test module writes it');
});
expect('that finding is bilingual', () => findingsOf({ 'a/reader.mjs': READER })[0].includes(' @es \'decision\' se lee en a/reader.mjs:2 y ningún módulo de producción lo escribe'));
expect('a writer with no reader is no finding', () => findingsOf({ 'b/writer.mjs': WRITER }).length === 0);
expect('every place that reads the kind is named, in English and in Spanish', () => findingsOf({ 'a/one.mjs': READER, 'a/two.mjs': READER })[0].split(' @es ').every((language) => language.includes('a/one.mjs:2, a/two.mjs:2')));
expect('a kind read in one module and written in another module of the same set is satisfied by that writer only', () => findingsOf({ 'a/reader.mjs': READER, 'b/writer.mjs': withImport("appendRecord(m, { kind: 'dismissal' });") }).length === 1);
expect('a write of a kind the journal does not know is a finding', () => findingsOf({ 'b/writer.mjs': withImport("appendRecord(m, { kind: 'desicion' });") })[0].includes("writes the kind 'desicion', which the journal does not know"));
expect('a read of a kind the journal does not know is a finding, not a missing producer', () => {
  const findings = findingsOf({ 'a/reader.mjs': withImport("if (record.kind === 'desicion') use();") });

  return findings.length === 1 && findings[0].includes("reads the kind 'desicion', which the journal does not know");
});
expect('the unknown-kind findings are bilingual', () => findingsOf({ 'w.mjs': withImport("appendRecord(m, { kind: 'x' });") })[0].includes(' @es escribe el tipo \'x\'') && findingsOf({ 'r.mjs': withImport("a.kind === 'x';") })[0].includes(' @es lee el tipo \'x\'') );
expect('a problem a scan reports is a finding, with its file and line, in both languages', () => {
  const [finding] = findingsOf({ 'w.mjs': withImport('', 'appendRecord(m, fields);') });

  return finding.startsWith('w.mjs:3 a call of appendRecord()') && finding.includes(' @es w.mjs:3 el análisis no puede probar este uso del tipo');
});
expect('the kinds the journal knows are the ones given', () => findingsOf({ 'a/reader.mjs': READER, 'b/writer.mjs': WRITER }, ['dismissal']).length === 2);
expect('the places found are returned per kind, for a proof that the scan found something', () => {
  const { reads, writes } = producerFindings({ ...modules({ 'a/reader.mjs': READER, 'b/writer.mjs': WRITER }), kinds: ['decision'] });

  return JSON.stringify([...reads]) === '[["decision",["a/reader.mjs:2"]]]' && JSON.stringify([...writes]) === '[["decision",["b/writer.mjs:2"]]]';
});

// --- THE FILES the scan reads: production modules only.
const tree = mkdtempSync(path.join(os.tmpdir(), 'producers-selftest-'));

try {
  const put = (relative) => {
    mkdirSync(path.dirname(path.join(tree, relative)), { recursive: true });
    writeFileSync(path.join(tree, relative), '\n');
  };

  for (const relative of ['a.mjs', 'x/b.mjs', 'x/y/c.mjs', 'selftest.mjs', 'x/d.selftest.mjs', 'mutants.mjs', 'x/e.mutants.mjs', 'x/f-mutants.mjs', 'data.json', 'x/readme.md', 'x/g.mjs.bak', '.git/h.mjs', 'node_modules/i.mjs', 'worktrees/w/j.mjs', 'x/state/k.mjs', 'selftest-fixtures/l.mjs', 'x/node_modules/m.mjs']) put(relative);

  expect('a symbolic link to a module is no module', () => {
    try {
      symlinkSync(path.join(tree, 'a.mjs'), path.join(tree, 'link.mjs'));
    } catch {
      return true; // a platform that cannot make a link has nothing to prove here
    }

    return !productionModules(tree).includes('link.mjs');
  });
  expect('the production modules are every .mjs but selftests and mutants campaigns, at any depth', () => JSON.stringify(productionModules(tree).sort()) === JSON.stringify(['a.mjs', 'x/b.mjs', 'x/y/c.mjs']));
} finally {
  rmSync(tree, { recursive: true, force: true });
}

// --- THIS REPOSITORY: every kind some module reads has a non-test module that writes it.
/** The scan of this repository; a throw is a finding, never a crash that hides which check broke. @es El análisis de este repositorio; un throw es un hallazgo, nunca un crash. */
function scanRepository() {
  try {
    const modulesOfRepository = productionModules(ROOT);

    return { files: modulesOfRepository, ...producerFindings({ files: modulesOfRepository, readText: (file) => readFileSync(path.join(ROOT, file), 'utf8'), kinds: KINDS }) };
  } catch (error) {
    return { files: [], findings: [`THREW ${error.message}`], reads: new Map(), writes: new Map() };
  }
}

const real = scanRepository();
const { files } = real;
const placesIn = (map, kind) => (map.get(kind) ?? []).map((place) => place.split(':')[0]);

expect('the scan reads the real journal modules: each of them is in the repository', () => JOURNAL_MODULES.every((name) => files.some((file) => path.posix.basename(file) === name)));
expect('the scan finds the real reader of `decision`: guard-precision', () => placesIn(real.reads, 'decision').includes('guard-precision/blocks.mjs'));
expect('the scan finds the real readers of the three outcomes of a block', () => ['dismissal', 'false-positive-report', 'true-positive-report'].every((kind) => placesIn(real.reads, kind).includes('guard-precision/blocks.mjs')));
expect('the scan finds the real writer of `decision`: the dispatcher journal', () => placesIn(real.writes, 'decision').includes('hook-dispatch/block-journal.mjs'));
expect('the scan finds the real writers of the outcomes: dismiss.mjs and label.mjs', () => placesIn(real.writes, 'dismissal').includes('hook-state/dismiss.mjs') && placesIn(real.writes, 'false-positive-report').includes('hook-state/dismiss.mjs') && placesIn(real.writes, 'false-positive-report').includes('guard-precision/label.mjs') && placesIn(real.writes, 'true-positive-report').includes('guard-precision/label.mjs'));
expect('every kind of the journal is read by some module (so the next check is not vacuous)', () => [...KINDS].every((kind) => real.reads.has(kind)));
expect('every kind some module reads has a non-test module that writes it, and no use of a kind is unreadable to the scan', () => {
  for (const finding of real.findings) process.stdout.write(`        ${finding}\n`);

  return real.findings.length === 0;
});

process.stdout.write(`journal producers selftest: ${checks - failed}/${checks} passed\n`);
process.exitCode = failed === 0 ? 0 : 1;
