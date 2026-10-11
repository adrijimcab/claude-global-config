#!/usr/bin/env node
/**
 * Proves the import closure DISCRIMINATES. The state space has three parts, each exercised on input built
 * here: (1) which literal specifiers the lexer reads as imports — every import form, and every place the
 * same text appears WITHOUT being an import (a comment, a string, a template, a regex, a member call,
 * `import.meta`), with the near misses that make a careless lexer drift (division read as a regex, a regex
 * read as division, an escaped quote); (2) how the closure walks a constructed tree — a relative import in
 * another folder, a chain, a cycle, a bare specifier, a missing file, a specifier that climbs out of the
 * root, a missing entry, a non-JavaScript import that is copied but not read; (3) which paths a set of files
 * copies — the folder of each, the file itself at the root, each once, in order.
 *
 * @es Prueba que el cierre de imports DISCRIMINA, sobre entradas construidas aquí: (1) qué especificadores
 * literales lee el lexer como imports, y cada sitio donde el mismo texto aparece SIN serlo (comentario,
 * cadena, plantilla, regex, llamada a miembro, `import.meta`), con los casi que harían derivar a un lexer
 * descuidado; (2) cómo recorre el cierre un árbol construido: otra carpeta, una cadena, un ciclo, un
 * especificador desnudo, un fichero ausente, uno que sale de la raíz, una entrada ausente, un import no
 * JavaScript que se copia sin leerse; (3) qué rutas copia un conjunto de ficheros.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { copiedPaths, importClosure, specifiersOf } from './import-closure.mjs';

let assertions = 0;
let failures = 0;

function check(ok, label) {
  assertions += 1;
  if (ok) return;

  failures += 1;
  console.error(`FAIL ${label} @es FALLO ${label}`);
}

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

// --- Part one: what the lexer reads as an import.
// @es Parte uno: qué lee el lexer como import.

check(same(specifiersOf("import x from './a.mjs';\n"), ['./a.mjs']), 'a default import is read');
check(same(specifiersOf("import { a,\n  b } from\n  '../m.mjs';\n"), ['../m.mjs']), 'an import over several lines is read');
check(same(specifiersOf("import './side.mjs';\n"), ['./side.mjs']), 'a side-effect import is read');
check(same(specifiersOf('export { y } from "../b.mjs";\nexport * from \'./c.mjs\';\n'), ['../b.mjs', './c.mjs']), 'both re-export forms are read, in source order');
check(same(specifiersOf("const m = await import('./d.mjs');\n"), ['./d.mjs']), 'a literal dynamic import is read');
check(same(specifiersOf("const j = await import('./j.json', { with: { type: 'json' } });\n"), ['./j.json']), 'a dynamic import with options is read');
check(same(specifiersOf("import fs from 'node:fs';\nimport x from 'pkg';\n"), ['node:fs', 'pkg']), 'a bare specifier is read too: the closure decides what to follow');
check(same(specifiersOf("#!/usr/bin/env node --title='x\nimport './after-hashbang.mjs';\n"), ['./after-hashbang.mjs']), 'a hashbang line is skipped whole, so a quote in it opens no string');
check(specifiersOf("const kind = typeof './no.mjs';\n").length === 0, 'a string after any other word is no import');
check(specifiersOf('const m = await import(specifier);\n').length === 0, 'a dynamic import of a variable names no file');
check(same(specifiersOf("/* c */ import './after-comment.mjs';\n"), ['./after-comment.mjs']), 'a block comment ends after its closing slash');

check(specifiersOf("// import './no.mjs';\n").length === 0, 'an import in a line comment is not read');
check(specifiersOf("const a = b /* import './no.mjs'; */;\n").length === 0, 'an import in a block comment is not read');
check(specifiersOf("const s = \"import('./no.mjs')\";\n").length === 0, 'an import inside a string is not read');
check(specifiersOf("const s = 'it\\'s import \"./no.mjs\"';\n").length === 0, 'an escaped quote does not end the string early');
check(specifiersOf("const t = `import x from './no.mjs';`;\n").length === 0, 'an import inside a template literal is not read');
check(same(specifiersOf("const t = `a ${await import('./yes.mjs')} b`;\n"), ['./yes.mjs']), 'an import inside a template substitution IS code, and is read');
check(same(specifiersOf("const t = `${ { a: `x` }.a } import './no.mjs'`;\nimport './after-template.mjs';\n"), ['./after-template.mjs']), 'a template nested in a substitution ends where it ends, and so does the outer one');
check(same(specifiersOf("const t = `${ ({ a: 1 }).a + (await import('./inner.mjs')).x }`;\n"), ['./inner.mjs']), 'a brace pair inside a substitution does not end it');
check(specifiersOf("const t = `\\` import './no.mjs'`;\n").length === 0, 'an escaped backtick does not end the template');
check(specifiersOf("load.import('./no.mjs');\nx.from('./no.mjs');\n").length === 0, 'a member named import or from is no import');
check(specifiersOf("const here = import.meta.url + './no.mjs';\n").length === 0, 'import.meta is no import');
check(same(specifiersOf("const r = /['\"]/;\nimport './after-regex.mjs';\n"), ['./after-regex.mjs']), 'a quote inside a regex opens no string');
check(same(specifiersOf("const r = /[/']/g;\nimport './after-class.mjs';\n"), ['./after-class.mjs']), 'a slash inside a regex class does not end the regex');
check(same(specifiersOf("const r = /\\/'/;\nimport './after-escape.mjs';\n"), ['./after-escape.mjs']), 'an escaped slash does not end the regex');
check(same(specifiersOf("const h = a / 2; import './after-division.mjs'; const b = c / 3;\n"), ['./after-division.mjs']), 'a division after a name is no regex');
check(same(specifiersOf("const h = (a) / 2; import './after-paren.mjs'; const b = c / 3;\n"), ['./after-paren.mjs']), 'a division after a closing parenthesis is no regex');
check(same(specifiersOf("const h = [a] / 2; import './after-bracket.mjs'; const b = c / 3;\n"), ['./after-bracket.mjs']), 'a division after a closing square bracket is no regex');
check(same(specifiersOf("const r = /[a]/; import './after-class-end.mjs';\n"), ['./after-class-end.mjs']), 'a regex class ends at its bracket, so the slash after it ends the regex');
check(same(specifiersOf("/'/.test(s);\nimport './after-start.mjs';\n"), ['./after-start.mjs']), 'a slash at the very start opens a regex');
check(same(specifiersOf("a++ / 2;\nimport './after-misread.mjs';\n"), ['./after-misread.mjs']), 'a division misread as a regex is confined to its line');
check(same(specifiersOf("const h = 'x' / 2; import './after-string.mjs'; const b = 'y' / 3;\n"), ['./after-string.mjs']), 'a division after a string is no regex');
check(same(specifiersOf("function f(s) { return /x'/.test(s); }\nimport './after-return.mjs';\n"), ['./after-return.mjs']), 'a slash after return opens a regex');
check(same(specifiersOf("if (a) {}\n/'/.test(s);\nimport './after-brace.mjs';\n"), ['./after-brace.mjs']), 'a slash after a closing brace opens a regex');
check(same(specifiersOf("const n = 4 / 2;\nconst m = n.x / 2;\nimport './after-number.mjs';\nconst k = 'é' / 2;\n"), ['./after-number.mjs']), 'a division after a number or a member is no regex');
check(same(specifiersOf("const é = 1; const v = é / 2; import './after-unicode.mjs'; const w = é / 3;\n"), ['./after-unicode.mjs']), 'a non-ASCII name is one name, so a division after it is no regex');
check(Array.isArray(specifiersOf("import x from './a.mjs';\nconst s = 'unterminated\nconst t = `open ${ \n/* open")), 'an unterminated string, template or comment ends the scan without throwing');

// --- Part two: the closure over a constructed tree.
// @es Parte dos: el cierre sobre un árbol construido.

const root = mkdtempSync(path.join(tmpdir(), 'import-closure-'));

function put(relative, content) {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), content);
}

try {
  put('mech/selftest.mjs', "import fs from 'node:fs';\nimport { x } from '../other/x.mjs';\nconst fixture = `import './ghost.mjs';`;\n");
  put('other/x.mjs', "export { y } from './y.mjs';\nexport const x = 1;\n");
  put('other/y.mjs', "import { x } from './x.mjs';\nexport const y = await import('../data/table.json', { with: { type: 'json' } });\n");
  put('data/table.json', "import './ghost.mjs';\n");
  put('top.mjs', 'export const top = 1;\n');
  put('loose/unread.mjs', "import './never-reached.mjs';\n");

  const walked = importClosure({ root, entries: ['mech/selftest.mjs'] });

  check(same(walked.problems, []), 'a closure whose every import resolves has no problem');
  check(same(walked.files, ['data/table.json', 'mech/selftest.mjs', 'other/x.mjs', 'other/y.mjs']), 'the closure follows an import into another folder, then its imports, through a cycle, sorted, each once');
  check(!walked.files.includes('loose/unread.mjs'), 'a file nobody imports is not in the closure');

  const twoEntries = importClosure({ root, entries: ['./top.mjs', 'mech\\selftest.mjs'] });

  check(twoEntries.files.includes('top.mjs') && twoEntries.files.includes('other/y.mjs'), 'every entry is walked, normalised, and a Windows separator in an entry is read as a folder');

  put('broken/selftest.mjs', "import { a } from './missing.mjs';\nimport { b } from '../../escape.mjs';\n");

  const broken = importClosure({ root, entries: ['broken/selftest.mjs', 'absent/selftest.mjs'] });

  const namesMissing = (half) => half.includes('broken/selftest.mjs') && half.includes("'./missing.mjs'") && half.includes('broken/missing.mjs');

  check(broken.problems.some((problem) => problem.split(' @es ').every(namesMissing)), 'a missing import is a problem naming the importer, the specifier and where it resolved, in both languages');
  check(broken.problems.some((problem) => problem.includes("'../../escape.mjs'") && problem.includes('outside')), 'an import that climbs out of the root is a problem naming the specifier');
  check(broken.problems.some((problem) => problem.includes('absent/selftest.mjs')), 'a missing entry is a problem naming it');
  check(broken.problems.length === 3, 'each problem is reported once, and nothing else is');
  check(broken.problems.every((problem) => problem.includes('@es')), 'every problem is bilingual');
  check(!broken.files.includes('broken/missing.mjs') && !broken.files.includes('absent/selftest.mjs'), 'a file that does not exist is never in the closure');
} finally {
  rmSync(root, { recursive: true, force: true });
}

// --- Part three: what a closure copies.
// @es Parte tres: qué copia un cierre.

check(same(copiedPaths(['other/y.mjs', 'mech/selftest.mjs', 'other/x.mjs', 'top.mjs', 'deep/er/z.mjs']), ['deep/er', 'mech', 'other', 'top.mjs']), 'each file copies its folder, a root-level file copies itself, each path once, sorted');

console.log(`${assertions - failures}/${assertions} assertions passed @es ${assertions - failures}/${assertions} aserciones correctas`);
process.exit(failures === 0 ? 0 : 1);
