#!/usr/bin/env node
/**
 * The decisions of the import closure, each broken once, that `import-closure.selftest.mjs` must catch: what
 * the lexer reads as an import and as data, how the closure walks and what it reports, and which paths it
 * copies. Every mutant keeps the code runnable and changes what it DECIDES, so a kill is an assertion kill.
 * Not mutated, on purpose: the end-of-input guard of `endOf` and the visited check of the walk, whose removal
 * can only loop forever (a timeout is no verdict), and the existence checks whose removal can only crash on
 * the read that follows; the silent DROP of those same problems is mutated instead.
 * @es Las decisiones del cierre de imports, rotas una a una, que `import-closure.selftest.mjs` debe cazar.
 * Cada mutante deja el código ejecutable y cambia lo que DECIDE. No se mutan, a propósito: la guarda de fin de
 * entrada de `endOf` y la marca de visitado del recorrido, cuya retirada solo puede colgar (un timeout no es
 * veredicto), y las comprobaciones de existencia, cuya retirada solo puede romper en la lectura siguiente; se
 * muta en su lugar el descarte silencioso de esos mismos problemas.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from './run-mutants.mjs';

const CLOSURE = 'mutation-proof/import-closure.mjs';

const MUTANTS = [
  // --- WHAT IS AN IMPORT
  ['a member named import is an import', CLOSURE, "token.kind === 'name' && !isMember(tokens[at - 1])", "token.kind === 'name'"],
  ['a re-export is not read', CLOSURE, "if (word === 'from' && first?.kind === 'string') return", "if (false) return"],
  ['a string after any word is an import', CLOSURE, "  if (word !== 'import') return [];\n", ''],
  ['a side-effect import is not read', CLOSURE, "  if (first?.kind === 'string') return [first.value];\n  if (first?.value", '  if (first?.value'],
  ['a dynamic import of a variable names a file', CLOSURE, "second?.kind === 'string' && (third", 'second !== undefined && (third'],
  ['a dynamic import without options is not read', CLOSURE, "third?.value === ')' || third?.value === ','", "third?.value === ','"],
  ['a dynamic import with options is not read', CLOSURE, "third?.value === ')' || third?.value === ','", "third?.value === ')'"],
  ['a hashbang is lexed as code', CLOSURE, "source.startsWith('#!') ? endOf(source, '\\n', 0) : 0", '0'],

  // --- WHAT IS DATA
  ['whitespace is punctuation', CLOSURE, String.raw`if (/\s/.test(char)) at += 1;`, String.raw`if (/\n/.test(char)) at += 1;`],
  ['a line comment is code', CLOSURE, "else if (pair === '//') at", "else if (false) at"],
  ['a block comment is code', CLOSURE, "else if (pair === '/*') at", "else if (false) at"],
  ['a block comment ends one character early', CLOSURE, "endOf(source, '*/', at + 2) + 2;", "endOf(source, '*/', at + 2) + 1;"],
  ['a single quote opens no string', CLOSURE, `else if (char === "'" || char === '"')`, `else if (char === '"')`],
  ['a double quote opens no string', CLOSURE, `else if (char === "'" || char === '"')`, `else if (char === "'")`],
  ['an escaped quote ends the string', CLOSURE, "source[at] !== source[start]) at += source[at] === '\\\\' ? 2 : 1;", 'source[at] !== source[start]) at += 1;'],
  ['a backtick opens no template', CLOSURE, "else if (char === '`') at", "else if (false) at"],
  ['an escaped backtick ends the template', CLOSURE, "    if (source[at] === '\\\\') at += 2;\n    else if (source.startsWith('${', at))", "    if (false) at += 2;\n    else if (source.startsWith('${', at))"],
  ['a substitution is template text', CLOSURE, "else if (source.startsWith('${', at)) at", 'else if (false) at'],
  ['the first closing brace ends a substitution', CLOSURE, "if (substitution && char === '}' && depth === 0)", "if (substitution && char === '}')"],
  ['an opening brace is not counted', CLOSURE, "      if (char === '{') depth += 1;\n", ''],
  ['a closing brace is not counted', CLOSURE, "      if (char === '}') depth -= 1;\n", ''],
  ['a slash never opens a regex', CLOSURE, "else if (char === '/' && opensRegex(tokens.at(-1))) at", "else if (false) at"],

  // --- REGEX OR DIVISION
  ['a slash at the start divides', CLOSURE, 'if (previous === undefined) return true;', 'if (previous === undefined) return false;'],
  ['a slash after any word divides', CLOSURE, "if (previous.kind === 'name') return REGEX_AFTER_WORDS.has(previous.value);", "if (previous.kind === 'name') return false;"],
  ['a slash after any word opens a regex', CLOSURE, "if (previous.kind === 'name') return REGEX_AFTER_WORDS.has(previous.value);", "if (previous.kind === 'name') return true;"],
  ['`return` is no regex keyword', CLOSURE, "new Set(['return', ", "new Set(["],
  ['a slash after a string opens a regex', CLOSURE, "return previous.kind === 'punct' && !OPERAND_CLOSERS", 'return !OPERAND_CLOSERS'],
  ['a slash after a closing parenthesis opens a regex', CLOSURE, "new Set([')', ']'])", "new Set([']'])"],
  ['a slash after a closing square bracket opens a regex', CLOSURE, "new Set([')', ']'])", "new Set([')'])"],
  ['a slash after a closing brace divides', CLOSURE, "new Set([')', ']'])", "new Set([')', ']', '}'])"],
  ['a regex class is not recognised', CLOSURE, "    if (source[at] === '[') inClass = true;", '    if (false) inClass = true;'],
  ['a regex class never ends', CLOSURE, "    else if (source[at] === ']') inClass = false;", '    else if (false) inClass = false;'],
  ['a slash inside a class ends the regex', CLOSURE, "(inClass || source[at] !== '/')", "source[at] !== '/'"],
  ['an escaped slash ends the regex', CLOSURE, "at += source[at] === '\\\\' ? 2 : 1;\n  }\n\n  tokens.push({ kind: 'regex' });", "at += 1;\n  }\n\n  tokens.push({ kind: 'regex' });"],
  ['a regex runs past its line', CLOSURE, "source[at] !== '\\n' && (inClass", 'true && (inClass'],
  ['a non-ASCII letter breaks a name', CLOSURE, String.raw`const NAME = /[\p{ID_Continue}$‌‍]/u;`, String.raw`const NAME = /[\w$]/u;`],

  // --- THE WALK
  ['a bare specifier is followed', CLOSURE, '.filter((found) => RELATIVE.test(found))', '.filter(() => true)'],
  ['a parent-folder specifier is not followed', CLOSURE, String.raw`const RELATIVE = /^\.{1,2}\//;`, String.raw`const RELATIVE = /^\.\//;`],
  ['an entry keeps its Windows separator', CLOSURE, ".split(path.win32.sep).join('/')", ''],
  ['an entry is not normalised', CLOSURE, "entries.map((file) => path.posix.normalize(file.split(path.win32.sep).join('/')))", "entries.map((file) => file.split(path.win32.sep).join('/'))"],
  ['a missing entry is dropped in silence', CLOSURE, 'else problems.push(`${entry} does not exist', 'else [].push(`${entry} does not exist'],
  ['an import out of the root is dropped in silence', CLOSURE, "if (target.startsWith('../')) problems.push(", "if (target.startsWith('../')) [].push("],
  ['an import out of the root reads as missing', CLOSURE, "if (target.startsWith('../')) problems.push(", "if (false) problems.push("],
  ['a missing import is dropped in silence', CLOSURE, 'else if (!isFile(root, target)) problems.push(', 'else if (!isFile(root, target)) [].push('],
  ['a missing import does not name its specifier', CLOSURE, "imports '${specifier}', which resolves to ${target}", 'imports, which resolves to ${target}'],
  ['every file is read for imports', CLOSURE, '    if (!READ_EXTENSIONS.has(path.posix.extname(file))) continue;\n', ''],
  ['`.mjs` is not read', CLOSURE, "new Set(['.mjs', '.cjs', '.js'])", "new Set(['.cjs', '.js'])"],
  ['the closure comes in walk order', CLOSURE, 'return { files: [...files].toSorted(), problems };', 'return { files: [...files], problems };'],

  // --- WHAT IS COPIED
  ['a root-level file copies the root', CLOSURE, "(path.posix.dirname(file) === '.' ? file : path.posix.dirname(file))", 'path.posix.dirname(file)'],
  ['a folder is copied once per file', CLOSURE, 'return [...new Set(files.map(', 'return [...(files.map('],
  ['the copied paths come in file order', CLOSURE, 'path.posix.dirname(file))))].toSorted();', 'path.posix.dirname(file))))];']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'mutation-proof/import-closure.selftest.mjs',
  mutants: MUTANTS,
  timeoutMs: 60_000,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
